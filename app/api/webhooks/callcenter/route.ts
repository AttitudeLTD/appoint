/**
 * Webhook inbound dal CRM del call center (progetto AiCall).
 *
 *   POST /api/webhooks/callcenter
 *   Authorization: Bearer <CALLCENTER_WEBHOOK_TOKEN>
 *   Content-Type: application/json
 *
 * Il partner chiama questo endpoint ogni volta che chiude un appuntamento; il
 * lavoro vero (match/creazione del pin, esito "OK - Appuntamento preso", status)
 * sta in `utils/callcenter/register.ts`. Qui solo: config, autenticazione a
 * token, parsing/validazione del body, mappatura errori → HTTP.
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
import { timingSafeEqual } from 'node:crypto';
import { parseAppointmentPayload } from '@/utils/callcenter/payload';
import { registerAppointment } from '@/utils/callcenter/register';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Config {
  supabaseUrl: string;
  serviceRoleKey: string;
  token: string;
  userId: string | null;
  clientId: number;
}

function readConfig(): { ok: true; cfg: Config } | { ok: false; missing: string[] } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const token = process.env.CALLCENTER_WEBHOOK_TOKEN ?? '';
  const userIdRaw = (process.env.CALLCENTER_USER_ID ?? '').trim();
  const clientId = Number(process.env.CALLCENTER_CLIENT_ID ?? '5');
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || token.length < 16) missing.push('CALLCENTER_WEBHOOK_TOKEN (min 16 caratteri)');
  if (userIdRaw && !/^[0-9a-f-]{36}$/i.test(userIdRaw)) missing.push('CALLCENTER_USER_ID (uuid non valido)');
  if (!Number.isInteger(clientId) || clientId <= 0) missing.push('CALLCENTER_CLIENT_ID');
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, cfg: { supabaseUrl, serviceRoleKey, token, userId: userIdRaw || null, clientId } };
}

function json(status: number, body: object) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** `Authorization: Bearer <token>` (o, in alternativa, header `X-Webhook-Token`). */
function isAuthorized(req: NextRequest, token: string): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const presented = (m ? m[1] : req.headers.get('x-webhook-token') ?? '').trim();
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
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

  const parsed = parseAppointmentPayload(body);
  if (!parsed.ok) {
    return json(400, { ok: false, error: 'validation_error', details: parsed.errors });
  }

  const supabase = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await registerAppointment(
      supabase,
      { clientId: cfg.clientId, userId: cfg.userId },
      parsed.value,
      parsed.warnings
    );
    if (!('dry_run' in result)) {
      console.info(
        '[callcenter-webhook]',
        JSON.stringify({ piva: parsed.value.partitaIva, store_id: result.store_id, store_created: result.store_created, geocoded: result.geocoded, outcome: result.outcome, id_esterno: result.id_esterno })
      );
    }
    return json(200, result);
  } catch (e) {
    console.error('[callcenter-webhook] errore:', e instanceof Error ? e.message : e);
    return json(500, { ok: false, error: 'internal_error', message: 'Errore interno, riprovare più tardi' });
  }
}
