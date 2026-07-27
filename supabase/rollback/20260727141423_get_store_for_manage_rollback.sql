-- =============================================================================
-- ROLLBACK di 20260727141423_get_store_for_manage.sql
--            e di 20260727142740_get_store_for_manage_editing_policy.sql
-- NON è una migration: non va applicata da `supabase db push`.
--
-- Elimina la RPC usata dalla Dashboard per aprire la scheda "Gestisci" di una
-- lead dello storico. Va eseguita SOLO insieme al revert del codice frontend:
-- senza la funzione, il bottone ⚙ dello storico riceve un errore PGRST202.
-- =============================================================================

drop function if exists public.get_store_for_manage(bigint);
