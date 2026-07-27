-- Ricerca per NOME punto vendita nella barra di ricerca della mappa.
--
-- Contesto: la barra di ricerca della mappa interrogava solo Nominatim (geocoding
-- esterno, indirizzi), quindi non trovava i punti vendita per ragione sociale.
-- Ora la stessa barra cerca anche su `stores.name` lato server (limit basso),
-- mai client-side sull'intero dataset.
--
-- Questa migration è ADDITIVA:
--   - nessuna modifica allo schema dati (nessuna colonna/tabella toccata);
--   - nessun impatto su RLS (le policy esistenti continuano ad applicarsi);
--   - l'indice GIN trigram rende `name ilike '%testo%'` index-assisted, così la
--     ricerca resta veloce anche crescendo molto il numero di negozi.
--
-- Verificato su ~14.5k negozi: Bitmap Index Scan su stores_name_trgm_idx,
-- execution time ~0.3 ms (prima: Seq Scan su tutta la tabella).

create extension if not exists pg_trgm;

create index if not exists stores_name_trgm_idx
  on public.stores using gin (name gin_trgm_ops);
