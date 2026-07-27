-- =============================================================================
-- Migration: clients.editing_policy — chi può riaprire un punto vendita esitato
-- Date: 2026-07-27
-- Author: egidiosalinaro
--
--   'exclusive' (default): il primo agente che esita mantiene il controllo; per
--                          gli altri il pin risulta "trattativa in corso" e non
--                          espone il pannello "Gestisci". Comportamento storico.
--   'shared'             : qualunque agente autorizzato può riaprire il punto
--                          vendita e registrare un proprio esito.
--
-- Configurazione di COMPORTAMENTO per cliente, accanto a `show_on_map` e
-- `auto_grant_new_users`. NON è un permesso: l'esclusività non è mai stata
-- imposta dal database — la policy UPDATE di `stores` è `user_can_see_store`,
-- senza alcun controllo di proprietà. Era ed è una regola di INTERFACCIA, e per
-- questo 'shared' NON richiede alcuna modifica alle RLS.
--
-- Il modello dati è già adatto a 'shared': `store_visit_outcomes` ha UNIQUE
-- (store_id, user_id) e UPDATE limitato al proprio record, quindi ogni agente
-- scrive la PROPRIA riga senza sovrascrivere quella di nessun altro e lo storico
-- esiti resta completo. L'esito "corrente" del negozio è il più recente — che è
-- già come la Dashboard calcola i bucket delle card.
--
-- Il default 'exclusive' + il CHECK garantiscono che ogni cliente non toccato
-- esplicitamente si comporti esattamente come oggi. Il frontend
-- (`utils/editing-policy.ts → isLockedForMe`) tratta qualsiasi valore diverso da
-- 'shared' — incluso NULL, stringa vuota o un valore futuro non ancora gestito —
-- come 'exclusive': fail-safe verso il comportamento storico.
--
-- Impostata a 'shared' per il solo cliente AiCall (id 5).
--
-- Rollback: ../rollback/20260727142706_clients_editing_policy_rollback.sql
-- =============================================================================

begin;

alter table public.clients
  add column if not exists editing_policy text not null default 'exclusive';

alter table public.clients
  drop constraint if exists clients_editing_policy_check;
alter table public.clients
  add  constraint clients_editing_policy_check
       check (editing_policy in ('exclusive', 'shared'));

comment on column public.clients.editing_policy is
  '''exclusive'' (default) = il primo agente che esita mantiene il controllo del punto vendita; ''shared'' = qualsiasi agente autorizzato può riaprirlo e registrare un proprio esito. Regola di interfaccia, non di autorizzazione: le RLS non cambiano.';

-- AiCall: lead condivisi fra tutti gli agenti del progetto.
update public.clients
   set editing_policy = 'shared'
 where id = 5
   and name = 'AiCall';

-- Guardie: la migration deve fallire, non passare in silenzio, se l'id 5 non è
-- AiCall o se per errore un altro cliente risultasse non più 'exclusive'.
do $$
begin
  if not exists (
    select 1 from public.clients
     where id = 5 and name = 'AiCall' and editing_policy = 'shared'
  ) then
    raise exception 'Cliente AiCall (id 5) non trovato o non aggiornato';
  end if;
  if exists (
    select 1 from public.clients where id <> 5 and editing_policy <> 'exclusive'
  ) then
    raise exception 'Un cliente diverso da AiCall non e'' piu'' exclusive';
  end if;
end $$;

commit;
