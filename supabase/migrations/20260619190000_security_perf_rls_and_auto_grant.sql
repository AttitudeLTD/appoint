-- =============================================================================
-- Migration: security_perf_rls_and_auto_grant
-- Date: 2026-06-19
-- Author: egidiosalinaro
--
-- Cosa fa (3 blocchi):
--
--  A) SICUREZZA
--     - Restringe la policy UPDATE su `stores` (era USING (true): chiunque
--       poteva modificare QUALSIASI store) a `user_can_see_store`.
--     - `store_status_logs` INSERT: il `modifier` deve essere l'utente loggato
--       (era WITH CHECK (true)).
--     - Fissa `search_path = public` sulle funzioni che ne erano prive.
--     - Revoca EXECUTE ad `anon` sulle funzioni SECURITY DEFINER / RPC
--       (l'app è solo-autenticata; le policy che le usano sono `authenticated`).
--
--  B) PERFORMANCE (RLS init-plan)
--     - Riscrive le policy usando `(select auth.uid())` / `(select auth.role())`
--       così l'espressione è valutata UNA volta per query invece che per riga
--       (rilevante su `stores`, ~14k righe).
--     - Aggiunge indici di copertura sulle foreign key segnalate.
--
--  C) ONBOARDING (auto-grant)
--     - `handle_new_user()`: ogni NUOVO utente riceve il grant di TUTTI i
--       clienti esistenti (resta `visibility_scope = 'restricted'`, ma vede
--       tutto). Si può sempre revocare il singolo cliente a mano.
--     - Nuovo trigger su `clients`: ogni NUOVO cliente viene concesso a TUTTI
--       gli utenti esistenti → il caso "abbiamo aggiunto un cliente ma non lo
--       vedono" non può più capitare.
--     - Backfill idempotente dei grant per utenti/clienti già esistenti.
--
-- Idempotente: drop policy if exists / create or replace / on conflict do nothing.
-- =============================================================================

begin;

-- =====================================================================
-- A) SICUREZZA
-- =====================================================================

-- A1) stores UPDATE: solo store visibili all'utente (prima: USING (true)).
drop policy if exists "Enable update for users"        on public.stores;
drop policy if exists "Update stores via visibility scope" on public.stores;
create policy "Update stores via visibility scope"
  on public.stores for update to authenticated
  using      (public.user_can_see_store((select auth.uid()), id))
  with check (public.user_can_see_store((select auth.uid()), id));

-- A2) store_status_logs INSERT: il modifier deve essere chi scrive.
drop policy if exists "Enable insert for authenticated users only" on public.store_status_logs;
create policy "Enable insert for authenticated users only"
  on public.store_status_logs for insert to authenticated
  with check ((select auth.uid()) = modifier);

-- A3) search_path fisso sulle funzioni segnalate (ALTER: non ricrea il corpo).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'update_generic_photos_updated_at',
        'update_store_photos_updated_at',
        'get_stores_within_radius',
        'convert_coordinates_to_location',
        'getstoreswithinradius'
      )
  loop
    execute format('alter function %s set search_path = public;', r.sig);
  end loop;
end $$;

-- A4) Revoca EXECUTE ad anon (app solo-autenticata).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'user_can_see_store','user_can_see_client',
        'get_client_stores_bounds','get_clients_stores_bounds',
        'get_stores_within_radius'
      )
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('grant  execute on function %s to authenticated;', r.sig);
  end loop;
end $$;


-- =====================================================================
-- B) PERFORMANCE — RLS init-plan: (select auth.uid()) / (select auth.role())
-- =====================================================================

-- areas
drop policy if exists "Auth read areas" on public.areas;
create policy "Auth read areas" on public.areas for select to public
  using ((select auth.role()) = 'authenticated');

-- client_workflows
drop policy if exists "Read client_workflows via visibility scope" on public.client_workflows;
create policy "Read client_workflows via visibility scope" on public.client_workflows for select to authenticated
  using (public.user_can_see_client((select auth.uid()), client_id));

-- clients
drop policy if exists "Read clients via visibility scope" on public.clients;
create policy "Read clients via visibility scope" on public.clients for select to authenticated
  using (public.user_can_see_client((select auth.uid()), id));

