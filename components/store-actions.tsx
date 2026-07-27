'use client';

import { useCallback, useState } from 'react';
import { Loader } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { StoreLog } from '@/types';
import { statuses } from '@/utils/utils';
import { createClient } from '@/utils/supabase/client';

/**
 * Orchestrazione della GESTIONE di un punto vendita: cambio stato (con il
 * limite delle 10 trattative e il dialog di conferma), storico dei log, lock
 * del pin all'esito, aggiornamento locale dell'esito.
 *
 * Perché esiste: era tutta dentro `components/map.tsx`, quindi il pannello
 * "Gestisci" si poteva aprire SOLO dalla mappa. La Dashboard, per aprire la
 * stessa scheda, doveva mandare l'utente sulla mappa con un deep-link
 * (`/protected?store=<id>&manage=1`) e sperare che il pin fosse tra quelli
 * caricati. Estraendo l'orchestrazione qui, mappa e Dashboard usano la STESSA
 * logica senza duplicarla e senza spostare il JSX di `StorePopup`.
 *
 * Il chiamante fornisce `onStatusApplied` se ha una propria copia degli store
 * da tenere allineata (la mappa la usa per l'array `stores`, da cui dipende il
 * colore del pin). Chi non ce l'ha — la Dashboard — semplicemente non lo passa.
 */

export type StoreActions = {
  /** Status corrente per store, aggiornato dalle azioni (fonte per la UI). */
  storeStatuses: Record<number, string>;
  setStoreStatuses: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  /** Esito manage_form più recente per store (null = nessun esito noto). */
  storeEsiti: Record<number, string | null>;
  setStoreEsiti: React.Dispatch<
    React.SetStateAction<Record<number, string | null>>
  >;
  statusLogs: Record<number, StoreLog[]>;
  loadingStatus: Record<number, boolean>;
  fetchStatusLogs: (storeId: number, offset?: number) => Promise<number | undefined>;
  handleStatusChangeAttempt: (
    storeId: number,
    newStatus: string,
    note?: string,
    checkInProgressLimit?: boolean
  ) => Promise<boolean>;
  applyEsitoLock: (storeId: number, prevStatus: string) => Promise<void>;
  handleOutcomeSaved: (storeId: number, esito: string | null) => void;
  /** Stato interno dei due AlertDialog — consumato da `<StoreActionDialogs />`. */
  dialogs: {
    dialogOpen: boolean;
    setDialogOpen: (v: boolean) => void;
    limitDialogOpen: boolean;
    setLimitDialogOpen: (v: boolean) => void;
    selectedStatus: string;
    selectedNote: string;
    loadingConfirm: boolean;
    confirmStatusChange: () => Promise<void>;
  };
};

