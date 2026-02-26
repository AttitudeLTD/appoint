'use server';

import { createClient } from '@/utils/supabase/server';

export type FetchUserStoresOptions = {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string | null;
  /** Per AM/supervisor: filtra per uno o più agenti. Se assente, si usano tutti gli agenti visibili. */
  agentIds?: string[];
};

type UserRole = 'agent' | 'am' | 'supervisor';

/** Restituisce ruolo e agenti per il filtro dashboard (per AM/supervisor). */
export async function getDashboardContext(currentUserId: string): Promise<{
  role: UserRole | null;
  agents: { id: string; name: string; surname: string }[];
}> {
  const supabase = createClient();
  const { data: me } = await supabase.from('users').select('role').eq('id', currentUserId).single();
  const role = (me?.role as UserRole) ?? null;
  const agents = role === 'am' || role === 'supervisor' ? await getAgentsForFilter(currentUserId) : [];
  return { role, agents };
}

/** Restituisce gli agenti che l'utente può selezionare nel filtro: supervisor=tutti, AM=solo della sua area, agent=nessuno */
export async function getAgentsForFilter(currentUserId: string): Promise<{ id: string; name: string; surname: string }[]> {
  const supabase = createClient();
  const { data: me } = await supabase.from('users').select('role').eq('id', currentUserId).single();
  const role = me?.role as UserRole | null;
  if (role !== 'am' && role !== 'supervisor') return [];

  if (role === 'supervisor') {
    const { data } = await supabase
      .from('users')
      .select('id, name, surname')
      .eq('role', 'agent')
      .order('surname');
    return (data ?? []).map((u) => ({ id: u.id, name: u.name ?? '', surname: u.surname ?? '' }));
  }

  // AM: agenti che condividono almeno un'area con me
  const { data: myAreas } = await supabase
    .from('user_areas')
    .select('area_id')
    .eq('user_id', currentUserId);
  const areaIds = (myAreas ?? []).map((r) => r.area_id);
  if (areaIds.length === 0) return [];

  const { data: userIdsInAreas } = await supabase
    .from('user_areas')
    .select('user_id')
    .in('area_id', areaIds);
  const ids = [...new Set((userIdsInAreas ?? []).map((r) => r.user_id))];
  if (ids.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, name, surname')
    .in('id', ids)
    .eq('role', 'agent')
    .order('surname');
  return (users ?? []).map((u) => ({ id: u.id, name: u.name ?? '', surname: u.surname ?? '' }));
}

/** Restituisce gli id degli agenti che l'utente può vedere (per aggregato senza filtro) */
async function getVisibleAgentIds(supabase: ReturnType<typeof createClient>, currentUserId: string): Promise<string[]> {
  const { data: me } = await supabase.from('users').select('role').eq('id', currentUserId).single();
  const role = me?.role as UserRole | null;
  if (role === 'agent') return [currentUserId];
  if (role === 'supervisor') {
    const { data } = await supabase.from('users').select('id').eq('role', 'agent');
    return (data ?? []).map((u) => u.id);
  }
  if (role === 'am') {
    const { data: myAreas } = await supabase.from('user_areas').select('area_id').eq('user_id', currentUserId);
    const areaIds = (myAreas ?? []).map((r) => r.area_id);
    if (areaIds.length === 0) return [];
    const { data: userIdsInAreas } = await supabase.from('user_areas').select('user_id').in('area_id', areaIds);
    const ids = [...new Set((userIdsInAreas ?? []).map((r) => r.user_id))];
    const { data: agents } = await supabase.from('users').select('id').in('id', ids).eq('role', 'agent');
    return (agents ?? []).map((u) => u.id);
  }
  return [currentUserId];
}

export async function fetchUserStores(userId: string, options?: FetchUserStoresOptions) {
  const supabase = createClient();
  const { dateFrom, dateTo, clientId, agentIds } = options ?? {};
  const isHistoryMode = dateFrom != null || dateTo != null;

  const { data: me } = await supabase.from('users').select('role').eq('id', userId).single();
  const role = me?.role as UserRole | null;
  const baseIds =
    role === 'agent'
      ? [userId]
      : role === 'am' || role === 'supervisor'
        ? (agentIds?.length ? agentIds : await getVisibleAgentIds(supabase, userId))
        : [userId];
  // AM e Supervisor vedono sempre anche le proprie attività insieme a quelle degli agenti
  const targetIds =
    role === 'am' || role === 'supervisor'
      ? Array.from(new Set([userId, ...baseIds]))
      : baseIds;

  // Build date filter for history mode (storico attività)
  let statusQuery = supabase
    .from('store_status_logs')
    .select('*')
    .in('modifier', targetIds)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (dateFrom) statusQuery = statusQuery.gte('created_at', dateFrom);
  if (dateTo) statusQuery = statusQuery.lte('created_at', dateTo);

  const { data: storeStatuses, error: statusError } = await statusQuery;

  if (statusError) {
    console.error('Error fetching store statuses:', statusError);
    return [];
  }

  // Get photos for target agents (from "Mi trovo qui")
  let photosQuery = supabase
    .from('store_photos')
    .select('*')
    .in('user_id', targetIds)
    .order('created_at', { ascending: false });
  if (dateFrom) photosQuery = photosQuery.gte('created_at', dateFrom);
  if (dateTo) photosQuery = photosQuery.lte('created_at', dateTo);
  const { data: storePhotos, error: photosError } = await photosQuery;

  if (photosError) {
    console.error('Error fetching store photos:', photosError);
  }

  // Get generic photos for target agents (from "Inserisci foto")
  let genericQuery = supabase
    .from('generic_photos')
    .select('*')
    .in('user_id', targetIds)
    .order('created_at', { ascending: false });
  if (dateFrom) genericQuery = genericQuery.gte('created_at', dateFrom);
  if (dateTo) genericQuery = genericQuery.lte('created_at', dateTo);
  const { data: genericPhotos, error: genericPhotosError } = await genericQuery;

  if (genericPhotosError) {
    console.error('Error fetching generic photos:', genericPhotosError);
  }

  // History mode: use all entries; otherwise keep only latest status per store
  const storeMap = new Map();
  if (isHistoryMode) {
    storeStatuses?.forEach((status) => storeMap.set(`${status.store_id}-${status.created_at}`, status));
  } else {
    storeStatuses?.forEach((status) => {
      if (!storeMap.has(status.store_id)) {
        storeMap.set(status.store_id, status);
      }
    });
  }

  const statusValues = Array.from(storeMap.values());

  // Get unique store IDs from status logs, store photos, and generic photos
  const photoStoreIds = storePhotos?.map((photo) => photo.store_id) || [];
  const genericPhotoStoreIds = genericPhotos?.map((photo) => photo.store_id) || [];
  const statusStoreIds = statusValues.map((s: { store_id: number }) => s.store_id);
  const uniqueStoreIds = Array.from(new Set([...statusStoreIds, ...photoStoreIds, ...genericPhotoStoreIds]));

  // Fetch store details for these IDs (with client name)
  const { data: storeDetails, error: storeError } = await supabase
    .from('stores')
    .select('*, client:clients(id, name)')
    .in('id', uniqueStoreIds);

  if (storeError) {
    console.error('Error fetching store details:', storeError);
    return [];
  }

  // Create a map of store details for easy lookup
  const storeDetailsMap = new Map(
    storeDetails?.map((store) => [store.id, store])
  );

  const getClientName = (store: (typeof storeDetails)[0]) =>
    store?.client && typeof store.client === 'object' && 'name' in store.client
      ? (store.client as { name: string }).name
      : null;

  const byClient = (entry: { client_id?: number | string | null }) =>
    clientId == null || String(entry.client_id) === String(clientId);

  // Mappa modifier_id -> "Nome Cognome" per mostrare l'agente in storico/CSV
  const modifierIds = new Set<string>();
  statusValues.forEach((s: { modifier: string }) => modifierIds.add(s.modifier));
  (storePhotos ?? []).forEach((p: { user_id: string }) => modifierIds.add(p.user_id));
  (genericPhotos ?? []).forEach((p: { user_id: string }) => modifierIds.add(p.user_id));
  const modifierIdList = Array.from(modifierIds);
  const modifierMap = new Map<string, string>();
  if (modifierIdList.length > 0) {
    const { data: modifierUsers } = await supabase
      .from('users')
      .select('id, name, surname')
      .in('id', modifierIdList);
    (modifierUsers ?? []).forEach((u: { id: string; name: string | null; surname: string | null }) => {
      modifierMap.set(u.id, [u.name, u.surname].filter(Boolean).join(' ').trim() || '');
    });
  }

  // Combine status logs and photos into a unified array
  const statusEntries = statusValues
    .map((status) => {
      const store = storeDetailsMap.get(status.store_id);
      return {
        type: 'status' as const,
        store_id: status.store_id,
        store_name: store?.name,
        address: store?.address,
        cap: store?.cap,
        comune: store?.comune,
        provincia: store?.provincia,
        status: store?.status || '',
        created_at: status.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        client_id: store?.client_id ?? null,
        client_name: getClientName(store),
        modifier_display_name: modifierMap.get(status.modifier) ?? '',
      };
    })
    .filter((entry) => entry.status !== 'free')
    .filter(byClient);

  // Add photo entries (from "Mi trovo qui")
  const photoEntries = (storePhotos || [])
    .map((photo) => {
      const store = storeDetailsMap.get(photo.store_id);
      return {
        type: 'photo' as const,
        store_id: photo.store_id,
        store_name: store?.name,
        address: store?.address,
        cap: store?.cap,
        comune: store?.comune,
        provincia: store?.provincia,
        status: store?.status || '',
        created_at: photo.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        photo_url: photo.photo_url,
        client_id: store?.client_id ?? null,
        client_name: getClientName(store),
        modifier_display_name: modifierMap.get(photo.user_id) ?? '',
      };
    })
    .filter(byClient);

  // Add generic photo entries (from "Inserisci foto")
  const genericPhotoEntries = (genericPhotos || [])
    .map((photo) => {
      const store = storeDetailsMap.get(photo.store_id);
      return {
        type: 'photo' as const,
        store_id: photo.store_id,
        store_name: store?.name,
        address: store?.address,
        cap: store?.cap,
        comune: store?.comune,
        provincia: store?.provincia,
        status: store?.status || '',
        created_at: photo.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        photo_url: photo.photo_url,
        client_id: store?.client_id ?? null,
        client_name: getClientName(store),
        modifier_display_name: modifierMap.get(photo.user_id) ?? '',
      };
    })
    .filter(byClient);

  // Combine and sort by created_at (most recent first)
  const allEntries = [...statusEntries, ...photoEntries, ...genericPhotoEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return allEntries;
}
