'use client';
// components/VariableFillDialog.tsx
//
// Popover dialog for filling or defining a template variable.
//
// Two modes:
//   'fill'   — shown during a meeting when a director clicks a token
//              Collects the value, shows the question label
//   'define' — shown in the template builder when an author creates a variable
//              Collects the key, question label, and type

import { useState, useEffect, useRef } from 'react';
import type { VariableType } from '@/lib/template-variables';

const TYPE_OPTIONS: { value: VariableType; label: string; placeholder: string }[] = [
  { value: 'text',    label: 'Text',    placeholder: 'e.g. Any text value' },
  { value: 'name',    label: 'Name',    placeholder: 'e.g. Full name of person' },
  { value: 'number',  label: 'Number',  placeholder: 'e.g. Amount or count' },
  { value: 'date',    label: 'Date',    placeholder: 'e.g. DD/MM/YYYY' },
  { value: 'address', label: 'Address', placeholder: 'e.g. Full address' },
  { value: 'custom',  label: 'Custom',  placeholder: 'e.g. Custom value' },
];

// ── Fill mode ─────────────────────────────────────────────────────────────────

interface FillProps {
  variable: { key: string; label: string; type: VariableType };
  currentValue?: string;
  onSave:   (value: string) => void;
  onLater:  () => void;
  onClose:  () => void;
}

export function VariableFillDialog({ variable, currentValue, onSave, onLater, onClose }: FillProps) {
  const [value, setValue] = useState(currentValue ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const typeOpt  = TYPE_OPTIONS.find(t => t.value === variable.type) ?? TYPE_OPTIONS[0];

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && variable.type !== 'address') { e.preventDefault(); if (value.trim()) onSave(value.trim()); }
    if (e.key === 'Escape') onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(35,31,27,0.45)', 
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#FDFCFB', border: '1px solid #2A3A6A', borderRadius: 16,
        padding: '24px 28px', width: 420, fontFamily: "'Instrument Sans',system-ui,sans-serif",
        boxShadow: '0 8px 32px rgba(35,31,27,0.15)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: 'rgba(196,151,58,0.1)', color: '#7A5C18', border: '1px solid rgba(196,151,58,0.3)', borderRadius: 6, padding: '1px 8px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{variable.type}</span>
              <span style={{ fontSize: 10, color: '#96908A', fontFamily: 'monospace' }}>{variable.key}</span>
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#231F1B', margin: 0 }}>{variable.label}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#5C5750', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Input */}
        {variable.type === 'address' ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={typeOpt.placeholder}
            rows={3}
            style={{ width: '100%', background: '#FDFCFB', border: '1px solid #374151', borderRadius: 10, padding: '10px 14px', color: '#231F1B', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={typeOpt.placeholder}
            style={{ width: '100%', background: '#FDFCFB', border: '1px solid #374151', borderRadius: 10, padding: '10px 14px', color: '#231F1B', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onLater}
            style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #374151', borderRadius: 10, color: '#96908A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Fill Later
          </button>
          <button onClick={() => value.trim() && onSave(value.trim())}
            disabled={!value.trim()}
            style={{ flex: 2, padding: '9px', background: value.trim() ? '#8B1A1A' : '#EBE6DF', border: 'none', borderRadius: 8, color: value.trim() ? '#fff' : '#96908A', fontSize: 13, fontWeight: 600, cursor: value.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Define mode ───────────────────────────────────────────────────────────────

interface DefineProps {
  initialKey?:   string;
  initialLabel?: string;
  initialType?:  VariableType;
  onSave:  (key: string, label: string, type: VariableType) => void;
  onClose: () => void;
}

export function VariableDefineDialog({ initialKey = '', initialLabel = '', initialType = 'text', onSave, onClose }: DefineProps) {
  const [key,   setKey]   = useState(initialKey.replace(/[{}|]/g, '').trim());
  const [label, setLabel] = useState(initialLabel);
  const [type,  setType]  = useState<VariableType>(initialType);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => labelRef.current?.focus(), 50);
  }, []);

  // Auto-generate key from label
  function handleLabelChange(v: string) {
    setLabel(v);
    if (!initialKey) {
      setKey(v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40));
    }
  }

  const canSave = key.trim() && label.trim();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(35,31,27,0.45)', 
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#FDFCFB', border: '1px solid #2A3A6A', borderRadius: 16,
        padding: '24px 28px', width: 440, fontFamily: "'Instrument Sans',system-ui,sans-serif",
        boxShadow: '0 8px 32px rgba(35,31,27,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#231F1B', margin: 0 }}>Define Variable</h3>
            <p style={{ fontSize: 12, color: '#96908A', margin: '3px 0 0' }}>Set the question that will be asked when this variable needs to be filled</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#5C5750', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Question label */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#96908A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Question to ask *
            </label>
            <input
              ref={labelRef}
              value={label}
              onChange={e => handleLabelChange(e.target.value)}
              placeholder='e.g. "Name of the appointed auditor"'
              style={{ width: '100%', background: '#FDFCFB', border: '1px solid #374151', borderRadius: 10, padding: '10px 14px', color: '#231F1B', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <p style={{ fontSize: 11, color: '#5C5750', marginTop: 4 }}>This is what the user sees when they click the variable in the meeting</p>
          </div>

          {/* Type */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#96908A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Answer type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TYPE_OPTIONS.map(t => (
                <button key={t.value} onClick={() => setType(t.value)}
                  style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    background: type === t.value ? 'rgba(139,26,26,0.07)' : 'transparent',
                    border: `1px solid ${type === t.value ? '#8B1A1A' : '#E0DAD2'}`,
                    color: type === t.value ? '#8B1A1A' : '#96908A',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Key (readonly) */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#96908A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Variable key <span style={{ fontWeight: 400, textTransform: 'none' }}>(auto-generated)</span>
            </label>
            <div style={{ background: '#FDFCFB', border: '1px solid #E0DAD2', borderRadius: 10, padding: '9px 14px', color: '#5C5750', fontSize: 13, fontFamily: 'monospace' }}>
              {'{{'}{key || 'variable_key'}{'}}'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #374151', borderRadius: 10, color: '#96908A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => canSave && onSave(key.trim(), label.trim(), type)}
            disabled={!canSave}
            style={{ flex: 2, padding: '9px', background: canSave ? '#8B1A1A' : '#EBE6DF', border: 'none', borderRadius: 8, color: canSave ? '#fff' : '#96908A', fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
            Insert Variable
          </button>
        </div>
      </div>
    </div>
  );
}