export function useStoreActions({
  userId,
  onStatusApplied,
}: {
  userId: string;
  /** Notifica che lo status di uno store è stato applicato con successo. */
  onStatusApplied?: (storeId: number, newStatus: string) => void;
}): StoreActions {
  const supabase = createClient();

  const [storeStatuses, setStoreStatuses] = useState<Record<number, string>>({});
  const [storeEsiti, setStoreEsiti] = useState<Record<number, string | null>>({});
  const [statusLogs, setStatusLogs] = useState<Record<number, StoreLog[]>>({});
  const [loadingStatus, setLoadingStatus] = useState<Record<number, boolean>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [loadingConfirm, setLoadingConfirm] = useState(false);

  const fetchUserInfo = useCallback(
    async (uid: string) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('name, surname')
          .eq('id', uid)
          .single();
        if (error) {
          console.error('Error fetching user info:', error);
          return null;
        }
        return data;
      } catch (error) {
        console.error('Unexpected error in fetchUserInfo:', error);
        return null;
      }
    },
    [supabase]
  );

  const fetchStatusLogs = useCallback(
    async (storeId: number, offset: number = 0) => {
      try {
        const { data, error } = await supabase
          .from('store_status_logs')
          .select('id, prev, new, created_at, modifier')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .range(offset, offset + 2); // 3 log per pagina (0,1,2 → 3,4,5 …)

        if (error) {
          console.error('Error fetching status logs:', error);
          return;
        }

        if (data && data.length > 0) {
          const logsWithUserInfo = await Promise.all(
            data.map(async (log) => {
              const info = await fetchUserInfo(log.modifier);
              return {
                ...log,
                modifierName: info ? `${info.name} ${info.surname}` : 'Unknown User',
              };
            })
          );
          setStatusLogs((prev) => ({
            ...prev,
            [storeId]:
              offset === 0
                ? logsWithUserInfo
                : [...(prev[storeId] || []), ...logsWithUserInfo],
          }));
          return logsWithUserInfo.length;
        }

        if (offset === 0) {
          setStatusLogs((prev) => ({ ...prev, [storeId]: [] }));
        }
        return 0;
      } catch (error) {
        console.error('Error in fetchStatusLogs:', error);
      }
    },
    [supabase, fetchUserInfo]
  );

  const updateStoreStatus = useCallback(
    async (storeId: number, newStatus: string, note?: string) => {
      setLoadingStatus((prev) => ({ ...prev, [storeId]: true }));
      try {
        const { error: updateError } = await supabase
          .from('stores')
          .update({ status: newStatus })
          .eq('id', storeId);

        if (!updateError) {
          setStoreStatuses((prev) => ({ ...prev, [storeId]: newStatus }));
          await supabase.from('store_status_logs').insert([
            {
              store_id: storeId,
              prev: storeStatuses[storeId] || 'free',
              new: newStatus,
              modifier: userId,
              notes:
                ['failed', 'non_existent'].includes(newStatus) && note ? note : null,
            },
          ]);
          await fetchStatusLogs(storeId);
        } else {
          console.error('Error updating store status:', updateError);
        }
      } catch (error) {
        console.error('Unexpected error:', error);
      } finally {
        setLoadingStatus((prev) => ({ ...prev, [storeId]: false }));
      }
    },
    [supabase, userId, storeStatuses, fetchStatusLogs]
  );

  const handleStatusChangeAttempt = useCallback(
    async (
      storeId: number,
      newStatus: string,
      note?: string,
      checkInProgressLimit?: boolean
    ): Promise<boolean> => {
      // Limite delle 10 trattative aperte contemporaneamente.
      if (checkInProgressLimit && newStatus === 'in_progress') {
        try {
          const { data: potentialInProgressStores, error: storesError } =
            await supabase
              .from('store_status_logs')
              .select('store_id')
              .eq('modifier', userId)
              .eq('new', 'in_progress');

          if (storesError) throw storesError;

          if (potentialInProgressStores && potentialInProgressStores.length > 0) {
            const uniqueStoreIds = Array.from(
              new Set(potentialInProgressStores.map((s) => s.store_id))
            );

            const checkPromises = uniqueStoreIds.map(async (sid) => {
              const { data: latestLog, error: logError } = await supabase
                .from('store_status_logs')
                .select('*')
                .eq('store_id', sid)
                .order('created_at', { ascending: false })
                .limit(1);
              if (logError) throw logError;
              return !!(
                latestLog &&
                latestLog.length > 0 &&
                latestLog[0].new === 'in_progress' &&
                latestLog[0].modifier === userId
              );
            });

            const results = await Promise.all(checkPromises);
            if (results.filter(Boolean).length >= 10) {
              setLimitDialogOpen(true);
              return false;
            }
          }
        } catch (error) {
          console.error('Error checking in-progress store count:', error);
          setLimitDialogOpen(true);
          return false;
        }
      }

      setSelectedStoreId(storeId);
      setSelectedStatus(newStatus || '');
      setSelectedNote(note || '');
      setDialogOpen(true);
      return true;
    },
    [supabase, userId]
  );

  const confirmStatusChange = useCallback(async () => {
    setLoadingConfirm(true);
    if (selectedStoreId && selectedStatus) {
      await updateStoreStatus(selectedStoreId, selectedStatus, selectedNote);
      onStatusApplied?.(selectedStoreId, selectedStatus);
      await fetchStatusLogs(selectedStoreId);
    }
    setLoadingConfirm(false);
    setDialogOpen(false);
    setSelectedNote('');
  }, [
    selectedStoreId,
    selectedStatus,
    selectedNote,
    updateStoreStatus,
    onStatusApplied,
    fetchStatusLogs,
  ]);

  /**
   * "Prende in carico" il pin al salvataggio dell'esito (manage_form con
   * `lock_pin`, es. AiCall): status → `in_progress`, senza dialog di conferma e
   * senza contare nel limite delle 10 trattative.
   */
  const applyEsitoLock = useCallback(
    async (storeId: number, prevStatus: string) => {
      const { error } = await supabase
        .from('stores')
        .update({ status: 'in_progress' })
        .eq('id', storeId);
      if (error) {
        console.error('Errore lock esito:', error);
        return;
      }
      await supabase.from('store_status_logs').insert([
        {
          store_id: storeId,
          prev: prevStatus || 'free',
          new: 'in_progress',
          modifier: userId,
        },
      ]);
      setStoreStatuses((prev) => ({ ...prev, [storeId]: 'in_progress' }));
      onStatusApplied?.(storeId, 'in_progress');
    },
    [supabase, userId, onStatusApplied]
  );

  /**
   * Esito appena salvato: aggiorna in memoria SOLO il negozio interessato, così
   * il pin si ricolora subito senza rifare alcuna fetch. Serve al RI-esito, dove
   * `stores.status` non cambia e l'unica informazione nuova è l'esito.
   */
  const handleOutcomeSaved = useCallback(
    (storeId: number, esito: string | null) => {
      setStoreEsiti((prev) =>
        prev[storeId] === esito ? prev : { ...prev, [storeId]: esito }
      );
    },
    []
  );

  return {
    storeStatuses,
    setStoreStatuses,
    storeEsiti,
    setStoreEsiti,
    statusLogs,
    loadingStatus,
    fetchStatusLogs,
    handleStatusChangeAttempt,
    applyEsitoLock,
    handleOutcomeSaved,
    dialogs: {
      dialogOpen,
      setDialogOpen,
      limitDialogOpen,
      setLimitDialogOpen,
      selectedStatus,
      selectedNote,
      loadingConfirm,
      confirmStatusChange,
    },
  };
}

