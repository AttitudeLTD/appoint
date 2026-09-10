-- =============================================================================
-- Seed: utente tecnico "Call Center AiCall" per il webhook del call center
-- Date: 2026-09-10
-- Author: egidiosalinaro
--
-- Perché serve:
--   Il webhook `POST /api/webhooks/callcenter` registra l'esito "OK - Appuntamento
--   preso" in `store_visit_outcomes` e, per i lead nuovi, crea il punto vendita.
--   Entrambe le scritture hanno bisogno di un utente:
--     - `store_visit_outcomes.user_id` (UNIQUE con store_id: un esito per utente)
--     - `stores.created_by`, `store_clients.created_by`, `store_status_logs.modifier`
--       sono FK → `public.users(id)` → `auth.users(id)`.
--   In mappa e in dashboard l'esito compare quindi come fatto da "Call Center
--   AiCall", distinguibile da quelli degli agenti.
--
-- Cosa fa:
--   - Inserisce una riga in `auth.users` (email fittizia su dominio non reale,
--     nessuna password, `banned_until` nel 2999: NON può fare login, e comunque
--     il dominio non è tra quelli ammessi da `utils/auth.ts`).
--   - Il trigger `on_auth_user_created` → `handle_new_user()` crea la riga in
--     `public.users` e i grant `user_client_access` per i clienti con
--     `auto_grant_new_users` (AiCall incluso).
--   - Normalizza nome/cognome/ruolo: role = 'agent' così l'utente entra nei filtri
--     "agente" della Dashboard e nello storico visibile a supervisor/AM.
--
-- Quando serve eseguirlo:
--   NON è obbligatorio. Il webhook cerca l'utente per email
--   (`callcenter.aicall@appoint.invalid`) e, se manca, lo crea da solo al primo
--   invio tramite Admin API con la service role (utils/callcenter/register.ts →
--   resolveTechnicalUserId). Questo seed è l'equivalente "a mano" da SQL editor,
--   utile per crearlo in anticipo o per ripristinarlo. I due percorsi convergono
--   sullo stesso utente (stessa email).
--   Facoltativo: copiare l'UUID stampato dalla SELECT finale in `CALLCENTER_USER_ID`
--   su Vercel per saltare la lookup per email.
--
-- Idempotenza: ri-eseguibile; se l'utente esiste già aggiorna solo i metadati.
-- =============================================================================

begin;

do $$
declare
  v_email text := 'callcenter.aicall@appoint.invalid';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      banned_until, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, null, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"technical_user":true,"purpose":"callcenter-webhook"}'::jsonb,
      now(), now(),
      '', '', '', '',
      '2999-12-31 00:00:00+00', false, false
    );
  end if;

  -- la riga public.users esiste già grazie al trigger; qui solo i metadati
  insert into public.users (id, email, name, surname, role, visibility_scope)
  values (v_id, v_email, 'Call Center', 'AiCall', 'agent', 'restricted')
  on conflict (id) do update
    set name = excluded.name, surname = excluded.surname, role = excluded.role;

  insert into public.user_client_access (user_id, client_id)
  select v_id, c.id from public.clients c where c.name = 'AiCall'
  on conflict do nothing;
end $$;

select u.id as callcenter_user_id, u.email, u.name, u.surname, u.role, u.visibility_scope
from public.users u
where u.email = 'callcenter.aicall@appoint.invalid';

commit;
