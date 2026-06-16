// Genera il seed SQL dei lead AiCall a partire da leads.geocoded.json.
//
// - Produce supabase/seed/20260616_aicall_leads.sql (idempotente: anti-join su
//   (client_id, pi)).
// - Produce inoltre batch separati su stdout opzionalmente (per applicazione MCP).
//
// Uso: node scripts/aicall/gen-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const IN = join(__dir, 'leads.geocoded.json');
const OUT = join(__dir, '..', '..', 'supabase', 'seed', '20260616_aicall_leads.sql');
const CLIENT_ID = 5;

const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

// Formato coordinate IDENTICO alle righe storiche: "[lat, lng]" con parentesi
// quadre, spazio dopo la virgola, parte intera a 2 cifre (zero-pad) e 8 decimali.
// Il trigger `convert_coordinates_to_location` toglie le parentesi e fa lo split
// con part1=lat, part2=lng → ST_Point(lng, lat). Va quindi usato QUESTO formato,
// non "lng,lat".
const fmt = (n) => {
  const [i, d] = Number(n).toFixed(8).split('.');
  return `${i.padStart(2, '0')}.${d}`;
};

const rows = JSON.parse(readFileSync(IN, 'utf8'));

const valueRows = [];
let withCoords = 0;
let noCoords = 0;
for (const r of rows) {
  const coords = r.lat != null && r.lng != null ? `[${fmt(r.lat)}, ${fmt(r.lng)}]` : null;
  if (coords) withCoords++; else noCoords++;
  valueRows.push(
    `  (${q(r.societa)}, ${q(r.referente)}, ${q(r.piva)}, ${q(r.address)}, ${q(coords)}, ${q(r.phone)}, ${q(r.email)}, ${q(r.comune)}, ${q(r.prov)}, ${q(r.regione)}, 'altro', 'free', ${CLIENT_ID}::smallint)`
  );
}

const header = `-- =============================================================================
-- Seed: PROGETTO AICALL — import lead (stores) generati dal partner AiCall
-- Date: 2026-06-16
-- Author: egidiosalinaro
--
-- Cosa fa:
--   - Inserisce ${rows.length} lead come righe in public.stores (client_id = ${CLIENT_ID}).
--   - Coordinate geocodificate via Nominatim/OSM (${withCoords} con coords, ${noCoords} senza).
--     Le righe senza coordinate NON appaiono come pin (location resta NULL).
--   - Normalizzazione "secondo la tabella stores":
--       name=Società · owner_name=Referente · pi=P.IVA · address=Indirizzo grezzo
--       (mantiene l'info appuntamento APT/ORE) · comune/provincia/regione parse · category='altro'.
--   - coordinates nel formato storico "[lat, lng]" (parentesi quadre + spazio): il
--     trigger convert_coordinates_to_location calcola da lì il punto PostGIS location.
--   - Backfill store_clients (is_primary = true) per ogni store del cliente.
--
-- Idempotenza:
--   - anti-join su (client_id, pi): ri-eseguibile senza duplicare.
-- =============================================================================

begin;

insert into public.stores
  (name, owner_name, pi, address, coordinates, phone, email, comune, provincia, regione, category, status, client_id)
select v.name, v.owner_name, v.pi, v.address, v.coordinates, v.phone, v.email, v.comune, v.provincia, v.regione, v.category, v.status, v.client_id
from (values
${valueRows.join(',\n')}
) as v(name, owner_name, pi, address, coordinates, phone, email, comune, provincia, regione, category, status, client_id)
where not exists (
  select 1 from public.stores s
  where s.client_id = ${CLIENT_ID} and s.pi = v.pi
);

-- store_clients: associazione primaria per ogni store del cliente
insert into public.store_clients (store_id, client_id, is_primary)
select s.id, ${CLIENT_ID}, true
from public.stores s
where s.client_id = ${CLIENT_ID}
on conflict (store_id, client_id) do nothing;

commit;
`;

writeFileSync(OUT, header);
console.log(`Scritto ${OUT}`);
console.log(`Righe: ${rows.length} (con coords: ${withCoords}, senza: ${noCoords})`);
