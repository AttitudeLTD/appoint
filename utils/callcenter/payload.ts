/**
 * Parsing e validazione del JSON inviato dal CRM del call center al webhook
 * `POST /api/webhooks/callcenter` (vedi docs/webhook-callcenter.md).
 *
 * Modulo puro (nessun I/O): riceve il body già deserializzato e restituisce o un
 * payload normalizzato o la lista degli errori da rimandare al partner con 400.
 */
import { normalizeProvincia, regioneByProvincia } from './italy';

export interface AppointmentPayload {
  /** Id univoco dell'appuntamento nel CRM del partner (idempotenza / tracciabilità). */
  idEsterno: string | null;
  ragioneSociale: string;
  /** 11 cifre, senza prefisso "IT" né spazi. Chiave di matching con `stores.pi`. */
  partitaIva: string;
  /** Via e civico. */
  indirizzo: string;
  cap: string | null;
  comune: string;
  /** Sigla a 2 lettere. */
  provincia: string | null;
  regione: string | null;
  titolare: string | null;
  telefono: string | null;
  email: string | null;
  dataCreazioneEsito: Date;
  dataAppuntamento: Date;
  /** false se il partner ha mandato solo la data (senza orario). */
  dataAppuntamentoHasTime: boolean;
  noteOperatore: string | null;
  /**
   * Agente a cui Sidial ha assegnato l'appuntamento. Id e nome sono quelli del
   * CRM del partner, non ancora mappati su `public.users`: il collegamento con
   * gli utenti Appoint è un passo successivo.
   */
  agenteId: string;
  agenteNome: string;
  /**
   * Stato dell'appuntamento nel CRM Sidial (colonna `stato` del tracciato).
   * Lo conserviamo così com'è: non è lo status del pin Appoint.
   */
  stato: string;
  /** true → valida e geocodifica ma non scrive nulla. */
  dryRun: boolean;
}

export type ParseResult =
  | { ok: true; value: AppointmentPayload; warnings: string[] }
  | { ok: false; errors: string[] };

/** Massimo numero di appuntamenti per chiamata (il partner ne prevede ~100). */
export const MAX_BATCH = 200;

export type WebhookBody =
  | { kind: 'single'; item: ParseResult }
  | { kind: 'batch'; items: ParseResult[]; dryRun: boolean }
  | { kind: 'error'; errors: string[] };

const TZ = 'Europe/Rome';

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Primo campo presente tra i nomi indicati (nome canonico + alias tollerati). */
function pick(body: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (n in body && body[n] !== undefined) return body[n];
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const s = collapse(v);
  return s.length > 0 ? s : null;
}

// --- Date --------------------------------------------------------------------

/** Offset (ms) di Europe/Rome rispetto a UTC nell'istante indicato. */
function romeOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return local - utcMs;
}

/** Interpreta una data/ora "da orologio italiano" (senza fuso) come istante UTC. */
function romeLocalToDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let result = asUtc - romeOffsetMs(asUtc);
  // Secondo passaggio: a cavallo del cambio ora l'offset stimato può differire.
  const off2 = romeOffsetMs(result);
  if (off2 !== romeOffsetMs(asUtc)) result = asUtc - off2;
  return new Date(result);
}

/**
 * Accetta ISO 8601 con fuso ("2026-09-15T10:30:00+02:00", "...Z"), ISO senza
 * fuso ("2026-09-15T10:30" / "2026-09-15 10:30" / "2026-09-15") e formato
 * italiano ("15/09/2026 10:30" / "15/09/2026"). Senza fuso ⇒ ora italiana.
 */
export function parseDateTime(raw: unknown): { date: Date; hasTime: boolean } | null {
  const s = str(raw);
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i);
  if (m) {
    const tz = m[7].toUpperCase() === 'Z' ? 'Z' : m[7].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${tz}`);
    return isNaN(d.getTime()) ? null : { date: d, hasTime: true };
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const hasTime = m[4] != null;
    const d = romeLocalToDate(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return isValidYmd(+m[1], +m[2], +m[3]) && !isNaN(d.getTime()) ? { date: d, hasTime } : null;
  }

  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2})[:.](\d{2}))?$/);
  if (m) {
    const hasTime = m[4] != null;
    const d = romeLocalToDate(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
    return isValidYmd(+m[3], +m[2], +m[1]) && !isNaN(d.getTime()) ? { date: d, hasTime } : null;
  }

  return null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "15/09/2026 ore 10:30" (o solo "15/09/2026") in ora italiana. */
export function formatRome(date: Date, withTime: boolean): string {
  const day = date.toLocaleDateString('it-IT', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  if (!withTime) return day;
  const time = date.toLocaleTimeString('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${day} ore ${time}`;
}

