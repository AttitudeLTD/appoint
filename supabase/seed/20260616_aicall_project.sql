-- =============================================================================
-- Seed: PROGETTO AICALL / AiCall — nuovo cliente + workflow + visibilità
-- Date: 2026-06-16 (agg. 2026-06-26: rename → "AiCall" + logo Amex condiviso)
-- Author: egidiosalinaro
--
-- NOTA rename: il cliente è stato creato come "PROGETTO AICALL" e in seguito
--   rinominato "AiCall". Le condizioni di esistenza considerano entrambi i nomi
--   così il seed resta idempotente sia su DB nuovo che su quello già rinominato.
--   Il rename è solo un'etichetta: il runtime referenzia il cliente per `id`.
--
-- Cosa fa:
--   1. Crea il cliente "AiCall" (lead generati dal partner AiCall).
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
select 'AiCall'
where not exists (
  select 1 from public.clients where name in ('AiCall', 'PROGETTO AICALL')
);


-- ---- 2) Workflow (manage_form: tendina ESITO obbligatoria + NOTE) -----------
insert into public.client_workflows (client_id, name, workflow, active)
select
  c.id,
  'AiCall',
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
    "submit": { "label": "Salva esito", "save_to_outcomes": true, "lock_pin": true }
  }
  }'::jsonb,
  true
from public.clients c
where c.name in ('AiCall', 'PROGETTO AICALL')
  and not exists (
    select 1 from public.client_workflows w where w.client_id = c.id
  );


-- ---- 3) Visibilità a TUTTI gli utenti ---------------------------------------
insert into public.user_client_access (user_id, client_id)
select u.id, c.id
from public.users u
cross join public.clients c
where c.name in ('AiCall', 'PROGETTO AICALL')
on conflict do nothing;


-- ---- 4) Nome finale "AiCall" + logo (riusa lo stesso file logo di Amex) ------
--    Il bucket `client-logos` è pubblico: puntare allo stesso path mostra il
--    logo Amex anche per i pin/filtro di AiCall. (Non esiste copia del file: si
--    condivide il path '2/logo.png'.)
update public.clients
set name = 'AiCall',
    logo = (select logo from public.clients where name = 'Amex' limit 1)
where name in ('AiCall', 'PROGETTO AICALL');

commit;

-- ---- rollback (riferimento, non eseguito) -----------------------------------
-- begin;
--   delete from public.user_client_access where client_id = (select id from public.clients where name = 'AiCall');
--   delete from public.client_workflows  where client_id = (select id from public.clients where name = 'AiCall');
--   -- ATTENZIONE: cancellare il cliente fallisce se esistono stores collegati.
--   -- delete from public.clients where name = 'AiCall';
-- commit;
