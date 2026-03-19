'use client';
// components/VariableTokenText.tsx
//
// Renders motion/resolution text with {{variable}} tokens as interactive inline pills.
//
// Unfilled token → amber pill showing the question label, clickable to fill
// Filled token   → green text showing the value, clickable to edit
//
// Usage:
//   <VariableTokenText
//     text={agendaItem.motionText}
//     variables={agendaItem.variables}
//     values={agendaItem.variableValues ?? {}}
//     onFill={(key, value) => saveValue(key, value)}
//     editable={isChairperson}
//   />

import { useState } from 'react';
import { parseVariables, humanise, type TemplateVariable } from '@/lib/template-variables';
import { VariableFillDialog } from './VariableFillDialog';
import type { VariableType } from '@/lib/template-variables';

interface Props {
  text:       string;
  variables?: { key: string; label: string; type: string; required: boolean }[] | null;
  values:     Record<string, string>;
  onFill?:    (key: string, value: string) => void;
  editable?:  boolean;
}

export default function VariableTokenText({ text, variables, values, onFill, editable = true }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (!text) return null;

  // Build variable lookup from defined variables + auto-parsed fallback
  const varMap = new Map<string, TemplateVariable>();
  (variables ?? []).forEach(v => varMap.set(v.key, v as TemplateVariable));

  // Parse text into segments — plain text and tokens
  const segments: { type: 'text' | 'token'; content: string; key?: string }[] = [];
  const TOKEN_RE = /\{\{([^}]+)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', content: text.slice(last, match.index) });
    }
    const parts = match[1].split('|');
    const key   = parts[0].trim();
    segments.push({ type: 'token', content: match[0], key });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', content: text.slice(last) });
  }

  const activeVar = activeKey
    ? (varMap.get(activeKey) ?? {
        key:      activeKey,
        label:    humanise(activeKey),
        type:     'text' as VariableType,
        required: true,
      })
    : null;

  return (
    <span style={{ lineHeight: 1.8 }}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>;
        }

        const key    = seg.key!;
        const filled = values[key] !== undefined && values[key] !== '';
        const varDef = varMap.get(key) ?? { key, label: humanise(key), type: 'text' as VariableType, required: true };

        return (
          <button
            key={i}
            onClick={() => editable && setActiveKey(key)}
            title={editable ? `Click to ${filled ? 'edit' : 'fill'}: ${varDef.label}` : varDef.label}
            style={{
              display:        'inline',
              padding:        '1px 8px',
              borderRadius:   6,
              fontSize:       'inherit',
              fontFamily:     'inherit',
              fontWeight:     filled ? 600 : 500,
              cursor:         editable ? 'pointer' : 'default',
              border:         `1px solid ${filled ? '#16a34a88' : '#F59E0B88'}`,
              background:     filled ? '#052e1688' : '#F59E0B22',
              color:          filled ? '#22c55e' : '#F59E0B',
              margin:         '0 2px',
              lineHeight:     1.5,
              transition:     'all 0.15s',
              verticalAlign:  'baseline',
            }}
          >
            {filled ? values[key] : varDef.label}
          </button>
        );
      })}

      {activeVar && (
        <VariableFillDialog
          variable={activeVar}
          currentValue={values[activeVar.key]}
          onSave={value => {
            onFill?.(activeVar.key, value);
            setActiveKey(null);
          }}
          onLater={() => setActiveKey(null)}
          onClose={() => setActiveKey(null)}
        />
      )}
    </span>
  );
}
