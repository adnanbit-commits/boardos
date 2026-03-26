'use client';
// components/DocNotesPanel.tsx
//
// Chairperson compliance document noting panel.
// Handles DIR-8, MBP-1 (every FY) and DIR-2 (first meeting / new directors).
//
// For each director × form:
//   • Shows upload status from vault compliance register
//   • If uploaded → opens doc link → unlocks "Note Receipt"
//   • If not uploaded → warns + offers "Confirm physically present at deemed venue"
//   • Always available: "Note with exception" for edge cases

import { useState, useEffect, useCallback } from 'react';
import { vault as vaultApi, resolveDownloadUrl, type DocNotesResult } from '@/lib/api';

interface Props {
  companyId:     string;
  meetingId:     string;
  token:         string;
  isChairperson: boolean;
  deemedVenue?:  string | null;
  onAllNoted?:   () => void;
}

const FORM_META: Record<string, { label: string; description: string; law: string }> = {
  DIR_2: { label: 'DIR-2', description: 'Consent to act as Director',         law: 'Sec. 152(5)' },
  DIR_8: { label: 'DIR-8', description: 'Non-disqualification declaration',   law: 'Sec. 164(2)' },
  MBP_1: { label: 'MBP-1', description: 'Disclosure of interest',             law: 'Sec. 184(1)' },
};

type NoteStatus = 'NOTED' | 'NOTED_WITH_EXCEPTION' | 'PHYSICALLY_PRESENT';

