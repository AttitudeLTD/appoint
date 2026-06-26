-- =============================================================================
-- Migration: idx_store_status_logs_modifier_created_at
-- Date: 2026-06-26
-- Author: egidiosalinaro
--
-- Cosa fa:
--   - Indice composito su store_status_logs(modifier, created_at desc).
--     La query dello storico dashboard filtra `modifier IN (...)` + range su
--     `created_at` e ordina per `created_at desc`: l'indice composito copre sia
--     il filtro sia l'ordinamento (l'indice singolo su `modifier` non bastava).
--
-- Idempotente: create index if not exists.
-- =============================================================================

create index if not exists idx_store_status_logs_modifier_created_at
  on public.store_status_logs (modifier, created_at desc);
