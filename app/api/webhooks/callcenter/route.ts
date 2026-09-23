/**
 * Webhook inbound dal CRM del call center (progetto AiCall).
 *
 *   POST /api/webhooks/callcenter
 *   Authorization: Bearer <CALLCENTER_WEBHOOK_TOKEN>
 *   Content-Type: application/json
 *   Body: un appuntamento (oggetto) oppure un batch (array, o
 *         `{ "appuntamenti": [...] }`), fino a MAX_BATCH elementi.
 *
 * Il partner chiama questo endpoint ogni volta che **assegna un appuntamento a
 * un agente** su Sidial (o a fine giornata con tutti quelli assegnati); il
 * lavoro vero (match/creazione del pin, esito "OK - Appuntamento preso", status)
 * sta in `utils/callcenter/register.ts`. `agente_id` e `agente_nome` sono quelli
 * del CRM del partner: il mapping sugli utenti Appoint è un passo successivo.
 * Qui solo: config, autenticazione a token, parsing/validazione del body,
 * mappatura errori → HTTP, budget di tempo.
 *
 * Budget di tempo (Vercel `maxDuration` = 60 s):
 *   - geocodifica dei lead nuovi fino a GEOCODE_BUDGET_MS dall'inizio; oltre,
 *     i pin nascono senza coordinate (`geocoded: 'pending'`) e vengono completati
 *     dopo (backfill in coda a questa stessa richiesta se c'è tempo, oppure
 *     dall'endpoint /geocode e dal cron giornaliero);
 *   - le scritture su DB vanno in parallelo per P.IVA.
 *
 * Scrive con la service role (bypass RLS): l'unico "utente" qui è il token del
 * partner. Spec completa per il partner in docs/webhook-callcenter.md.
 *
 * Variabili d'ambiente (Vercel → Settings → Environment Variables):
 *   SUPABASE_SERVICE_ROLE_KEY   service role del progetto Supabase (mai lato client)
 *   CALLCENTER_WEBHOOK_TOKEN    segreto condiviso col partner (≥ 16 caratteri)
 *   CALLCENTER_CLIENT_ID        opzionale, default 5 (AiCall)
 *   CALLCENTER_USER_ID          opzionale: uuid dell'utente tecnico; se assente
 *                               viene risolto per email (o creato al primo invio)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseWebhookBody, type ParseResult } from '@/utils/callcenter/payload';
import { registerAppointments, backfillPendingGeocodes, type ItemResult, type ParsedItem } from '@/utils/callcenter/register';
import { readConfig, isAuthorized, json } from '@/utils/callcenter/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Oltre questo istante (dall'inizio) niente nuove geocodifiche nel batch. */
const GEOCODE_BUDGET_MS = 30_000;
/** Il backfill dei pending parte solo se la richiesta è stata veloce… */
const BACKFILL_IF_ELAPSED_UNDER_MS = 12_000;
/** …e si ferma comunque entro questo istante dall'inizio. */
const BACKFILL_DEADLINE_MS = 28_000;
const BACKFILL_MAX_ITEMS = 5;

type ItemOut =
  | ({ indice: number } & ItemResult)
  | { indice: number; ok: false; error: 'validation_error'; details: string[]; id_esterno: string | null };

