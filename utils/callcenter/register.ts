/**
 * Logica applicativa del webhook call center (`app/api/webhooks/callcenter`):
 * dato un payload già validato, aggiorna il DB come farebbe un agente AiCall che
 * salva "OK - Appuntamento preso" dallo Sheet "Gestisci".
 *
 * Separata dal route handler per poterla esercitare con un client Supabase
 * finto (nessuna dipendenza da HTTP/env qui dentro).
 *
 * Effetti per ogni appuntamento, in ordine:
 *   1. match del punto vendita per (client_id, pi); se manca → INSERT in `stores`
 *      (status `in_progress`, geocodifica dell'indirizzo) + `store_clients`.
 *   2. se il pin era `free` → `in_progress` + riga in `store_status_logs`
 *      (stesso effetto di `submit.lock_pin` del workflow AiCall: senza questo la
 *      mappa non leggerebbe l'esito, vedi `nonFreeIds` in components/map.tsx).
 *   3. UPSERT in `store_visit_outcomes` su (store_id, user_id): un secondo invio
 *      per lo stesso punto vendita AGGIORNA l'appuntamento, non lo duplica.
 *
 * Batch (fino a MAX_BATCH appuntamenti per chiamata). Il vincolo è il tempo:
 * Vercel taglia la funzione a `maxDuration` e Nominatim accetta ~1 richiesta/s,
 * quindi 100 lead NUOVI non si geocodificano in una chiamata. Strategia:
 *   - i punti vendita esistenti si leggono in blocco (`.in('pi', …)`);
 *   - la geocodifica è sequenziale, con pacing, entro `geocodeDeadline`: oltre,
 *     il pin viene comunque creato (esito incluso) ma SENZA coordinate e con
 *     `outcome_data.geocode = 'pending'`;
 *   - le scritture su DB vanno in parallelo per P.IVA (`concurrency`);
 *   - `backfillPendingGeocodes` completa i pending: viene chiamata in coda a ogni
 *     ricezione, dall'endpoint dedicato e dal cron giornaliero.
 *
 * AiCall ha `editing_policy = 'shared'`: l'esito dell'utente tecnico non blocca
 * il pin per gli agenti, che salvano la PROPRIA riga esito senza toccare questa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRome, romeIsoDate, type AppointmentPayload } from './payload';
import {
  geocodeAddress,
  formatCoordinates,
  GEOCODE_TIMEOUT,
  type GeocodeInput,
  type GeocodeOutcome,
  type GeocodeResult,
} from './geocode';

export const ESITO = 'ok_appuntamento_preso';

/**
 * Utente tecnico a cui vengono attribuiti esiti e pin creati dal webhook.
 * Stesso utente del seed `supabase/seed/20260910_callcenter_user.sql`: se il
 * seed è stato eseguito lo troviamo per email, altrimenti lo creiamo al primo
 * invio con la Admin API (email fittizia su dominio `.invalid`, nessuna password,
 * ban di 100 anni → non può fare login; il dominio non è nemmeno tra quelli
 * ammessi da `utils/auth.ts`).
 */
export const TECH_USER = {
  email: 'callcenter.aicall@appoint.invalid',
  name: 'Call Center',
  surname: 'AiCall',
  role: 'agent',
} as const;

export interface RegisterOptions {
  clientId: number;
  /** Override (env `CALLCENTER_USER_ID`); se assente l'utente è risolto/creato per email. */
  userId?: string | null;
  /** Iniettabile nei test. */
  geocode?: (input: GeocodeInput, deadline?: number) => Promise<GeocodeOutcome>;
  /** Epoch ms oltre cui non si avviano nuove geocodifiche (→ `pending`). */
  geocodeDeadline?: number;
  /** Gruppi (P.IVA) scritti in parallelo. */
  concurrency?: number;
}

/** Come è stato posizionato il pin per questo appuntamento. */
export type GeocodedTag = 'street' | 'comune' | 'none' | 'existing' | 'pending';