/**
 * I due AlertDialog dell'orchestrazione (conferma cambio stato + limite
 * trattative). Vivono qui e non nel chiamante così mappa e Dashboard non ne
 * duplicano il markup.
 */
export function StoreActionDialogs({ actions }: { actions: StoreActions }) {
  const {
    dialogOpen,
    setDialogOpen,
    limitDialogOpen,
    setLimitDialogOpen,
    selectedStatus,
    selectedNote,
    loadingConfirm,
    confirmStatusChange,
  } = actions.dialogs;

  return (
    <>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className='z-1000'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Sei sicuro di voler cambiare lo stato?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questo punto vendita verrà contrassegnato come{' '}
              <strong>
                {statuses.find((status) => status.value === selectedStatus)
                  ?.label || selectedStatus}
              </strong>
              {selectedStatus === 'failed' && selectedNote && (
                <>
                  {' '}
                  con motivo <strong>{selectedNote}</strong>
                </>
              )}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogOpen(false)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange} disabled={loadingConfirm}>
              {loadingConfirm ? <Loader className='animate-spin' /> : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <AlertDialogContent className='z-1000'>
          <AlertDialogHeader>
            <AlertDialogTitle>Limite di trattative raggiunto</AlertDialogTitle>
            <AlertDialogDescription>
              Hai già 10 trattative in corso. Concludi o chiudi almeno una
              trattativa prima di iniziarne un&apos;altra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLimitDialogOpen(false)}>
              Ho capito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