export default function DocNotesPanel({
  companyId, meetingId, token, isChairperson, deemedVenue, onAllNoted,
}: Props) {
  const [data,       setData]       = useState<DocNotesResult | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [noting,     setNoting]     = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{
    userId: string; formType: string;
    mode: 'options' | 'exception' | 'physical';
  } | null>(null);
  const [exceptionText, setExceptionText] = useState('');

  // Tracks which docs the chairperson has opened this session
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vaultApi.docNotes(companyId, meetingId, token);
      setData(result);
      if (result.allNoted) onAllNoted?.();
    } catch { /* chairperson not yet elected — silent */ }
    finally { setLoading(false); }
  }, [companyId, meetingId, token]);

  useEffect(() => { load(); }, [load]);

  function markReviewed(userId: string, formType: string) {
    setReviewed(prev => new Set(prev).add(`${userId}:${formType}`));
  }

  async function submitNote(
    directorUserId: string,
    formType: string,
    status: NoteStatus,
    exception?: string,
  ) {
    if (!isChairperson) return;
    const key = `${directorUserId}:${formType}`;
    setNoting(key);
    try {
      await vaultApi.noteDoc(companyId, meetingId, {
        directorUserId, formType, status,
        exception: exception?.trim() || undefined,
      }, token);
      setActiveCell(null);
      setExceptionText('');
      await load();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to note document.');
    } finally { setNoting(null); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#96908A', fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: '2px solid #E0DAD2', borderTop: '2px solid #8B1A1A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading compliance status…
      </div>
    );
  }

  if (!data) return null;

  const progress = data.totalRequired > 0
    ? Math.round((data.totalNoted / data.totalRequired) * 100)
    : 0;

  // Count how many forms are missing from vault
  const missingDocs = data.rows.flatMap(r =>
    r.forms.filter(f => !f.complianceDoc?.submittedAt).map(f => `${r.name} — ${FORM_META[f.formType]?.label ?? f.formType}`)
  );

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Progress banner */}
      <div style={{
        background: data.allNoted ? '#F0FDF4' : '#FDFCFB',
        border: `1px solid ${data.allNoted ? '#86EFAC' : '#E0DAD2'}`,
        borderRadius: 12, padding: '14px 18px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: data.allNoted ? '#166534' : '#231F1B', margin: '0 0 2px' }}>
            {data.allNoted ? '✓ All compliance documents noted' : `${data.totalNoted} of ${data.totalRequired} documents noted`}
          </p>
          <p style={{ fontSize: 11, color: '#96908A', margin: 0 }}>
            {data.allNoted
              ? 'All declarations are on record.'
              : 'Chairperson must note each form before proceedings can begin.'}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: data.allNoted ? '#166534' : '#231F1B' }}>{progress}%</div>
          <div style={{ width: 80, height: 4, background: '#EBE6DF', borderRadius: 2, marginTop: 4 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: data.allNoted ? '#166534' : '#8B1A1A', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Missing docs warning */}
      {missingDocs.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: '0 0 6px' }}>
            ⚠ {missingDocs.length} document{missingDocs.length > 1 ? 's' : ''} not uploaded to vault
          </p>
          <p style={{ fontSize: 11, color: '#D97706', margin: '0 0 8px', lineHeight: 1.5 }}>
            The following forms have not been uploaded to the compliance register.
            If the chairperson has received them physically at the deemed venue
            {deemedVenue ? ` (${deemedVenue})` : ''}, they can be noted as physically present.
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
            {missingDocs.map(d => (
              <li key={d} style={{ fontSize: 11, color: '#92400E', marginBottom: 2 }}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* No chairperson warning */}
      {!data.chairpersonId && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#92400E' }}>
          ⚑ No Chairperson elected yet. Elect a Chairperson before noting compliance documents.
        </div>
      )}

      {/* Director × Form matrix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.rows.map(row => (
          <div key={row.userId} style={{ background: '#FDFCFB', border: '1px solid #E0DAD2', borderRadius: 12, overflow: 'hidden' }}>

            {/* Row header */}
            <div style={{ background: '#EBE6DF', borderBottom: '1px solid #E0DAD2', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#231F1B' }}>{row.name}</span>
                <span style={{ fontSize: 11, color: '#96908A', marginLeft: 8 }}>{row.email}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#5C5750', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.role}</span>
            </div>

            {/* Form cells */}
            <div style={{ display: 'grid', gridTemplateColumns: row.forms.length === 1 ? '1fr' : row.forms.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 0 }}>
              {row.forms.map((cell, ci) => {
                const cellKey     = `${row.userId}:${cell.formType}`;
                const noted       = !!cell.note;
                const hasDoc      = !!cell.complianceDoc?.submittedAt;
                const rawUrl      = cell.complianceDoc?.downloadUrl ?? null;
                const downloadUrl = rawUrl ? resolveDownloadUrl(rawUrl, token) : null;
                const hasReviewed = reviewed.has(cellKey);
                const isActive    = activeCell?.userId === row.userId && activeCell?.formType === cell.formType;
                const isNoting    = noting === cellKey;
                const meta        = FORM_META[cell.formType] ?? { label: cell.formType, description: '', law: '' };

                // Chairperson can note if:
                // - has opened the uploaded doc, OR
                // - no doc uploaded (will use physical presence option)
                const canNote = isChairperson && !!data.chairpersonId;

                // Status colour for noted state
                const noteStatusColor = cell.note?.status === 'NOTED'
                  ? '#166534'
                  : cell.note?.status === 'PHYSICALLY_PRESENT'
                  ? '#1D4ED8'
                  : '#92400E';

                const noteStatusLabel = cell.note?.status === 'NOTED'
                  ? '✓ Noted'
                  : cell.note?.status === 'PHYSICALLY_PRESENT'
                  ? '✓ Physically present'
                  : '⚠ Noted with exception';

                return (
                  <div key={cell.formType} style={{ borderRight: ci < row.forms.length - 1 ? '1px solid #E0DAD2' : 'none' }}>
                    <div style={{ padding: '14px 16px' }}>

                      {/* Form label */}
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#96908A' }}>{meta.label}</span>
                        <span style={{ fontSize: 10, color: '#5C5750', marginLeft: 6 }}>{meta.law}</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#5C5750', margin: '0 0 10px', lineHeight: 1.4 }}>{meta.description}</p>

                      {/* Document status */}
                      <div style={{ marginBottom: 10 }}>
                        {hasDoc && downloadUrl ? (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markReviewed(row.userId, cell.formType)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 600,
                              color:      hasReviewed ? '#166534' : '#1D4ED8',
                              background: hasReviewed ? '#F0FDF4' : '#EFF6FF',
                              border:     `1px solid ${hasReviewed ? '#86EFAC' : '#BFDBFE'}`,
                              borderRadius: 8, padding: '5px 10px',
                              textDecoration: 'none', maxWidth: '100%',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ flexShrink: 0 }}>{hasReviewed ? '✓' : '↗'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {cell.complianceDoc!.fileName ?? 'Open document'}
                            </span>
                          </a>
                        ) : (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: '#8B1A1A', background: 'rgba(139,26,26,0.07)',
                            border: '1px solid rgba(139,26,26,0.22)', padding: '3px 8px',
                            borderRadius: 10, textTransform: 'uppercase',
                            letterSpacing: '0.06em', display: 'inline-block',
                          }}>
                            Not in vault
                          </span>
                        )}
                      </div>

                      {/* Noted status OR action buttons */}
                      {noted ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: noteStatusColor }}>
                            {noteStatusLabel}
                          </span>
                          <span style={{ fontSize: 10, color: '#96908A' }}>
                            by {cell.note!.chair.name}
                          </span>
                          {cell.note?.exception && (
                            <p style={{ fontSize: 10, color: '#96908A', fontStyle: 'italic', width: '100%', margin: '4px 0 0' }}>
                              {cell.note.exception}
                            </p>
                          )}
                        </div>

                      ) : isChairperson ? (
                        <div>
                          {/* Nudge to open doc before noting (if uploaded) */}
                          {hasDoc && !hasReviewed && !isActive && (
                            <p style={{ fontSize: 10, color: '#92400E', background: 'rgba(146,64,14,0.1)', border: '1px solid rgba(146,64,14,0.3)', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
                              Open document above to unlock digital noting
                            </p>
                          )}

                          {!isActive ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {/* Digital note — only if doc opened */}
                              {hasDoc && (
                                <button
                                  onClick={() => hasReviewed && canNote && setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'options' })}
                                  disabled={isNoting || !canNote || !hasReviewed}
                                  title={!hasReviewed ? 'Open document above first' : undefined}
                                  style={{
                                    fontSize: 11, fontWeight: 700,
                                    color:      (canNote && hasReviewed) ? '#8B1A1A' : '#5C5750',
                                    background: (canNote && hasReviewed) ? 'rgba(139,26,26,0.07)' : '#F5F2EE',
                                    border:     `1px solid ${(canNote && hasReviewed) ? 'rgba(139,26,26,0.25)' : '#E0DAD2'}`,
                                    borderRadius: 7, padding: '6px 12px',
                                    cursor: (canNote && hasReviewed) ? 'pointer' : 'not-allowed',
                                    opacity: (canNote && hasReviewed) ? 1 : 0.5,
                                  }}
                                >
                                  Note Receipt ›
                                </button>
                              )}
                              {/* Physical presence — always available to chairperson */}
                              <button
                                onClick={() => canNote && setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'physical' })}
                                disabled={isNoting || !canNote}
                                style={{
                                  fontSize: 11, fontWeight: 600,
                                  color:      canNote ? '#5C5750' : '#96908A',
                                  background: canNote ? '#F5F2EE' : '#EBE6DF',
                                  border:     `1px solid ${canNote ? '#E0DAD2' : '#E0DAD2'}`,
                                  borderRadius: 7, padding: '6px 12px',
                                  cursor: canNote ? 'pointer' : 'not-allowed',
                                  opacity: canNote ? 1 : 0.5,
                                }}
                                title={deemedVenue ? `Confirm physically present at ${deemedVenue}` : 'Confirm physically present at deemed venue'}
                              >
                                {hasDoc ? 'Physical copy ›' : 'Mark present ›'}
                              </button>
                            </div>

                          ) : activeCell?.mode === 'options' ? (
                            /* Note options */
                            <div>
                              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                <button
                                  onClick={() => submitNote(row.userId, cell.formType, 'NOTED')}
                                  style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}
                                >
                                  ✓ Note Receipt
                                </button>
                                <button
                                  onClick={() => setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'exception' })}
                                  style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}
                                >
                                  ⚠ Exception
                                </button>
                                <button onClick={() => setActiveCell(null)} style={{ fontSize: 11, color: '#5C5750', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px' }}>
                                  ✕
                                </button>
                              </div>
                            </div>

                          ) : activeCell?.mode === 'exception' ? (
                            /* Exception flow */
                            <div>
                              <textarea
                                value={exceptionText}
                                onChange={e => setExceptionText(e.target.value)}
                                placeholder="Describe the exception (e.g. Director to submit within 30 days per SS-1)"
                                rows={2}
                                style={{ width: '100%', boxSizing: 'border-box', background: '#FDFCFB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#231F1B', resize: 'vertical', marginBottom: 6, fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
                              />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => submitNote(row.userId, cell.formType, 'NOTED_WITH_EXCEPTION', exceptionText)}
                                  disabled={!exceptionText.trim()}
                                  style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 7, padding: '6px 14px', cursor: exceptionText.trim() ? 'pointer' : 'default', opacity: exceptionText.trim() ? 1 : 0.5 }}
                                >
                                  Record Exception
                                </button>
                                <button onClick={() => setActiveCell(null)} style={{ fontSize: 11, color: '#5C5750', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>

                          ) : activeCell?.mode === 'physical' ? (
                            /* Physical presence confirmation */
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px' }}>
                              <p style={{ fontSize: 11, color: '#1D4ED8', margin: '0 0 8px', lineHeight: 1.5 }}>
                                Confirm that <strong>{meta.label}</strong> for <strong>{row.name}</strong> was
                                physically present at the deemed venue
                                {deemedVenue ? <strong> ({deemedVenue})</strong> : ''} and
                                available for inspection by the Board.
                              </p>
                              <p style={{ fontSize: 10, color: '#5C5750', margin: '0 0 10px' }}>
                                This will be recorded in the minutes as: "The Chairperson confirmed that Form {meta.label} received from {row.name} was physically present at the deemed venue and placed before the Board."
                              </p>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => submitNote(row.userId, cell.formType, 'PHYSICALLY_PRESENT', `${meta.label} physically present at deemed venue${deemedVenue ? ` — ${deemedVenue}` : ''}`)}
                                  style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}
                                >
                                  ✓ Confirm Physical Presence
                                </button>
                                <button onClick={() => setActiveCell(null)} style={{ fontSize: 11, color: '#5C5750', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                      ) : (
                        <span style={{ fontSize: 11, color: '#96908A', fontStyle: 'italic' }}>Awaiting Chairperson</span>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {data.rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#96908A', fontSize: 13 }}>
          No directors or CS members found in this workspace.
        </div>
      )}
    </div>
  );
}