/** Errore di validazione per elemento: non blocca gli altri elementi del batch. */
function validationOut(indice: number, r: Extract<ParseResult, { ok: false }>, raw: unknown): ItemOut {
  const idRaw = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).id_esterno : null;
  return { indice, ok: false, error: 'validation_error', details: r.errors, id_esterno: typeof idRaw === 'string' ? idRaw : null };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const conf = readConfig();
  if (!conf.ok) {
    console.error('[callcenter-webhook] configurazione incompleta:', conf.missing.join(', '));
    return json(503, { ok: false, error: 'not_configured' });
  }
  const { cfg } = conf;

  if (!isAuthorized(req, cfg.token)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json', message: 'Il body deve essere JSON valido' });
  }

  const parsed = parseWebhookBody(body);
  if (parsed.kind === 'error') {
    return json(400, { ok: false, error: 'validation_error', details: parsed.errors });
  }
  if (parsed.kind === 'single' && !parsed.item.ok) {
    return json(400, { ok: false, error: 'validation_error', details: parsed.item.errors });
  }

  const supabase = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const opts = { clientId: cfg.clientId, userId: cfg.userId, geocodeDeadline: startedAt + GEOCODE_BUDGET_MS };

  // Backfill "a rimorchio": se questa richiesta è stata veloce, usa il tempo che
  // resta per completare qualche pin rimasto senza coordinate da un batch
  // precedente. Best-effort: un errore qui non tocca la risposta al partner.
  const backfillIfTime = async (dryRun: boolean) => {
    if (dryRun || Date.now() - startedAt > BACKFILL_IF_ELAPSED_UNDER_MS) return;
    try {
      const s = await backfillPendingGeocodes(supabase, opts, { limit: BACKFILL_MAX_ITEMS, deadline: startedAt + BACKFILL_DEADLINE_MS });
      if (s.checked > 0) console.info('[callcenter-webhook] backfill geocodifica', JSON.stringify(s));
    } catch (e) {
      console.error('[callcenter-webhook] backfill fallito:', e instanceof Error ? e.message : e);
    }
  };

  try {
    if (parsed.kind === 'single') {
      const item = parsed.item as Extract<ParseResult, { ok: true }>;
      const [result] = await registerAppointments(supabase, opts, [{ value: item.value, warnings: item.warnings }]);
      if (!result.ok) {
        return json(500, { ok: false, error: 'internal_error', message: 'Errore interno, riprovare più tardi' });
      }
      if (!('dry_run' in result)) {
        console.info(
          '[callcenter-webhook]',
          JSON.stringify({ piva: item.value.partitaIva, store_id: result.store_id, store_created: result.store_created, geocoded: result.geocoded, outcome: result.outcome, id_esterno: result.id_esterno })
        );
      }
      await backfillIfTime(item.value.dryRun);
      return json(200, result);
    }

    // Batch: gli elementi non validi vengono riportati singolarmente, gli altri
    // vengono comunque elaborati.
    const rawList: unknown[] = Array.isArray(body)
      ? body
      : (['appuntamenti', 'appointments', 'items', 'data']
          .map((k) => (body as Record<string, unknown>)[k])
          .find(Array.isArray) as unknown[] | undefined) ?? [];
    const out: ItemOut[] = new Array(parsed.items.length);
    const toProcess: { indice: number; item: ParsedItem }[] = [];
    parsed.items.forEach((r, indice) => {
      if (r.ok) toProcess.push({ indice, item: { value: r.value, warnings: r.warnings } });
      else out[indice] = validationOut(indice, r, rawList[indice]);
    });

    const results = await registerAppointments(supabase, opts, toProcess.map((t) => t.item));
    results.forEach((r, k) => {
      out[toProcess[k].indice] = { indice: toProcess[k].indice, ...r };
    });

    const registrati = out.filter((o) => o.ok).length;
    const falliti = out.length - registrati;
    const pending = out.filter((o) => o.ok && 'geocoded' in o && o.geocoded === 'pending').length;
    console.info(
      '[callcenter-webhook] batch',
      JSON.stringify({ totale: out.length, registrati, falliti, pending, dry_run: parsed.dryRun, ms: Date.now() - startedAt })
    );

    await backfillIfTime(parsed.dryRun);

    return json(200, {
      ok: falliti === 0,
      ...(parsed.dryRun ? { dry_run: true } : {}),
      totale: out.length,
      registrati,
      falliti,
      geocodifica_in_sospeso: pending,
      risultati: out,
    });
  } catch (e) {
    console.error('[callcenter-webhook] errore:', e instanceof Error ? e.message : e);
    return json(500, { ok: false, error: 'internal_error', message: 'Errore interno, riprovare più tardi' });
  }
}
