/**
 * Pezzi HTTP condivisi dai route handler del webhook call center:
 * lettura config da env, autenticazione a token, risposta JSON.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export interface WebhookConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  token: string;
  userId: string | null;
  clientId: number;
}

export function readConfig(): { ok: true; cfg: WebhookConfig } | { ok: false; missing: string[] } {
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

export function json(status: number, body: object) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Token presentato dal chiamante: `Authorization: Bearer <token>` o header `X-Webhook-Token`. */
export function presentedToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return (m ? m[1] : req.headers.get('x-webhook-token') ?? '').trim();
}

/** Vero se il token presentato coincide con uno di quelli accettati (confronto a tempo costante). */
export function isAuthorized(req: NextRequest, ...accepted: (string | null | undefined)[]): boolean {
  const presented = presentedToken(req);
  if (!presented) return false;
  return accepted.some((t) => !!t && t.length >= 16 && safeEqual(presented, t));
}
