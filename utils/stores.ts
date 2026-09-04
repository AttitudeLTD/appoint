'use server';

import { createClient } from '@/utils/supabase/server';
import { chunk, fetchAllRows } from '@/utils/supabase/fetch-all';

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
  const ids = Array.from(new Set((userIdsInAreas ?? []).map((r) => r.user_id)));
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
    const ids = Array.from(new Set((userIdsInAreas ?? []).map((r) => r.user_id)));
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

  // Tutte le query "attività" sono paginate con fetchAllRows: Supabase tronca
  // a 1000 righe per risposta (anche con .limit più alto) e su "tutto il
  // periodo" lo storico supera la soglia. Ordine stabile: created_at desc + id.

  // Build date filter for history mode (storico attività)
  const { data: storeStatuses, error: statusError } = await fetchAllRows((from, to) => {
    let q = supabase
      .from('store_status_logs')
      .select('*')
      .in('modifier', targetIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    return q.range(from, to);
  });

  if (statusError) {
    console.error('Error fetching store statuses:', statusError);
    return [];
  }

  // Get photos for target agents (from "Mi trovo qui")
  const { data: storePhotos, error: photosError } = await fetchAllRows((from, to) => {
    let q = supabase
      .from('store_photos')
      .select('*')
      .in('user_id', targetIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    return q.range(from, to);
  });

  if (photosError) {
    console.error('Error fetching store photos:', photosError);
  }

  // Get generic photos for target agents (from "Inserisci foto")
  const { data: genericPhotos, error: genericPhotosError } = await fetchAllRows((from, to) => {
    let q = supabase
      .from('generic_photos')
      .select('*')
      .in('user_id', targetIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    return q.range(from, to);
  });

  if (genericPhotosError) {
    console.error('Error fetching generic photos:', genericPhotosError);
  }

  // Esiti dei workflow "manage_form" (es. PROGETTO AICALL / AiCall): l'esito
  // viene salvato in `store_visit_outcomes.outcome_data` e NON cambia lo status
  // del pin, quindi non comparirebbe nello storico basato su status_logs. Lo
  // recuperiamo a parte per renderlo visibile in dashboard/CSV.
  const { data: visitOutcomes, error: outcomesError } = await fetchAllRows((from, to) => {
    let q = supabase
      .from('store_visit_outcomes')
      .select('store_id, client_id, user_id, outcome_data, created_at')
      .in('user_id', targetIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    return q.range(from, to);
  });

  if (outcomesError) {
    console.error('Error fetching store visit outcomes:', outcomesError);
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

  // Get unique store IDs from status logs, store photos, generic photos and outcomes
  const photoStoreIds = storePhotos?.map((photo) => photo.store_id) || [];
  const genericPhotoStoreIds = genericPhotos?.map((photo) => photo.store_id) || [];
  const statusStoreIds = statusValues.map((s: { store_id: number }) => s.store_id);
  const outcomeStoreIds = (visitOutcomes ?? []).map((o: { store_id: number }) => o.store_id);
  const uniqueStoreIds = Array.from(
    new Set([...statusStoreIds, ...photoStoreIds, ...genericPhotoStoreIds, ...outcomeStoreIds])
  );

  // Fetch store details for these IDs (with client name).
  // NB: esistono DUE relazioni stores↔clients (FK diretta `stores.client_id` e
  // N:N via `store_clients`), quindi va disambiguata la FK nell'embed, altrimenti
  // PostgREST risponde PGRST201 e la query fallisce (storico vuoto).
  // A blocchi di 500 id: querystring corta e risposte sempre sotto max-rows.
  const storeDetails: any[] = [];
  for (const ids of chunk(uniqueStoreIds, 500)) {
    const { data, error: storeError } = await supabase
      .from('stores')
      .select('*, client:clients!stores_client_id_fkey(id, name)')
      .in('id', ids);
    if (storeError) {
      console.error('Error fetching store details:', storeError);
      return [];
    }
    storeDetails.push(...(data ?? []));
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
  (visitOutcomes ?? []).forEach((o: { user_id: string }) => modifierIds.add(o.user_id));
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
        pi: store?.pi,
        status: store?.status || '',
        created_at: status.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        client_id: store?.client_id ?? null,
        client_name: getClientName(store),
        data_setup: store?.data_setup ?? null,
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
        pi: store?.pi,
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
        data_setup: store?.data_setup ?? null,
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
        pi: store?.pi,
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
        data_setup: store?.data_setup ?? null,
        modifier_display_name: modifierMap.get(photo.user_id) ?? '',
      };
    })
    .filter(byClient);

  // Esiti dei workflow manage_form: costruiamo la mappa value→label leggendo le
  // `options` dei field del workflow dei clienti coinvolti (così l'etichetta
  // mostrata è quella configurata, non lo slug grezzo). Chiave: `${client_id}:${value}`.
  // Ogni opzione può avere anche `amex_status` ("Status - Sub status" richiesto
  // da Amex per il reporting delle lead AiCall): lo mappiamo allo stesso modo.
  const esitoLabelByClientValue = new Map<string, string>();
  const amexStatusByClientValue = new Map<string, string>();
  const outcomeClientIds = Array.from(
    new Set((visitOutcomes ?? []).map((o: { client_id: number }) => o.client_id))
  );
  if (outcomeClientIds.length > 0) {
    const { data: wfs } = await supabase
      .from('client_workflows')
      .select('client_id, workflow')
      .in('client_id', outcomeClientIds);
    for (const wf of wfs ?? []) {
      const sections = (wf as any)?.workflow?.manage_form?.sections ?? [];
      for (const sec of sections) {
        for (const f of sec?.fields ?? []) {
          for (const opt of f?.options ?? []) {
            if (opt?.value != null) {
              esitoLabelByClientValue.set(`${wf.client_id}:${opt.value}`, opt.label ?? String(opt.value));
              if (opt.amex_status) {
                amexStatusByClientValue.set(`${wf.client_id}:${opt.value}`, String(opt.amex_status));
              }
            }
          }
        }
      }
    }
  }

  // Add outcome entries (esiti dei workflow manage_form, es. AiCall)
  const outcomeEntries = (visitOutcomes ?? [])
    .map((o: any) => {
      const store = storeDetailsMap.get(o.store_id);
      const data = (o.outcome_data ?? {}) as Record<string, unknown>;
      const esitoVal = (data.esito as string | undefined) ?? null;
      const esitoLabel = esitoVal
        ? esitoLabelByClientValue.get(`${o.client_id}:${esitoVal}`) ?? String(esitoVal)
        : '';
      const amexStatus = esitoVal
        ? amexStatusByClientValue.get(`${o.client_id}:${esitoVal}`) ?? ''
        : '';
      const clientId = o.client_id ?? store?.client_id ?? null;
      return {
        type: 'outcome' as const,
        store_id: o.store_id,
        store_name: store?.name,
        address: store?.address,
        cap: store?.cap,
        comune: store?.comune,
        provincia: store?.provincia,
        pi: store?.pi,
        status: store?.status || '',
        esito: esitoVal,
        esito_label: esitoLabel,
        amex_status: amexStatus,
        note: (data.note as string | undefined) ?? '',
        created_at: o.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        client_id: clientId,
        client_name: getClientName(store),
        data_setup: store?.data_setup ?? null,
        modifier_display_name: modifierMap.get(o.user_id) ?? '',
      };
    })
    .filter(byClient);

  // Combine and sort by created_at (most recent first)
  const allEntries = [
    ...statusEntries,
    ...photoEntries,
    ...genericPhotoEntries,
    ...outcomeEntries,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return allEntries;
}
