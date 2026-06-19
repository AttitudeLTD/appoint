-- =============================================================================
-- Migration: multi_client_filter_and_bounds
-- Date: 2026-06-19
-- Author: egidiosalinaro
--
-- Cosa fa:
--   1. Estende `get_stores_within_radius` con il parametro `p_client_ids bigint[]`
--      (in coda, default null) → la mappa può filtrare per PIÙ clienti insieme.
--      Mantiene `p_client_id` (singolo) per retro-compatibilità: se `p_client_ids`
--      è valorizzato vince lui, altrimenti si usa `p_client_id`, altrimenti
--      nessun filtro cliente. Match su `stores.client_id` OPPURE `store_clients`.
--   2. Aggiunge `get_clients_stores_bounds(p_client_ids bigint[])`: conteggio +
--      bounding box dei pin VISIBILI per un INSIEME di clienti (per il fit-bounds
--      automatico della mappa, multi-select).
--
-- Perché:
--   - selezione multipla di clienti + dezoom automatico sull'estensione
--     complessiva, per qualsiasi cliente.
--
-- NB overload:
--   - droppiamo tutte le versioni di `get_stores_within_radius` e ricreiamo
--     l'unica canonica: PostgREST risolve per argomenti nominati, quindi una
--     sola funzione (niente PGRST203) con tutti i parametri opzionali a default.
--
-- Idempotenza: drop+create / create or replace.
-- =============================================================================

begin;

-- ---- 1) get_stores_within_radius con p_client_ids ---------------------------
do $$
declare r record;
begin
  for r in
    select format('drop function if exists %s(%s);',
                   p.oid::regproc,
                   pg_get_function_identity_arguments(p.oid)) as cmd
    from pg_proc p
    where p.proname = 'get_stores_within_radius'
      and p.pronamespace = 'public'::regnamespace
  loop execute r.cmd; end loop;
end $$;

create or replace function public.get_stores_within_radius(
  lat          double precision,
  lng          double precision,
  radius       double precision,
  p_client_id  bigint   default null,
  p_limit      integer  default 500,
  p_client_ids bigint[] default null
)
returns table (
  id          bigint,
  name        text,
  address     text,
  location    text,
  phone       text,
  category    text,
  email       text,
  owner_name  text,
  status      text,
  tier        text,
  fatturato   text,
  client_id   smallint,
  client_name text,
  client_logo text
)
language plpgsql
stable
as $$
declare
  v_ids bigint[] := case
    when p_client_ids is not null and array_length(p_client_ids, 1) is not null then p_client_ids
    when p_client_id is not null then array[p_client_id]
    else null
  end;
begin
  return query
  select
    s.id, s.name, s.address,
    ST_AsText(s.location) as location,
    s.phone, s.category, s.email, s.owner_name,
    s.status, s.tier, s.fatturato,
    s.client_id, c.name as client_name, c.logo as client_logo
  from public.stores s
  left join public.clients c on c.id = s.client_id
  where s.location is not null
    and (
      v_ids is null
      or s.client_id = any(v_ids)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_ids)
      )
    )
    and public.user_can_see_store(auth.uid(), s.id)
    and ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius
    )
  order by s.location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  limit p_limit;
end;
$$;

-- ---- 2) bounds + conteggio per un INSIEME di clienti ------------------------
create or replace function public.get_clients_stores_bounds(p_client_ids bigint[])
returns table(
  n       bigint,
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select s.location::geometry as g
    from public.stores s
    where s.location is not null
      and (
        s.client_id = any(p_client_ids)
        or exists (
          select 1 from public.store_clients sc
          where sc.store_id = s.id and sc.client_id = any(p_client_ids)
        )
      )
      and public.user_can_see_store(auth.uid(), s.id)
  )
  select count(*)::bigint, min(ST_Y(g)), min(ST_X(g)), max(ST_Y(g)), max(ST_X(g))
  from visible;
$$;

revoke all     on function public.get_clients_stores_bounds(bigint[]) from public;
grant  execute on function public.get_clients_stores_bounds(bigint[]) to authenticated, anon;

commit;

-- ---- rollback (riferimento, non eseguito) -----------------------------------
-- Ripristinare la versione precedente di get_stores_within_radius (senza
-- p_client_ids) — vedi migrations/20260514123300_user_visibility_scope.sql —
-- e: drop function if exists public.get_clients_stores_bounds(bigint[]);
