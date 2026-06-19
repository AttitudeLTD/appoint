-- =============================================================================
-- Migration: map_perf_indexes_and_client_bounds
-- Date: 2026-06-19
-- Author: egidiosalinaro
--
-- Cosa fa:
--   1. Indice spaziale GIST su `stores.location` → la RPC
--      `get_stores_within_radius` (ST_DWithin + ORDER BY <->) passa da seq scan
--      di tutti i ~14k store a un Index Scan (KNN). Abilita ad alzare in
--      sicurezza raggio/limite di caricamento pin sulla mappa.
--   2. Indice `store_status_logs (store_id, created_at desc)` → lookup dei log
--      per store istantaneo (la mappa li carica in batch via `.in('store_id',…)`).
--   3. Funzione `get_client_stores_bounds(p_client_id)` → restituisce conteggio
--      + bounding box (min/max lat/lng) dei pin VISIBILI all'utente per un
--      cliente. Usata dalla mappa per il fit-bounds automatico quando si
--      seleziona un filtro cliente, e per decidere se caricarne tutti i pin.
--
-- Perché:
--   - rendere più ampia la vista dei pin senza degradare la performance
--     (anzi migliorandola): il costo diventa index-assisted e i round-trip
--     lato client passano da O(N) a O(1).
--
-- NOTA sugli indici in produzione:
--   - sul DB live gli indici sono stati creati con CREATE INDEX CONCURRENTLY
--     (non bloccante). Qui sono dichiarati senza CONCURRENTLY per poter girare
--     dentro la transazione della migration / `supabase db reset` su DB nuovi.
--
-- Idempotenza:
--   - `create index if not exists`, `create or replace function`.
-- =============================================================================

begin;

-- ---- 1) Indice spaziale GIST su stores.location -----------------------------
create index if not exists idx_stores_location_gist
  on public.stores using gist (location);

-- ---- 2) Indice per il lookup dei log per store ------------------------------
create index if not exists idx_store_status_logs_store_created
  on public.store_status_logs (store_id, created_at desc);

-- ---- 3) Bounds + conteggio dei pin visibili per cliente ---------------------
create or replace function public.get_client_stores_bounds(p_client_id bigint)
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
        s.client_id = p_client_id
        or exists (
          select 1 from public.store_clients sc
          where sc.store_id = s.id and sc.client_id = p_client_id
        )
      )
      and public.user_can_see_store(auth.uid(), s.id)
  )
  select count(*)::bigint, min(ST_Y(g)), min(ST_X(g)), max(ST_Y(g)), max(ST_X(g))
  from visible;
$$;

revoke all     on function public.get_client_stores_bounds(bigint) from public;
grant  execute on function public.get_client_stores_bounds(bigint) to authenticated, anon;

commit;

-- ---- rollback (riferimento, non eseguito) -----------------------------------
-- begin;
--   drop function if exists public.get_client_stores_bounds(bigint);
--   drop index    if exists public.idx_store_status_logs_store_created;
--   drop index    if exists public.idx_stores_location_gist;
-- commit;
