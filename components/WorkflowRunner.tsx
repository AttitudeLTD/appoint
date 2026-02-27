'use client';

import React, { useState, useRef } from 'react';
import { Camera, CheckCircle, ExternalLink, Loader, Plus, Trash2 } from 'lucide-react';
import { ClientWorkflow, WorkflowOption, WorkflowSection } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const DOM_LINK = 'https://amex.ssb.it/cubo/fgu-amex-onbrd/AF08/main.app?FUNCTIONID=Login&LINGUA=it';

interface TerminalEntry {
  id: string;
  type: string;
  photoUrl?: string;
  note?: string;
}

interface WorkflowData {
  pop_main: string;
  pop_sub: string;
  pop_sub_text: string;
  pop_photo_url: string;
  terminals: TerminalEntry[];
  aml: string;
  aml_photo_url: string;
  further_actions: string[];
}

const EMPTY_DATA: WorkflowData = {
  pop_main: '',
  pop_sub: '',
  pop_sub_text: '',
  pop_photo_url: '',
  terminals: [{ id: Date.now().toString(), type: '', photoUrl: '' }],
  aml: '',
  aml_photo_url: '',
  further_actions: [],
};

type WorkflowVariant = 'concluded' | 'already_client';

interface Props {
  storeId: number;
  clientId: number;
  userId: string;
  workflow: ClientWorkflow;
  variant: WorkflowVariant;
  existingOutcome?: WorkflowData | null;
}

