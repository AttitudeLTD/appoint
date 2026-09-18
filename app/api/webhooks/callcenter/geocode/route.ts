/**
 * Backfill della geocodifica dei pin creati dal webhook call center senza
 * coordinate (`store_visit_outcomes.outcome_data.geocode = 'pending'`): succede
 * quando un batch grande esaurisce il budget di tempo della richiesta.
 *
 *   GET|POST /api/webhooks/callcenter/geocode
 *   Authorization: Bearer <CALLCENTER_WEBHOOK_TOKEN>   (a mano / dal partner)
 *   Authorization: Bearer <CRON_SECRET>                 (cron Vercel, vedi vercel.json)
 *
 * Sequenziale, pacing Nominatim 1 req/s, si ferma entro DEADLINE_MS: se restano
 * pending lo dice in risposta (`remaining`) e basta richiamarlo. Viene anche
 * eseguito in coda a ogni ricezione del webhook, se quella è stata veloce.
 */
import { type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { backfillPendingGeocodes } from '@/utils/callcenter/register';
import { readConfig, isAuthorized, json } from '@/utils/callcenter/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEADLINE_MS = 50_000;
const MAX_ITEMS = 40;

async function handle(req: NextRequest) {
  const startedAt = Date.now();
  const conf = readConfig();
  if (!conf.ok) {
    console.error('[callcenter-geocode] configurazione incompleta:', conf.missing.join(', '));
    return json(503, { ok: false, error: 'not_configured' });
  }
  const { cfg } = conf;
  if (!isAuthorized(req, cfg.token, process.env.CRON_SECRET)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const supabase = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const summary = await backfillPendingGeocodes(
      supabase,
      { clientId: cfg.clientId, userId: cfg.userId },
      { limit: MAX_ITEMS, deadline: startedAt + DEADLINE_MS }
    );
    console.info('[callcenter-geocode]', JSON.stringify({ ...summary, ms: Date.now() - startedAt }));
    return json(200, { ok: true, ...summary });
  } catch (e) {
    console.error('[callcenter-geocode] errore:', e instanceof Error ? e.message : e);
    return json(500, { ok: false, error: 'internal_error' });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