export interface RegisterResult {
  ok: true;
  store_id: number;
  store_created: boolean;
  status_changed: boolean;
  geocoded: GeocodedTag;
  esito: typeof ESITO;
  outcome: 'created' | 'updated';
  id_esterno: string | null;
  warnings: string[];
}

export interface DryRunResult {
  ok: true;
  dry_run: true;
  store: { id: number; name: string | null; address: string | null; status: string | null; has_coordinates: boolean } | null;
  would_create_store: boolean;
  geocode: { lat: number; lng: number; precision: string; display_name: string | null } | 'not_needed' | 'timeout' | null;
  note_preview: string;
  id_esterno: string | null;
  warnings: string[];
}

export interface ItemFailure {
  ok: false;
  error: 'internal_error';
  message: string;
  id_esterno: string | null;
}

export type ItemResult = RegisterResult | DryRunResult | ItemFailure;

export interface ParsedItem {
  value: AppointmentPayload;
  warnings: string[];
}

// Cache per la durata dell'istanza serverless: l'utente tecnico non cambia.
let cachedTechUserId: string | null = null;

export function resetTechnicalUserCache() {
  cachedTechUserId = null;
}

export async function resolveTechnicalUserId(supabase: SupabaseClient, opts: RegisterOptions): Promise<string> {
  if (opts.userId) return opts.userId;
  if (cachedTechUserId) return cachedTechUserId;

  const { data: found, error: findErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', TECH_USER.email)
    .maybeSingle();
  if (findErr) throw new Error(`users select: ${findErr.message}`);

  let id = (found?.id as string | undefined) ?? null;
  if (!id) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: TECH_USER.email,
      email_confirm: true,
      ban_duration: '876000h',
      user_metadata: { technical_user: true, purpose: 'callcenter-webhook' },
    });
    if (createErr || !created?.user) throw new Error(`auth.admin.createUser: ${createErr?.message ?? 'nessun utente'}`);
    id = created.user.id;
    console.info('[callcenter-webhook] creato utente tecnico', id);
  }

  // Il trigger handle_new_user ha già creato la riga (nome derivato dall'email):
  // qui fissiamo nome/cognome/ruolo e il grant sul cliente. Idempotente.
  const { error: upErr } = await supabase
    .from('users')
    .upsert(
      { id, email: TECH_USER.email, name: TECH_USER.name, surname: TECH_USER.surname, role: TECH_USER.role, visibility_scope: 'restricted' },
      { onConflict: 'id' }
    );
  if (upErr) throw new Error(`users upsert: ${upErr.message}`);
  const { error: grantErr } = await supabase
    .from('user_client_access')
    .upsert({ user_id: id, client_id: opts.clientId }, { onConflict: 'user_id,client_id', ignoreDuplicates: true });
  if (grantErr) throw new Error(`user_client_access upsert: ${grantErr.message}`);

  cachedTechUserId = id;
  return id;
}

/** "VIA ROMA 10, 20121 MILANO (MI)" — stesso stile dei lead importati. */
export function composeAddress(p: AppointmentPayload): string {
  const city = `${p.cap ? `${p.cap} ` : ''}${p.comune}${p.provincia ? ` (${p.provincia})` : ''}`;
  return `${p.indirizzo}, ${city}`;
}

const fold = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

/**
 * Testo del campo `note` dell'esito: è l'unica cosa (oltre all'esito) che la
 * scheda del pin mostra agli agenti, quindi ci mettiamo tutto ciò che gli serve.
 */
export function composeNote(p: AppointmentPayload, opts: { includeAddress: boolean }): string {
  const parts = [`Appuntamento: ${formatRome(p.dataAppuntamento, p.dataAppuntamentoHasTime)}`];
  if (opts.includeAddress) parts.push(`Indirizzo appuntamento: ${composeAddress(p)}`);
  if (p.titolare) parts.push(`Titolare: ${p.titolare}`);
  if (p.noteOperatore) parts.push(`Note operatore: ${p.noteOperatore}`);
  return parts.join(' — ');
}

