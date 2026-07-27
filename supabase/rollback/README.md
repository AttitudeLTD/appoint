# Script di rollback

Script SQL che **annullano** una migration di [`../migrations/`](../migrations/).

## Perché stanno qui e non in `migrations/`

Il CLI `supabase` tratta **ogni** file `.sql` dentro `supabase/migrations/` come una
migration da applicare. Un rollback lasciato lì verrebbe eseguito da
`supabase db push` **subito dopo** la migration che deve annullare — cioè
disferebbe la modifica appena applicata, in produzione, senza che nessuno l'abbia
chiesto. Per questo vivono in una cartella separata, che il CLI ignora.

## Convenzione

```
<stesso_timestamp_della_migration>_<stessa_descrizione>_rollback.sql
```

Ogni file è **auto-contenuto** e va eseguito a mano (SQL editor di Supabase o
`psql`), mai tramite `supabase db push`.

## Contenuto

| File | Annulla | Nota |
| ---- | ------- | ---- |
| [`20260727125237_gswr_set_based_visibility_rollback.sql`](./20260727125237_gswr_set_based_visibility_rollback.sql) | Filtro di visibilità insiemistico in `get_stores_within_radius` | Ripristina il corpo di `20260702140000_stores_pi_in_rpc` (SECURITY INVOKER, `user_can_see_store` riga per riga). Nessun dato né schema toccati. |
| [`20260727131525_clients_show_on_map_rollback.sql`](./20260727131525_clients_show_on_map_rollback.sql) | Esclusione di Amex dalla mappa | Nel 99% dei casi basta la riga `update public.clients set show_on_map = true where id = 2;` — il file contiene anche il ripristino completo della RPC. |

> ⚠️ I due rollback sono in **ordine**: il secondo riporta la RPC alla versione
> introdotta dal primo. Se serve tornare indietro del tutto, eseguire prima
> `…_clients_show_on_map_rollback.sql` e poi
> `…_gswr_set_based_visibility_rollback.sql`.
