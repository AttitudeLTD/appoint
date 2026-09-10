/**
 * Logica applicativa del webhook call center (`app/api/webhooks/callcenter`):
 * dato un payload già validato, aggiorna il DB come farebbe un agente AiCall che
 * salva "OK - Appuntamento preso" dallo Sheet "Gestisci".
 *
 * Separata dal route handler per poterla esercitare con un client Supabase
 * finto (nessuna dipendenza da HTTP/env qui dentro).
 *
 * Effetti, in ordine:
 *   1. match del punto vendita per (client_id, pi); se manca → INSERT in `stores`
 *      (status `in_progress`, geocodifica dell'indirizzo) + `store_clients`.
 *   2. se il pin era `free` → `in_progress` + riga in `store_status_logs`
 *      (stesso effetto di `submit.lock_pin` del workflow AiCall: senza questo la
 *      mappa non leggerebbe l'esito, vedi `nonFreeIds` in components/map.tsx).
 *   3. UPSERT in `store_visit_outcomes` su (store_id, user_id): un secondo invio
 *      per lo stesso punto vendita AGGIORNA l'appuntamento, non lo duplica.
 *
 * AiCall ha `editing_policy = 'shared'`: l'esito dell'utente tecnico non blocca
 * il pin per gli agenti, che salvano la PROPRIA riga esito senza toccare questa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRome, romeIsoDate, type AppointmentPayload } from './payload';
import { geocodeAddress, formatCoordinates, type GeocodeResult } from './geocode';

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
  geocode?: (input: { indirizzo: string; cap: string | null; comune: string; provincia: string | null }) => Promise<GeocodeResult | null>;
}

export interface RegisterResult {
  ok: true;
  store_id: number;
  store_created: boolean;
  status_changed: boolean;
  geocoded: 'street' | 'comune' | 'none' | 'existing';
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
  geocode: { lat: number; lng: number; precision: string; display_name: string | null } | 'not_needed' | null;
  note_preview: string;
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

async function findStore(supabase: SupabaseClient, clientId: number, piva: string): Promise<ExistingStore | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, address, status, coordinates, owner_name, phone, email, cap, comune, provincia, regione')
    .eq('client_id', clientId)
    .eq('pi', piva)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`stores select: ${error.message}`);
  return (data as ExistingStore | null) ?? null;
}

export async function registerAppointment(
  supabase: SupabaseClient,
  opts: RegisterOptions,
  p: AppointmentPayload,
  initialWarnings: string[] = []
): Promise<RegisterResult | DryRunResult> {
  const warnings = [...initialWarnings];
  const geocode = opts.geocode ?? geocodeAddress;

  const existing = await findStore(supabase, opts.clientId, p.partitaIva);

  // Geocodifica solo quando serve piazzare un pin: store nuovo, oppure store già
  // presente ma senza coordinate (lead importato senza indirizzo).
  let geo: GeocodeResult | null = null;
  const needsGeocode = !existing || !existing.coordinates;
  if (needsGeocode) {
    geo = await geocode({ indirizzo: p.indirizzo, cap: p.cap, comune: p.comune, provincia: p.provincia });
    if (!geo) warnings.push('indirizzo non geocodificato: il punto vendita non comparirà in mappa finché non avrà coordinate');
    else if (geo.precision === 'comune') warnings.push('indirizzo geocodificato solo a livello di comune (pin al centro del paese)');
  }

  const addressChanged = existing != null && fold(existing.address) !== fold(composeAddress(p));
  const note = composeNote(p, { includeAddress: addressChanged });

  if (p.dryRun) {
    return {
      ok: true,
      dry_run: true,
      store: existing
        ? { id: existing.id, name: existing.name, address: existing.address, status: existing.status, has_coordinates: !!existing.coordinates }
        : null,
      would_create_store: !existing,
      geocode: geo
        ? { lat: geo.lat, lng: geo.lng, precision: geo.precision, display_name: geo.displayName }
        : needsGeocode
          ? null
          : 'not_needed',
      note_preview: note,
      warnings,
    };
  }

  const userId = await resolveTechnicalUserId(supabase, opts);

  let storeId: number;
  let storeCreated = false;
  let statusChanged = false;
  const logNotes = `Appuntamento preso dal call center (${formatRome(p.dataAppuntamento, p.dataAppuntamentoHasTime)})`;

  if (!existing) {
    const { data: inserted, error: insErr } = await supabase
      .from('stores')
      .insert({
        name: p.ragioneSociale,
        owner_name: p.titolare,
        pi: p.partitaIva,
        address: composeAddress(p),
        coordinates: geo ? formatCoordinates(geo.lat, geo.lng) : null,
        phone: p.telefono,
        email: p.email,
        cap: p.cap,
        comune: p.comune,
        provincia: p.provincia,
        regione: p.regione,
        category: 'altro',
        status: 'in_progress',
        client_id: opts.clientId,
        created_by: userId,
        data_setup: romeIsoDate(p.dataCreazioneEsito),
      })
      .select('id')
      .single();
    if (insErr || !inserted) throw new Error(`stores insert: ${insErr?.message ?? 'nessuna riga'}`);
    storeId = inserted.id as number;
    storeCreated = true;
    statusChanged = true;

    const { error: scErr } = await supabase
      .from('store_clients')
      .upsert({ store_id: storeId, client_id: opts.clientId, is_primary: true, created_by: userId }, { onConflict: 'store_id,client_id' });
    if (scErr) throw new Error(`store_clients upsert: ${scErr.message}`);
  } else {
    storeId = existing.id;

    // Completa SOLO i campi vuoti: i dati già presenti (importati dal partner via
    // CSV o corretti a mano) non vengono sovrascritti. Il pin non si sposta se ha
    // già coordinate: l'indirizzo dell'appuntamento, se diverso, finisce nella
    // nota dell'esito.
    const patch: Record<string, unknown> = {};
    if (!existing.owner_name && p.titolare) patch.owner_name = p.titolare;
    if (!existing.phone && p.telefono) patch.phone = p.telefono;
    if (!existing.email && p.email) patch.email = p.email;
    if (!existing.cap && p.cap) patch.cap = p.cap;
    if (!existing.comune) patch.comune = p.comune;
    if (!existing.provincia && p.provincia) patch.provincia = p.provincia;
    if (!existing.regione && p.regione) patch.regione = p.regione;
    if (!existing.coordinates) {
      if (!existing.address) patch.address = composeAddress(p);
      if (geo) patch.coordinates = formatCoordinates(geo.lat, geo.lng);
    }
    if ((existing.status ?? 'free') === 'free') {
      patch.status = 'in_progress';
      statusChanged = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from('stores').update(patch).eq('id', storeId);
      if (updErr) throw new Error(`stores update: ${updErr.message}`);
    }
  }

  if (statusChanged) {
    const { error: logErr } = await supabase
      .from('store_status_logs')
      .insert({ store_id: storeId, prev: 'free', new: 'in_progress', modifier: userId, notes: logNotes });
    if (logErr) throw new Error(`store_status_logs insert: ${logErr.message}`);
  }

  const { data: prevOutcome, error: prevErr } = await supabase
    .from('store_visit_outcomes')
    .select('id')
    .eq('store_id', storeId)
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
  };
  const { error: outErr } = await supabase.from('store_visit_outcomes').upsert(
    {
      store_id: storeId,
      user_id: userId,
      client_id: opts.clientId,
      outcome_data: outcomeData,
      created_at: p.dataCreazioneEsito.toISOString(),
    },
    { onConflict: 'store_id,user_id' }
  );
  if (outErr) throw new Error(`store_visit_outcomes upsert: ${outErr.message}`);

  return {
    ok: true,
    store_id: storeId,
    store_created: storeCreated,
    status_changed: statusChanged,
    geocoded: geo ? geo.precision : existing?.coordinates ? 'existing' : 'none',
    esito: ESITO,
    outcome: prevOutcome ? 'updated' : 'created',
    id_esterno: p.idEsterno,
    warnings,
  };
}
