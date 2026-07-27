-- =============================================================================
-- ROLLBACK di 20260727150000_gswr_set_based_visibility.sql
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- NON è una migration: NON va applicata nel normale flusso `supabase db push`.
-- È il file da eseguire (un solo statement, < 30 s, nessun downtime, nessuna
-- perdita di dati) se la riscrittura insiemistica di `get_stores_within_radius`
-- dovesse dare problemi in produzione.
--
-- Ripristina ESATTAMENTE il corpo precedente, quello introdotto da
-- `20260702140000_stores_pi_in_rpc.sql`:
--   - LANGUAGE plpgsql, STABLE, SECURITY INVOKER
--   - filtro di visibilità riga per riga via `public.user_can_see_store()`
--   - ACL come prima della migration (EXECUTE a PUBLIC + authenticated/service_role)
--
-- Le statistiche aggiornate da `analyze` NON richiedono rollback (autovacuum le
-- rigenera comunque; non alterano dati né schema).
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
set search_path to 'public'
as $function$
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
    s.client_id, c.name as client_name, c.logo as client_logo,
    s.data_setup, s.pi
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
$function$;

grant execute on function public.get_stores_within_radius(
  double precision, double precision, double precision, bigint, integer, bigint[]
) to authenticated, service_role;

commit;
