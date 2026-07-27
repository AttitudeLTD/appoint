-- =============================================================================
-- Migration: get_store_for_manage — carica UN punto vendita fuori dalla mappa
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
-- Serve alla Dashboard per aprire la scheda "Gestisci" di una lead dello storico
-- senza mandare l'utente sulla mappa.
--
-- Perché una RPC e non una select su `stores`: `location` è `geography` e letta
-- direttamente dalla tabella arriva come WKB esadecimale ("0101000020E6…"),
-- mentre `utils/navigation.ts → parseCoords` accetta solo `POINT(lng lat)`.
-- Era esattamente ciò che rompeva il vecchio deep-link `?store=<id>&manage=1`:
-- parseCoords tornava null e la funzione usciva senza aprire nulla.
--
-- Applica il predicato di visibilità insiemistico (equivalente a
-- `user_can_see_store`) ma NON `clients.show_on_map`: quel filtro riguarda il
-- disegno dei pin sulla mappa, mentre dallo storico si deve poter riaprire anche
-- una lead di un cliente non mappato.
--
-- NB: superata da 20260727142740, che aggiunge `editing_policy` alla TABLE di
-- ritorno. Il file resta per fedeltà alla storia applicata sul database.
--
-- Rollback: ../rollback/20260727141423_get_store_for_manage_rollback.sql
-- =============================================================================

create or replace function public.get_store_for_manage(p_store_id bigint)
returns table(
  id bigint, name text, address text, location text, phone text, category text,
  email text, owner_name text, status text, tier text, fatturato text,
  client_id smallint, client_name text, client_logo text, data_setup date, pi text
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
         s.data_setup, s.pi
  from public.stores s
  left join public.clients c on c.id = s.client_id and (v_all or c.id = any(v_see_clients))
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
