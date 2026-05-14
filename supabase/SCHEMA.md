# Appoint — Supabase Database Schema

> **Fonte di verità** dello schema del database Supabase del progetto.
> Aggiornare questo file **ad ogni cambio di schema** (insieme alla migration corrispondente in [`./migrations/`](./migrations/)).
>
> _Ultimo aggiornamento: 2026-05-14 — aggiunto modello di visibilità per utente ([`20260514123300_user_visibility_scope`](./migrations/20260514123300_user_visibility_scope.sql))._

---

## Indice

- [Panoramica](#panoramica)
- [Estensioni Postgres](#estensioni-postgres)
- [Schema `public`](#schema-public)
  - [Tabelle](#tabelle)
    - [`clients`](#clients)
    - [`client_workflows`](#client_workflows)
    - [`users`](#users)
    - [`areas`](#areas)
    - [`user_areas`](#user_areas)
    - [`user_client_access`](#user_client_access)
    - [`user_store_access`](#user_store_access)
    - [`stores`](#stores)
    - [`store_status_logs`](#store_status_logs)
    - [`store_visit_outcomes`](#store_visit_outcomes)
    - [`store_photos`](#store_photos)
    - [`generic_photos`](#generic_photos)
  - [Diagramma relazioni](#diagramma-relazioni)
  - [Modello di visibilità per utente](#modello-di-visibilit%C3%A0-per-utente)
  - [Funzioni custom](#funzioni-custom)
  - [Trigger](#trigger)
  - [RLS — Row Level Security](#rls--row-level-security)
- [Schema `storage` — Supabase Storage](#schema-storage--supabase-storage)
  - [Bucket](#bucket)
  - [Policy sugli oggetti](#policy-sugli-oggetti)
- [Schema `auth`](#schema-auth)
- [Convenzioni](#convenzioni)

---

## Panoramica

Il database supporta un'applicazione **field-sales / merchandising** che permette agli **agenti** di:

- esplorare una mappa di **negozi** (`stores`) filtrati per cliente/area geografica,
- aggiornarne lo **stato** di lavorazione tracciandone lo **storico** (`store_status_logs`),
- raccogliere **foto** sul campo (`store_photos`, `generic_photos`),
- registrare l'**esito di una visita** in base al workflow del cliente (`store_visit_outcomes`),
- essere assegnati ad **aree geografiche** (`areas` / `user_areas`).

Ruoli applicativi (`public.users.role`): `agent`, `am`, `supervisor`.
Il ruolo definisce solo la **gerarchia** (es. un AM vede solo gli agenti delle sue aree, via `user_areas`). La **visibilità sui dati di business** (clienti/negozi) è gestita separatamente dal campo `public.users.visibility_scope` e dalle tabelle `user_client_access` / `user_store_access` — vedi [Modello di visibilità per utente](#modello-di-visibilit%C3%A0-per-utente).

Stack: **PostgreSQL** + **PostGIS** (geolocalizzazione) + **Supabase Auth** + **Supabase Storage**.

---

## Estensioni Postgres

| Estensione           | Versione | Schema       | Note                                 |
| -------------------- | -------- | ------------ | ------------------------------------ |
| `plpgsql`            | 1.0      | `pg_catalog` | Linguaggio procedurale di default    |
| `pgcrypto`           | 1.3      | `extensions` | UUID e crittografia                  |
| `uuid-ossp`          | 1.1      | `extensions` | Generatori UUID                      |
| `pgjwt`              | 0.2.0    | `extensions` | JWT helper (usato da Supabase Auth)  |
| `pg_stat_statements` | 1.10     | `extensions` | Statistiche query                    |
| `pgsodium`           | 3.1.8    | `pgsodium`   | Crittografia simmetrica              |
| `supabase_vault`     | 0.3.1    | `vault`      | Vault per secret                     |
| `postgis`            | 3.3.7    | `public`     | **Geolocalizzazione store** (chiave) |

---

## Schema `public`

### Tabelle

#### `clients`

Anagrafica dei clienti business (es. brand committenti). Ogni `store` appartiene a un cliente.

| Colonna      | Tipo          | Null | Default                              | Note                       |
| ------------ | ------------- | ---- | ------------------------------------ | -------------------------- |
| `id`         | `smallint`    | NO   | `nextval('clients_id_seq')`          | **PK**                     |
| `name`       | `text`        | NO   | —                                    |                            |
| `created_at` | `timestamptz` | YES  | `now()`                              |                            |
| `logo`       | `text`        | YES  | —                                    | Path in bucket `client-logos` |

**RLS:** lettura `authenticated` vincolata a `public.user_can_see_client(auth.uid(), id)`.

---

#### `client_workflows`

Definisce il **workflow di visita** (in JSON) di ciascun cliente. _Un workflow per cliente_ (UNIQUE su `client_id`).

| Colonna      | Tipo          | Null | Default | Note                                                   |
| ------------ | ------------- | ---- | ------- | ------------------------------------------------------ |
| `id`         | `bigint`      | NO   | identity | **PK**                                                |
| `client_id`  | `smallint`    | NO   | —       | **FK** → `clients.id` (ON DELETE CASCADE), **UNIQUE** |
| `name`       | `text`        | NO   | —       |                                                        |
| `workflow`   | `jsonb`       | NO   | —       | Schema definito in `types.ts → ClientWorkflow`        |
| `active`     | `boolean`     | NO   | `true`  |                                                        |
| `created_at` | `timestamptz` | NO   | `now()` |                                                        |

**RLS:** lettura `authenticated` vincolata a `public.user_can_see_client(auth.uid(), client_id)` (un utente vede il workflow solo dei clienti che può vedere).

---

#### `users`

Profilo applicativo collegato a `auth.users` (1:1 sulla PK).
Popolato automaticamente da trigger `auth.on_auth_user_created → public.handle_new_user()`.

| Colonna            | Tipo          | Null | Default        | Note                                                                                  |
| ------------------ | ------------- | ---- | -------------- | ------------------------------------------------------------------------------------- |
| `id`               | `uuid`        | NO   | —              | **PK**, **FK** → `auth.users.id`                                                      |
| `created_at`       | `timestamptz` | NO   | `now()`        |                                                                                       |
| `name`             | `text`        | YES  | —              |                                                                                       |
| `surname`          | `text`        | YES  | —              |                                                                                       |
| `number`           | `text`        | YES  | —              | Numero di telefono                                                                    |
| `email`            | `text`        | YES  | —              |                                                                                       |
| `role`             | `text`        | NO   | `'agent'`      | CHECK IN (`'agent'`, `'am'`, `'supervisor'`)                                          |
| `visibility_scope` | `text`        | NO   | `'all'` *(¹)*  | CHECK IN (`'all'`, `'restricted'`). Vedi [Modello di visibilità per utente](#modello-di-visibilit%C3%A0-per-utente). |

*(¹)* Il default di **colonna** è `'all'` per non rompere gli utenti pre-esistenti, ma il trigger `handle_new_user()` inserisce i **nuovi** utenti con `'restricted'` (fail-closed).

**RLS:** lettura libera (`SELECT … USING (true)`).

---

#### `areas`

Aree geografiche (province) raggruppate per cliente, assegnabili agli utenti.

| Colonna      | Tipo          | Null | Default  | Note                          |
| ------------ | ------------- | ---- | -------- | ----------------------------- |
| `id`         | `bigint`      | NO   | identity | **PK**                        |
| `name`       | `text`        | NO   | —        |                               |
| `client_id`  | `smallint`    | YES  | —        | **FK** → `clients.id`         |
| `province`   | `text[]`      | YES  | —        | Es. `{"MI","BG","BS"}`        |
| `created_at` | `timestamptz` | NO   | `now()`  |                               |

**RLS:** lettura ad utenti `authenticated`.

---

#### `user_areas`

Tabella di join M:N **utente ↔ area**.

| Colonna   | Tipo     | Null | Note                                                |
| --------- | -------- | ---- | --------------------------------------------------- |
| `user_id` | `uuid`   | NO   | **PK** + **FK** → `public.users.id` (ON DELETE CASCADE) |
| `area_id` | `bigint` | NO   | **PK** + **FK** → `public.areas.id` (ON DELETE CASCADE) |

PK composta `(user_id, area_id)`.
**RLS:** lettura ad utenti `authenticated`.

> ℹ️ `user_areas` riguarda **solo la gerarchia AM ↔ agenti**, non la visibilità sui clienti/negozi. Per quella, vedi `user_client_access` / `user_store_access`.

---

#### `user_client_access`

Lista bianca **utente → cliente** per il modello di visibilità ([dettagli](#modello-di-visibilit%C3%A0-per-utente)).
Si applica solo se l'utente ha `users.visibility_scope = 'restricted'`. Per utenti `'all'` queste righe sono ignorate.

| Colonna      | Tipo          | Null | Note                                                       |
| ------------ | ------------- | ---- | ---------------------------------------------------------- |
| `user_id`    | `uuid`        | NO   | **PK** + **FK** → `public.users.id` (ON DELETE CASCADE)    |
| `client_id`  | `smallint`    | NO   | **PK** + **FK** → `public.clients.id` (ON DELETE CASCADE)  |
| `created_at` | `timestamptz` | NO   | `now()`                                                    |

PK composta `(user_id, client_id)`.
**RLS:** un utente legge solo le proprie righe (`user_id = auth.uid()`). Gestione concessioni via service role / SQL admin.

---

#### `user_store_access`

Lista bianca **utente → singolo negozio**. Complementare a `user_client_access` (la visibilità finale è l'**unione** delle due).

| Colonna      | Tipo          | Null | Note                                                       |
| ------------ | ------------- | ---- | ---------------------------------------------------------- |
| `user_id`    | `uuid`        | NO   | **PK** + **FK** → `public.users.id` (ON DELETE CASCADE)    |
| `store_id`   | `bigint`      | NO   | **PK** + **FK** → `public.stores.id` (ON DELETE CASCADE)   |
| `created_at` | `timestamptz` | NO   | `now()`                                                    |

PK composta `(user_id, store_id)`. Indice secondario `idx_user_store_access_store_id` su `(store_id)`.
**RLS:** un utente legge solo le proprie righe.

---

#### `stores`

Tabella **principale** dei negozi/POS sul territorio. Geocodificati tramite PostGIS.

| Colonna               | Tipo                  | Null | Default  | Note                                                                      |
| --------------------- | --------------------- | ---- | -------- | ------------------------------------------------------------------------- |
| `id`                  | `bigint`              | NO   | identity | **PK**                                                                    |
| `created_at`          | `timestamptz`         | NO   | `now()`  |                                                                           |
| `name`                | `text`                | YES  | —        | Ragione sociale / insegna                                                 |
| `address`             | `text`                | YES  | —        |                                                                           |
| `coordinates`         | `text`                | YES  | —        | Input formato `"lng,lat"` — sorgente per popolare `location` via trigger  |
| `location`            | `geography` (PostGIS) | YES  | —        | Punto geografico, calcolato dal trigger `trigger_convert_coordinates`     |
| `phone`               | `text`                | YES  | —        |                                                                           |
| `email`               | `text`                | YES  | —        |                                                                           |
| `owner_name`          | `text`                | YES  | —        |                                                                           |
| `category`            | `text`                | YES  | —        |                                                                           |
| `status`              | `text`                | YES  | `'free'` | `free`, `in_progress`, `concluded`, `already_client`, `failed`, `not_interested`, `non_existent` |
| `tier`                | `text`                | YES  | —        | `bronze`, `silver`, `gold`, `gold+`                                       |
| `consent`             | `boolean`             | YES  | —        | Consenso privacy                                                          |
| `type`                | `text`                | YES  | —        |                                                                           |
| `codice_ateco_gruppo` | `text`                | YES  | —        |                                                                           |
| `codice_ateco`        | `text`                | YES  | —        |                                                                           |
| `cap`                 | `text`                | YES  | —        | CAP                                                                       |
| `regione`             | `text`                | YES  | —        |                                                                           |
| `provincia`           | `text`                | YES  | —        |                                                                           |
| `comune`              | `text`                | YES  | —        |                                                                           |
| `pi`                  | `text`                | YES  | —        | Partita IVA                                                               |
| `cf_azienda`          | `text`                | YES  | —        | Codice fiscale azienda                                                    |
| `dipendenti`          | `text`                | YES  | —        |                                                                           |
| `fatturato`           | `text`                | YES  | —        | Fatturato annuo                                                           |
| `client_id`           | `smallint`            | NO   | `1`      | **FK** → `clients.id` (ON DELETE RESTRICT)                                |

**Indici notabili:** `idx_stores_client_id` su `(client_id)`. ⚠️ Considerare in futuro un **GIST index su `location`** per le query spaziali.

**RLS:**
- `SELECT` vincolato a `public.user_can_see_store(auth.uid(), id)` — vedi [Modello di visibilità per utente](#modello-di-visibilit%C3%A0-per-utente). Gli utenti `anon` non vedono nulla.
- `INSERT` consentito ad utenti `authenticated`.
- `UPDATE` consentito a tutti.

---

#### `store_status_logs`

Storico delle transizioni di `stores.status`. Inserimento manuale lato app (nessun trigger automatico).

| Colonna      | Tipo          | Null | Note                                                  |
| ------------ | ------------- | ---- | ----------------------------------------------------- |
| `id`         | `bigint`      | NO   | **PK**, identity                                      |
| `created_at` | `timestamptz` | NO   | `now()`                                               |
| `store_id`   | `bigint`      | NO   | **FK** → `stores.id`                                  |
| `prev`       | `text`        | NO   | Stato precedente                                      |
| `new`        | `text`        | NO   | Stato nuovo                                           |
| `modifier`   | `uuid`        | NO   | **FK** → `public.users.id` (autore della transizione) |
| `notes`      | `text`        | YES  |                                                       |

**RLS:**
- `SELECT` aperto.
- `INSERT` consentito agli utenti `authenticated`.

---

#### `store_visit_outcomes`

Risultato di una visita al negozio per uno specifico cliente, in base al workflow.
Esiste **al massimo un esito per coppia `(store_id, user_id)`** (UNIQUE `uq_store_visit_outcomes_store_user`).

| Colonna        | Tipo          | Null | Default | Note                                                |
| -------------- | ------------- | ---- | ------- | --------------------------------------------------- |
| `id`           | `bigint`      | NO   | identity | **PK**                                              |
| `store_id`     | `bigint`      | NO   | —       | **FK** → `stores.id` (ON DELETE CASCADE)            |
| `client_id`    | `smallint`    | NO   | —       | **FK** → `clients.id`                               |
| `user_id`      | `uuid`        | NO   | —       | (autore della visita)                               |
| `outcome_data` | `jsonb`       | NO   | `'{}'`  | Risposte alle sezioni del `client_workflows.workflow` |
| `created_at`   | `timestamptz` | NO   | `now()` |                                                     |

**RLS:** `SELECT` e `INSERT` autenticati; `UPDATE` solo del proprio record (`user_id = auth.uid()`).

---

#### `store_photos`

Foto associate a un negozio specifico.

| Colonna      | Tipo          | Null | Default  | Note                                          |
| ------------ | ------------- | ---- | -------- | --------------------------------------------- |
| `id`         | `bigint`      | NO   | sequence | **PK**                                        |
| `store_id`   | `int`         | NO   | —        | **FK** → `stores.id` (ON DELETE CASCADE)      |
| `user_id`    | `uuid`        | NO   | —        | Autore                                        |
| `photo_url`  | `text`        | NO   | —        | URL nel bucket `store-photos`                 |
| `created_at` | `timestamptz` | YES  | `now()`  |                                               |
| `updated_at` | `timestamptz` | YES  | `now()`  | Aggiornato dal trigger `update_…_updated_at`  |

**RLS:** lettura aperta agli `authenticated`; insert/delete del proprio (`auth.uid() = user_id`).

---

#### `generic_photos`

Foto generiche (es. dei materiali del POS) associate a un negozio. Stessa struttura di `store_photos`.

| Colonna      | Tipo          | Null | Default  | Note                                          |
| ------------ | ------------- | ---- | -------- | --------------------------------------------- |
| `id`         | `bigint`      | NO   | sequence | **PK**                                        |
| `store_id`   | `int`         | NO   | —        | **FK** → `stores.id` (ON DELETE CASCADE)      |
| `user_id`    | `uuid`        | NO   | —        |                                               |
| `photo_url`  | `text`        | NO   | —        | URL nel bucket `generic-photos`               |
| `created_at` | `timestamptz` | YES  | `now()`  |                                               |
| `updated_at` | `timestamptz` | YES  | `now()`  | Trigger `update_generic_photos_updated_at`    |

**RLS:** identica a `store_photos`.

---

### Diagramma relazioni

```mermaid
erDiagram
    auth_users ||--|| users : "id"
    clients ||--o{ stores : "client_id"
    clients ||--o| client_workflows : "client_id (UNIQUE)"
    clients ||--o{ areas : "client_id"
    clients ||--o{ store_visit_outcomes : "client_id"

    users ||--o{ user_areas : "user_id"
    areas ||--o{ user_areas : "area_id"

    users   ||--o{ user_client_access : "user_id"
    clients ||--o{ user_client_access : "client_id"

    users  ||--o{ user_store_access : "user_id"
    stores ||--o{ user_store_access : "store_id"

    stores ||--o{ store_status_logs : "store_id"
    stores ||--o{ store_visit_outcomes : "store_id"
    stores ||--o{ store_photos : "store_id"
    stores ||--o{ generic_photos : "store_id"

    users ||--o{ store_status_logs : "modifier"
```

---

### Modello di visibilità per utente

Indipendente da `areas` / `user_areas` (che riguardano la gerarchia AM ↔ agenti), questo meccanismo regola **quali clienti e quali negozi un utente vede** sulla mappa e nei dropdown dell'app.

**Componenti**

| Cosa                            | Dove                              |
| ------------------------------- | --------------------------------- |
| Modalità di scope per utente    | `public.users.visibility_scope`   |
| Concessioni a livello cliente   | `public.user_client_access`       |
| Concessioni a livello negozio   | `public.user_store_access`        |
| Logica di scoping (predicate)   | `public.user_can_see_store(...)`, `public.user_can_see_client(...)` |

**Semantica**

| `visibility_scope` | `user_client_access` | `user_store_access` | Cosa vede l'utente                                                       |
| ------------------ | -------------------- | ------------------- | ------------------------------------------------------------------------- |
| `'all'`            | _(ignorato)_         | _(ignorato)_        | Tutti i clienti e tutti i negozi (comportamento storico).                 |
| `'restricted'`     | vuoto                | vuoto               | **Nessuno** (fail-closed).                                                |
| `'restricted'`     | `{A, B}`             | vuoto               | Tutti i negozi di A + tutti i negozi di B.                                |
| `'restricted'`     | vuoto                | `{s1, s2, s3}`      | Solo `s1`, `s2`, `s3` (anche di clienti diversi).                         |
| `'restricted'`     | `{A}`                | `{s7, s8}` (cli. C) | Tutti i negozi di A **+** `s7`, `s8` del cliente C.                       |

**Regole importanti**

- **Retrocompatibilità**: utenti pre-esistenti restano `'all'` → non cambia nulla per loro.
- **Nuovi utenti**: il trigger `handle_new_user()` li crea con `'restricted'` → di default non vedono nulla finché non ricevono concessioni.
- **Nessun ruolo bypassa lo scoping**: anche un `supervisor` con `'restricted'` vede solo ciò che è in elenco. Per dargli accesso totale → impostare `visibility_scope = 'all'`.
- **`user_can_see_client`** considera "visibile" anche il cliente di un negozio in `user_store_access` (per coerenza UI: se vedi un pin, devi vedere il nome/logo del suo cliente).
- **Punti di applicazione**:
  - RLS `SELECT` su `public.clients`, `public.stores`, `public.client_workflows`;
  - filtro esplicito dentro `public.get_stores_within_radius()` (che alimenta la mappa).

**Esempi pratici (gestione concessioni)**

```sql
-- Far diventare un utente "scoped"
update public.users
set visibility_scope = 'restricted'
where id = '<uuid>';

-- Concedergli tutti i negozi di un cliente
insert into public.user_client_access (user_id, client_id)
values ('<uuid>', 2)
on conflict do nothing;

-- Concedergli singoli negozi (oltre/invece che per cliente)
insert into public.user_store_access (user_id, store_id)
select '<uuid>', s.id
from public.stores s
where s.id in (101, 102, 103)
on conflict do nothing;

-- Rimettere un utente a "tutto"
update public.users
set visibility_scope = 'all'
where id = '<uuid>';
```

> ⚠️ Le tabelle dipendenti (`store_status_logs`, `store_visit_outcomes`, `store_photos`, `generic_photos`) **non** hanno una RLS che verifica direttamente lo scope. Sono accessibili agli `authenticated`, ma in pratica vengono filtrate "a monte" perché l'app parte sempre dalla lista degli stores visibili. Da rivedere se in futuro si esponessero endpoint che bypassano questa logica.

---

### Funzioni custom

> Esclusi i centinaia di simboli installati da PostGIS.

| Funzione                              | Argomenti                                                                       | Ritorno  | Note                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle_new_user()`                   | —                                                                               | trigger  | **SECURITY DEFINER**. Inserisce una riga in `public.users` quando viene creato un utente in `auth.users`. I nuovi utenti vengono creati con `visibility_scope = 'restricted'`. |
| `convert_coordinates_to_location()`   | —                                                                               | trigger  | Trasforma il campo testuale `stores.coordinates` (`"lng,lat"`) nel punto PostGIS `stores.location`.                                                        |
| `user_can_see_store(p_user_id uuid, p_store_id bigint)`     | `uuid, bigint`                                              | `boolean` | **SECURITY DEFINER / STABLE**. Predicato di visibilità sul negozio. Usato dalla RLS di `stores` e dalla RPC `get_stores_within_radius`.                    |
| `user_can_see_client(p_user_id uuid, p_client_id smallint)` | `uuid, smallint`                                            | `boolean` | **SECURITY DEFINER / STABLE**. Predicato di visibilità sul cliente. Usato dalla RLS di `clients` e `client_workflows`.                                     |
| `get_stores_within_radius(...)`       | `lat double precision, lng double precision, radius double precision, p_client_id bigint, p_limit integer` | TABLE    | Ritorna negozi entro un raggio (in metri) da un punto, filtrati per cliente **e** per scope di visibilità del chiamante (`auth.uid()`).                    |
| `getstoreswithinradius(...)`          | `lat, lng, radius`                                                              | TABLE    | _Legacy / deprecato_ — versione precedente di `get_stores_within_radius`.                                                                                  |
| `update_store_photos_updated_at()`    | —                                                                               | trigger  | Mantiene `store_photos.updated_at = now()` su UPDATE.                                                                                                      |
| `update_generic_photos_updated_at()`  | —                                                                               | trigger  | Mantiene `generic_photos.updated_at = now()` su UPDATE.                                                                                                    |

---

### Trigger

| Trigger                                | Tabella                  | Quando                   | Funzione                              |
| -------------------------------------- | ------------------------ | ------------------------ | ------------------------------------- |
| `on_auth_user_created`                 | `auth.users`             | AFTER INSERT             | `handle_new_user()`                   |
| `trigger_convert_coordinates`          | `public.stores`          | BEFORE INSERT            | `convert_coordinates_to_location()`   |
| `trigger_convert_coordinates_update`   | `public.stores`          | BEFORE UPDATE            | `convert_coordinates_to_location()`   |
| `update_store_photos_updated_at`       | `public.store_photos`    | BEFORE UPDATE            | `update_store_photos_updated_at()`    |
| `update_generic_photos_updated_at`     | `public.generic_photos`  | BEFORE UPDATE            | `update_generic_photos_updated_at()`  |

---

### RLS — Row Level Security

| Tabella                | Policy                                          | Cmd      | Ruoli           | Condizione                                                            |
| ---------------------- | ----------------------------------------------- | -------- | --------------- | --------------------------------------------------------------------- |
| `clients`              | _Read clients via visibility scope_             | SELECT   | `authenticated` | `public.user_can_see_client(auth.uid(), id)`                          |
| `client_workflows`     | _Read client_workflows via visibility scope_    | SELECT   | `authenticated` | `public.user_can_see_client(auth.uid(), client_id)`                   |
| `users`                | _Enable read access for all users_              | SELECT   | `public`        | `true`                                                                |
| `areas`                | _Auth read areas_                               | SELECT   | `public`        | `auth.role() = 'authenticated'`                                       |
| `user_areas`           | _Auth read user_areas_                          | SELECT   | `public`        | `auth.role() = 'authenticated'`                                       |
| `user_client_access`   | _Users can read own client access_              | SELECT   | `authenticated` | `user_id = auth.uid()`                                                |
| `user_store_access`    | _Users can read own store access_               | SELECT   | `authenticated` | `user_id = auth.uid()`                                                |
| `stores`               | _Read stores via visibility scope_              | SELECT   | `public`        | `public.user_can_see_store(auth.uid(), id)`                           |
| `stores`               | _Enable insert for authenticated users only_    | INSERT   | `authenticated` | WITH CHECK `true`                                                     |
| `stores`               | _Enable update for users_                       | UPDATE   | `public`        | USING `true` / WITH CHECK `true`                                      |
| `store_status_logs`    | _Enable read access for all users_              | SELECT   | `public`        | `true`                                                                |
| `store_status_logs`    | _Enable insert for authenticated users only_    | INSERT   | `authenticated` | WITH CHECK `true`                                                     |
| `store_visit_outcomes` | _Authenticated read store_visit_outcomes_       | SELECT   | `public`        | `auth.role() = 'authenticated'`                                       |
| `store_visit_outcomes` | _Authenticated insert store_visit_outcomes_     | INSERT   | `public`        | WITH CHECK `auth.role() = 'authenticated'`                            |
| `store_visit_outcomes` | _Authenticated update own store_visit_outcomes_ | UPDATE   | `public`        | USING `user_id = auth.uid()`                                          |
| `store_photos`         | _Authenticated users can view all photos_       | SELECT   | `authenticated` | `true`                                                                |
| `store_photos`         | _Users can insert their own photos_             | INSERT   | `authenticated` | WITH CHECK `auth.uid() = user_id`                                     |
| `store_photos`         | _Users can delete their own photos_             | DELETE   | `authenticated` | `auth.uid() = user_id`                                                |
| `generic_photos`       | _Authenticated users can view all generic photos_ | SELECT | `authenticated` | `true`                                                                |
| `generic_photos`       | _Users can insert their own generic photos_     | INSERT   | `authenticated` | WITH CHECK `auth.uid() = user_id`                                     |
| `generic_photos`       | _Users can delete their own generic photos_     | DELETE   | `authenticated` | `auth.uid() = user_id`                                                |

> ⚠️ Diverse tabelle (`store_status_logs`, `users`, …) hanno ancora policy con `USING (true)` per il `SELECT`, cioè lettura completamente aperta. `stores`, `clients` e `client_workflows` sono invece vincolati dal [modello di visibilità per utente](#modello-di-visibilit%C3%A0-per-utente). Valutare in futuro un irrigidimento anche sulle tabelle dipendenti (`store_status_logs`, `store_visit_outcomes`, `store_photos`, `generic_photos`) per evitare leak di dati riferiti a negozi non visibili.

---

## Schema `storage` — Supabase Storage

### Bucket

| ID               | Public | Limite size | MIME consentiti                                       |
| ---------------- | ------ | ----------- | ----------------------------------------------------- |
| `client-logos`   | ✅ sì  | 1 MB        | `image/jpeg`, `image/png`, `image/webp`, `image/gif`  |
| `generic-photos` | ✅ sì  | 5 MB        | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/jpg` |
| `store-photos`   | ✅ sì  | —           | —                                                     |

### Policy sugli oggetti

> _Tutte le policy sotto sono in `storage.objects`._

**Bucket `client-logos`:**
- `SELECT` pubblico (chiunque, anche `anon`).
- `INSERT` / `UPDATE` / `DELETE` consentiti agli utenti `authenticated`.

**Bucket `store-photos`:**
- `SELECT` e `INSERT` consentiti agli `authenticated`.
- `UPDATE` / `DELETE` solo del proprio: `auth.uid()::text = (string_to_array(name, '_'))[2]`.
  > Convenzione **filename**: `<prefix>_<uid>_<...>.<ext>` — il segmento `[2]` deve corrispondere all'UID dell'utente.

**Bucket `generic-photos`:**
- Idem a `store-photos`, con la stessa convenzione di filename.

---

## Schema `auth`

Gestito interamente da **Supabase Auth** — non modificare manualmente.
La sola integrazione custom è il trigger `auth.on_auth_user_created` che popola `public.users`.

---

## Convenzioni

### Naming

- **Tabelle**: `snake_case`, plurale (`stores`, `clients`, `store_photos`).
- **Tabelle di join**: `entità1_entità2` (es. `user_areas`).
- **Colonne FK**: `<entità>_id` (`store_id`, `client_id`, `user_id`).
- **PK**: sempre `id`.
- **Timestamps**: `created_at`, `updated_at` (timestamptz, default `now()`).
- **Funzioni trigger**: `<azione>_<tabella>_<colonna?>` (es. `update_store_photos_updated_at`).
- **Indici**: `idx_<tabella>_<colonne>`.

### Migration

Vedi [`./migrations/README.md`](./migrations/README.md) per la convenzione di naming/numerazione delle migration.
