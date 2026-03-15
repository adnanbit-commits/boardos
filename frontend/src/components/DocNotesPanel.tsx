'use client';
// components/DocNotesPanel.tsx

import { useState, useEffect, useCallback } from 'react';
import { vault as vaultApi, resolveDownloadUrl, type DocNotesResult } from '@/lib/api';

interface Props {
  companyId:     string;
  meetingId:     string;
  token:         string;
  isChairperson: boolean;
  onAllNoted?:   () => void;
}

const FORM_META: Record<string, { label: string; description: string }> = {
  DIR_8: { label: 'DIR-8', description: 'Non-disqualification declaration (Sec. 164)' },
  MBP_1: { label: 'MBP-1', description: 'Disclosure of interest (Sec. 184)' },
};

export default function DocNotesPanel({ companyId, meetingId, token, isChairperson, onAllNoted }: Props) {
  const [data,       setData]       = useState<DocNotesResult | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [noting,     setNoting]     = useState<string | null>(null);
  const [exception,  setException]  = useState('');
  const [activeCell, setActiveCell] = useState<{ userId: string; formType: string; showException?: boolean } | null>(null);

  // Track which docs the chairperson has opened this session.
  // "Take Note" is locked until the doc is opened (or no doc was uploaded).
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vaultApi.docNotes(companyId, meetingId, token);
      setData(result);
      if (result.allNoted) onAllNoted?.();
    } catch { /* meeting might not have chairperson yet */ }
    finally { setLoading(false); }
  }, [companyId, meetingId, token]);

  useEffect(() => { load(); }, [load]);

  function markReviewed(userId: string, formType: string) {
    setReviewed(prev => new Set(prev).add(`${userId}:${formType}`));
  }

  async function handleNote(directorUserId: string, formType: string, status: 'NOTED' | 'NOTED_WITH_EXCEPTION') {
    if (!isChairperson) return;
    const key = `${directorUserId}:${formType}`;
    setNoting(key);
    try {
      await vaultApi.noteDoc(companyId, meetingId, {
        directorUserId, formType, status,
        exception: status === 'NOTED_WITH_EXCEPTION' ? exception.trim() : undefined,
      }, token);
      setActiveCell(null);
      setException('');
      await load();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to note document.');
    } finally { setNoting(null); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#6B7280', fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading compliance status…
      </div>
    );
  }

  if (!data) return null;

  const progress = data.totalRequired > 0 ? Math.round((data.totalNoted / data.totalRequired) * 100) : 0;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Status banner */}
      <div style={{
        background: data.allNoted ? '#022C22' : '#1A1F0D',
        border: `1px solid ${data.allNoted ? '#064E3B' : '#365314'}`,
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: data.allNoted ? '#34D399' : '#BEF264', margin: '0 0 2px' }}>
            {data.allNoted ? '✓ All compliance documents noted' : `${data.totalNoted} of ${data.totalRequired} documents noted`}
          </p>
          <p style={{ fontSize: 11, color: data.allNoted ? '#6B7280' : '#84CC16', margin: 0 }}>
            {data.allNoted
              ? 'Meeting can now be opened to proceedings.'
              : 'The Chairperson must open and note each DIR-8 and MBP-1 before the meeting can begin.'}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: data.allNoted ? '#34D399' : '#BEF264' }}>{progress}%</div>
          <div style={{ width: 80, height: 4, background: '#1a1e26', borderRadius: 2, marginTop: 4 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: data.allNoted ? '#34D399' : '#84CC16', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {!data.chairpersonId && (
        <div style={{ background: '#451A03', border: '1px solid #92400E', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 12, color: '#FDE68A' }}>
          ⚠ No Chairperson elected yet. Elect a Chairperson above before noting compliance documents.
        </div>
      )}

      {/* Director × Form matrix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.rows.map(row => (
          <div key={row.userId} style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, overflow: 'hidden' }}>

            {/* Row header */}
            <div style={{ background: '#1a1e26', borderBottom: '1px solid #232830', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5' }}>{row.name}</span>
                <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>{row.email}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.role ?? 'DIRECTOR'}</span>
            </div>

            {/* Form cells */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {row.forms.map((cell, ci) => {
                const cellKey     = `${row.userId}:${cell.formType}`;
                const noted       = !!cell.note;
                const hasDoc      = !!cell.complianceDoc?.submittedAt;
                const rawUrl      = cell.complianceDoc?.downloadUrl ?? null;
                const downloadUrl = rawUrl ? resolveDownloadUrl(rawUrl, token) : null;
                const hasReviewed = reviewed.has(cellKey);
                const isActive    = activeCell?.userId === row.userId && activeCell?.formType === cell.formType;
                const isNoting    = noting === cellKey;
                // Chairperson must open the actual doc before the note action unlocks.
                // If no doc was uploaded, the note is always available (will record as exception typically).
                const canNote = isChairperson && !!data.chairpersonId && (hasReviewed || !hasDoc);

                return (
                  <div key={cell.formType} style={{ borderRight: ci === 0 ? '1px solid #232830' : 'none' }}>
                    <div style={{ padding: '14px 16px' }}>

                      {/* Form label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>
                          {FORM_META[cell.formType].label}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: '#4B5563', margin: '0 0 10px', lineHeight: 1.4 }}>
                        {FORM_META[cell.formType].description}
                      </p>

                      {/* Document row — the review link */}
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
                              color:      hasReviewed ? '#34D399' : '#60A5FA',
                              background: hasReviewed ? 'rgba(52,211,153,0.08)' : 'rgba(96,165,250,0.08)',
                              border:     `1px solid ${hasReviewed ? 'rgba(52,211,153,0.25)' : 'rgba(96,165,250,0.25)'}`,
                              borderRadius: 8, padding: '5px 10px',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease',
                              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ flexShrink: 0 }}>{hasReviewed ? '✓' : '↗'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {cell.complianceDoc!.fileName ?? 'Open document'}
                            </span>
                          </a>
                        ) : hasDoc ? (
                          // Doc exists but signed URL unavailable
                          <span style={{ fontSize: 11, color: '#6B7280', background: '#1a1e26', border: '1px solid #232830', borderRadius: 8, padding: '5px 10px', display: 'inline-block' }}>
                            {cell.complianceDoc!.fileName ?? 'Document on file'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#F87171', background: '#450A0A', border: '1px solid #7F1D1D', padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-block' }}>
                            Not uploaded
                          </span>
                        )}
                      </div>

                      {/* Note status or chairperson action */}
                      {noted ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cell.note!.status === 'NOTED' ? '#34D399' : '#FBBF24' }}>
                            {cell.note!.status === 'NOTED' ? '✓ Noted' : '⚠ Noted with exception'}
                          </span>
                          <span style={{ fontSize: 10, color: '#374151' }}>
                            by {cell.note!.chair.name} · {new Date(cell.note!.notedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                      ) : isChairperson ? (
                        <div>
                          {/* Nudge when doc exists but not yet opened */}
                          {hasDoc && !hasReviewed && (
                            <p style={{ fontSize: 10, color: '#92400E', background: 'rgba(146,64,14,0.1)', border: '1px solid rgba(146,64,14,0.3)', borderRadius: 6, padding: '4px 8px', margin: '0 0 8px' }}>
                              Open document above to unlock
                            </p>
                          )}

                          {!isActive ? (
                            <button
                              onClick={() => canNote && setActiveCell({ userId: row.userId, formType: cell.formType })}
                              disabled={isNoting || !data.chairpersonId || !canNote}
                              title={!canNote && hasDoc ? 'Open the document above to unlock noting' : undefined}
                              style={{
                                fontSize: 11, fontWeight: 700,
                                color:      canNote ? '#4F7FFF' : '#4B5563',
                                background: canNote ? 'rgba(79,127,255,0.08)' : 'rgba(75,85,99,0.08)',
                                border:     `1px solid ${canNote ? 'rgba(79,127,255,0.3)' : 'rgba(75,85,99,0.2)'}`,
                                borderRadius: 7, padding: '6px 12px',
                                cursor:   canNote ? 'pointer' : 'not-allowed',
                                opacity:  canNote ? 1 : 0.5,
                                transition: 'all 0.15s ease',
                              }}>
                              {isNoting ? 'Noting…' : 'Take Note ›'}
                            </button>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <button onClick={() => handleNote(row.userId, cell.formType, 'NOTED')}
                                  style={{ fontSize: 11, fontWeight: 700, color: '#34D399', background: '#022C22', border: '1px solid #064E3B', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>
                                  ✓ Note Receipt
                                </button>
                                <button onClick={() => setActiveCell({ userId: row.userId, formType: cell.formType, showException: true })}
                                  style={{ fontSize: 11, fontWeight: 600, color: '#FBBF24', background: '#1A1000', border: '1px solid #78350F', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}>
                                  ⚠ Exception
                                </button>
                                <button onClick={() => setActiveCell(null)}
                                  style={{ fontSize: 11, color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px' }}>
                                  ✕
                                </button>
                              </div>
                              {activeCell?.showException && (
                                <div>
                                  <textarea
                                    value={exception}
                                    onChange={e => setException(e.target.value)}
                                    placeholder="Describe the exception (e.g. Director to submit within 30 days per SS-1 Rule 17)"
                                    rows={2}
                                    style={{ width: '100%', boxSizing: 'border-box', background: '#0D0F12', border: '1px solid #78350F', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#F0F2F5', resize: 'vertical', marginBottom: 6, fontFamily: "'DM Sans', system-ui, sans-serif" }} />
                                  <button
                                    onClick={() => handleNote(row.userId, cell.formType, 'NOTED_WITH_EXCEPTION')}
                                    disabled={!exception.trim()}
                                    style={{ fontSize: 11, fontWeight: 700, color: '#FBBF24', background: '#1A1000', border: '1px solid #78350F', borderRadius: 7, padding: '6px 14px', cursor: exception.trim() ? 'pointer' : 'default', opacity: exception.trim() ? 1 : 0.5 }}>
                                    Record Exception
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                      ) : (
                        <span style={{ fontSize: 11, color: '#374151', fontStyle: 'italic' }}>Awaiting Chairperson</span>
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
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#374151', fontSize: 13 }}>
          No directors or CS members found in this workspace.
        </div>
      )}
    </div>
  );
}
