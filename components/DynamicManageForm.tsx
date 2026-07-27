'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle,
  ExternalLink,
  Loader,
  MailPlus,
  Navigation,
  Phone,
  Plus,
  Settings,
  Star,
  Ban,
  X as XIcon,
} from 'lucide-react';

import { Button } from './ui/button';
import { SelectComponent } from './select';
import {
  DynamicAction,
  DynamicField,
  DynamicFieldCondition,
  // Rinominato l'import del tipo per evitare la collisione con il
  // nome del componente esportato in questo stesso file.
  DynamicManageForm as DynamicManageFormDef,
  DynamicSection,
  Store,
} from '@/types';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { statuses as ALL_STATUSES } from '@/utils/utils';

type FormValues = Record<string, unknown>;

interface Props {
  store: Store;
  userId: string;
  form: DynamicManageFormDef;
  existingOutcome?: FormValues | null;
  /**
   * Callback fornito da StorePopup per cambiare lo status del pin
   * (apre il dialog di conferma; ritorna `true` se accettato).
   * Riusiamo lo stesso flow del legacy.
   */
  handleStatusChangeAttempt: (
    storeId: number,
    newStatus: string,
    note?: string,
    checkInProgressLimit?: boolean
  ) => Promise<boolean>;
  /**
   * Mappa storeId → status corrente (seedata dalla RPC get_stores_within_radius
   * in map.tsx e aggiornata dagli update di stato). Serve al field
   * `status_select` per riflettere lo status "in tempo reale" dopo un cambio,
   * senza dover ricaricare lo store.
   */
  storeStatuses?: Record<number, string>;
  /**
   * "Prende in carico" il pin al salvataggio esito quando il workflow ha
   * `submit.lock_pin` (es. PROGETTO AICALL): porta lo status a `in_progress`
   * senza dialog di conferma. Fornito da StorePopup → map.
   */
  onEsitoLock?: (storeId: number, prevStatus: string) => Promise<void>;
  /**
   * Notifica al chiamante l'esito appena salvato, così può aggiornare lo stato
   * LOCALE del solo negozio interessato (es. il colore del pin sulla mappa)
   * senza rifare alcuna fetch. Chiamata dopo un salvataggio andato a buon fine.
   */
  onOutcomeSaved?: (storeId: number, esito: string | null) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function evalCondition(
  cond: DynamicFieldCondition | undefined,
  values: FormValues
): boolean {
  if (!cond) return true;
  const v = values[cond.field];
  if (cond.equals !== undefined) return v === cond.equals;
  if (cond.notEquals !== undefined) return v !== cond.notEquals;
  if (cond.in !== undefined)
    return cond.in.some((item) => item === v);
  return true;
}

const iconMap: Record<string, React.ReactNode> = {
  navigation: <Navigation className='mr-2 h-4 w-4' />,
  phone: <Phone className='mr-2 h-4 w-4' />,
  mail: <MailPlus className='mr-2 h-4 w-4' />,
  external: <ExternalLink className='mr-2 h-4 w-4' />,
  check: <Check className='mr-2 h-4 w-4' />,
  x: <XIcon className='mr-2 h-4 w-4' />,
  ban: <Ban className='mr-2 h-4 w-4' />,
  star: <Star className='mr-2 h-4 w-4' />,
  plus: <Plus className='mr-2 h-4 w-4' />,
  settings: <Settings className='mr-2 h-4 w-4' />,
};

function renderIcon(icon?: string) {
  if (!icon) return null;
  return iconMap[icon] ?? null;
}

// ── Componente ──────────────────────────────────────────────────────────────

export const DynamicManageForm: React.FC<Props> = ({
  store,
  userId,
  form,
  existingOutcome,
  handleStatusChangeAttempt,
  storeStatuses,
  onEsitoLock,
  onOutcomeSaved,
}) => {
  const supabase = createClient();
  const [values, setValues] = useState<FormValues>(existingOutcome ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existingOutcome);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sync se l'outcome esistente arriva in ritardo (fetch async lato parent)
  useEffect(() => {
    if (existingOutcome) {
      setValues(existingOutcome);
      setSaved(true);
    }
  }, [existingOutcome]);

  const setField = useCallback((id: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    setSaved(false);
  }, []);

  // ── Primary actions ───────────────────────────────────────────────────────

  const handleAction = useCallback(
    async (a: DynamicAction) => {
      switch (a.type) {
        case 'directions': {
          const coords = store.location?.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
          if (!coords) return;
          const [, lng, lat] = coords;
          window.open(
            `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
            '_blank'
          );
          return;
        }
        case 'phone': {
          if (store.phone) window.open(`tel:${store.phone}`, '_self');
          return;
        }
        case 'email': {
          if (store.email)
            window.location.href = `mailto:${store.email}?subject=Proposta commerciale`;
          return;
        }
        case 'external_link': {
          if (a.url) window.open(a.url, '_blank');
          return;
        }
        case 'status_change': {
          if (a.status) await handleStatusChangeAttempt(store.id, a.status);
          return;
        }
      }
    },
    [store, handleStatusChangeAttempt]
  );

  // Etichetta del bottone di una primary action. Per il tipo `phone` accoda il
  // numero effettivamente presente sul punto vendita → "Chiama 0635072117".
  // L'etichetta base continua ad arrivare dal JSON del workflow
  // (`client_workflows.workflow.manage_form.primary_actions[].label`), quindi
  // vale per ogni cliente presente e futuro senza migrare i dati.
  // Il numero è reso come sta a DB (`stores.phone`), senza normalizzazioni.
  // Senza numero l'etichetta resta quella del JSON e il comportamento del
  // bottone non cambia (il click era già inerte: vedi case 'phone' sopra).
  const actionLabel = useCallback(
    (a: DynamicAction) =>
      a.type === 'phone' && store.phone ? `${a.label} ${store.phone}` : a.label,
    [store.phone]
  );

  // ── Photo upload ──────────────────────────────────────────────────────────

  const uploadPhoto = useCallback(
    async (field: DynamicField, file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Per favore seleziona un file immagine');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('File troppo grande. Massimo 5MB.');
        return;
      }
      const bucket = field.bucket || 'generic-photos';
      setUploadingId(field.id);
      try {
        const ts = Date.now();
        const rnd = Math.random().toString(36).substring(2, 12);
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `${store.id}_${userId}_${ts}_${rnd}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error('Impossibile ottenere URL pubblico');

        // Registra la foto nelle tabelle storiche (compat con i bucket noti).
        if (bucket === 'store-photos') {
          await supabase.from('store_photos').insert({
            store_id: store.id,
            user_id: userId,
            photo_url: publicUrl,
            created_at: new Date().toISOString(),
          });
        } else if (bucket === 'generic-photos') {
          await supabase.from('generic_photos').insert({
            store_id: store.id,
            user_id: userId,
            photo_url: publicUrl,
            created_at: new Date().toISOString(),
          });
        }

        setField(field.id, publicUrl);
      } catch (err: any) {
        console.error('Upload photo error:', err);
        alert(`Errore upload: ${err?.message ?? 'sconosciuto'}`);
      } finally {
        setUploadingId(null);
      }
    },
    [store.id, userId, supabase, setField]
  );

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    // Validazione "required" sui field visibili
    const missing: string[] = [];
    for (const section of form.sections) {
      if (!evalCondition(section.show_if, values)) continue;
      for (const field of section.fields) {
        if (!evalCondition(field.show_if, values)) continue;
        if (!field.required) continue;
        const v = values[field.id];
        const empty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0);
        if (empty) missing.push(field.label ?? field.id);
      }
    }
    if (missing.length > 0) {
      alert(`Campi obbligatori mancanti:\n• ${missing.join('\n• ')}`);
      return;
    }

    setSaving(true);
    try {
      const saveToOutcomes = form.submit?.save_to_outcomes ?? true;
      if (saveToOutcomes && store.client_id != null) {
        const { error: upsertErr } = await supabase
          .from('store_visit_outcomes')
          .upsert(
            {
              store_id: store.id,
              user_id: userId,
              client_id: store.client_id,
              outcome_data: values,
            },
            { onConflict: 'store_id,user_id' }
          );
        if (upsertErr) throw upsertErr;
      }

      const newStatus = form.submit?.sets_status;
      if (newStatus) {
        await handleStatusChangeAttempt(store.id, newStatus);
      }

      // Lock del pin al salvataggio esito (manage_form con `lock_pin`, es. AiCall):
      // dal PRIMO esito lo store passa a `in_progress` (esitato + bloccato per gli
      // altri agenti), senza dialog. I ri-esiti dell'autore non ri-cambiano stato.
      if (form.submit?.lock_pin && onEsitoLock) {
        const prev = (storeStatuses?.[store.id] ?? store.status ?? 'free') as string;
        if (prev === 'free') {
          await onEsitoLock(store.id, prev);
        }
      }

      // Comunica al chiamante l'esito salvato: serve alla mappa per ricolorare
      // SUBITO il solo pin interessato (nessuna fetch). Va fatto anche quando
      // `lock_pin` non scatta o quando lo status non cambia — il caso tipico è
      // il RI-esito di un pin già preso in carico, dove `stores.status` resta
      // `in_progress` e l'unica cosa che cambia è appunto l'esito.
      if (onOutcomeSaved) {
        const esito = values?.esito;
        onOutcomeSaved(store.id, typeof esito === 'string' ? esito : null);
      }

      setSaved(true);
    } catch (err: any) {
      console.error('Save dynamic form error:', err);
      alert(`Errore salvataggio: ${err?.message ?? 'sconosciuto'}`);
    } finally {
      setSaving(false);
    }
  }, [
    form,
    values,
    store.id,
    store.client_id,
    store.status,
    userId,
    supabase,
    handleStatusChangeAttempt,
    onEsitoLock,
    onOutcomeSaved,
    storeStatuses,
  ]);