-- generic_photos
drop policy if exists "Users can delete their own generic photos" on public.generic_photos;
create policy "Users can delete their own generic photos" on public.generic_photos for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own generic photos" on public.generic_photos;
create policy "Users can insert their own generic photos" on public.generic_photos for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- store_clients
drop policy if exists "Read store_clients via store visibility" on public.store_clients;
create policy "Read store_clients via store visibility" on public.store_clients for select to authenticated
  using (public.user_can_see_store((select auth.uid()), store_id));
drop policy if exists "Insert store_clients via store visibility" on public.store_clients;
create policy "Insert store_clients via store visibility" on public.store_clients for insert to authenticated
  with check (public.user_can_see_store((select auth.uid()), store_id));
drop policy if exists "Delete store_clients via store visibility" on public.store_clients;
create policy "Delete store_clients via store visibility" on public.store_clients for delete to authenticated
  using (public.user_can_see_store((select auth.uid()), store_id));

-- store_photos
drop policy if exists "Users can delete their own photos" on public.store_photos;
create policy "Users can delete their own photos" on public.store_photos for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own photos" on public.store_photos;
create policy "Users can insert their own photos" on public.store_photos for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- store_visit_outcomes
drop policy if exists "Authenticated insert store_visit_outcomes" on public.store_visit_outcomes;
create policy "Authenticated insert store_visit_outcomes" on public.store_visit_outcomes for insert to public
  with check ((select auth.role()) = 'authenticated');
drop policy if exists "Authenticated read store_visit_outcomes" on public.store_visit_outcomes;
create policy "Authenticated read store_visit_outcomes" on public.store_visit_outcomes for select to public
  using ((select auth.role()) = 'authenticated');
drop policy if exists "Authenticated update own store_visit_outcomes" on public.store_visit_outcomes;
create policy "Authenticated update own store_visit_outcomes" on public.store_visit_outcomes for update to public
  using ((select auth.uid()) = user_id);

-- stores SELECT (scoped to authenticated + init-plan)
drop policy if exists "Read stores via visibility scope" on public.stores;
create policy "Read stores via visibility scope" on public.stores for select to authenticated
  using (public.user_can_see_store((select auth.uid()), id));

-- user_areas
drop policy if exists "Auth read user_areas" on public.user_areas;
create policy "Auth read user_areas" on public.user_areas for select to public
  using ((select auth.role()) = 'authenticated');

-- user_client_access
drop policy if exists "Users can read own client access" on public.user_client_access;
create policy "Users can read own client access" on public.user_client_access for select to authenticated
  using (user_id = (select auth.uid()));

-- user_store_access
drop policy if exists "Users can read own store access" on public.user_store_access;
create policy "Users can read own store access" on public.user_store_access for select to authenticated
  using (user_id = (select auth.uid()));

-- Indici di copertura sulle foreign key segnalate (tabelle piccole → istantaneo).
create index if not exists idx_areas_client_id              on public.areas(client_id);
create index if not exists idx_store_clients_created_by      on public.store_clients(created_by);
create index if not exists idx_store_status_logs_modifier    on public.store_status_logs(modifier);
create index if not exists idx_store_visit_outcomes_client_id on public.store_visit_outcomes(client_id);
create index if not exists idx_user_areas_area_id            on public.user_areas(area_id);
create index if not exists idx_user_client_access_client_id  on public.user_client_access(client_id);


-- =====================================================================
-- C) ONBOARDING — auto-grant
-- =====================================================================

-- C1) Nuovo utente → grant di tutti i clienti esistenti.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, visibility_scope)
  values (new.id, new.email, 'restricted')
  on conflict (id) do nothing;

  insert into public.user_client_access (user_id, client_id)
  select new.id, c.id from public.clients c
  on conflict do nothing;

  return new;
end;
$$;

-- C2) Nuovo cliente → grant a tutti gli utenti esistenti.
create or replace function public.grant_new_client_to_all_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_client_access (user_id, client_id)
  select u.id, new.id from public.users u
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_client_created on public.clients;
create trigger on_client_created
  after insert on public.clients
  for each row execute function public.grant_new_client_to_all_users();

-- Le due funzioni sopra sono SOLO trigger: non vanno esposte come RPC.
revoke execute on function public.handle_new_user()                from anon, authenticated, public;
revoke execute on function public.grant_new_client_to_all_users()  from anon, authenticated, public;

-- C3) Backfill idempotente (utenti × clienti già esistenti).
insert into public.user_client_access (user_id, client_id)
select u.id, c.id from public.users u cross join public.clients c
on conflict do nothing;

commit;