/** Data in ISO `yyyy-mm-dd` secondo il calendario italiano (per `stores.data_setup`). */
export function romeIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// --- Campi -------------------------------------------------------------------

export function normalizePartitaIva(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const digits = s.replace(/^IT/i, '').replace(/[\s.\-]/g, '');
  return /^\d{11}$/.test(digits) ? digits : null;
}

function normalizePhone(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const cleaned = s.replace(/[\s.\-()\/]/g, '');
  return /^\+?\d{6,15}$/.test(cleaned) ? cleaned : s;
}

function normalizeCap(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits.length === 5 ? digits : null;
}

/**
 * Se il partner manda l'indirizzo "tutto in una riga" senza `comune`, prova a
 * separare via / CAP / comune / provincia da "Via Roma 10, 20121 Milano (MI)".
 */
function splitAddress(full: string): { via: string; cap: string | null; comune: string | null; prov: string | null } {
  let s = collapse(full);
  let prov: string | null = null;
  const pm = s.match(/\(([A-Za-z]{2})\)\s*$/);
  if (pm) {
    prov = normalizeProvincia(pm[1]);
    s = s.slice(0, pm.index).trim().replace(/[,\s-]+$/, '');
  }
  let cap: string | null = null;
  const cm = s.match(/(^|[\s,])(\d{5})(?=[\s,]|$)/);
  if (cm && cm.index != null) {
    cap = cm[2];
  }
  const segs = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (segs.length >= 2) {
    const via = segs.slice(0, -1).join(', ');
    const last = segs[segs.length - 1].replace(/\b\d{5}\b/, '').trim();
    const tail = last.match(/^(.*?)\s+([A-Za-z]{2})$/);
    if (tail && !prov && normalizeProvincia(tail[2])) {
      prov = normalizeProvincia(tail[2]);
      return { via: via.replace(/\b\d{5}\b/, '').trim(), cap, comune: tail[1] || null, prov };
    }
    return { via: via.replace(/\b\d{5}\b/, '').trim(), cap, comune: last || null, prov };
  }
  if (cap) {
    // "Via Roma 10 20121 Milano": via prima del CAP, comune dopo
    const idx = s.indexOf(cap);
    const via = s.slice(0, idx).trim().replace(/[,\s-]+$/, '');
    const comune = s.slice(idx + 5).trim().replace(/^[,\s-]+/, '') || null;
    return { via: via || s, cap, comune, prov };
  }
  return { via: s, cap: null, comune: null, prov };
}

// --- Entry point -------------------------------------------------------------

