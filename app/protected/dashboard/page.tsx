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
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { fetchUserStores, getDashboardContext } from '@/utils/stores';
import { filterStoresForUser } from '@/utils/test-stores';
import { getMyLoc } from '@/utils/navigation';
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

export default function DashboardPage() {
  const [allActivities, setAllActivities] = useState<any[]>([]);
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
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [historyEsitoFilter, setHistoryEsitoFilter] = useState<string>('all');
  const [historyActivities, setHistoryActivities] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [coord, setCoord] = useState<[number, number] | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [agentFilterOpen, setAgentFilterOpen] = useState(false);

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
          if (ctx.role === 'agent') {
            const data = await fetchUserStores(user.id);
            setAllActivities(data);
          }
        }
      } catch (error) {
        console.error('Error loading activities:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const loadAllActivities = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const agentIds = selectedAgentIds.length > 0 ? selectedAgentIds : undefined;
    const data = await fetchUserStores(user.id, { agentIds });
    setAllActivities(data);
  }, [selectedAgentIds, supabase]);

  useEffect(() => {
    if (dashboardRole === 'am' || dashboardRole === 'supervisor') {
      loadAllActivities();
    }
  }, [dashboardRole, selectedAgentIds, loadAllActivities]);

  // Posizione utente per indicazioni
  useEffect(() => {
    getMyLoc((coords) => {
      if (coords && Array.isArray(coords)) setCoord(coords as [number, number]);
    });
  }, []);

  const loadHistory = useCallback(async () => {
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
      const data = await fetchUserStores(user.id, {
        dateFrom,
        dateTo,
        clientId: historyClientId || undefined,
        agentIds,
      });
      setHistoryActivities(data);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyDateFrom, historyDateTo, historyClientId, dashboardRole, selectedAgentIds, supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Prospect vicini: posizione utente + RPC get_stores_within_radius, solo status free
  useEffect(() => {
    setNearbyLoading(true);
    setNearbyError(null);
    getMyLoc((coords) => {
      if (!coords || !Array.isArray(coords)) {
        setNearbyLoading(false);
        setNearbyError('Posizione non disponibile');
        setNearbyProspects([]);
        return;
      }
      const [lat, lng] = coords;
      const params: { lat: number; lng: number; radius: number; p_limit?: number } = {
        lat,
        lng,
        radius: NEARBY_RADIUS_M,
        p_limit: 30,
      };

      (async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            setNearbyLoading(false);
            return;
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

          const visibleStores = filterStoresForUser(storesData ?? [], user.id);
          const stores = visibleStores.filter((s: any) => s.status === 'free');
          setNearbyProspects(stores.slice(0, NEARBY_LIMIT));
          setNearbyError(null);
        } catch (error) {
          console.error('Unexpected error in get_stores_within_radius:', error);
          setNearbyError('Errore nel caricamento');
          setNearbyProspects([]);
        } finally {
          setNearbyLoading(false);
        }
      })();
    });
  }, []);

  const historyClients = useMemo(() => {
    const m = new Map<string, string>();
    historyActivities.forEach((a) => {
      if (a.client_id != null && a.client_name) m.set(String(a.client_id), a.client_name);
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [historyActivities]);

  // Storico filtrato per esito (per lista e CSV)
  const filteredHistoryActivities = useMemo(() => {
    if (historyEsitoFilter === 'all') return historyActivities;
    if (historyEsitoFilter === 'photo') {
      return historyActivities.filter((a) => a.type === 'photo');
    }
    return historyActivities.filter(
      (a) => a.type === 'status' && a.status === historyEsitoFilter
    );
  }, [historyActivities, historyEsitoFilter]);

  const handleDownloadHistoryCSV = useCallback(() => {
    if (filteredHistoryActivities.length === 0) return;
    const withAgent = (dashboardRole === 'am' || dashboardRole === 'supervisor');
    const headers = [
      'Tipo',
      'Nome Attività',
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
      return [
        entry.type === 'photo' ? 'Foto' : 'Stato',
        entry.store_name || '',
        entry.address || '',
        entry.cap || '',
        entry.comune || '',
        entry.provincia || '',
        entry.type === 'photo' ? 'Foto scattata' : getStatusLabel(entry.status),
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

  // Aggrega per store: uno per store (prima occorrenza = più recente), poi conta per esito
  const kpis = useMemo(() => {
    const storeToStatus = new Map<number, string>();
    for (const e of allActivities) {
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

    const items: { id: string; label: string; value: string; icon: typeof Store; color: string; bgColor: string }[] = [
      {
        id: 'visite',
        label: 'Numero visite',
        value: String(total),
        icon: Store,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/20',
      },
    ];
    for (const s of statuses) {
      if (s.value === 'free') continue;
      const count = byStatus[s.value] ?? 0;
      const config = STATUS_KPI_CONFIG[s.value];
      if (config) {
        items.push({
          id: s.value,
          label: s.label,
          value: String(count),
          icon: config.icon,
          color: config.color,
          bgColor: config.bgColor,
        });
      }
    }
    return items;
  }, [allActivities]);


  const showAgentFilter = dashboardRole === 'am' || dashboardRole === 'supervisor';
  const agentFilterLabel =
    selectedAgentIds.length === 0
      ? 'Tutti gli agenti'
      : selectedAgentIds.length === 1
        ? agentsForFilter.find((a) => a.id === selectedAgentIds[0])
          ? `${agentsForFilter.find((a) => a.id === selectedAgentIds[0])!.name} ${agentsForFilter.find((a) => a.id === selectedAgentIds[0])!.surname}`.trim()
          : '1 agente'
        : `${selectedAgentIds.length} agenti`;

  return (
    <div className='container mx-auto px-4 py-8 max-w-7xl' style={{ backgroundColor: '#224677', minHeight: '100vh' }}>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-white'>Dashboard</h1>
      </div>

      {/* Filtro agenti (solo AM e Supervisor) */}
      {showAgentFilter && agentsForFilter.length > 0 && (
        <div className='mb-6 flex flex-wrap items-center gap-3'>
          <Popover open={agentFilterOpen} onOpenChange={setAgentFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                className='h-9 min-w-[200px] justify-between bg-white/10 border-white/20 text-white hover:bg-white/20'
              >
                <span className='truncate'>{agentFilterLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-64 p-2 bg-slate-900 border-white/20' align='start'>
              <div className='space-y-1 max-h-64 overflow-y-auto'>
                <label className='flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/10 text-sm text-white'>
                  <Checkbox
                    checked={selectedAgentIds.length === 0}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedAgentIds([]);
                    }}
                  />
                  Tutti gli agenti
                </label>
                {agentsForFilter.map((agent) => (
                  <label
                    key={agent.id}
                    className='flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/10 text-sm text-white'
                  >
                    <Checkbox
                      checked={selectedAgentIds.includes(agent.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAgentIds((prev) => [...prev, agent.id]);
                        } else {
                          setSelectedAgentIds((prev) => prev.filter((id) => id !== agent.id));
                        }
                      }}
                    />
                    {[agent.name, agent.surname].filter(Boolean).join(' ').trim() || agent.id}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

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

      {/* Due riquadri affiancati */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Riquadro Storico Attività */}
        <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm flex flex-col'>
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
          {/* Filtri: range date (popup calendario), cliente, esito */}
          <div className='flex flex-wrap items-end gap-3 mb-4 flex-shrink-0'>
            <div className='flex flex-col gap-1'>
              <label className='text-xs text-white/80'>Periodo</label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className='h-9 w-[220px] justify-start gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20'
                  >
                    <CalendarIcon className='h-4 w-4' />
                    {historyDateFrom && historyDateTo ? (
                      <>
                        {format(new Date(historyDateFrom + 'T12:00:00'), 'd MMM yyyy', { locale: it })} –{' '}
                        {format(new Date(historyDateTo + 'T12:00:00'), 'd MMM yyyy', { locale: it })}
                      </>
                    ) : (
                      <span className='text-white/80'>Seleziona periodo</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0 bg-slate-900 border-white/20' align='start'>
                  <DayPicker
                    mode='range'
                    locale={it}
                    selected={{
                      from: historyDateFrom ? new Date(historyDateFrom + 'T12:00:00') : undefined,
                      to: historyDateTo ? new Date(historyDateTo + 'T12:00:00') : undefined,
                    }}
                    onSelect={(range) => {
                      if (range?.from) {
                        setHistoryDateFrom(format(range.from, 'yyyy-MM-dd'));
                      }
                      if (range?.to) {
                        setHistoryDateTo(format(range.to, 'yyyy-MM-dd'));
                        setCalendarOpen(false);
                      }
                    }}
                    numberOfMonths={1}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className='flex flex-col gap-1'>
              <label className='text-xs text-white/80'>Cliente</label>
              <Select
                value={historyClientId ?? 'all'}
                onValueChange={(v) => setHistoryClientId(v === 'all' ? null : v)}
              >
                <SelectTrigger className='bg-white/10 border-white/20 text-white h-9 w-[180px]'>
                  <SelectValue placeholder='Tutti i clienti' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Tutti i clienti</SelectItem>
                  {historyClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-1'>
              <label className='text-xs text-white/80'>Esito</label>
              <Select value={historyEsitoFilter} onValueChange={setHistoryEsitoFilter}>
                <SelectTrigger className='bg-white/10 border-white/20 text-white h-9 w-[180px]'>
                  <SelectValue placeholder='Tutti gli esiti' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Tutti gli esiti</SelectItem>
                  {statuses.filter((s) => s.value !== 'free').map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                  <SelectItem value='photo'>Foto scattata</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto' style={{ maxHeight: '320px' }}>
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
                        ) : (
                          <Store className='h-4 w-4 text-white/80 mt-0.5 flex-shrink-0' />
                        )}
                        <div className='flex-1 min-w-0'>
                          <p className='font-medium text-sm truncate text-white'>
                            {activity.store_name}
                          </p>
                          <p className='text-xs text-white/80 truncate'>
                            {activity.address}
                            {activity.cap && `, ${activity.cap}`}
                            {activity.comune && ` ${activity.comune}`}
                          </p>
                          {activity.type === 'photo' ? (
                            <p className='text-xs text-blue-300 mt-1'>Foto scattata</p>
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
        <div className='bg-white/10 rounded-lg border border-white/20 p-6 shadow-sm flex flex-col'>
          <div className='flex items-center gap-2 mb-4 flex-shrink-0'>
            <MapPin className='h-5 w-5 text-green-300' />
            <h2 className='text-xl font-semibold text-white'>Prospect vicini a te</h2>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto' style={{ maxHeight: '320px' }}>
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
    </div>
  );
}
