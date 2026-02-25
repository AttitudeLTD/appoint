const BUCKET = 'client-logos';

/**
 * Returns the public URL for a client logo storage path (e.g. "123/logo.png").
 * Returns null if path is empty or Supabase URL is not set.
 */
export function getClientLogoUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${path.trim()}`;
}