function isDryFlag(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * Body del webhook: un singolo appuntamento (oggetto), oppure un batch
 * (array di oggetti, o wrapper `{ "appuntamenti": [...] }` con eventuale
 * `dry_run` a livello di batch). In batch il `dry_run` vale per TUTTI gli
 * elementi: metterlo solo su alcuni è un errore, non un'ambiguità da indovinare.
 */
export function parseWebhookBody(body: unknown): WebhookBody {
  if (body == null || typeof body !== 'object') {
    return { kind: 'error', errors: ['il body deve essere un oggetto JSON o un array di oggetti'] };
  }

  let list: unknown[] | null = null;
  let wrapperDry: boolean | null = null;
  if (Array.isArray(body)) {
    list = body;
  } else {
    const obj = body as Record<string, unknown>;
    const wrapped = pick(obj, 'appuntamenti', 'appointments', 'items', 'data');
    if (Array.isArray(wrapped)) {
      list = wrapped;
      const d = pick(obj, 'dry_run', 'dryRun');
      wrapperDry = d === undefined ? null : isDryFlag(d);
    } else if (wrapped !== undefined) {
      return { kind: 'error', errors: ['"appuntamenti" deve essere un array di oggetti'] };
    }
  }

  if (list == null) {
    return { kind: 'single', item: parseAppointmentPayload(body) };
  }
  if (list.length === 0) {
    return { kind: 'error', errors: ['il batch è vuoto'] };
  }
  if (list.length > MAX_BATCH) {
    return { kind: 'error', errors: [`troppi appuntamenti in una chiamata: ${list.length} (massimo ${MAX_BATCH})`] };
  }

  const items = list.map((el) => {
    if (el == null || typeof el !== 'object' || Array.isArray(el)) {
      return { ok: false, errors: ['ogni elemento del batch deve essere un oggetto JSON'] } as ParseResult;
    }
    if (wrapperDry != null) {
      const withDry = { ...(el as Record<string, unknown>) };
      if (pick(withDry, 'dry_run', 'dryRun') === undefined) withDry.dry_run = wrapperDry;
      return parseAppointmentPayload(withDry);
    }
    return parseAppointmentPayload(el);
  });

  const flags = items.filter((r) => r.ok).map((r) => (r.ok ? r.value.dryRun : false));
  const anyDry = flags.some(Boolean);
  const allDry = flags.length > 0 && flags.every(Boolean);
  if (anyDry && !allDry) {
    return {
      kind: 'error',
      errors: ['dry_run deve essere uguale per tutti gli elementi del batch (oppure indicato una volta sola a livello di batch)'],
    };
  }

  return { kind: 'batch', items, dryRun: anyDry };
}

export function parseAppointmentPayload(input: unknown): ParseResult {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['il body deve essere un oggetto JSON'] };
  }
  const body = input as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  const ragioneSociale = str(pick(body, 'ragione_sociale', 'ragioneSociale', 'ragione sociale', 'Ragione sociale', 'azienda', 'nome_azienda'));
  if (!ragioneSociale) errors.push('ragione_sociale: obbligatoria');
  else if (ragioneSociale.length > 200) errors.push('ragione_sociale: massimo 200 caratteri');

  const pivaRaw = pick(body, 'partita_iva', 'partitaIva', 'piva', 'p_iva', 'p.iva', 'P.iva', 'P.IVA', 'vat');
  const partitaIva = normalizePartitaIva(pivaRaw);
  if (pivaRaw == null || str(pivaRaw) == null) errors.push('partita_iva: obbligatoria');
  else if (!partitaIva) errors.push('partita_iva: deve essere composta da 11 cifre (es. "01234567890")');

  let indirizzo = str(pick(body, 'indirizzo', 'indirizzo_appuntamento', 'via', 'address'));
  let cap = normalizeCap(pick(body, 'cap', 'codice_postale', 'postal_code', 'zip'));
  const capRaw = str(pick(body, 'cap', 'codice_postale', 'postal_code', 'zip'));
  if (capRaw && !cap) warnings.push(`cap: "${capRaw}" non è un CAP a 5 cifre, ignorato`);
  let comune = str(pick(body, 'comune', 'citta', 'città', 'city', 'localita', 'località'));
  const provRaw = str(pick(body, 'provincia', 'prov', 'sigla_provincia'));
  let provincia = normalizeProvincia(provRaw);
  if (provRaw && !provincia) warnings.push(`provincia: "${provRaw}" non riconosciuta, ignorata`);

  if (!indirizzo) {
    errors.push('indirizzo: obbligatorio (via e numero civico)');
  } else if (!comune) {
    // indirizzo "in una riga": proviamo a ricavare comune/CAP/provincia
    const split = splitAddress(indirizzo);
    if (split.comune) {
      indirizzo = split.via;
      comune = split.comune;
      cap = cap ?? split.cap;
      provincia = provincia ?? split.prov;
      warnings.push(`comune: assente, dedotto dall'indirizzo ("${comune}")`);
    } else {
      errors.push('comune: obbligatorio (oppure indirizzo nel formato "Via Roma 10, 20121 Milano (MI)")');
    }
  }
  if (!provincia && comune) {
    warnings.push('provincia: assente, la regione del punto vendita resterà vuota');
  }

  const titolare = str(pick(body, 'titolare', 'nome_titolare', 'nomeTitolare', 'referente', 'owner_name'));
  const telefono = normalizePhone(pick(body, 'telefono', 'telefono_titolare', 'telefonoTitolare', 'phone', 'cellulare'));
  const emailRaw = str(pick(body, 'email', 'email_titolare'));
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.toLowerCase() : null;
  if (emailRaw && !email) warnings.push(`email: "${emailRaw}" non valida, ignorata`);

  const creazioneRaw = pick(body, 'data_creazione_esito', 'dataCreazioneEsito', 'data_creazione', 'Data Creazione', 'data_esito', 'created_at');
  let dataCreazioneEsito: Date;
  if (creazioneRaw == null || str(creazioneRaw) == null) {
    dataCreazioneEsito = new Date();
    warnings.push('data_creazione_esito: assente, usata la data/ora di ricezione');
  } else {
    const parsed = parseDateTime(creazioneRaw);
    if (!parsed) {
      errors.push('data_creazione_esito: formato non riconosciuto (usare ISO 8601, es. "2026-09-10T10:32:00+02:00")');
      dataCreazioneEsito = new Date();
    } else {
      dataCreazioneEsito = parsed.date;
      if (dataCreazioneEsito.getTime() > Date.now() + 24 * 3600 * 1000) {
        errors.push('data_creazione_esito: non può essere nel futuro');
      }
    }
  }

  const appRaw = pick(body, 'data_appuntamento', 'dataAppuntamento', 'Data Appuntamento', 'appuntamento');
  let dataAppuntamento = new Date(0);
  let dataAppuntamentoHasTime = false;
  if (appRaw == null || str(appRaw) == null) {
    errors.push('data_appuntamento: obbligatoria');
  } else {
    const parsed = parseDateTime(appRaw);
    if (!parsed) {
      errors.push('data_appuntamento: formato non riconosciuto (usare ISO 8601, es. "2026-09-15T10:30:00+02:00")');
    } else {
      dataAppuntamento = parsed.date;
      dataAppuntamentoHasTime = parsed.hasTime;
      if (!parsed.hasTime) warnings.push("data_appuntamento: senza orario, l'agente vedrà solo la data");
    }
  }

  let noteOperatore = str(pick(body, 'note_operatore', 'noteOperatore', 'noteoperatore', 'note', 'notes'));
  if (noteOperatore && noteOperatore.length > 2000) {
    noteOperatore = noteOperatore.slice(0, 2000);
    warnings.push('note_operatore: troncate a 2000 caratteri');
  }

  // Agente assegnato su Sidial: campi piatti, oppure oggetto `agente: { id, nome }`.
  const agenteObj = pick(body, 'agente', 'agent', 'agente_assegnato', 'assigned_agent');
  const agenteNested =
    agenteObj != null && typeof agenteObj === 'object' && !Array.isArray(agenteObj)
      ? (agenteObj as Record<string, unknown>)
      : null;
  const agenteId = str(
    pick(body, 'agente_id', 'agenteId', 'id_agente', 'agent_id', 'assigned_agent_id') ??
      (agenteNested ? pick(agenteNested, 'id', 'agente_id', 'id_agente') : undefined)
  );
  const agenteNome = str(
    pick(body, 'agente_nome', 'agenteNome', 'nome_agente', 'agent_name', 'assigned_agent_name') ??
      (agenteNested ? pick(agenteNested, 'nome', 'name', 'agente_nome', 'nominativo') : undefined)
  );
  if (!agenteId) errors.push('agente_id: obbligatorio (id dell\'agente assegnato nel vostro CRM)');
  else if (agenteId.length > 80) errors.push('agente_id: massimo 80 caratteri');
  if (!agenteNome) errors.push('agente_nome: obbligatorio (nome e cognome dell\'agente assegnato)');
  else if (agenteNome.length > 200) errors.push('agente_nome: massimo 200 caratteri');

  const stato = str(pick(body, 'stato', 'Stato', 'status', 'stato_appuntamento'));
  if (!stato) errors.push('stato: obbligatorio (stato dell\'appuntamento nel vostro CRM, colonna "stato" del tracciato)');
  else if (stato.length > 120) errors.push('stato: massimo 120 caratteri');

  const idEsterno = str(pick(body, 'id_esterno', 'idEsterno', 'external_id', 'id_appuntamento', 'id'));
  if (!idEsterno) warnings.push('id_esterno: assente (consigliato per tracciare gli invii)');

  const dryRaw = pick(body, 'dry_run', 'dryRun');
  const dryRun = dryRaw === true || dryRaw === 'true' || dryRaw === 1 || dryRaw === '1';

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    value: {
      idEsterno,
      ragioneSociale: ragioneSociale!,
      partitaIva: partitaIva!,
      indirizzo: indirizzo!,
      cap,
      comune: comune!,
      provincia,
      regione: regioneByProvincia(provincia),
      titolare,
      telefono,
      email,
      dataCreazioneEsito,
      dataAppuntamento,
      dataAppuntamentoHasTime,
      noteOperatore,
      agenteId: agenteId!,
      agenteNome: agenteNome!,
      stato: stato!,
      dryRun,
    },
  };
}
