-- =============================================================================
-- Migration: clients.show_on_map — esclusione dichiarativa di un cliente dai pin
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- Cosa fa:
--   1. Nuova colonna `public.clients.show_on_map` (boolean, not null, default true).
--      È una CONFIGURAZIONE DI VISUALIZZAZIONE, non un permesso: dice se i pin
--      del cliente vanno disegnati sulla mappa. Non tocca l'autorizzazione.
--   2. La imposta a `false` per il cliente **Amex** (id 2), i cui 2.079 punti
--      vendita sono tutti nell'area di Milano (2.005 MI + 74 MB) e non devono
--      più comparire.
--   3. `get_stores_within_radius` esclude gli store che non hanno NESSUN cliente
--      associato con `show_on_map = true` (associazione = `stores.client_id`
--      OPPURE `store_clients.client_id`).
--
-- Perché qui e non nel frontend:
--   - un solo punto di verità: la RPC che alimenta i pin (mappa + "Prospect
--     vicini" della dashboard). Niente `id === 2` sparsi nei componenti;
--   - si nasconde/riattiva un cliente con un UPDATE di una riga, senza deploy;
--   - NON tocca l'autorizzazione: `user_can_see_store` / `user_can_see_client`,
--     `user_client_access` e le RLS restano identiche. Amex resta *autorizzato*,
--     semplicemente non *mappato*. È questo che protegge storico ed estrazioni:
--       * i 48 store Amex già lavorati e i 68 `store_status_logs` restano;
--       * nome e logo Amex continuano a risolversi ovunque (RLS di `clients`
--         invariata) → dashboard storico e export CSV supervisor intatti;
--       * revocare i grant in `user_client_access` avrebbe invece fatto sparire
--         Amex dallo storico, e il trigger `handle_new_user` (Amex ha
--         `auto_grant_new_users = true`) lo avrebbe ri-concesso ad ogni nuovo
--         utente → soluzione non mantenibile. Scartata.
--
-- Semantica dell'esclusione (multi-cliente):
--   uno store compare se ESISTE ALMENO UN cliente associato con show_on_map.
--   Quindi un ipotetico store con primario Amex ma anche associato a Scalapay
--   resterebbe visibile (è un target Scalapay legittimo). Oggi il caso non
--   esiste: `store_clients` ha 14.617 righe tutte `is_primary`, 0 store
--   multi-cliente, e 0 store con Amex come cliente secondario → l'esclusione
--   non può trascinarsi dietro pin di altri clienti.
--
-- Effetto sui chiamanti:
--   - mappa (`components/map.tsx`): nessun pin Amex;
--   - dashboard "Prospect vicini" (`app/protected/dashboard/page.tsx`): usa la
--     STESSA RPC, quindi niente prospect Amex. Voluto: un prospect che l'agente
--     non può poi trovare sulla mappa sarebbe incoerente.
--   - export CSV "Esporta lista negozi" (supervisor): NON passa dalla RPC →
--     invariato, Amex continua ad essere estraibile.
--   - `NewStoreForm`: invariato, Amex resta selezionabile in creazione
--     (`show_on_map` riguarda il rendering dei pin, non il ritiro del cliente).
--
-- Nota di coerenza (non affrontata qui, funzioni non più usate dal frontend):
--   `get_client_stores_bounds` / `get_clients_stores_bounds` NON applicano
--   `show_on_map`. Oggi non le chiama nessuno (la mappa calcola i bounds lato
--   client dai pin già caricati), ma se venissero riattivate includerebbero
--   Amex nel fit-bounds. Da allineare se si tornasse a usarle.
--
-- Rollback:
--   `20260727160000_clients_show_on_map_rollback.sql` (riporta Amex a
--   `show_on_map = true` e ripristina la RPC senza il filtro; la colonna può
--   restare, è innocua con default true).
-- =============================================================================

begin;

-- ---- 1) colonna di configurazione -------------------------------------------
alter table public.clients
  add column if not exists show_on_map boolean not null default true;

comment on column public.clients.show_on_map is
  'Se false, i punti vendita del cliente NON vengono disegnati sulla mappa (get_stores_within_radius li esclude). È una configurazione di VISUALIZZAZIONE, non un permesso: non incide su user_can_see_store/user_can_see_client, RLS, storico, esiti o export.';

-- ---- 2) Amex fuori dalla mappa ----------------------------------------------
update public.clients
   set show_on_map = false
 where id = 2
   and name = 'Amex';

-- Guardia: se l'id 2 non fosse Amex la migration deve fallire, non passare in
-- silenzio nascondendo il cliente sbagliato.
do $$
begin
  if not exists (
    select 1 from public.clients
     where id = 2 and name = 'Amex' and show_on_map = false
  ) then
    raise exception 'Cliente Amex (id 2) non trovato o non aggiornato: verificare public.clients';
  end if;
end $$;

-- ---- 3) RPC: esclude gli store senza alcun cliente mappabile -----------------
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

  -- Clienti che possono comparire sulla mappa (clients.show_on_map).
  -- Risolto una volta per chiamata; vale anche per gli utenti con scope 'all'.
  v_map_clients      bigint[] := '{}'::bigint[];

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

  select coalesce(array_agg(cl.id::bigint), '{}'::bigint[])
    into v_map_clients
    from public.clients cl
   where cl.show_on_map;

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
    -- (1) filtro cliente richiesto — INVARIATO
    and (
      v_ids is null
      or s.client_id = any(v_ids)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_ids)
      )
    )
    -- (2) visibilità del chiamante — equivalente a user_can_see_store(v_uid, s.id)
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
    -- (3) NUOVO: lo store deve avere almeno un cliente mappabile (show_on_map).
    --     Il test su array corto-circuita per la quasi totalità degli store;
    --     la sotto-query scatta solo per quelli il cui primario è nascosto.
    and (
      s.client_id = any(v_map_clients)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_map_clients)
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

-- ACL: come da 20260727150000 (SECURITY DEFINER → solo i ruoli necessari).
-- `revoke from public` non basta: le ALTER DEFAULT PRIVILEGES di Supabase danno
-- un grant ESPLICITO ad anon su ogni funzione creata in `public`.
revoke all     on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) from public;
revoke execute on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) from anon;
grant  execute on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) to authenticated, service_role;

commit;

analyze public.clients;
