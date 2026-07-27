-- =============================================================================
-- Migration: get_store_for_manage espone anche `clients.editing_policy`
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- La Dashboard deve applicare la stessa regola di lock della mappa
-- (`utils/editing-policy.ts → isLockedForMe`), quindi le serve la policy del
-- cliente PRIMARIO dello store. Esposta qui: nessuna query aggiuntiva.
--
-- NB: il join `cp` è separato da `c` di proposito. `c` è filtrato dalla
-- visibilità del cliente (serve solo per nome/logo, e resta NULL se il cliente
-- non è visibile al chiamante), mentre la policy va letta SEMPRE — altrimenti un
-- cliente non visibile ricadrebbe silenziosamente su 'exclusive'.
--
-- Serve un DROP: non si può cambiare la TABLE di ritorno con CREATE OR REPLACE.
--
-- Rollback: ../rollback/20260727141423_get_store_for_manage_rollback.sql
-- =============================================================================

drop function if exists public.get_store_for_manage(bigint);

create function public.get_store_for_manage(p_store_id bigint)
returns table(
  id bigint, name text, address text, location text, phone text, category text,
  email text, owner_name text, status text, tier text, fatturato text,
  client_id smallint, client_name text, client_logo text, data_setup date, pi text,
  editing_policy text
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_scope text; v_all boolean;
  v_grant_clients bigint[] := '{}'::bigint[];
  v_has_store_grants boolean := false;
  v_see_clients bigint[] := '{}'::bigint[];
begin
  if v_uid is null or p_store_id is null then return; end if;
  select u.visibility_scope into v_scope from public.users u where u.id = v_uid;
  if v_scope is null then return; end if;
  v_all := (v_scope = 'all');
  if not v_all then
    select coalesce(array_agg(uca.client_id::bigint), '{}'::bigint[]) into v_grant_clients
      from public.user_client_access uca where uca.user_id = v_uid;
    v_has_store_grants := exists (select 1 from public.user_store_access usa where usa.user_id = v_uid);
    select coalesce(array_agg(cl.id::bigint), '{}'::bigint[]) into v_see_clients
      from public.clients cl where public.user_can_see_client(v_uid, cl.id);
  end if;

  return query
  select s.id, s.name, s.address, ST_AsText(s.location) as location,
         s.phone, s.category, s.email, s.owner_name, s.status, s.tier, s.fatturato,
         s.client_id, c.name as client_name, c.logo as client_logo,
         s.data_setup, s.pi,
         coalesce(cp.editing_policy, 'exclusive') as editing_policy
  from public.stores s
  left join public.clients c  on c.id  = s.client_id and (v_all or c.id = any(v_see_clients))
  left join public.clients cp on cp.id = s.client_id
  where s.id = p_store_id
    and (
      v_all
      or s.client_id = any(v_grant_clients)
      or exists (select 1 from public.store_clients sc where sc.store_id=s.id and sc.client_id = any(v_grant_clients))
      or (v_has_store_grants and exists (select 1 from public.user_store_access usa where usa.user_id=v_uid and usa.store_id=s.id))
    );
end;
$function$;

revoke all     on function public.get_store_for_manage(bigint) from public;
revoke execute on function public.get_store_for_manage(bigint) from anon;
grant  execute on function public.get_store_for_manage(bigint) to authenticated, service_role;