export const WorkflowRunner: React.FC<Props> = ({
  storeId,
  clientId,
  userId,
  workflow,
  variant,
  existingOutcome,
}) => {
  const supabase = createClient();
  const [data, setData] = useState<WorkflowData>(existingOutcome ?? EMPTY_DATA);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existingOutcome);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sections =
    variant === 'already_client'
      ? (workflow.already_client_sub_workflow?.sections ?? [])
      : (workflow.concluded_sub_workflow?.sections ?? []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const set = (patch: Partial<WorkflowData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const toggleFurtherAction = (value: string) => {
    set({
      further_actions: data.further_actions.includes(value)
        ? data.further_actions.filter((v) => v !== value)
        : [...data.further_actions, value],
    });
  };

  const addTerminal = () =>
    set({ terminals: [...data.terminals, { id: Date.now().toString(), type: '', photoUrl: '', note: '' }] });

  const removeTerminal = (id: string) =>
    set({ terminals: data.terminals.filter((t) => t.id !== id) });

  const updateTerminal = (id: string, patch: Partial<TerminalEntry>) =>
    set({ terminals: data.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  // ── Photo upload ───────────────────────────────────────────────────────────

  const uploadPhoto = async (file: File, key: string): Promise<string | null> => {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return null;
    setUploadingKey(key);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `workflow/${storeId}/${key}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('generic-photos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('generic-photos').getPublicUrl(path);
      return urlData?.publicUrl ?? null;
    } catch (e) {
      console.error('Upload error', e);
      return null;
    } finally {
      setUploadingKey(null);
    }
  };

  const handlePhotoInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
    key: string,
    onUrl: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadPhoto(file, key);
    if (url) onUrl(url);
    e.target.value = '';
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('store_visit_outcomes').upsert(
        {
          store_id: storeId,
          client_id: clientId,
          user_id: userId,
          outcome_data: data,
        },
        { onConflict: 'store_id,user_id' }
      );
      if (!error) setSaved(true);
    } catch (e) {
      console.error('Save error', e);
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const PhotoButton = ({
    uploadKey,
    photoUrl,
    label,
    onUrl,
  }: {
    uploadKey: string;
    photoUrl: string;
    label: string;
    onUrl: (url: string) => void;
  }) => (
    <div className='mt-2'>
      <input
        type='file'
        accept='image/*'
        capture='environment'
        className='hidden'
        ref={(el) => { fileRefs.current[uploadKey] = el; }}
        onChange={(e) => handlePhotoInput(e, uploadKey, onUrl)}
      />
      <Button
        type='button'
        variant='outline'
        size='sm'
        className={cn(
          'w-full bg-white/10 border-white/30 text-white hover:bg-white/20 text-xs',
          photoUrl && 'bg-green-500/30 border-green-400/50 hover:bg-green-500/40'
        )}
        disabled={uploadingKey === uploadKey}
        onClick={() => fileRefs.current[uploadKey]?.click()}
      >
        {uploadingKey === uploadKey ? (
          <Loader className='h-3 w-3 mr-1 animate-spin' />
        ) : photoUrl ? (
          <CheckCircle className='h-3 w-3 mr-1 text-green-300' />
        ) : (
          <Camera className='h-3 w-3 mr-1' />
        )}
        {photoUrl ? 'Foto caricata' : label}
      </Button>
    </div>
  );

  const RadioRow = ({
    value,
    current,
    label,
    onChange,
  }: {
    value: string;
    current: string;
    label: string;
    onChange: (v: string) => void;
  }) => (
    <label className='flex items-center gap-2 cursor-pointer py-1'>
      <input
        type='radio'
        className='accent-white'
        checked={current === value}
        onChange={() => onChange(value)}
      />
      <span className='text-sm text-white'>{label}</span>
    </label>
  );

  // ── Section renderers ──────────────────────────────────────────────────────

  const renderPopPlacement = (section: WorkflowSection) => {
    const mainChoices = section.mainChoices ?? [];
    const currentMain = mainChoices.find((c) => c.value === data.pop_main);
    const currentSub = currentMain?.subOptions.find((o) => o.value === data.pop_sub);

    return (
      <div key={section.id}>
        <p className='text-sm font-semibold text-white/80 mb-2'>{section.title}</p>
        {mainChoices.map((mc) => (
          <div key={mc.value}>
            <RadioRow
              value={mc.value}
              current={data.pop_main}
              label={mc.label}
              onChange={(v) => set({ pop_main: v, pop_sub: '', pop_sub_text: '', pop_photo_url: '' })}
            />
            {data.pop_main === mc.value && (
              <div className='ml-6 mt-1 space-y-1 border-l border-white/20 pl-3'>
                {mc.subOptions.map((sub) => (
                  <div key={sub.value}>
                    <RadioRow
                      value={sub.value}
                      current={data.pop_sub}
                      label={sub.label}
                      onChange={(v) => set({ pop_sub: v, pop_sub_text: '', pop_photo_url: '' })}
                    />
                  </div>
                ))}
                {currentSub?.freeText && (
                  <input
                    type='text'
                    placeholder={currentSub.freeTextLabel ?? 'Note'}
                    value={data.pop_sub_text}
                    onChange={(e) => set({ pop_sub_text: e.target.value })}
                    className='w-full mt-1 px-2 py-1 rounded text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50'
                  />
                )}
                {currentSub?.requiresPhoto && (
                  <PhotoButton
                    uploadKey={`pop_${data.pop_sub}`}
                    photoUrl={data.pop_photo_url}
                    label={currentSub.photoLabel ?? 'Carica foto'}
                    onUrl={(url) => set({ pop_photo_url: url })}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderMultiTerminal = (section: WorkflowSection) => {
    const terminalOptions = section.terminals ?? [];
    return (
      <div key={section.id}>
        <p className='text-sm font-semibold text-white/80 mb-2'>{section.title}</p>
        {data.terminals.map((terminal, idx) => {
          const selectedOpt = terminalOptions.find((t) => t.value === terminal.type);
          return (
            <div key={terminal.id} className='mb-3 p-2 rounded bg-white/5 border border-white/10'>
              <div className='flex items-center justify-between mb-1'>
                <span className='text-xs text-white/60'>Terminale {idx + 1}</span>
                {data.terminals.length > 1 && (
                  <button
                    type='button'
                    onClick={() => removeTerminal(terminal.id)}
                    className='text-red-400 hover:text-red-300'
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                )}
              </div>
              <div className='space-y-1'>
                {terminalOptions.map((opt) => (
                  <RadioRow
                    key={opt.value}
                    value={opt.value}
                    current={terminal.type}
                    label={opt.label}
                    onChange={(v) => updateTerminal(terminal.id, { type: v, photoUrl: '' })}
                  />
                ))}
              </div>
              {selectedOpt?.requiresPhoto && (
                <PhotoButton
                  uploadKey={`terminal_${terminal.id}`}
                  photoUrl={terminal.photoUrl ?? ''}
                  label={selectedOpt.photoLabel ?? 'Carica foto'}
                  onUrl={(url) => updateTerminal(terminal.id, { photoUrl: url })}
                />
              )}
              {selectedOpt?.externalLink && (
                <a
                  href={DOM_LINK}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='mt-2 flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 underline'
                >
                  <ExternalLink className='h-3 w-3' /> Apri piattaforma DOM
                </a>
              )}
              {section.terminalNoteLabel && (
                <div className='mt-2'>
                  <label className='text-xs text-white/70 block mb-1'>{section.terminalNoteLabel}</label>
                  <input
                    type='text'
                    placeholder={section.terminalNoteLabel}
                    value={terminal.note ?? ''}
                    onChange={(e) => updateTerminal(terminal.id, { note: e.target.value })}
                    className='w-full px-2 py-1.5 rounded text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50'
                  />
                </div>
              )}
            </div>
          );
        })}
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-full bg-white/10 border-white/30 text-white hover:bg-white/20 text-xs'
          onClick={addTerminal}
        >
          <Plus className='h-3 w-3 mr-1' /> Aggiungi terminale
        </Button>
      </div>
    );
  };

  const renderChoice = (section: WorkflowSection) => {
    const choices = section.choices ?? [];
    const currentChoice = choices.find((c) => c.value === data.aml);
    return (
      <div key={section.id}>
        <p className='text-sm font-semibold text-white/80 mb-2'>{section.title}</p>
        {choices.map((c) => (
          <RadioRow
            key={c.value}
            value={c.value}
            current={data.aml}
            label={c.label}
            onChange={(v) => set({ aml: v, aml_photo_url: '' })}
          />
        ))}
        {currentChoice?.requiresPhoto && (
          <PhotoButton
            uploadKey='aml'
            photoUrl={data.aml_photo_url}
            label={currentChoice.photoLabel ?? 'Carica foto'}
            onUrl={(url) => set({ aml_photo_url: url })}
          />
        )}
      </div>
    );
  };

  const renderMultiSelect = (section: WorkflowSection) => {
    const options = section.options ?? [];
    return (
      <div key={section.id}>
        <p className='text-sm font-semibold text-white/80 mb-2'>{section.title}</p>
        {options.map((opt) => (
          <div key={opt.value}>
            <label className='flex items-center gap-2 cursor-pointer py-1'>
              <input
                type='checkbox'
                className='accent-white'
                checked={data.further_actions.includes(opt.value)}
                onChange={() => toggleFurtherAction(opt.value)}
              />
              <span className='text-sm text-white'>{opt.label}</span>
            </label>
            {opt.externalLink && data.further_actions.includes(opt.value) && (
              <a
                href={DOM_LINK}
                target='_blank'
                rel='noopener noreferrer'
                className='ml-6 flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 underline'
              >
                <ExternalLink className='h-3 w-3' /> Apri piattaforma DOM
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderSection = (section: WorkflowSection) => {
    switch (section.type) {
      case 'choice_with_sub': return renderPopPlacement(section);
      case 'multi_terminal':  return renderMultiTerminal(section);
      case 'choice':          return renderChoice(section);
      case 'multi_select':    return renderMultiSelect(section);
      default:                return null;
    }
  };

  // ── Main render ────────────────────────────────────────────────────────────

  const title =
    variant === 'already_client' ? 'Esito già cliente' : 'Esito contratto sottoscritto';

  return (
    <div className='mt-2 space-y-5 border-t border-white/20 pt-4'>
      <p className='text-sm font-bold text-white'>{title}</p>

      {sections.map((section) => (
        <div key={section.id} className='p-3 rounded-lg bg-white/5 border border-white/10 space-y-2'>
          {renderSection(section)}
        </div>
      ))}

      <Button
        type='button'
        onClick={handleSave}
        disabled={saving || saved}
        className={cn(
          'w-full',
          saved
            ? 'bg-green-600 hover:bg-green-600 text-white'
            : 'bg-white text-[#224677] hover:bg-gray-100'
        )}
      >
        {saving ? (
          <><Loader className='mr-2 h-4 w-4 animate-spin' /> Salvataggio...</>
        ) : saved ? (
          <><CheckCircle className='mr-2 h-4 w-4' /> Esito salvato</>
        ) : (
          'Salva esito'
        )}
      </Button>
    </div>
  );
};
