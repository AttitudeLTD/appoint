'use client';

import {
  Store,
  Camera,
  MapPin,
  CheckCircle,
  Clock,
  XCircle,
  Star,
  Ban,
  X,
  Navigation,
  History,
  Download,
  CalendarIcon,
  TrendingUp,
  ClipboardCheck,
  Phone,
  ChevronDown,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { fetchUserStores, getDashboardContext } from '@/utils/stores';
import { getMyLoc, parseCoords } from '@/utils/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getStatusLabel, statuses } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DayPicker } from 'react-day-picker';
import { it } from 'date-fns/locale';
import { format } from 'date-fns';
import 'react-day-picker/style.css';

const STATUS_KPI_CONFIG: Record<
  string,
  { icon: typeof Store; color: string; bgColor: string }
> = {
  in_progress: { icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-500/20' },
  concluded: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/20' },
  already_client: { icon: Star, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  failed: { icon: Ban, color: 'text-red-500', bgColor: 'bg-red-500/20' },
  not_interested: { icon: X, color: 'text-gray-500', bgColor: 'bg-gray-500/20' },
  non_existent: { icon: XCircle, color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
};

const NEARBY_RADIUS_M = 5000;
const NEARBY_LIMIT = 10;

function getDefaultDateRange() {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return {
    fromStr: from.toISOString().slice(0, 10),
    toStr: now.toISOString().slice(0, 10),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

type DashboardRole = 'agent' | 'am' | 'supervisor';

// Preset rapidi di periodo per il filtro date (#3).
function rangeForPreset(preset: 'today' | '7d' | '30d' | 'month'): {
  fromStr: string;
  toStr: string;
} {
  const now = new Date();
  const toStr = now.toISOString().slice(0, 10);
  let from: Date;
  if (preset === 'today') {
    from = new Date(now);
  } else if (preset === '7d') {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  } else if (preset === '30d') {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { fromStr: from.toISOString().slice(0, 10), toStr };
}

// Multiselect riutilizzabile (stessa UI per Agenti / Clienti / Esiti):
// label sopra, trigger con freccetta, popover con checkbox + voce "Tutti".
function MultiSelectPopover({
  label,
  allLabel,
  options,
  selected,
  onChange,
  widthClass = 'w-[180px]',
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? '1 selezionato'
        : `${selected.length} selezionati`;
  return (
    <div className='flex flex-col gap-1'>
      {label ? <label className='text-xs text-white/80'>{label}</label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            className={`h-9 ${widthClass} justify-between gap-1 bg-white/10 border-white/20 text-white hover:bg-white/20`}
          >
            <span className='truncate'>{triggerLabel}</span>
            <ChevronDown className='h-4 w-4 shrink-0 opacity-70' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-64 p-2 bg-slate-900 border-white/20' align='start'>
          <div className='space-y-1 max-h-64 overflow-y-auto'>
            <label className='flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/10 text-sm text-white'>
              <Checkbox
                checked={selected.length === 0}
                onCheckedChange={(checked) => {
                  if (checked) onChange([]);
                }}
              />
              {allLabel}
            </label>
            {options.map((o) => (
              <label
                key={o.value}
                className='flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/10 text-sm text-white'
              >
                <Checkbox
                  checked={selected.includes(o.value)}
                  onCheckedChange={(checked) => {
                    onChange(
                      checked
                        ? [...selected, o.value]
                        : selected.filter((x) => x !== o.value)
                    );
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [nearbyProspects, setNearbyProspects] = useState<any[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const supabase = createClient();

  const [dashboardRole, setDashboardRole] = useState<DashboardRole | null>(null);
  const [agentsForFilter, setAgentsForFilter] = useState<{ id: string; name: string; surname: string }[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Storico attività: date range (default ultimi 7 giorni), cliente, lista
  const [historyDateFrom, setHistoryDateFrom] = useState<string>(() =>
    getDefaultDateRange().fromStr
  );
  const [historyDateTo, setHistoryDateTo] = useState<string>(() =>
    getDefaultDateRange().toStr
  );
  // Filtri multiselect (vuoto = tutti). Esiti accetta status, 'photo' e 'outcome'.
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedEsiti, setSelectedEsiti] = useState<string[]>([]);
  const [historyActivities, setHistoryActivities] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [coord, setCoord] = useState<[number, number] | null>(null);
  // Filtro clienti per i "Prospect vicini" (multiselect; vuoto = tutti).
  const [selectedNearbyClientIds, setSelectedNearbyClientIds] = useState<string[]>([]);
  // Clienti visibili all'utente (RLS) per le tendine client (es. prospect).
  const [visibleClients, setVisibleClients] = useState<{ id: number; name: string }[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── Export negozi per supervisor ────────────────────────────────────────────
  // Lista di tutti i clienti per il select dell'export (caricata solo per supervisor).
  // L'export è "un cliente alla volta" (no "tutti insieme") per design.
  const [allClients, setAllClients] = useState<{ id: number; name: string }[]>([]);
  const [exportClientId, setExportClientId] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const ctx = await getDashboardContext(user.id);
          setDashboardRole(ctx.role ?? null);
          setAgentsForFilter(ctx.agents);
        }
      } catch (error) {
        console.error('Error loading activities:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Posizione utente (per indicazioni + prospect vicini)
  useEffect(() => {
    getMyLoc((coords) => {
      if (coords && Array.isArray(coords)) {
        setCoord(coords as [number, number]);
      } else {
        setNearbyError('Posizione non disponibile');
        setNearbyLoading(false);
      }
    });
  }, []);

  // Clienti visibili all'utente (per la tendina dei prospect). RLS limita a ciò
  // che l'utente può vedere.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true });
      if (!error && data) {
        setVisibleClients(data.map((c: any) => ({ id: c.id, name: c.name })));
      }
    })();
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    // Attendiamo che il ruolo sia noto: così la singola fetch parte già con il
    // set corretto di agenti (per AM/supervisor) ed evitiamo un fetch iniziale
    // "sbagliato" con ruolo nullo. Questa fetch alimenta sia KPI che storico.
    if (!dashboardRole) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setHistoryLoading(true);
    try {
      const defaultRange = getDefaultDateRange();
      const fromDate = historyDateFrom || defaultRange.fromStr;
      const toDate = historyDateTo || defaultRange.toStr;
      const dateFrom = new Date(fromDate + 'T00:00:00').toISOString();
      const dateTo = new Date(toDate + 'T23:59:59').toISOString();
      const agentIds =
        (dashboardRole === 'am' || dashboardRole === 'supervisor') && selectedAgentIds.length > 0
          ? selectedAgentIds
          : undefined;
      // Il filtro cliente è ora multiselect e viene applicato lato client (sotto),
      // così la fetch resta unica e la tendina clienti mostra tutti i clienti del periodo.
      const data = await fetchUserStores(user.id, {
        dateFrom,
        dateTo,
        agentIds,
      });
      setHistoryActivities(data);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyDateFrom, historyDateTo, dashboardRole, selectedAgentIds, supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Prospect vicini: RPC get_stores_within_radius (solo status free), con filtro
  // cliente opzionale (multiselect → p_client_ids). Si ri-esegue al cambio filtro.
  const loadNearby = useCallback(async () => {
    if (!coord) return;
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNearbyLoading(false);
        return;
      }
      const [lat, lng] = coord;
      const params: {
        lat: number;
        lng: number;
        radius: number;
        p_limit: number;
        p_client_ids?: number[];
      } = { lat, lng, radius: NEARBY_RADIUS_M, p_limit: 60 };
      if (selectedNearbyClientIds.length > 0) {
        params.p_client_ids = selectedNearbyClientIds.map(Number);
      }

      const { data: storesData, error: rpcError } = await supabase.rpc(
        'get_stores_within_radius',
        params
      );

      if (rpcError) {
        console.error('get_stores_within_radius error:', rpcError);
        setNearbyError('Errore nel caricamento');
        setNearbyProspects([]);
        return;
      }

      // Visibilità gestita lato DB (RLS + RPC), niente filtro client-side.
      const stores = (storesData ?? []).filter((s: any) => s.status === 'free');
      setNearbyProspects(stores.slice(0, NEARBY_LIMIT));
      setNearbyError(null);
    } catch (error) {
      console.error('Unexpected error in get_stores_within_radius:', error);
      setNearbyError('Errore nel caricamento');
      setNearbyProspects([]);
    } finally {
      setNearbyLoading(false);
    }
  }, [coord, selectedNearbyClientIds, supabase]);

  useEffect(() => {
    if (coord) loadNearby();
  }, [coord, loadNearby]);

  const historyClients = useMemo(() => {
    const m = new Map<string, string>();
    historyActivities.forEach((a) => {
      if (a.client_id != null && a.client_name) m.set(String(a.client_id), a.client_name);
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [historyActivities]);

  // Filtro cliente (multiselect) applicato lato client. I KPI usano questo set.
  const clientFiltered = useMemo(() => {
    if (selectedClientIds.length === 0) return historyActivities;
    const set = new Set(selectedClientIds);
    return historyActivities.filter(
      (a) => a.client_id != null && set.has(String(a.client_id))
    );
  }, [historyActivities, selectedClientIds]);

  // Storico filtrato per cliente + esiti (multiselect) → per lista e CSV.
  const filteredHistoryActivities = useMemo(() => {
    if (selectedEsiti.length === 0) return clientFiltered;
    const set = new Set(selectedEsiti);
    return clientFiltered.filter((a) => {
      if (a.type === 'photo') return set.has('photo');
      if (a.type === 'outcome') return set.has('outcome');
      return a.type === 'status' && set.has(a.status);
    });
  }, [clientFiltered, selectedEsiti]);

  const handleDownloadHistoryCSV = useCallback(() => {
    if (filteredHistoryActivities.length === 0) return;
    const withAgent = (dashboardRole === 'am' || dashboardRole === 'supervisor');
    const headers = [
      'Tipo',
      'Nome Attività',
      'Partita IVA',
      'Indirizzo',
      'CAP',
      'Comune',
      'Provincia',
      'Stato',
      ...(withAgent ? ['Agente'] : []),
      'Data',
      'URL Foto',
    ];
    const csvRows = filteredHistoryActivities.map((entry) => {
      const tipo =
        entry.type === 'photo'
          ? 'Foto'
          : entry.type === 'outcome'
            ? 'Esito AiCall'
            : 'Stato';
      const stato =
        entry.type === 'photo'
          ? 'Foto scattata'
          : entry.type === 'outcome'
            ? `${entry.esito_label || ''}${entry.note ? ` — ${entry.note}` : ''}`.trim()
            : getStatusLabel(entry.status);
      return [
        tipo,
        entry.store_name || '',
        entry.pi || '',
        entry.address || '',
        entry.cap || '',
        entry.comune || '',
        entry.provincia || '',
        stato,
        ...(withAgent ? [entry.modifier_display_name ?? ''] : []),
        new Date(entry.created_at).toLocaleString('it-IT'),
        entry.type === 'photo' ? entry.photo_url || '' : '',
      ];
    });
    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell ?? '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          })
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `storico-attivita-${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [filteredHistoryActivities, dashboardRole]);

  // Carica la lista clienti per il pannello "Esporta lista negozi" (solo supervisor).
  useEffect(() => {
    if (dashboardRole !== 'supervisor') return;
    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) {
        console.error('Error loading clients for export:', error);
        return;
      }
      setAllClients((data ?? []).map((c: any) => ({ id: c.id, name: c.name })));
    })();
  }, [dashboardRole, supabase]);

  // Esporta come CSV tutti i negozi associati al cliente selezionato (sia come
  // cliente primario sia come secondario, via tabella di join `store_clients`).
  const handleExportStoresCSV = useCallback(async () => {
    if (!exportClientId) return;
    setExportLoading(true);
    try {
      const clientIdNum = Number(exportClientId);
      // 1) Tutti gli store_id collegati a questo cliente (primary o secondary).
      const { data: links, error: linksErr } = await supabase
        .from('store_clients')
        .select('store_id, is_primary')
        .eq('client_id', clientIdNum);
      if (linksErr) throw linksErr;

      // 2) Aggiungiamo anche i (eventuali) negozi che hanno SOLO il vecchio
      //    campo `stores.client_id` valorizzato e nessuna riga in store_clients
      //    (back-compat con il modello pre-multicliente).
      const { data: legacyStores, error: legacyErr } = await supabase
        .from('stores')
        .select('id')
        .eq('client_id', clientIdNum);
      if (legacyErr) throw legacyErr;

      const primaryByStoreId = new Map<number, boolean>();
      for (const l of links ?? []) primaryByStoreId.set(l.store_id as number, !!l.is_primary);
      for (const s of legacyStores ?? []) {
        if (!primaryByStoreId.has(s.id as number)) primaryByStoreId.set(s.id as number, true);
      }

      const storeIds = Array.from(primaryByStoreId.keys());
      if (storeIds.length === 0) {
        alert('Nessun negozio trovato per il cliente selezionato.');
        return;
      }

      // 3) Fetch dei dettagli negozio.
      const { data: storesData, error: storesErr } = await supabase
        .from('stores')
        .select(
          'id, name, pi, cf_azienda, address, comune, provincia, cap, regione, phone, email, category, codice_ateco, dipendenti, fatturato, tier, status, created_at, created_by'
        )
        .in('id', storeIds);
      if (storesErr) throw storesErr;

      // 4) Lookup nominativo creatore (solo per chi ce l'ha valorizzato).
      const creatorIds = Array.from(
        new Set(
          (storesData ?? [])
            .map((s: any) => s.created_by)
            .filter((v: string | null) => !!v)
        )
      );
      const creatorById = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, surname')
          .in('id', creatorIds);
        for (const u of usersData ?? []) {
          creatorById.set(
            u.id as string,
            `${u.name ?? ''} ${u.surname ?? ''}`.trim() || (u.id as string)
          );
        }
      }

      const clientName =
        allClients.find((c) => c.id === clientIdNum)?.name ?? `cliente_${clientIdNum}`;

      // 5) Build CSV.
      const headers = [
        'ID',
        'Ragione sociale',
        'Partita IVA',
        'Codice fiscale azienda',
        'Indirizzo',
        'Comune',
        'Provincia',
        'CAP',
        'Regione',
        'Telefono',
        'Email',
        'Categoria',
        'Codice ATECO',
        'Dipendenti',
        'Fatturato',
        'Tier',
        'Status',
        'Cliente',
        'Cliente primario',
        'Data creazione',
        'Creato da',
      ];
      const rows = (storesData ?? []).map((s: any) => {
        const isPrimary = primaryByStoreId.get(s.id) === true;
        return [
          s.id,
          s.name ?? '',
          s.pi ?? '',
          s.cf_azienda ?? '',
          s.address ?? '',
          s.comune ?? '',
          s.provincia ?? '',
          s.cap ?? '',
          s.regione ?? '',
          s.phone ?? '',
          s.email ?? '',
          s.category ?? '',
          s.codice_ateco ?? '',
          s.dipendenti ?? '',
          s.fatturato ?? '',
          s.tier ?? '',
          getStatusLabel(s.status) || s.status || '',
          clientName,
          isPrimary ? 'Sì' : 'No',
          s.created_at ? new Date(s.created_at).toLocaleString('it-IT') : '',
          s.created_by ? creatorById.get(s.created_by) ?? '' : '',
        ];
      });

      const escape = (cell: unknown) => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const csv = [headers, ...rows]
        .map((r) => r.map(escape).join(','))
        .join('\n');

      const safeClientName = clientName.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
      const fileName = `negozi-${safeClientName}-${new Date().toISOString().split('T')[0]}.csv`;
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      console.error('Export stores CSV error:', err);
      alert(`Errore export: ${err?.message ?? 'sconosciuto'}`);
    } finally {
      setExportLoading(false);
    }
  }, [exportClientId, supabase, allClients]);

  // KPI: un record per store (stato più recente), conteggi per esito + tasso di
  // conversione + percentuali. Fonte: `clientFiltered` (riflette periodo, agenti
  // e clienti selezionati; indipendente dal filtro esiti, che agisce sulla lista).
  const kpis = useMemo(() => {
    const storeToStatus = new Map<number, string>();
    for (const e of clientFiltered) {
      if (!storeToStatus.has(e.store_id)) {
        storeToStatus.set(e.store_id, e.status || 'free');
      }
    }
    const total = storeToStatus.size;
    const byStatus: Record<string, number> = {};
    Array.from(storeToStatus.values()).forEach((status) => {
      if (status !== 'free') {
        byStatus[status] = (byStatus[status] || 0) + 1;
      }
    });

    const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%');

    type KpiItem = {
      id: string;
      label: string;
      value: string;
      sub?: string;
      icon: typeof Store;
      color: string;
      bgColor: string;
    };
    const items: KpiItem[] = [
      {
        id: 'visite',
        label: 'Numero visite',
        value: String(total),
        icon: Store,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/20',
      },
    ];

    // Tasso di conversione = contratti sottoscritti / visite totali del periodo.
    const concluded = byStatus['concluded'] ?? 0;
    items.push({
      id: 'conversion',
      label: 'Tasso conversione',
      value: pct(concluded),
      sub: `${concluded}/${total}`,
      icon: TrendingUp,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
    });

    for (const s of statuses) {
      if (s.value === 'free') continue;
      const count = byStatus[s.value] ?? 0;
      const config = STATUS_KPI_CONFIG[s.value];
      if (config) {
        items.push({
          id: s.value,
          label: s.label,
          value: String(count),
          sub: pct(count),
          icon: config.icon,
          color: config.color,
          bgColor: config.bgColor,
        });
      }
    }
    return items;
  }, [clientFiltered]);

  // #6 — Andamento visite per giorno nel periodo (mini-grafico a barre, no librerie).
  const dailyTrend = useMemo(() => {
    const byDay = new Map<string, Set<number>>();
    for (const e of clientFiltered) {
      const day = String(e.created_at).slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, new Set<number>());
      byDay.get(day)!.add(e.store_id);
    }
    const days = Array.from(byDay.entries())
      .map(([day, set]) => ({ day, count: set.size }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
    const max = days.reduce((m, d) => Math.max(m, d.count), 0);
    return { days, max };
  }, [clientFiltered]);


  const showAgentFilter = dashboardRole === 'am' || dashboardRole === 'supervisor';

  return (
    <div className='container mx-auto px-4 py-8 max-w-7xl' style={{ backgroundColor: '#224677', minHeight: '100vh' }}>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-white'>Dashboard</h1>
      </div>

      {/* Filtro agenti (solo AM e Supervisor) */}
      <div className='mb-6 flex flex-wrap items-end gap-3'>
        {showAgentFilter && agentsForFilter.length > 0 && (
          <MultiSelectPopover
            label='Agenti'
            allLabel='Tutti gli agenti'
            widthClass='w-[200px]'
            options={agentsForFilter.map((a) => ({
              value: a.id,
              label: [a.name, a.surname].filter(Boolean).join(' ').trim() || a.id,
            }))}
            selected={selectedAgentIds}
            onChange={setSelectedAgentIds}
          />
        )}

        {/* Filtri globali dashboard: periodo, clienti, esiti (valgono per KPI + storico) */}
        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-white/80'>Periodo</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className='h-9 w-[180px] min-w-0 justify-start gap-1 overflow-hidden px-2 bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs'
                >
                  <CalendarIcon className='h-3.5 w-3.5 shrink-0' />
                  <span className='min-w-0 truncate'>
                    {historyDateFrom && historyDateTo ? (
                      <>
                        {format(new Date(historyDateFrom + 'T12:00:00'), 'd/M/yy')} –{' '}
                        {format(new Date(historyDateTo + 'T12:00:00'), 'd/M/yy')}
                      </>
                    ) : (
                      <span className='text-white/80'>Seleziona periodo</span>
                    )}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className='w-auto p-4 border border-white/20 rounded-xl shadow-xl'
                style={{ backgroundColor: '#224677' }}
                align='start'
              >
                {/* #3 — Preset rapidi */}
                <div className='flex flex-wrap gap-1.5 mb-3'>
                  {(
                    [
                      { id: 'today', label: 'Oggi' },
                      { id: '7d', label: '7 giorni' },
                      { id: '30d', label: '30 giorni' },
                      { id: 'month', label: 'Questo mese' },
                    ] as { id: 'today' | '7d' | '30d' | 'month'; label: string }[]
                  ).map((p) => {
                    const r = rangeForPreset(p.id);
                    const active = historyDateFrom === r.fromStr && historyDateTo === r.toStr;
                    return (
                      <button
                        key={p.id}
                        type='button'
                        onClick={() => {
                          setHistoryDateFrom(r.fromStr);
                          setHistoryDateTo(r.toStr);
                          setCalendarOpen(false);
                        }}
                        className='rounded-full text-xs px-3 py-1 border transition-colors'
                        style={{
                          backgroundColor: active ? '#CBACF9' : 'transparent',
                          borderColor: '#CBACF9',
                          color: active ? '#224677' : '#CBACF9',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  className='rdp-root rdp-dashboard-theme'
                  style={
                    {
                      ['--rdp-accent-color']: '#CBACF9',
                      ['--rdp-accent-background-color']: 'rgba(203,172,249,0.22)',
                      ['--rdp-day_button-border']: 'none',
                      ['--rdp-day_button-border-radius']: '9999px',
                      ['--rdp-today-color']: '#CBACF9',
                      // Range "in mezzo": fondo tenue leggibile, testo bianco.
                      ['--rdp-range_middle-background-color']: 'rgba(203,172,249,0.22)',
                      ['--rdp-range_middle-color']: '#ffffff',
                      // Estremi del range: pillola piena viola con testo scuro.
                      ['--rdp-range_start-background']: 'transparent',
                      ['--rdp-range_start-date-background-color']: '#CBACF9',
                      ['--rdp-range_start-color']: '#224677',
                      ['--rdp-range_end-background']: 'transparent',
                      ['--rdp-range_end-date-background-color']: '#CBACF9',
                      ['--rdp-range_end-color']: '#224677',
                      ['--rdp-selected-color']: '#224677',
                      ['--rdp-outside-opacity']: '0.4',
                      color: 'white',
                    } as React.CSSProperties
                  }
                >
                  <DayPicker
                    mode='range'
                    locale={it}
                    defaultMonth={new Date(historyDateTo + 'T12:00:00')}
                    // Il range selezionato è SEMPRE quello applicato: così resta
                    // evidenziato sul calendario e si vede a colpo d'occhio.
                    selected={{
                      from: new Date(historyDateFrom + 'T12:00:00'),
                      to: new Date(historyDateTo + 'T12:00:00'),
                    }}
                    onSelect={(range) => {
                      if (!range?.from) return;
                      const from = range.from;
                      const to = range.to ?? range.from;
                      // Applica subito (la fetch dipende da queste date).
                      setHistoryDateFrom(format(from, 'yyyy-MM-dd'));
                      setHistoryDateTo(format(to, 'yyyy-MM-dd'));
                      // Chiude solo quando è stato scelto un range completo (2 click).
                      if (range.to && range.to.getTime() !== range.from.getTime()) {
                        setCalendarOpen(false);
                      }
                    }}
                    numberOfMonths={2}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <MultiSelectPopover
            label='Clienti'
            allLabel='Tutti i clienti'
            options={historyClients.map((c) => ({ value: c.id, label: c.name }))}
            selected={selectedClientIds}
            onChange={setSelectedClientIds}
          />

          <MultiSelectPopover
            label='Esiti'
            allLabel='Tutti gli esiti'
            options={[
              ...statuses
                .filter((s) => s.value !== 'free')
                .map((s) => ({ value: s.value, label: s.label })),
              { value: 'outcome', label: 'Esiti AiCall' },
              { value: 'photo', label: 'Foto scattata' },
            ]}
            selected={selectedEsiti}
            onChange={setSelectedEsiti}
          />
        </div>
      </div>

      {/* KPI Section */}
      <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-8'>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.id}
              className={`${kpi.bgColor} rounded-lg border border-white/20 p-4 shadow-sm`}
            >
              <div className='flex items-center justify-between mb-2'>
                <Icon className={`h-5 w-5 ${kpi.color}`} />
                {kpi.sub && (
                  <span className='text-xs font-medium text-white/70'>
                    {kpi.sub}
                  </span>
                )}
              </div>
              <p className='text-2xl font-bold text-white mb-1'>
                {kpi.value}
              </p>
              <p className='text-xs text-white/80 leading-tight'>
                {kpi.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* #6 — Andamento visite per giorno (mini-grafico a barre) */}
      <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm mb-8'>
        <div className='flex items-center gap-2 mb-4'>
          <TrendingUp className='h-5 w-5 text-emerald-300' />
          <h2 className='text-xl font-semibold text-white'>Andamento visite</h2>
        </div>
        {dailyTrend.days.length === 0 ? (
          <p className='text-sm text-white/60 py-6 text-center'>
            Nessun dato nel periodo selezionato
          </p>
        ) : (
          <div className='flex items-end gap-1 h-40 overflow-x-auto pb-1'>
            {dailyTrend.days.map((d) => {
              const hPct = dailyTrend.max > 0 ? Math.round((d.count / dailyTrend.max) * 100) : 0;
              return (
                <div
                  key={d.day}
                  className='flex flex-col items-center justify-end gap-1 flex-1 min-w-[18px] h-full'
                  title={`${format(new Date(d.day + 'T12:00:00'), 'd MMM yyyy', { locale: it })}: ${d.count} visite`}
                >
                  <span className='text-[10px] text-white/70 leading-none'>{d.count}</span>
                  <div
                    className='w-full rounded-t bg-emerald-400/70 hover:bg-emerald-300 transition-colors'
                    style={{ height: `${Math.max(hPct, 3)}%` }}
                  />
                  <span className='text-[9px] text-white/50 leading-none whitespace-nowrap'>
                    {format(new Date(d.day + 'T12:00:00'), 'd/M', { locale: it })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Due riquadri affiancati: stessa altezza, area lista riempie fino in fondo e scrolla se serve */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch'>
        {/* Riquadro Storico Attività */}
        <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm flex flex-col min-h-0 overflow-hidden max-h-[32rem]'>
          <div className='flex items-center justify-between gap-2 mb-4 flex-shrink-0'>
            <div className='flex items-center gap-2'>
              <History className='h-5 w-5 text-blue-300' />
              <h2 className='text-xl font-semibold text-white'>Storico Attività</h2>
            </div>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 text-white hover:bg-white/20'
              onClick={handleDownloadHistoryCSV}
              disabled={filteredHistoryActivities.length === 0}
              title='Scarica CSV'
            >
              <Download className='h-4 w-4' />
            </Button>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto min-h-[280px]'>
            {historyLoading ? (
              <div className='text-center text-white/80 py-8'>Caricamento...</div>
            ) : filteredHistoryActivities.length > 0 ? (
              <div className='space-y-3'>
                {filteredHistoryActivities.map((activity, index) => {
                  const entryKey =
                    activity.type === 'photo'
                      ? `photo-${activity.store_id}-${activity.created_at}-${index}`
                      : `status-${activity.store_id}-${activity.created_at}-${index}`;
                  return (
                    <div
                      key={entryKey}
                      className='flex items-center justify-between gap-3 p-3 rounded-lg border border-white/20 hover:bg-white/10 transition-colors'
                    >
                      <div className='flex items-start gap-3 flex-1 min-w-0'>
                        {activity.type === 'photo' ? (
                          <Camera className='h-4 w-4 text-blue-300 mt-0.5 flex-shrink-0' />
                        ) : activity.type === 'outcome' ? (
                          <ClipboardCheck className='h-4 w-4 text-purple-300 mt-0.5 flex-shrink-0' />
                        ) : (
                          <Store className='h-4 w-4 text-white/80 mt-0.5 flex-shrink-0' />
                        )}
                        <div className='flex-1 min-w-0'>
                          <p className='font-medium text-sm truncate text-white'>
                            {activity.store_name}
                          </p>
                          {activity.pi ? (
                            <p className='text-xs text-white/70 truncate'>
                              P.IVA: {activity.pi}
                            </p>
                          ) : null}
                          <p className='text-xs text-white/80 truncate'>
                            {activity.address}
                            {activity.cap && `, ${activity.cap}`}
                            {activity.comune && ` ${activity.comune}`}
                          </p>
                          {activity.type === 'photo' ? (
                            <p className='text-xs text-blue-300 mt-1'>Foto scattata</p>
                          ) : activity.type === 'outcome' ? (
                            <>
                              <p className='text-xs text-purple-200 mt-1'>
                                {activity.esito_label || 'Esito'}
                              </p>
                              {activity.note && (
                                <p className='text-xs text-white/60 mt-0.5 break-words'>
                                  {activity.note}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className='text-xs text-white/80 mt-1'>
                              {getStatusLabel(activity.status)}
                            </p>
                          )}
                          {(dashboardRole === 'am' || dashboardRole === 'supervisor') &&
                            activity.modifier_display_name && (
                            <p className='text-xs text-amber-200/90 mt-0.5'>
                              Agente: {activity.modifier_display_name}
                            </p>
                          )}
                          <p className='text-xs text-white/60 mt-0.5'>
                            {new Date(activity.created_at).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className='flex gap-2 flex-shrink-0'>
                        {activity.type === 'photo' && activity.photo_url && (
                          <Button
                            variant='outline'
                            size='icon'
                            className='h-8 w-8'
                            onClick={() => window.open(activity.photo_url, '_blank')}
                            title='Visualizza foto'
                          >
                            <Camera className='h-4 w-4' />
                          </Button>
                        )}
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => {
                            if (
                              Array.isArray(coord) &&
                              coord.length === 2 &&
                              activity.coordinates
                            ) {
                              const [lat, lng] = coord;
                              const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${activity.coordinates[0]},${activity.coordinates[1]}`;
                              window.open(gmapsUrl, '_blank');
                            }
                          }}
                          title='Indicazioni'
                        >
                          <Navigation className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className='text-center text-white/80 py-8'>
                {historyActivities.length > 0
                  ? 'Nessuna attività con gli esiti selezionati'
                  : 'Nessuna attività nel periodo selezionato'}
              </div>
            )}
          </div>
        </div>

        {/* Riquadro Prospect vicini a te */}
        <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm flex flex-col min-h-0 overflow-hidden max-h-[32rem]'>
          <div className='flex items-center justify-between gap-2 mb-4 flex-shrink-0'>
            <div className='flex items-center gap-2 min-w-0'>
              <MapPin className='h-5 w-5 text-green-300 flex-shrink-0' />
              <h2 className='text-xl font-semibold text-white truncate'>Prospect vicini a te</h2>
            </div>
            <MultiSelectPopover
              label=''
              allLabel='Tutti i clienti'
              widthClass='w-[150px]'
              options={visibleClients.map((c) => ({ value: String(c.id), label: c.name }))}
              selected={selectedNearbyClientIds}
              onChange={setSelectedNearbyClientIds}
            />
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto min-h-[280px]'>
            {nearbyLoading ? (
              <div className='text-center text-white/80 py-8'>Caricamento...</div>
            ) : nearbyError ? (
              <div className='text-center text-white/60 py-8 text-sm'>{nearbyError}</div>
            ) : nearbyProspects.length > 0 ? (
              <div className='space-y-3'>
                {nearbyProspects.map((prospect: any) => (
                <div
                  key={prospect.id}
                  className='flex items-start gap-3 p-3 rounded-lg border border-white/20 hover:bg-white/10 transition-colors'
                >
                  <Store className='h-4 w-4 text-white/80 mt-0.5 flex-shrink-0' />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-1'>
                      <p className='font-medium text-sm truncate text-white'>
                        {prospect.name}
                      </p>
                      {prospect.tier && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            prospect.tier.toLowerCase() === 'gold'
                              ? 'bg-yellow-500/30 text-yellow-200'
                              : prospect.tier.toLowerCase() === 'silver'
                                ? 'bg-gray-500/30 text-gray-200'
                                : 'bg-amber-500/30 text-amber-200'
                          }`}
                        >
                          {String(prospect.tier).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {prospect.category && (
                      <p className='text-xs text-white/80 truncate'>{prospect.category}</p>
                    )}
                    {prospect.address && (
                      <p className='text-xs text-white/80 truncate'>{prospect.address}</p>
                    )}
                    {prospect.fatturato && (
                      <p className='text-xs text-green-300 font-medium mt-1'>
                        {prospect.fatturato}
                      </p>
                    )}
                  </div>
                  <div className='flex gap-2 flex-shrink-0'>
                    {prospect.phone && (
                      <Button
                        variant='outline'
                        size='icon'
                        className='h-8 w-8'
                        onClick={() => window.open(`tel:${prospect.phone}`, '_self')}
                        title={`Chiama ${prospect.phone}`}
                      >
                        <Phone className='h-4 w-4' />
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      size='icon'
                      className='h-8 w-8'
                      onClick={() => {
                        const dest = prospect.location
                          ? parseCoords(prospect.location)
                          : null;
                        if (!dest) return;
                        const [dlat, dlng] = dest;
                        const origin =
                          Array.isArray(coord) && coord.length === 2
                            ? `&origin=${coord[0]},${coord[1]}`
                            : '';
                        window.open(
                          `https://www.google.com/maps/dir/?api=1${origin}&destination=${dlat},${dlng}`,
                          '_blank'
                        );
                      }}
                      title='Indicazioni'
                    >
                      <Navigation className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              ))}
              </div>
            ) : (
              <div className='text-center text-white/60 py-8 text-sm'>
                Nessun prospect nelle vicinanze (raggio {NEARBY_RADIUS_M / 1000} km)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Esporta lista negozi (solo supervisor) ───────────────────────────
          Un cliente per volta: si seleziona un cliente e si scarica il CSV
          completo di tutti i suoi negozi (primari + secondari).
          Pensato per consuntivazione AMEX e per passare le lead a Salvo. */}
      {dashboardRole === 'supervisor' && (
        <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm mt-8'>
          <div className='flex items-center gap-2 mb-4'>
            <Download className='h-5 w-5 text-amber-300' />
            <h2 className='text-xl font-semibold text-white'>Esporta lista negozi</h2>
          </div>
          <p className='text-sm text-white/70 mb-4'>
            Seleziona un cliente per scaricare l&apos;elenco completo dei suoi negozi in formato CSV.
            Si esporta un cliente alla volta.
          </p>
          <div className='flex flex-col sm:flex-row gap-3 items-stretch sm:items-end'>
            <div className='flex-1'>
              <label className='text-xs text-white/70 font-medium mb-1 block'>
                Cliente
              </label>
              <Select value={exportClientId} onValueChange={setExportClientId}>
                <SelectTrigger className='bg-white/10 border-white/30 text-white'>
                  <SelectValue placeholder='Seleziona un cliente…' />
                </SelectTrigger>
                <SelectContent>
                  {allClients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type='button'
              onClick={handleExportStoresCSV}
              disabled={!exportClientId || exportLoading}
              className='bg-white text-[#224677] hover:bg-gray-100 disabled:opacity-60'
            >
              {exportLoading ? (
                'Esportazione...'
              ) : (
                <>
                  <Download className='mr-2 h-4 w-4' />
                  Scarica CSV
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
