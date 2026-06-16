// Normalizza e geocodifica i lead AiCall (scripts/aicall/leads.tsv).
//
// - Pulisce il campo "Indirizzo" dai prefissi operativi (APT/ORE, N.ALT,
//   RICONTATTARE, ecc.) e dalle note finali (REC ALT, GIA CLT, ...).
// - Estrae via (street) e comune best-effort.
// - Geocodifica via Nominatim (OpenStreetMap), rispettando ~1 req/sec.
// - Scrive scripts/aicall/leads.geocoded.json (resumable: salva ad ogni riga).
//
// Uso: node scripts/aicall/geocode.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const TSV = join(__dir, 'leads.tsv');
const OUT = join(__dir, 'leads.geocoded.json');

const UA = 'appoint-aicall-import/1.0 (+https://github.com/AttitudeLTD/appoint; egidiosalinaro)';
const SLEEP_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STREET_KEYWORDS = [
  'VIALE', 'VIA', 'V.LE', 'CORSO', 'C.SO', 'PIAZZALE', 'PIAZZA', 'P.ZZA',
  'P.ZA', 'P.LE', 'LARGO', 'STRADA', 'S.DA', 'S.STATALE', 'ST. PROVINCIALE',
  'LOCALITA', "LOCALITA'", 'LOC', 'LOC.', 'CONTRADA', 'C.DA', 'BORGO',
  'FRAZIONE', 'NUCLEO', 'VICOLO', 'CUPA',
];

// Rimuove prefissi/postfissi operativi e isola la parte indirizzo.
function cleanAddress(raw) {
  let s = (raw || '').replace(/\s+/g, ' ').trim();

  // taglia note finali (recapiti alternativi, cliente privato, ecc.)
  s = s.replace(/\s*[-–]\s*REC\.?\s*ALT.*$/i, '');
  s = s.replace(/\s*[-–]\s*RECAPITO\s*ALT.*$/i, '');
  s = s.replace(/\s*[-–]\s*GIA\s*CL?T.*$/i, '');
  s = s.replace(/\s*-?\s*REC\s*ALT.*$/i, '');
  s = s.replace(/\s*-?\s*RECALL.*$/i, '');
  s = s.replace(/\s*GIA\s*CLT\s*PRIVATO.*$/i, '');

  // trova la prima keyword di via: tutto ciò che precede è rumore (APT, N.ALT…)
  const upper = s.toUpperCase();
  let bestIdx = -1;
  for (const kw of STREET_KEYWORDS) {
    const re = new RegExp(`(^|[^A-Z])${kw.replace(/[.]/g, '\\.')}(\\b|\\.|\\s)`, 'i');
    const m = upper.match(re);
    if (m) {
      const idx = m.index + (m[1] ? m[1].length : 0);
      if (bestIdx === -1 || idx < bestIdx) bestIdx = idx;
    }
  }

  if (bestIdx >= 0) {
    return s.slice(bestIdx).trim();
  }

  // nessuna via: prova a togliere prefissi noti e restituire il resto (di solito un comune)
  s = s.replace(/^N\.?\s*ALT\s+\S+\s*/i, '');
  s = s.replace(/^N\.?\s*AL\s+\S+\s*/i, '');
  s = s.replace(/^RICONTATTARE.*?(APT|$)/i, '');
  s = s.replace(/^RICONT\.?.*?(APT|$)/i, '');
  s = s.replace(/^CHIEDE\s+RICONTATTO.*?(APT|$)/i, '');
  s = s.replace(/^MOLTO\s+INTERESSATO\s*/i, '');
  s = s.replace(/^CLIENTE\s+PRIVATO\s*/i, '');
  s = s.replace(/^RICHIEDE\s+LA\s+PLATINO\s*/i, '');
  // togli "APT <data> ORE <ora>" o "APT <gg> ORE <ora>" o "<data> ORE <ora>" o "APT"
  s = s.replace(/\bAPT\b\s*\d{0,2}[\/.]?\d{0,2}\s*(ORE\s*[\d.:]+)?/i, '');
  s = s.replace(/^\d{1,2}[\/.]\d{1,2}\s*(ORE\s*[\d.:]+)?\s*/i, '');
  s = s.replace(/\bORE\s*[\d.:]+/i, '');
  s = s.replace(/\bDALLE\s*[\d.:]+\s*ALLE\s*[\d.:]+/i, '');
  return s.replace(/^[,\s-]+|[,\s-]+$/g, '').trim();
}

