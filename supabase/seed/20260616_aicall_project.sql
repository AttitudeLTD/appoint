-- =============================================================================
-- Seed: PROGETTO AICALL — nuovo cliente + workflow + visibilità
-- Date: 2026-06-16
-- Author: egidiosalinaro
--
-- Cosa fa:
--   1. Crea il cliente "PROGETTO AICALL" (lead generati dal partner AiCall).
--   2. Crea il relativo `client_workflows.workflow` con un `manage_form`
--      dichiarativo: una tendina ESITO obbligatoria (9 esiti OK/KO) + un campo
--      NOTE libero. Al salvataggio l'esito viene persistito in
--      `store_visit_outcomes.outcome_data` (come per gli altri clienti
--      "manage_form", es. id 4).
--   3. Concede la visibilità del cliente a TUTTI gli utenti applicativi
--      (requisito: i pin devono essere visibili a tutti gli agenti) inserendo
--      una riga in `user_client_access` per ogni utente esistente.
--
-- Perché NON è una migration di schema:
--   - non modifica tabelle/colonne/funzioni: inserisce solo dati di
--     configurazione (cliente, workflow, grants). Vive quindi in `supabase/seed/`.
--
-- Idempotenza:
--   - tutte le insert usano `where not exists` / `on conflict do nothing`.
--   - rieseguire questo file è sicuro.
--
-- NOTA sui NUOVI utenti:
--   - `handle_new_user()` crea i nuovi utenti come `restricted` SENZA grant.
--     Per far vedere PROGETTO AICALL anche agli utenti creati DOPO questo seed,
--     ri-eseguire lo step 3 (oppure concedere il grant in fase di onboarding).
-- =============================================================================

begin;

-- ---- 1) Cliente -------------------------------------------------------------
insert into public.clients (name)
select 'PROGETTO AICALL'
where not exists (select 1 from public.clients where name = 'PROGETTO AICALL');


-- ---- 2) Workflow (manage_form: tendina ESITO obbligatoria + NOTE) -----------
insert into public.client_workflows (client_id, name, workflow, active)
select
  c.id,
  'PROGETTO AICALL',
  '{
  "manage_form": {
    "version": 1,
    "primary_actions": [
      { "id": "go",   "type": "directions", "label": "Indicazioni", "icon": "navigation" },
      { "id": "call", "type": "phone",      "label": "Chiama",      "icon": "phone" }
    ],
    "sections": [
      {
        "id": "esito_section",
        "title": "Esito",
        "fields": [
          {
            "id": "esito",
            "type": "select",
            "label": "Esito",
            "required": true,
            "placeholder": "Seleziona esito",
            "options": [
              { "value": "ok_in_trattativa",     "label": "OK - In trattativa" },
              { "value": "ko_non_interessato",   "label": "KO - Non interessato" },
              { "value": "ok_inviata_amex",      "label": "OK - Inviata ad Amex" },
              { "value": "ko_lead_non_valido",   "label": "KO - Lead non valido" },
              { "value": "ko_irreperibile",      "label": "KO - Irreperibile" },
              { "value": "ko_gia_cliente",       "label": "KO - Già Cliente" },
              { "value": "ok_richiamare",        "label": "OK - Richiamare" },
              { "value": "ko_blocco_dap",        "label": "KO - Blocco DAP" },
              { "value": "ok_appuntamento_preso","label": "OK - Appuntamento preso" }
            ]
          },
          {
            "id": "note",
            "type": "textarea",
            "label": "Note",
            "placeholder": "Note libere..."
          }
        ]
      }
    ],
    "submit": { "label": "Salva esito", "save_to_outcomes": true }
  }
  }'::jsonb,
  true
from public.clients c
where c.name = 'PROGETTO AICALL'
  and not exists (
    select 1 from public.client_workflows w where w.client_id = c.id
  );


-- ---- 3) Visibilità a TUTTI gli utenti ---------------------------------------
insert into public.user_client_access (user_id, client_id)
select u.id, c.id
from public.users u
cross join public.clients c
where c.name = 'PROGETTO AICALL'
on conflict do nothing;

commit;

-- ---- rollback (riferimento, non eseguito) -----------------------------------
-- begin;
--   delete from public.user_client_access where client_id = (select id from public.clients where name = 'PROGETTO AICALL');
--   delete from public.client_workflows  where client_id = (select id from public.clients where name = 'PROGETTO AICALL');
--   -- ATTENZIONE: cancellare il cliente fallisce se esistono stores collegati.
--   -- delete from public.clients where name = 'PROGETTO AICALL';
-- commit;
