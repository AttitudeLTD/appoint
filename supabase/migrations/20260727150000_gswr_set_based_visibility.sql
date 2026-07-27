-- =============================================================================
-- Migration: get_stores_within_radius — filtro di visibilità insiemistico
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- Cosa fa:
--   Riscrive il corpo di `get_stores_within_radius` in modo INSIEMISTICO: la
--   visibilità del chiamante viene calcolata UNA VOLTA per chiamata invece che
--   riga per riga con `user_can_see_store(auth.uid(), s.id)`.
--   Firma argomenti e TABLE di ritorno INVARIATE (nessun impatto su PostgREST
--   né sui chiamanti `components/map.tsx` / `app/protected/dashboard/page.tsx`).
--
-- Perché (misure su produzione, ~14.6k store, utente `restricted` grant {1,2,5}):
--   - `p_client_id=5`, raggio Italia, p_limit 2000 → 1.400 ms, 370.178 buffer
--   - `p_client_id=2`, idem                       → 1.390 ms
--   - default mappa (2 km / 250 pin)              →   121 ms
--   Il piano mostrava `Rows Removed by Filter: 14395`, cioè il predicato di
--   visibilità (una funzione plpgsql) valutato su OGNI store del DB → costo
--   O(N_store_totali), non O(N_store_visibili). A 150k store → timeout.
--
--   Tre difetti sovrapposti, tutti risolti qui:
--     (a) `user_can_see_store` valutata DUE volte per riga: una dal filtro
--         esplicito nella RPC e una dalla policy RLS "Read stores via
--         visibility scope", perché la funzione era SECURITY INVOKER.
--     (b) `clients` in Seq Scan dentro un Nested Loop (una volta per pin),
--         perché anche `clients` è RLS-filtrata da `user_can_see_client` e la
--         tabella non era MAI stata analizzata (reltuples = -1 → il planner
--         stimava 263 righe su 5).
--     (c) predicato plpgsql non inlineabile → nessuna spinta verso l'indice.
--
-- Equivalenza di autorizzazione (nessuna regola business cambia):
--   `user_can_see_store(u, s)` ramo per ramo ↔ nuovo predicato:
--     u is null                         → RETURN senza righe
--     visibility_scope is null          → RETURN senza righe
--     scope = 'all'                     → v_all
--     user_store_access(u, s)           → 4° OR
--     stores.client_id      ∈ UCA       → 2° OR
--     store_clients.client_id ∈ UCA     → 3° OR
--     altrimenti                        → nessun OR soddisfatto → riga esclusa
--   `user_can_see_store` NON viene modificata e resta il predicato della RLS di
--   `stores` / `store_clients`: qui cambia solo COME viene valutata dalla RPC.
--
-- SECURITY DEFINER:
--   necessario per eliminare il difetto (a): con INVOKER la RLS di `stores`
--   ri-valuta `user_can_see_store` per ogni riga anche dopo la riscrittura.
--   Stesso pattern già in produzione su `get_clients_stores_bounds` /
--   `get_client_stores_bounds`. Il corpo è fail-closed su `auth.uid() is null`
--   e su utente inesistente in `public.users`, `search_path` è fissato e
--   l'EXECUTE è revocato a public/anon (`/protected` è comunque irraggiungibile
--   agli anonimi: vedi `utils/supabase/middleware.ts`).
--
-- Comportamento preservato di proposito:
--   Il LEFT JOIN su `clients` era RLS-filtrato: uno store visibile il cui
--   cliente primario NON è visibile tornava con `client_name`/`client_logo`
--   NULL. Con SECURITY DEFINER quel filtro sparirebbe, quindi lo riproduco
--   esplicitamente con `v_see_clients` (calcolato una volta, O(#clienti)).
--   Con i dati odierni (0 store multi-cliente) il caso non può verificarsi, ma
--   il modello dati lo ammette.
--
-- Rollback:
--   `supabase/migrations/20260727150000_gswr_set_based_visibility_rollback.sql`
--   (ripristina il corpo attuale, identico a 20260702140000_stores_pi_in_rpc).
--   Nessun dato e nessuno schema vengono toccati: si sostituisce una funzione.
-- =============================================================================

begin;

drop function if exists public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
);

create function public.get_stores_within_radius(
  lat double precision,
  lng double precision,
  radius double precision,
  p_client_id bigint DEFAULT NULL::bigint,
  p_limit integer DEFAULT 500,
  p_client_ids bigint[] DEFAULT NULL::bigint[]
)
returns table(
  id bigint,
  name text,
  address text,
  location text,
  phone text,
  category text,
  email text,
  owner_name text,
  status text,
  tier text,
  fatturato text,
  client_id smallint,
  client_name text,
  client_logo text,
  data_setup date,
  pi text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  -- Filtro cliente RICHIESTO dal chiamante. Logica invariata: `p_client_ids`
  -- (array, multi-select) ha precedenza su `p_client_id` (singolo, legacy).
  v_ids bigint[] := case
    when p_client_ids is not null and array_length(p_client_ids, 1) is not null then p_client_ids
    when p_client_id is not null then array[p_client_id]
    else null
  end;

  -- Scope di visibilità del chiamante, risolto UNA VOLTA per chiamata.
  v_uid              uuid := auth.uid();
  v_scope            text;
  v_all              boolean;
  -- Clienti concessi via user_client_access → guidano la visibilità sugli STORE.
  v_grant_clients    bigint[] := '{}'::bigint[];
  -- Esistono grant per singolo store? (short-circuit: oggi user_store_access è vuota)
  v_has_store_grants boolean := false;
  -- Clienti VISIBILI (user_can_see_client) → guidano solo il join di visualizzazione
  -- nome/logo. NB: insieme diverso da v_grant_clients, include i clienti derivati
  -- da user_store_access.
  v_see_clients      bigint[] := '{}'::bigint[];
begin
  -- Fail-closed, identico al comportamento di user_can_see_store(null, …) = false.
  if v_uid is null then
    return;
  end if;

  select u.visibility_scope into v_scope
  from public.users u
  where u.id = v_uid;

  -- Utente senza riga in public.users → nessuna visibilità (come oggi).
  if v_scope is null then
    return;
  end if;

  v_all := (v_scope = 'all');

  if not v_all then
    select coalesce(array_agg(uca.client_id::bigint), '{}'::bigint[])
      into v_grant_clients
      from public.user_client_access uca
     where uca.user_id = v_uid;

    v_has_store_grants := exists (
      select 1
      from public.user_store_access usa
      where usa.user_id = v_uid
    );

    select coalesce(array_agg(cl.id::bigint), '{}'::bigint[])
      into v_see_clients
      from public.clients cl
     where public.user_can_see_client(v_uid, cl.id);
  end if;

  return query
  select
    s.id, s.name, s.address,
    ST_AsText(s.location) as location,
    s.phone, s.category, s.email, s.owner_name,
    s.status, s.tier, s.fatturato,
    s.client_id, c.name as client_name, c.logo as client_logo,
    s.data_setup, s.pi
  from public.stores s
  -- Riproduce la RLS di `clients`: se il cliente primario non è visibile al
  -- chiamante, client_name/client_logo restano NULL (comportamento invariato).
  left join public.clients c
    on c.id = s.client_id
   and (v_all or c.id = any(v_see_clients))
  where s.location is not null
    -- (1) filtro cliente richiesto — INVARIATO rispetto alla versione precedente
    and (
      v_ids is null
      or s.client_id = any(v_ids)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_ids)
      )
    )
    -- (2) visibilità del chiamante — equivalente a user_can_see_store(v_uid, s.id)
    --     ma valutata su insiemi già in memoria + lookup su PK.
    and (
      v_all
      or s.client_id = any(v_grant_clients)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_grant_clients)
      )
      or (
        v_has_store_grants
        and exists (
          select 1 from public.user_store_access usa
          where usa.user_id = v_uid and usa.store_id = s.id
        )
      )
    )
    and ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius
    )
  order by s.location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  limit p_limit;
end;
$function$;

-- La funzione è SECURITY DEFINER: EXECUTE solo ai ruoli che ne hanno bisogno.
-- (Coerente con l'intento di 20260702140000 e con la migration di sicurezza
--  20260619190000. `/protected` non è raggiungibile da `anon`.)
revoke all on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) from public;

-- NB: `revoke from public` NON basta. Supabase ha ALTER DEFAULT PRIVILEGES che
-- concede EXECUTE ad anon/authenticated/service_role su ogni funzione creata in
-- `public`: dopo il CREATE, `anon` ha un grant ESPLICITO, che sopravvive alla
-- revoke su PUBLIC. Va revocato per nome. ACL attesa a fine migration:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
revoke execute on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) from anon;

grant execute on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) to authenticated, service_role;

commit;

-- Statistiche: `public.clients` non era MAI stata analizzata (reltuples = -1),
-- il planner stimava 263 righe su 5 → Seq Scan dentro Nested Loop.
analyze public.clients;
analyze public.stores;