// Estrae il comune (best-effort) dall'indirizzo pulito.
function extractComune(cleaned) {
  if (!cleaned) return '';
  let s = cleaned.replace(/\bSNC\b/gi, '').replace(/\s+/g, ' ').trim();
  // dopo l'ultima virgola
  if (s.includes(',')) {
    const after = s.split(',').pop().trim();
    if (after) return tidyComune(after);
  }
  // dopo l'ultimo token-numero (civico): "VIA ADUA 34 PASSIRANO" -> "PASSIRANO"
  const tokens = s.split(' ');
  let lastNumIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/\d/.test(tokens[i])) lastNumIdx = i;
  }
  if (lastNumIdx >= 0 && lastNumIdx < tokens.length - 1) {
    return tidyComune(tokens.slice(lastNumIdx + 1).join(' '));
  }
  // niente civico: ultima 1-2 parole
  return tidyComune(tokens.slice(-2).join(' '));
}

function tidyComune(c) {
  let s = c.replace(/\b(KM\.?\s*[\d.,]+)\b/gi, '').replace(/[.,]+$/g, '').trim();
  s = s.replace(/^[-\s]+/, '').trim();
  s = s.replace(/\s*\/\s*[A-Z]$/i, '').trim();   // "BRESCIA/A" -> "BRESCIA"
  s = s.replace(/\s+\d+$/g, '').trim();           // "PUTIGNANO 48" -> "PUTIGNANO"
  s = s.replace(/^(SNC|N)\s+/i, '').trim();
  return s;
}

const REGION_BY_PROV = {
  BS: 'Lombardia', MI: 'Lombardia', CO: 'Lombardia', MB: 'Lombardia', VA: 'Lombardia', MN: 'Lombardia',
  BA: 'Puglia', LE: 'Puglia',
  SA: 'Campania', NA: 'Campania', AV: 'Campania', BN: 'Campania',
  RM: 'Lazio', LT: 'Lazio', FR: 'Lazio',
  PG: 'Umbria', TR: 'Umbria',
  FI: 'Toscana', AR: 'Toscana',
  FC: 'Emilia Romagna', BO: 'Emilia Romagna', RA: 'Emilia Romagna', RN: 'Emilia Romagna', MO: 'Emilia Romagna', PR: 'Emilia Romagna', FE: 'Emilia Romagna',
  VI: 'Veneto', PD: 'Veneto', VR: 'Veneto', RO: 'Veneto',
  SP: 'Liguria', AL: 'Piemonte', AN: 'Marche',
};

async function nominatim(params) {
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocode(street, comune, prov) {
  // 1) free-form: via + comune + provincia
  const queries = [];
  if (street) queries.push({ q: `${street}, ${prov}, Italia`, quality: 'street' });
  if (comune) queries.push({ q: `${comune}, ${prov}, Italia`, quality: 'comune' });
  for (const { q, quality } of queries) {
    const data = await nominatim(
      `format=json&limit=1&countrycodes=it&accept-language=it&q=${encodeURIComponent(q)}`
    );
    await sleep(SLEEP_MS);
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), quality, display: data[0].display_name };
    }
  }
  return null;
}

async function main() {
  const lines = readFileSync(TSV, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const header = lines.shift();

  let results = [];
  const done = new Set();
  if (existsSync(OUT)) {
    results = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const r of results) done.add(r.piva);
    console.log(`Ripresa: ${results.length} righe già processate.`);
  }

  let i = 0;
  for (const line of lines) {
    i++;
    const [data_setup, piva, societa, referente, indirizzo, prov, regione, phone, email] = line.split('\t');
    if (done.has(piva)) continue;

    const street = cleanAddress(indirizzo);
    const comune = extractComune(street);
    const region = regione && regione !== '#N/A' ? regione : (REGION_BY_PROV[prov] || null);

    if (process.env.DRY) {
      console.log(`${prov} | street="${street}" | comune="${comune}"  <= ${indirizzo.replace(/\s+/g,' ').trim()}`);
      continue;
    }

    let geo = null;
    try {
      geo = await geocode(street, comune, prov);
    } catch (e) {
      console.error(`  ! geocode error per ${piva}: ${e.message}`);
      await sleep(SLEEP_MS);
    }

    const rec = {
      piva, societa, referente,
      address: indirizzo.replace(/\s+/g, ' ').trim(),
      street, comune, prov, regione: region,
      phone: (phone || '').trim(), email: (email || '').trim(),
      lat: geo?.lat ?? null, lng: geo?.lng ?? null,
      geocode_quality: geo?.quality ?? 'none',
      geocode_display: geo?.display ?? null,
    };
    results.push(rec);
    writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log(`[${i}/${lines.length}] ${societa} -> ${rec.geocode_quality} ${geo ? `(${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}) ${comune}` : 'NO COORDS'}`);
  }

  const ok = results.filter((r) => r.lat != null).length;
  console.log(`\nFatto. ${ok}/${results.length} geocodificati. Output: ${OUT}`);
}

main();