  // ── Field renderer ────────────────────────────────────────────────────────

  const renderField = (field: DynamicField) => {
    if (!evalCondition(field.show_if, values)) return null;

    const value = values[field.id];

    switch (field.type) {
      case 'info': {
        const variantCls =
          field.variant === 'warning'
            ? 'bg-amber-400/20 border-amber-400/50 text-amber-100'
            : field.variant === 'success'
              ? 'bg-emerald-400/20 border-emerald-400/50 text-emerald-100'
              : 'bg-white/10 border-white/30 text-white/90';
        return (
          <div
            key={field.id}
            className={cn(
              'px-3 py-2 rounded-md border text-sm',
              variantCls
            )}
          >
            {field.text ?? field.label}
          </div>
        );
      }

      case 'text':
        return (
          <FieldShell key={field.id} field={field}>
            <input
              type='text'
              value={(value as string) ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => setField(field.id, e.target.value)}
              className='w-full px-3 py-2 rounded-md text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50'
            />
          </FieldShell>
        );

      case 'textarea':
        return (
          <FieldShell key={field.id} field={field}>
            <textarea
              value={(value as string) ?? ''}
              placeholder={field.placeholder}
              rows={3}
              onChange={(e) => setField(field.id, e.target.value)}
              className='w-full px-3 py-2 rounded-md text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50 resize-y'
            />
          </FieldShell>
        );

      case 'number':
        return (
          <FieldShell key={field.id} field={field}>
            <input
              type='number'
              value={value === undefined || value === null ? '' : String(value)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={(e) => {
                const v = e.target.value;
                setField(field.id, v === '' ? '' : Number(v));
              }}
              className='w-full px-3 py-2 rounded-md text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50'
            />
          </FieldShell>
        );

      case 'date':
        return (
          <FieldShell key={field.id} field={field}>
            <input
              type='date'
              value={(value as string) ?? ''}
              onChange={(e) => setField(field.id, e.target.value)}
              className='w-full px-3 py-2 rounded-md text-sm bg-white/10 border border-white/30 text-white'
            />
          </FieldShell>
        );

      case 'select':
        return (
          <FieldShell key={field.id} field={field}>
            <SelectComponent
              placeholder={field.placeholder ?? field.label}
              value={(value as string) ?? ''}
              onChange={(v) => setField(field.id, v ?? '')}
              options={(field.options ?? []).map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </FieldShell>
        );

      case 'radio': {
        const current = (value as string) ?? '';
        return (
          <FieldShell key={field.id} field={field}>
            <div className='flex flex-wrap gap-2'>
              {(field.options ?? []).map((o) => {
                const selected = current === o.value;
                return (
                  <button
                    key={o.value}
                    type='button'
                    onClick={() => setField(field.id, o.value)}
                    className={cn(
                      'rounded-full text-xs px-3 py-1 border transition-colors',
                      selected
                        ? 'bg-white text-[#224677] border-white'
                        : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </FieldShell>
        );
      }

      case 'multi_select': {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        return (
          <FieldShell key={field.id} field={field}>
            <div className='flex flex-wrap gap-2'>
              {(field.options ?? []).map((o) => {
                const selected = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type='button'
                    onClick={() => {
                      const next = selected
                        ? arr.filter((x) => x !== o.value)
                        : [...arr, o.value];
                      setField(field.id, next);
                    }}
                    className={cn(
                      'rounded-full text-xs px-3 py-1 border transition-colors',
                      selected
                        ? 'bg-white text-[#224677] border-white'
                        : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </FieldShell>
        );
      }

      case 'checkbox': {
        const checked = !!value;
        return (
          <label
            key={field.id}
            className='flex items-center gap-2 cursor-pointer select-none'
          >
            <input
              type='checkbox'
              checked={checked}
              onChange={(e) => setField(field.id, e.target.checked)}
              className='h-4 w-4 rounded border-white/30 bg-white/10 accent-white'
            />
            <span className='text-sm text-white'>{field.label}</span>
            {field.help && (
              <span className='text-xs text-white/60'>({field.help})</span>
            )}
          </label>
        );
      }

      case 'photo': {
        const uploaded = !!value;
        const uploading = uploadingId === field.id;
        return (
          <div key={field.id} className='space-y-1'>
            {field.label && (
              <p className='text-xs text-white/70 font-medium'>
                {field.label}
                {field.required && <span className='text-red-300 ml-1'>*</span>}
              </p>
            )}
            <input
              ref={(el) => {
                fileInputRefs.current[field.id] = el;
              }}
              type='file'
              accept='image/*'
              capture={field.capture ?? 'environment'}
              className='hidden'
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(field, f);
                e.target.value = '';
              }}
            />
            <Button
              type='button'
              variant='outline'
              disabled={uploading}
              className={cn(
                'w-full transition-all duration-300 bg-white text-[#224677] border-white hover:bg-gray-100',
                uploaded && !uploading &&
                  'bg-green-500 text-white border-green-600 hover:bg-green-500'
              )}
              onClick={() => fileInputRefs.current[field.id]?.click()}
            >
              {uploading ? (
                <>
                  <Loader className='mr-2 h-4 w-4 animate-spin' />
                  Caricamento...
                </>
              ) : uploaded ? (
                <>
                  <CheckCircle className='mr-2 h-4 w-4' />
                  Foto caricata
                </>
              ) : (
                <>
                  <Camera className='mr-2 h-4 w-4' />
                  {field.placeholder ?? 'Carica foto'}
                </>
              )}
            </Button>
            {field.help && (
              <p className='text-xs text-white/60'>{field.help}</p>
            )}
          </div>
        );
      }

      case 'external_link':
        return (
          <a
            key={field.id}
            href={field.url}
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center justify-center gap-2 w-full py-2 px-4 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors'
          >
            <ExternalLink className='h-4 w-4' />
            {field.buttonLabel ?? field.label ?? 'Apri link'}
          </a>
        );

      case 'status_select': {
        // Opzioni: se il JSON ne specifica un sottoinsieme tramite `options`
        // (mappando value → label), uso quelle. Altrimenti uso tutte le label
        // standard di `statuses` da utils/utils.ts.
        const allowedValues =
          field.options && field.options.length > 0
            ? field.options.map((o) => o.value)
            : ALL_STATUSES.map((s) => s.value);
        const labelOverrides = new Map<string, string>(
          (field.options ?? []).map((o) => [o.value, o.label])
        );
        const opts = ALL_STATUSES.filter((s) =>
          allowedValues.includes(s.value)
        ).map((s) => ({
          value: s.value,
          label: labelOverrides.get(s.value) ?? s.label,
        }));
        const currentStatus =
          (storeStatuses?.[store.id] as string | undefined) ?? store.status;
        return (
          <FieldShell key={field.id} field={field}>
            <SelectComponent
              placeholder={field.placeholder ?? 'Seleziona esito'}
              value={currentStatus}
              onChange={(v) => {
                if (v && v !== currentStatus) {
                  // Stessa funzione del legacy: apre il dialog di conferma e,
                  // al confermare, aggiorna lo status del pin (icona inclusa).
                  handleStatusChangeAttempt(store.id, v);
                }
              }}
              options={opts}
            />
          </FieldShell>
        );
      }

      default:
        return null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const visibleSections = useMemo(
    () => form.sections.filter((s) => evalCondition(s.show_if, values)),
    [form.sections, values]
  );

  return (
    <div className='flex flex-col gap-4'>
      {/* Primary actions */}
      {form.primary_actions && form.primary_actions.length > 0 && (
        <div className='flex flex-col gap-2'>
          {form.primary_actions
            .filter((a) => evalCondition(a.show_if, values))
            .map((a) => (
              <Button
                key={a.id}
                type='button'
                variant='secondary'
                className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
                onClick={() => handleAction(a)}
              >
                {renderIcon(a.icon)}
                {actionLabel(a)}
              </Button>
            ))}
        </div>
      )}

      {/* Sections */}
      {visibleSections.map((section: DynamicSection) => (
        <div key={section.id} className='flex flex-col gap-3'>
          {section.title && (
            <div className='border-b border-white/20 pb-2'>
              <p className='text-base font-semibold text-white'>{section.title}</p>
              {section.description && (
                <p className='text-xs text-white/70 mt-1'>
                  {section.description}
                </p>
              )}
            </div>
          )}
          <div className='flex flex-col gap-3'>
            {section.fields.map((f) => renderField(f))}
          </div>
        </div>
      ))}

      {/* Submit */}
      <Button
        type='button'
        onClick={handleSubmit}
        disabled={saving}
        className={cn(
          'w-full mt-2',
          saved
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-white text-[#224677] hover:bg-gray-100'
        )}
      >
        {saving ? (
          <>
            <Loader className='mr-2 h-4 w-4 animate-spin' />
            Salvataggio...
          </>
        ) : saved ? (
          <>
            <CheckCircle className='mr-2 h-4 w-4' />
            Salvato
          </>
        ) : (
          form.submit?.label ?? 'Salva'
        )}
      </Button>
    </div>
  );
};

// ── FieldShell: label + slot input + required marker ────────────────────────

const FieldShell: React.FC<{
  field: DynamicField;
  children: React.ReactNode;
}> = ({ field, children }) => {
  return (
    <div className='space-y-1'>
      {field.label && (
        <label className='text-xs text-white/70 font-medium'>
          {field.label}
          {field.required && <span className='text-red-300 ml-1'>*</span>}
        </label>
      )}
      {children}
      {field.help && (
        <p className='text-xs text-white/60'>{field.help}</p>
      )}
    </div>
  );
};

export default DynamicManageForm;
