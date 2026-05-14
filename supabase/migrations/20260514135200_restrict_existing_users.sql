-- =============================================================================
-- Migration: restrict_existing_users
-- Data:      2026-05-14
-- =============================================================================
-- Converte TUTTI gli utenti esistenti da visibility_scope = 'all'
-- a visibility_scope = 'restricted', preservandone la visibilità corrente
-- tramite uno "snapshot" di grants in user_client_access.
--
-- Effetti:
--   * ogni utente che oggi vede TUTTI i clienti riceve una riga di
--     user_client_access per OGNI cliente attualmente presente
--     → la sua visibilità non cambia (continua a vedere quei clienti);
--   * dopo questa migration, i NUOVI clienti creati in seguito NON
--     vengono concessi automaticamente a nessuno: solo gli utenti
--     esplicitamente abilitati via user_client_access li vedranno;
--   * il trigger handle_new_user (già modificato dalla migration
--     20260514123300) continua a creare i nuovi utenti come 'restricted'
--     senza grant → un nuovo signup non vedrà nulla finché un admin
--     non gli concederà esplicitamente clienti/negozi.
--
-- Pattern d'uso da qui in poi:
--   * per concedere a Tizio l'accesso al cliente N:
--       insert into public.user_client_access (user_id, client_id)
--       values ('<uuid>', N) on conflict do nothing;
--   * per concedere solo singoli negozi:
--       insert into public.user_store_access (user_id, store_id) ...;
--   * per riportare un utente al comportamento "vede tutto":
--       update public.users set visibility_scope = 'all' where id = '<uuid>';
--
-- Idempotenza:
--   * lo UPDATE è idempotente (rieseguendolo restituisce 0 righe);
--   * l'INSERT usa ON CONFLICT DO NOTHING (la PK composta
--     (user_id, client_id) impedisce duplicati);
--   * rieseguire l'intera migration è quindi sicuro.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Snapshot dei grants PRIMA di cambiare lo scope.
--    Dato che oggi tutti sono 'all' (vedono tutto), generiamo righe
--    di user_client_access per ogni coppia (utente × cliente esistente).
-- ---------------------------------------------------------------------------
insert into public.user_client_access (user_id, client_id)
select u.id, c.id
from public.users    u
cross join public.clients c
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 2) Bulk-restrict di tutti gli utenti esistenti.
--    Da ora in poi vedono solo ciò che è in user_client_access /
--    user_store_access — che per gli esistenti coincide con la
--    visibilità precedente (vedi step 1).
-- ---------------------------------------------------------------------------
update public.users
set visibility_scope = 'restricted'
where visibility_scope <> 'restricted';
