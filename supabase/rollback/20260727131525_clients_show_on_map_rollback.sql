-- =============================================================================
-- ROLLBACK di 20260727131525_clients_show_on_map.sql
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- NON è una migration: NON va applicata nel normale flusso `supabase db push`.
--
-- Due livelli, dal più leggero al più completo.
--
-- ── A) RIMETTERE SOLO AMEX SULLA MAPPA (caso normale) ────────────────────────
--    Un UPDATE di una riga, nessun DDL, effetto immediato sulla RPC:
--
--        update public.clients set show_on_map = true where id = 2;
--
--    È il rollback che serve nel 99% dei casi: la colonna e la RPC restano,
--    ma nessun cliente è più escluso. Vale anche come "riattiva il cliente X"
--    in futuro. Il frontend torna a mostrare la chip Amex al reload.
--
-- ── B) RIPRISTINO COMPLETO (togliere anche il filtro dalla RPC) ──────────────
--    Sotto. Rimette il corpo della RPC alla versione 20260727125237 (Fase 1,
--    filtro insiemistico SENZA `show_on_map`). La colonna `clients.show_on_map`
--    viene lasciata: è innocua con default true e droppandola si perderebbe la
--    configurazione. Per toglierla davvero:
--        alter table public.clients drop column show_on_map;
--    (da fare solo dopo aver allineato il frontend, che la usa in
--     `components/map.tsx` e `app/protected/dashboard/page.tsx`).
-- =============================================================================

begin;

update public.clients set show_on_map = true where id = 2;

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
  v_ids bigint[] := case
    when p_client_ids is not null and array_length(p_client_ids, 1) is not null then p_client_ids
    when p_client_id is not null then array[p_client_id]
    else null
  end;

  v_uid              uuid := auth.uid();
  v_scope            text;
  v_all              boolean;
  v_grant_clients    bigint[] := '{}'::bigint[];
  v_has_store_grants boolean := false;
  v_see_clients      bigint[] := '{}'::bigint[];
begin
  if v_uid is null then
    return;
  end if;

  select u.visibility_scope into v_scope
  from public.users u
  where u.id = v_uid;

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
  left join public.clients c
    on c.id = s.client_id
   and (v_all or c.id = any(v_see_clients))
  where s.location is not null
    and (
      v_ids is null
      or s.client_id = any(v_ids)
      or exists (
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = any(v_ids)
      )
    )
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
