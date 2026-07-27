-- =============================================================================
-- Migration: search_stores_by_name — ricerca punti vendita per nome, scalabile
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- Cosa fa:
--   Nuova RPC `search_stores_by_name(p_query text, p_limit integer)` che
--   sostituisce la query diretta `from('stores').ilike('name', …)` usata dalla
--   barra di ricerca della mappa (`components/map.tsx → AddressSearchBar`).
--
-- Perché — la query diretta aveva TRE difetti.
--
-- (1) SCALABILITÀ. Passando da PostgREST come `authenticated`, la RLS di
--     `stores` inietta `user_can_see_store(auth.uid(), id)` nel filtro. Il
--     planner la valuta PRIMA del predicato sul nome e sceglie un Seq Scan:
--     l'indice trigram `stores_name_trgm_idx` non viene MAI usato.
--     Misurato in produzione (~14,6k store, utente reale):
--         Seq Scan on stores  (actual time=706.444..706.444)
--           Filter: (user_can_see_store($0, id) AND (name ~~* '%esselunga%'))
--           Rows Removed by Filter: 14617
--           Buffers: shared hit=132737
--     Costo O(N_store_totali) ad ogni ricerca → a milioni di store, inagibile.
--     Stessa causa radice della migration 20260727125237.
--     Con il predicato insiemistico dentro una SECURITY DEFINER:
--         Bitmap Index Scan on stores_name_trgm_idx
--           Buffers: shared hit=25
--     → ~5.300x meno I/O, e il costo scala coi MATCH, non col totale.
--
-- (2) COERENZA CON LA MAPPA. La query diretta non applicava `show_on_map`
--     (migration 20260727131525): cercare un negozio Amex restituiva un
--     risultato, la mappa ci volava sopra e non c'era alcun pin. Qui il
--     filtro è applicato, esattamente come in `get_stores_within_radius`.
--
-- (3) COORDINATE INUTILIZZABILI. `stores.location` è `geography`: letta
--     direttamente dalla tabella arriva al client come WKB esadecimale
--     ("0101000020E6100000…"), mentre `utils/navigation.ts → parseCoords`
--     accetta SOLO il formato `POINT(lng lat)`. Ogni risultato veniva quindi
--     scartato da `.filter(Boolean)` → la ricerca per nome non ha mai
--     restituito nulla. Qui si ritorna `ST_AsText(location)`, come fa già
--     `get_stores_within_radius` (ed è il motivo per cui i pin funzionano).
--
-- Sicurezza:
--   SECURITY DEFINER con lo STESSO predicato di visibilità insiemistico di
--   `get_stores_within_radius` — equivalente a `user_can_see_store`, che non
--   viene modificata. Fail-closed su `auth.uid() is null` e su utente assente
--   da `public.users`. `search_path` fissato, EXECUTE revocato a public/anon.
--   I wildcard LIKE (`%`, `_`, `\`) vengono neutralizzati QUI dentro: la
--   protezione non dipende più dal chiamante.
--
-- Ranking: prima i match per prefisso ("Esselunga …" prima di "Bar Esselunga"),
--   poi i nomi più corti (più specifici), poi alfabetico. Deterministico.
--
-- Rollback: ../rollback/20260727135354_search_stores_by_name_rollback.sql
--   (drop della funzione; il frontend torna alla query diretta — che però
--    resta affetta dai tre difetti sopra).
-- =============================================================================

begin;

create or replace function public.search_stores_by_name(
  p_query text,
  p_limit integer default 6
)
returns table(
  id        bigint,
  name      text,
  address   text,
  comune    text,
  provincia text,
  location  text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_q                text;
  v_escaped          text;
  v_uid              uuid := auth.uid();
  v_scope            text;
  v_all              boolean;
  v_grant_clients    bigint[] := '{}'::bigint[];
  v_has_store_grants boolean  := false;
  v_map_clients      bigint[] := '{}'::bigint[];
  -- Cap difensivo: nessun chiamante può farsi restituire l'intero dataset.
  v_limit            integer  := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  -- Fail-closed, come user_can_see_store(null, …) = false.
  if v_uid is null then
    return;
  end if;

  -- Sotto i 2 caratteri la ricerca è troppo ampia per essere utile (e il
  -- trigram non è selettivo): stesso taglio che faceva già il frontend.
  v_q := btrim(coalesce(p_query, ''));
  if length(v_q) < 2 then
    return;
  end if;

  select u.visibility_scope into v_scope
  from public.users u
  where u.id = v_uid;

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
      select 1 from public.user_store_access usa where usa.user_id = v_uid
    );
  end if;

  -- `\` va sostituito per primo, altrimenti ri-escaperebbe le barre appena
  -- introdotte da `%` e `_`. `\` è l'ESCAPE di default di LIKE in Postgres.
  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    s.id,
    s.name,
    s.address,
    s.comune,
    s.provincia,
    ST_AsText(s.location) as location
  from public.stores s
  where s.location is not null            -- senza coordinate il risultato non è cliccabile
    and s.name ilike '%' || v_escaped || '%'
    -- visibilità del chiamante (equivalente a user_can_see_store)
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
    -- coerenza con la mappa: solo clienti mappabili (clients.show_on_map)
    and (
      s.client_id = any(v_map_clients)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_map_clients)
      )
    )
  order by
    case when s.name ilike v_escaped || '%' then 0 else 1 end,  -- prefisso prima
    length(s.name),                                             -- più specifico prima
    s.name
  limit v_limit;
end;
$function$;

revoke all     on function public.search_stores_by_name(text, integer) from public;
revoke execute on function public.search_stores_by_name(text, integer) from anon;
grant  execute on function public.search_stores_by_name(text, integer) to authenticated, service_role;

commit;
