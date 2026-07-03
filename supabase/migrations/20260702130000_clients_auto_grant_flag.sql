-- =============================================================================
-- Migration: clients.auto_grant_new_users — clienti "riservati"
-- Date: 2026-07-02
--
-- Cosa fa:
--   1. Aggiunge `public.clients.auto_grant_new_users boolean not null default true`.
--      Se false, il cliente NON viene concesso automaticamente:
--        - ai NUOVI utenti (trigger handle_new_user), e
--        - a TUTTI gli utenti alla creazione del cliente (trigger
--          grant_new_client_to_all_users).
--      I grant restano gestibili manualmente via user_client_access.
--   2. Marca i clienti maintenance come riservati:
--        id 3 = "Maintenance Amex", id 4 = "Lead da Maintenance".
--   3. Aggiorna i due trigger di onboarding perché rispettino il flag.
--
-- Nota operativa (una tantum, NON in migration perché dipende dagli UUID del
-- singolo ambiente): i grant maintenance già esistenti sono stati rimossi da
-- tutti gli utenti tranne gli admin abilitati (Egidio Salinaro x2, Ilaria
-- Silvestre) con:
--   delete from public.user_client_access
--   where client_id in (3,4) and user_id not in (<uuid admin>);
-- =============================================================================

alter table public.clients
  add column if not exists auto_grant_new_users boolean not null default true;

comment on column public.clients.auto_grant_new_users is
  'Se false il cliente è "riservato": NON viene concesso automaticamente ai nuovi utenti (trigger handle_new_user) né a tutti gli utenti alla creazione (trigger grant_new_client_to_all_users). I grant restano gestibili manualmente via user_client_access. Usato per i clienti maintenance (id 3,4) visibili solo ad admin selezionati.';

update public.clients set auto_grant_new_users = false where id in (3, 4);

-- handle_new_user: i nuovi utenti ricevono il grant solo dei clienti auto_grant_new_users = true.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_local text := split_part(new.email, '@', 1);
  v_name text;
  v_surname text;
begin
  v_name := public.normalize_person_name(split_part(v_local, '.', 1));
  v_surname := public.normalize_person_name(nullif(replace(substr(v_local, nullif(position('.' in v_local),0)+1), '.', ' '), ''));
  insert into public.users (id, email, name, surname, visibility_scope)
  values (new.id, new.email, v_name, v_surname, 'restricted')
  on conflict (id) do nothing;
  insert into public.user_client_access (user_id, client_id)
  select new.id, c.id from public.clients c
  where c.auto_grant_new_users
  on conflict do nothing;
  return new;
end;
$function$;

-- grant_new_client_to_all_users: auto-concede il nuovo cliente a tutti solo se non riservato.
create or replace function public.grant_new_client_to_all_users()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.auto_grant_new_users then
    insert into public.user_client_access (user_id, client_id)
    select u.id, new.id from public.users u
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
