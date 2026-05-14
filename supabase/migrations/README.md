# Supabase Migrations

Questa cartella contiene le **migration SQL incrementali** dello schema del database.

Per la documentazione completa dello schema corrente vedi [`../SCHEMA.md`](../SCHEMA.md).
Per uno snapshot SQL del baseline vedi [`../schema/public_schema.sql`](../schema/public_schema.sql).

---

## Convenzione di naming

```
YYYYMMDDHHMMSS_breve_descrizione.sql
```

Esempi:

```
20260514120000_add_store_gist_index.sql
20260601093000_add_store_visit_outcomes_notes.sql
20260615174500_create_invoices_table.sql
```

> Compatibile con il CLI `supabase` (`supabase migration new <name>` genera il timestamp automaticamente).

## Workflow consigliato

1. **Crea la migration**
   ```bash
   supabase migration new <descrizione_breve>
   ```
   (oppure crea manualmente il file con il timestamp UTC).

2. **Scrivi le statement SQL** idempotenti dove possibile:
   - `create table if not exists …`
   - `create index if not exists …`
   - `drop policy if exists … ; create policy …`
   - `alter table … add column if not exists …`

3. **Testa in locale** (se usi Supabase CLI):
   ```bash
   supabase db reset       # ricrea da migrations
   # oppure
   supabase db push        # applica al progetto remoto
   ```

4. **Aggiorna la documentazione**:
   - [`../SCHEMA.md`](../SCHEMA.md) → sezioni interessate + bump della data in cima.
   - [`../schema/public_schema.sql`](../schema/public_schema.sql) → sincronizza se la modifica fa parte del baseline (table create/alter, index, function, trigger principali).

5. **Commit** in un'unica change-list:
   - `supabase/migrations/<timestamp>_<descrizione>.sql`
   - `supabase/SCHEMA.md`
   - `supabase/schema/public_schema.sql` (se toccato)
   - `types.ts` (se cambia la shape esposta al frontend)

## Template di migration

```sql
-- =============================================================================
-- <Titolo della modifica>
-- Date: YYYY-MM-DD
-- Author: <tuo nome>
--
-- Cosa fa:
--   - …
-- Perché:
--   - …
-- Rollback:
--   - vedi sezione finale (o sostituire con migration di rollback)
-- =============================================================================

begin;

-- ---- forward ---------------------------------------------------------------

-- … statements SQL …

commit;

-- ---- rollback (riferimento, non eseguito) ----------------------------------
-- begin;
--   …statement inversi…
-- commit;
```

## Regole

- **Idempotenza**: ogni file deve poter essere ri-eseguito senza errori (usa `if not exists`, `drop … if exists`, `on conflict do nothing`).
- **Transazionale**: avvolgere in `begin; … commit;` quando possibile.
- **Niente dati di produzione**: le migration definiscono **schema**, non popolano dati di business (i seed vanno altrove).
- **Una migration = un cambiamento logico**: meglio più file piccoli che un mega-file.
- **Mai modificare** una migration già pushata in produzione: crearne una nuova che corregge.
- **RLS sempre dichiarata**: se crei una tabella, dichiara anche `alter table … enable row level security;` e le relative policy.
