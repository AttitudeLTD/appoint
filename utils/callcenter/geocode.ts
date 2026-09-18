/**
 * Geocodifica server-side (Nominatim / OpenStreetMap) per i punti vendita creati
 * dal webhook del call center. Stessa fonte usata per l'import CSV dei lead
 * AiCall (`scripts/aicall/geocode.mjs`), qui con query STRUTTURATA
 * (street/postalcode/city) che è molto più affidabile della ricerca libera.
 *
 * Strategia, dalla più precisa alla meno precisa:
 *   1. strutturata: via + CAP + comune            → precision 'street'
 *   2. strutturata: via + comune (senza CAP)      → precision 'street'
 *   3. libera:      "via, CAP comune (PROV)"      → precision 'street' se il
 *      risultato ricade nel comune indicato, altrimenti scartata
 *   4. strutturata: solo comune (+ CAP)           → precision 'comune'
 *      (pin al centro del paese: l'agente ha comunque l'indirizzo nella scheda)
 *
 * Policy Nominatim: 1 richiesta al secondo. Tutte le richieste dell'istanza
 * passano da un'unica coda con pacing (`paced`), anche quando il batch elabora
 * più appuntamenti in parallelo. Con una `deadline` la catena si interrompe e
 * restituisce `'timeout'`: l'indirizzo verrà geocodificato dopo (backfill).
 */
import { PROVINCE } from './italy';

export type GeocodePrecision = 'street' | 'comune' | 'none';

export interface GeocodeResult {
  lat: number;
  lng: number;
  precision: GeocodePrecision;
  displayName: string | null;
}

export interface GeocodeInput {
  indirizzo: string;
  cap: string | null;
  comune: string;
  provincia: string | null;
}

const UA = 'appoint-callcenter-webhook/1.0 (+https://github.com/AttitudeLTD/appoint)';
const ITALY = { minLat: 35, maxLat: 47.5, minLng: 6, maxLng: 19 };

/** Policy Nominatim: massimo 1 richiesta al secondo. */
const MIN_INTERVAL_MS = 1000;
/** Quanto deve mancare alla deadline per permetterci un'altra richiesta. */
const REQUEST_RESERVE_MS = 1500;

interface NominatimRow {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string>;
}

/** Restituito quando la deadline non lascia il tempo per (altre) richieste. */
export const GEOCODE_TIMEOUT = 'timeout' as const;
export type GeocodeOutcome = GeocodeResult | null | typeof GEOCODE_TIMEOUT;

// Pacing per istanza: le richieste a Nominatim sono serializzate e distanziate
// di almeno MIN_INTERVAL_MS, anche se arrivano da item elaborati in parallelo.
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

class DeadlineError extends Error {}

function paced<T>(fn: () => Promise<T>, deadline?: number): Promise<T> {
  const run = async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (deadline != null && Date.now() + REQUEST_RESERVE_MS > deadline) throw new DeadlineError();
    lastRequestAt = Date.now();
    return fn();
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

async function nominatim(params: Record<string, string>, deadline?: number): Promise<NominatimRow[]> {
  return paced(() => nominatimRaw(params), deadline);
}

async function nominatimRaw(params: Record<string, string>): Promise<NominatimRow[]> {
  const qs = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'it',
    addressdetails: '1',
    'accept-language': 'it',
    ...params,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as NominatimRow[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

/**
 * Il risultato ricade nel comune richiesto? (best-effort sui campi OSM).
 * Volutamente NON guarda `county`: "Via Roma 10, Milano" senza CAP viene
 * risolto da Nominatim a Legnano (provincia di Milano) — un pin sbagliato di
 * 25 km. Meglio scartarlo e ripiegare sul centro del comune giusto.
 */
function inComune(row: NominatimRow, comune: string): boolean {
  const a = row.address ?? {};
  const candidates = [a.city, a.town, a.village, a.municipality, a.hamlet, a.suburb]
    .filter(Boolean)
    .map((x) => fold(x as string));
  const want = fold(comune);
  return candidates.some((c) => c === want || c.includes(want) || want.includes(c));
}

function toResult(row: NominatimRow, precision: GeocodePrecision): GeocodeResult | null {
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lon);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat < ITALY.minLat || lat > ITALY.maxLat || lng < ITALY.minLng || lng > ITALY.maxLng) return null;
  return { lat, lng, precision, displayName: row.display_name ?? null };
}

/** Toglie dalla via le indicazioni che confondono Nominatim ("snc", "int. 3", "scala B"). */
function cleanStreet(via: string): string {
  return via
    .replace(/\bs\.?n\.?c\.?\b/gi, '')
    .replace(/\b(int(erno)?|sc(ala)?|piano|p\.)\s*\.?\s*[A-Za-z0-9]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[,\s-]+$/, '')
    .trim();
}

/**
 * @param deadline epoch ms oltre cui NON avviare altre richieste: la funzione
 *   restituisce `'timeout'` (l'indirizzo andrà geocodificato in un secondo
 *   momento, vedi `backfillPendingGeocodes`). Senza deadline prova tutta la
 *   catena di fallback.
 */
export async function geocodeAddress(input: GeocodeInput, deadline?: number): Promise<GeocodeOutcome> {
  try {
    return await geocodeChain(input, deadline);
  } catch (e) {
    if (e instanceof DeadlineError) return GEOCODE_TIMEOUT;
    throw e;
  }
}

async function geocodeChain(input: GeocodeInput, deadline?: number): Promise<GeocodeResult | null> {
  const street = cleanStreet(input.indirizzo);
  const city = input.comune.trim();

  if (street) {
    const streetResult = (rows: NominatimRow[]) =>
      rows[0] && inComune(rows[0], city) ? toResult(rows[0], 'street') : null;

    if (input.cap) {
      const r = streetResult(await nominatim({ street, postalcode: input.cap, city, country: 'Italia' }, deadline));
      if (r) return r;
    }
    {
      const r = streetResult(await nominatim({ street, city, country: 'Italia' }, deadline));
      if (r) return r;
    }
    {
      const q = `${street}, ${input.cap ?? ''} ${city}${input.provincia ? ` (${input.provincia})` : ''}, Italia`;
      const r = streetResult(await nominatim({ q: q.replace(/\s+/g, ' ') }, deadline));
      if (r) return r;
    }
  }

  {
    const params: Record<string, string> = { city, country: 'Italia' };
    if (input.cap) params.postalcode = input.cap;
    const provName = input.provincia ? PROVINCE[input.provincia]?.nome : null;
    if (provName) params.county = provName;
    let rows = await nominatim(params, deadline);
    if (!rows[0] && (input.cap || input.provincia)) rows = await nominatim({ city, country: 'Italia' }, deadline);
    const r = rows[0] ? toResult(rows[0], 'comune') : null;
    if (r) return r;
  }

  return null;
}

/**
 * Formato `stores.coordinates` IDENTICO alle righe storiche: "[lat, lng]" con
 * parte intera a 2 cifre e 8 decimali. Il trigger `convert_coordinates_to_location`
 * ricava da qui il punto PostGIS `location` (vedi scripts/aicall/gen-sql.mjs).
 */
export function formatCoordinates(lat: number, lng: number): string {
  const fmt = (n: number) => {
    const [i, d] = n.toFixed(8).split('.');
    const neg = i.startsWith('-');
    const abs = neg ? i.slice(1) : i;
    return `${neg ? '-' : ''}${abs.padStart(2, '0')}.${d}`;
  };
  return `[${fmt(lat)}, ${fmt(lng)}]`;
}