interface ExistingStore {
  id: number;
  name: string | null;
  address: string | null;
  status: string | null;
  coordinates: string | null;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  regione: string | null;
}

const STORE_COLS = 'id, name, address, status, coordinates, owner_name, phone, email, cap, comune, provincia, regione';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Punti vendita del cliente per P.IVA, in blocco. A pari P.IVA vince l'id più basso. */
async function findStores(supabase: SupabaseClient, clientId: number, pivas: string[]): Promise<Map<string, ExistingStore>> {
  const map = new Map<string, ExistingStore & { pi: string }>();
  for (const part of chunk(pivas, 100)) {
    const { data, error } = await supabase
      .from('stores')
      .select(`${STORE_COLS}, pi`)
      .eq('client_id', clientId)
      .in('pi', part)
      .order('id', { ascending: true });
    if (error) throw new Error(`stores select: ${error.message}`);
    for (const row of (data ?? []) as (ExistingStore & { pi: string })[]) {
      if (!map.has(row.pi)) map.set(row.pi, row);
    }
  }
  return map;
}

function geocodeInputOf(p: AppointmentPayload): GeocodeInput {
  return { indirizzo: p.indirizzo, cap: p.cap, comune: p.comune, provincia: p.provincia };
}

interface Ctx {
  supabase: SupabaseClient;
  clientId: number;
  userId: string;
}

/**
 * Scrive un singolo appuntamento. `existing` è lo stato corrente del punto
 * vendita (null se va creato); `geo` il risultato della fase di geocodifica
 * (`undefined` = non serviva, il pin ha già coordinate).
 * Restituisce anche lo stato aggiornato dello store, così un eventuale secondo
 * appuntamento per la stessa P.IVA nello stesso batch lo vede già creato.
 */
