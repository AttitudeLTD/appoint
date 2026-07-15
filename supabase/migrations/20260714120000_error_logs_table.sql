-- =============================================================================
-- Migration: public.error_logs — raccolta errori client-side (diagnostica)
-- Date: 2026-07-14
--
-- Popolata da `utils/error-logger.ts` (dai due error boundary e da un listener
-- globale window 'error'/'unhandledrejection'). Serve a capire quali eccezioni
-- lato client colpiscono gli utenti (finora invisibili: solo schermata "Application
-- error"). INSERT aperto anche ad anon (gli errori possono capitare pre-login, es.
-- fallimento del callback OAuth). SELECT solo ai supervisor.
-- =============================================================================

create table if not exists public.error_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text,
  stack       text,
  digest      text,
  source      text,
  url         text,
  user_id     uuid,
  user_email  text,
  user_agent  text,
  extra       jsonb
);

comment on table public.error_logs is
  'Log degli errori client-side dell''app Appoint (popolato da utils/error-logger.ts). INSERT aperto (anche anon); lettura solo ai supervisor.';

create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);

alter table public.error_logs enable row level security;

drop policy if exists "error_logs insert for all" on public.error_logs;
create policy "error_logs insert for all"
  on public.error_logs for insert
  to anon, authenticated
  with check (true);

drop policy if exists "error_logs select for supervisors" on public.error_logs;
create policy "error_logs select for supervisors"
  on public.error_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role = 'supervisor'
    )
  );

grant insert on public.error_logs to anon, authenticated;
grant select on public.error_logs to authenticated;