async function processOne(
  ctx: Ctx,
  item: ParsedItem,
  existing: ExistingStore | null,
  geo: GeocodeOutcome | undefined
): Promise<{ result: RegisterResult; store: ExistingStore }> {
  const { supabase, clientId, userId } = ctx;
  const p = item.value;
  const warnings = [...item.warnings];

  const found: GeocodeResult | null = geo && geo !== GEOCODE_TIMEOUT ? geo : null;
  let geocoded: GeocodedTag;
  if (geo === undefined) geocoded = 'existing';
  else if (geo === GEOCODE_TIMEOUT) {
    geocoded = 'pending';
    warnings.push('indirizzo non ancora geocodificato (tempo esaurito): il pin comparirà in mappa al prossimo passaggio automatico');
  } else if (geo === null) {
    geocoded = 'none';
    warnings.push('indirizzo non geocodificato: il punto vendita non comparirà in mappa finché non avrà coordinate');
  } else {
    geocoded = geo.precision;
    if (geo.precision === 'comune') warnings.push('indirizzo geocodificato solo a livello di comune (pin al centro del paese)');
  }

  const addressChanged = existing != null && fold(existing.address) !== fold(composeAddress(p));
  const note = composeNote(p, { includeAddress: addressChanged });
  const logNotes = `Appuntamento preso dal call center (${formatRome(p.dataAppuntamento, p.dataAppuntamentoHasTime)})`;

  let store: ExistingStore;
  let storeCreated = false;
  let statusChanged = false;

  if (!existing) {
    const row = {
      name: p.ragioneSociale,
      owner_name: p.titolare,
      pi: p.partitaIva,
      address: composeAddress(p),
      coordinates: found ? formatCoordinates(found.lat, found.lng) : null,
      phone: p.telefono,
      email: p.email,
      cap: p.cap,
      comune: p.comune,
      provincia: p.provincia,
      regione: p.regione,
      category: 'altro',
      status: 'in_progress',
      client_id: clientId,
      created_by: userId,
      data_setup: romeIsoDate(p.dataCreazioneEsito),
    };
    const { data: inserted, error: insErr } = await supabase.from('stores').insert(row).select('id').single();
    if (insErr || !inserted) throw new Error(`stores insert: ${insErr?.message ?? 'nessuna riga'}`);
    store = {
      id: inserted.id as number,
      name: row.name,
      address: row.address,
      status: row.status,
      coordinates: row.coordinates,
      owner_name: row.owner_name,
      phone: row.phone,
      email: row.email,
      cap: row.cap,
      comune: row.comune,
      provincia: row.provincia,
      regione: row.regione,
    };
    storeCreated = true;
    statusChanged = true;

    const { error: scErr } = await supabase
      .from('store_clients')
      .upsert({ store_id: store.id, client_id: clientId, is_primary: true, created_by: userId }, { onConflict: 'store_id,client_id' });
    if (scErr) throw new Error(`store_clients upsert: ${scErr.message}`);
  } else {
    // Completa SOLO i campi vuoti: i dati già presenti (importati dal partner via
    // CSV o corretti a mano) non vengono sovrascritti. Il pin non si sposta se ha
    // già coordinate: l'indirizzo dell'appuntamento, se diverso, finisce nella
    // nota dell'esito.
    const patch: Partial<ExistingStore> = {};
    if (!existing.owner_name && p.titolare) patch.owner_name = p.titolare;
    if (!existing.phone && p.telefono) patch.phone = p.telefono;
    if (!existing.email && p.email) patch.email = p.email;
    if (!existing.cap && p.cap) patch.cap = p.cap;
    if (!existing.comune) patch.comune = p.comune;
    if (!existing.provincia && p.provincia) patch.provincia = p.provincia;
    if (!existing.regione && p.regione) patch.regione = p.regione;
    if (!existing.coordinates) {
      if (!existing.address) patch.address = composeAddress(p);
      if (found) patch.coordinates = formatCoordinates(found.lat, found.lng);
    }
    if ((existing.status ?? 'free') === 'free') {
      patch.status = 'in_progress';
      statusChanged = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from('stores').update(patch).eq('id', existing.id);
      if (updErr) throw new Error(`stores update: ${updErr.message}`);
    }
    store = { ...existing, ...patch };
  }

  if (statusChanged) {
    const { error: logErr } = await supabase
      .from('store_status_logs')
      .insert({ store_id: store.id, prev: 'free', new: 'in_progress', modifier: userId, notes: logNotes });
    if (logErr) throw new Error(`store_status_logs insert: ${logErr.message}`);
  }

  const { data: prevOutcome, error: prevErr } = await supabase
    .from('store_visit_outcomes')
    .select('id')
    .eq('store_id', store.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (prevErr) throw new Error(`store_visit_outcomes select: ${prevErr.message}`);

  const outcomeData = {
    esito: ESITO,
    note,
    data_appuntamento: p.dataAppuntamento.toISOString(),
    indirizzo_appuntamento: composeAddress(p),
    note_operatore: p.noteOperatore,
    origine: 'callcenter',
    id_esterno: p.idEsterno,
    // Stato della geocodifica di QUESTO invio + input per il backfill dei pending.
    geocode: geocoded,
    geocode_input: geocodeInputOf(p),
  };
  const { error: outErr } = await supabase.from('store_visit_outcomes').upsert(
    {
      store_id: store.id,
      user_id: userId,
      client_id: clientId,
      outcome_data: outcomeData,
      created_at: p.dataCreazioneEsito.toISOString(),
    },
    { onConflict: 'store_id,user_id' }
  );
  if (outErr) throw new Error(`store_visit_outcomes upsert: ${outErr.message}`);

  return {
    store,
    result: {
      ok: true,
      store_id: store.id,
      store_created: storeCreated,
      status_changed: statusChanged,
      geocoded,
      esito: ESITO,
      outcome: prevOutcome ? 'updated' : 'created',
      id_esterno: p.idEsterno,
      warnings,
    },
  };
}

/**
 * Registra un batch di appuntamenti. Restituisce un risultato per elemento,
 * nello stesso ordine dell'input; un errore su un elemento non ferma gli altri.
 */
export async function registerAppointments(
  supabase: SupabaseClient,
  opts: RegisterOptions,
  items: ParsedItem[]
): Promise<ItemResult[]> {
  const geocode = opts.geocode ?? geocodeAddress;
  const results: ItemResult[] = new Array(items.length);
  if (items.length === 0) return results;
  const dryRun = items.every((it) => it.value.dryRun);

  // 1. Punti vendita esistenti, in blocco.
  const pivas = Array.from(new Set(items.map((it) => it.value.partitaIva)));
  const existingByPiva = await findStores(supabase, opts.clientId, pivas);

  // 2. Geocodifica: una per P.IVA, solo dove serve, sequenziale, entro la deadline.
  const geoByPiva = new Map<string, GeocodeOutcome>();
  let outOfTime = false;
  for (const it of items) {
    const piva = it.value.partitaIva;
    if (geoByPiva.has(piva)) continue;
    const ex = existingByPiva.get(piva);
    if (ex?.coordinates) continue;
    if (outOfTime) {
      geoByPiva.set(piva, GEOCODE_TIMEOUT);
      continue;
    }
    const g = await geocode(geocodeInputOf(it.value), opts.geocodeDeadline);
    if (g === GEOCODE_TIMEOUT) outOfTime = true;
    geoByPiva.set(piva, g);
  }

  // 3. Dry run: nessuna scrittura, nemmeno l'utente tecnico.
  if (dryRun) {
    items.forEach((it, i) => {
      const p = it.value;
      const existing = existingByPiva.get(p.partitaIva) ?? null;
      const geo = geoByPiva.get(p.partitaIva);
      const addressChanged = existing != null && fold(existing.address) !== fold(composeAddress(p));
      results[i] = {
        ok: true,
        dry_run: true,
        store: existing
          ? { id: existing.id, name: existing.name, address: existing.address, status: existing.status, has_coordinates: !!existing.coordinates }
          : null,
        would_create_store: !existing,
        geocode:
          geo === undefined
            ? 'not_needed'
            : geo === GEOCODE_TIMEOUT
              ? 'timeout'
              : geo
                ? { lat: geo.lat, lng: geo.lng, precision: geo.precision, display_name: geo.displayName }
                : null,
        note_preview: composeNote(p, { includeAddress: addressChanged }),
        id_esterno: p.idEsterno,
        warnings: it.warnings,
      };
    });
    return results;
  }

  const ctx: Ctx = { supabase, clientId: opts.clientId, userId: await resolveTechnicalUserId(supabase, opts) };

  // 4. Scritture: gruppi per P.IVA in parallelo; dentro un gruppo in ordine di
  //    arrivo, così il secondo appuntamento per la stessa azienda aggiorna il
  //    pin appena creato invece di duplicarlo.
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => {
    const key = it.value.partitaIva;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  const queue = Array.from(groups.values());
  const concurrency = Math.max(1, opts.concurrency ?? 6);

  const worker = async () => {
    for (;;) {
      const indices = queue.shift();
      if (!indices) return;
      for (const i of indices) {
        const it = items[i];
        const piva = it.value.partitaIva;
        try {
          const existing = existingByPiva.get(piva) ?? null;
          // Dopo il primo elemento del gruppo il pin esiste (e ha già coordinate
          // se le abbiamo trovate): niente seconda geocodifica.
          const geo = existing?.coordinates ? undefined : geoByPiva.get(piva);
          const { result, store } = await processOne(ctx, it, existing, geo);
          existingByPiva.set(piva, store);
          results[i] = result;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error('[callcenter-webhook] errore elemento', i, message);
          results[i] = { ok: false, error: 'internal_error', message: 'Errore interno su questo elemento, riprovare più tardi', id_esterno: it.value.idEsterno };
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return results;
}

/** Singolo appuntamento: stessa pipeline del batch, ma un errore diventa eccezione (→ HTTP 500). */
export async function registerAppointment(
  supabase: SupabaseClient,
  opts: RegisterOptions,
  p: AppointmentPayload,
  initialWarnings: string[] = []
): Promise<RegisterResult | DryRunResult> {
  const [r] = await registerAppointments(supabase, opts, [{ value: p, warnings: initialWarnings }]);
  if (!r.ok) throw new Error(r.message);
  return r;
}

export interface BackfillSummary {
  checked: number;
  geocoded: number;
  failed: number;
  already_positioned: number;
  timed_out: boolean;
  /** true se restano altri pending oltre quelli esaminati: richiamare. */
  has_more: boolean;
}

/**
 * Completa la geocodifica dei pin creati dal webhook senza coordinate per
 * mancanza di tempo (`outcome_data.geocode = 'pending'`). Sequenziale, con
 * pacing Nominatim, entro `deadline`. Un indirizzo che Nominatim non trova
 * viene marcato `'failed'` e non ritentato.
 */
export async function backfillPendingGeocodes(
  supabase: SupabaseClient,
  opts: RegisterOptions,
  params: { limit: number; deadline: number }
): Promise<BackfillSummary> {
  const geocode = opts.geocode ?? geocodeAddress;
  const summary: BackfillSummary = { checked: 0, geocoded: 0, failed: 0, already_positioned: 0, timed_out: false, has_more: false };
  if (Date.now() >= params.deadline || params.limit <= 0) return summary;

  const userId = await resolveTechnicalUserId(supabase, opts);
  const { data, error } = await supabase
    .from('store_visit_outcomes')
    .select('id, store_id, outcome_data, stores!inner(id, coordinates)')
    .eq('user_id', userId)
    .eq('outcome_data->>geocode', 'pending')
    .order('created_at', { ascending: true })
    .limit(params.limit + 1);
  if (error) throw new Error(`pending select: ${error.message}`);

  type Row = { id: number; store_id: number; outcome_data: Record<string, unknown>; stores: { id: number; coordinates: string | null } | { id: number; coordinates: string | null }[] | null };
  const all = (data ?? []) as Row[];
  const rows = all.slice(0, params.limit);
  summary.has_more = all.length > rows.length;

  const setGeocode = async (row: Row, tag: GeocodedTag | 'failed') => {
    const { error: upErr } = await supabase
      .from('store_visit_outcomes')
      .update({ outcome_data: { ...row.outcome_data, geocode: tag } })
      .eq('id', row.id);
    if (upErr) throw new Error(`outcome update: ${upErr.message}`);
  };

  for (const row of rows) {
    if (Date.now() >= params.deadline) {
      summary.timed_out = true;
      break;
    }
    summary.checked++;
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    if (store?.coordinates) {
      // Nel frattempo qualcuno ha posizionato il pin a mano.
      await setGeocode(row, 'existing');
      summary.already_positioned++;
      continue;
    }
    const input = row.outcome_data.geocode_input as GeocodeInput | undefined;
    if (!input?.indirizzo || !input?.comune) {
      await setGeocode(row, 'failed');
      summary.failed++;
      continue;
    }
    const g = await geocode(input, params.deadline);
    if (g === GEOCODE_TIMEOUT) {
      summary.timed_out = true;
      summary.checked--;
      break;
    }
    if (!g) {
      await setGeocode(row, 'failed');
      summary.failed++;
      continue;
    }
    const { error: stErr } = await supabase
      .from('stores')
      .update({ coordinates: formatCoordinates(g.lat, g.lng) })
      .eq('id', row.store_id);
    if (stErr) throw new Error(`stores update: ${stErr.message}`);
    await setGeocode(row, g.precision);
    summary.geocoded++;
  }
  if (summary.timed_out && summary.checked < rows.length) summary.has_more = true;
  return summary;
}
