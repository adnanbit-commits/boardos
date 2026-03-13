'use client';
// app/(dashboard)/companies/[companyId]/vault/page.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { vault as vaultApi, type VaultDocument, type ComplianceMatrix, type MeetingDocument } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUTORY_SLOTS: { docType: string; label: string; description: string; required: boolean }[] = [
  { docType: 'INCORPORATION_CERT', label: 'Certificate of Incorporation',  description: 'COI issued by MCA / RoC on incorporation',                    required: true  },
  { docType: 'MOA',                label: 'Memorandum of Association',      description: 'Memorandum of Association — objects, capital clause',         required: true  },
  { docType: 'AOA',                label: 'Articles of Association',        description: 'Articles of Association — internal governance rules',         required: true  },
  { docType: 'PAN',                label: 'Company PAN Card',               description: 'Permanent Account Number issued by Income Tax Department',    required: true  },
  { docType: 'GST_CERT',           label: 'GST Registration Certificate',   description: 'GSTIN certificate from GST portal',                          required: false },
  { docType: 'COMMON_SEAL',        label: 'Common Seal (specimen / scan)',  description: 'Impression or scan of the company\'s common seal if adopted', required: false },
];

const COMPLIANCE_FORM_META: Record<string, { label: string; description: string; deadlineNote: string }> = {
  DIR_2:     { label: 'DIR-2',     description: 'Consent to act as Director',         deadlineNote: 'On appointment' },
  MBP_1:     { label: 'MBP-1',     description: 'Disclosure of interest (Sec. 184)',  deadlineNote: 'Annually + on change' },
  DIR_8:     { label: 'DIR-8',     description: 'Non-disqualification declaration',   deadlineNote: 'Annually (first board meeting of FY)' },
  DIR_3_KYC: { label: 'DIR-3 KYC', description: 'Annual Director KYC',                deadlineNote: 'By Sep 30 each year' },
};

type Tab = 'statutory' | 'compliance' | 'meetings';

// ── Upload helper — presigned PUT direct to GCS ───────────────────────────────

async function uploadToGCS(
  presignedUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload  = () => (xhr.status < 300 ? resolve() : reject(new Error(`GCS upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = getToken()!;
  const [tab, setTab] = useState<Tab>('statutory');

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1020, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .row-anim { animation: fadeIn 0.18s ease; }
        .slot-card:hover { border-color: #2a3040 !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F2F5', margin: 0 }}>Document Vault</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            Statutory records, director compliance forms, and meeting papers — all in one place.
          </p>
        </div>
        <Link href={`/companies/${companyId}`}
          style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none', border: '1px solid #232830', borderRadius: 8, padding: '7px 14px' }}>
          ← Back
        </Link>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#13161B', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {(['statutory', 'compliance', 'meetings'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1E2530' : 'transparent',
            border: 'none', borderRadius: 9, padding: '8px 18px',
            fontSize: 13, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#F0F2F5' : '#6B7280', cursor: 'pointer',
          }}>
            {t === 'statutory' ? '⊟ Statutory Docs' : t === 'compliance' ? '▦ Compliance Register' : '◈ Meeting Papers'}
          </button>
        ))}
      </div>

      {tab === 'statutory'  && <StatutoryTab  companyId={companyId} token={token} />}
      {tab === 'compliance' && <ComplianceTab companyId={companyId} token={token} />}
      {tab === 'meetings'   && <MeetingPapersTab companyId={companyId} token={token} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Statutory Documents
// ══════════════════════════════════════════════════════════════════════════════

function StatutoryTab({ companyId, token }: { companyId: string; token: string }) {
  const [docs,    setDocs]    = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null); // docType being uploaded
  const [progress, setProgress]   = useState(0);
  const [customLabel, setCustomLabel] = useState('');
  const [showCustom, setShowCustom]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<{ docType: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs(await vaultApi.list(companyId, token)); }
    finally { setLoading(false); }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  function findDoc(docType: string) {
    return docs.find(d => d.docType === docType) ?? null;
  }

  function triggerUpload(slot: { docType: string; label: string }) {
    setPendingSlot(slot);
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingSlot) return;
    e.target.value = '';
    setUploading(pendingSlot.docType);
    setProgress(0);
    try {
      const { uploadUrl, objectPath } = await vaultApi.uploadUrl(companyId, { fileName: file.name, contentType: file.type }, token);
      await uploadToGCS(uploadUrl, file, setProgress);
      await vaultApi.register(companyId, {
        docType: pendingSlot.docType, label: pendingSlot.label,
        objectPath, fileName: file.name, fileSize: file.size,
      }, token);
      await load();
    } catch (err) {
      console.error(err);
      alert('Upload failed. Please try again.');
    } finally { setUploading(null); setPendingSlot(null); }
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleFileChange} />

      {loading ? <Spinner /> : (
        <>
          {/* Fixed slots */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {STATUTORY_SLOTS.map(slot => {
              const doc = findDoc(slot.docType);
              const isUp = uploading === slot.docType;
              return (
                <div key={slot.docType} className="slot-card row-anim" style={{
                  background: '#13161B', border: `1px solid ${doc ? '#1B3A2A' : '#232830'}`,
                  borderRadius: 14, padding: '18px 20px', transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {slot.required && <span style={{ fontSize: 9, fontWeight: 700, color: '#F87171', background: '#450A0A', border: '1px solid #7F1D1D', padding: '1px 6px', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Required</span>}
                        {doc && <span style={{ fontSize: 9, fontWeight: 700, color: '#34D399', background: '#022C22', border: '1px solid #064E3B', padding: '1px 6px', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>✓ Uploaded</span>}
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', margin: 0 }}>{slot.label}</p>
                      <p style={{ fontSize: 11, color: '#6B7280', margin: '4px 0 0', lineHeight: 1.4 }}>{slot.description}</p>
                    </div>
                  </div>

                  {doc ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ background: '#0D0F12', border: '1px solid #1B3A2A', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#F0F2F5', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.fileName}</p>
                          <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0 0' }}>
                            Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} by {doc.uploader.name}
                          </p>
                        </div>
                        {doc.downloadUrl && (
                          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#4F7FFF', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                            View ↗
                          </a>
                        )}
                      </div>
                      <button onClick={() => triggerUpload(slot)} disabled={!!uploading}
                        style={{ marginTop: 8, background: 'none', border: 'none', color: '#6B7280', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                        Replace file
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => triggerUpload(slot)} disabled={!!uploading}
                      style={{ marginTop: 12, width: '100%', background: isUp ? '#1E2530' : '#0D0F12', border: `1px dashed ${isUp ? '#4F7FFF' : '#2A3040'}`, borderRadius: 8, padding: '10px 0', color: isUp ? '#4F7FFF' : '#6B7280', fontSize: 12, fontWeight: 600, cursor: isUp ? 'default' : 'pointer' }}>
                      {isUp ? `Uploading… ${progress}%` : '+ Upload document'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom documents */}
          <div style={{ borderTop: '1px solid #1a1e26', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Other Company Documents</p>
              <button onClick={() => setShowCustom(s => !s)}
                style={{ background: 'none', border: '1px solid #232830', borderRadius: 8, padding: '6px 14px', color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + Add Custom
              </button>
            </div>

            {showCustom && (
              <div style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, padding: '16px 18px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Document name *</label>
                  <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                    placeholder="e.g. Shareholder Agreement, DPIIT Certificate"
                    style={{ ...inputStyle, marginTop: 6 }} />
                </div>
                <button
                  onClick={() => {
                    if (!customLabel.trim()) return;
                    triggerUpload({ docType: 'CUSTOM', label: customLabel.trim() });
                    setShowCustom(false);
                  }}
                  disabled={!customLabel.trim()}
                  style={{ ...primaryBtn, opacity: customLabel.trim() ? 1 : 0.5 }}>
                  Upload
                </button>
              </div>
            )}

            {/* Custom docs list */}
            {docs.filter(d => d.docType === 'CUSTOM').map(doc => (
              <div key={doc.id} className="row-anim" style={{ background: '#13161B', border: '1px solid #1B3A2A', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', margin: 0 }}>{doc.label}</p>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0 0' }}>
                    {doc.fileName} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                {doc.downloadUrl && (
                  <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#4F7FFF', fontWeight: 600, textDecoration: 'none' }}>
                    View ↗
                  </a>
                )}
              </div>
            ))}

            {docs.filter(d => d.docType === 'CUSTOM').length === 0 && !showCustom && (
              <p style={{ fontSize: 12, color: '#374151', textAlign: 'center', padding: '16px 0' }}>No custom documents yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Director Compliance Register
// ══════════════════════════════════════════════════════════════════════════════

function ComplianceTab({ companyId, token }: { companyId: string; token: string }) {
  const [data,    setData]    = useState<ComplianceMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [fy,      setFy]      = useState('');
  const [drawer,  setDrawer]  = useState<{ userId: string; name: string; formType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<{ userId: string; formType: string } | null>(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async (fyOverride?: string) => {
    setLoading(true);
    try {
      const result = await vaultApi.compliance(companyId, token, (fyOverride ?? fy) || undefined);
      setData(result);
      if (!fy) setFy(result.financialYear);
    } finally { setLoading(false); }
  }, [companyId, token, fy]);

  useEffect(() => { load(); }, [companyId, token]); // eslint-disable-line

  const forms = ['DIR_2', 'MBP_1', 'DIR_8', 'DIR_3_KYC'];

  function drawerRow() {
    if (!drawer || !data) return null;
    return data.matrix.find(r => r.userId === drawer.userId) ?? null;
  }

  function drawerCell() {
    if (!drawer) return null;
    return drawerRow()?.forms.find(f => f.formType === drawer.formType) ?? null;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload) return;
    e.target.value = '';
    setUploading(true); setUploadPct(0);
    try {
      const { uploadUrl, objectPath } = await vaultApi.complianceUploadUrl(companyId, { fileName: file.name, contentType: file.type }, token);
      await uploadToGCS(uploadUrl, file, setUploadPct);
      await vaultApi.registerCompliance(companyId, {
        userId: pendingUpload.userId, formType: pendingUpload.formType,
        objectPath, fileName: file.name, fileSize: file.size,
        notes: notes.trim() || undefined,
      }, token);
      await load(fy);
      setDrawer(null);
    } finally { setUploading(false); setPendingUpload(null); }
  }

  async function handleMarkReceived(docId: string, received: boolean) {
    await vaultApi.markReceived(companyId, docId, { received, notes: notes.trim() || undefined }, token);
    await load(fy);
    setDrawer(null);
  }

  function cellBg(cell: { doc: any; isOverdue: boolean }) {
    if (!cell.doc) return cell.isOverdue ? '#450A0A' : '#13161B';
    if (cell.doc.receivedAt) return '#022C22';
    if (cell.doc.submittedAt) return '#1A2540';
    return '#13161B';
  }

  function cellLabel(cell: { doc: any; isOverdue: boolean }) {
    if (!cell.doc) return cell.isOverdue ? <span style={{ color: '#F87171', fontWeight: 700 }}>✕ Overdue</span> : <span style={{ color: '#374151' }}>— Pending</span>;
    if (cell.doc.receivedAt) return <span style={{ color: '#34D399', fontWeight: 700 }}>✓ Received</span>;
    if (cell.doc.submittedAt) return <span style={{ color: '#60A5FA', fontWeight: 700 }}>↑ Uploaded</span>;
    return <span style={{ color: '#374151' }}>— Pending</span>;
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleFileUpload} />

      {/* FY selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>Financial Year</span>
        {['2023-24', '2024-25', '2025-26'].map(f => (
          <button key={f} onClick={() => { setFy(f); load(f); }}
            style={{ background: fy === f ? '#1E2530' : 'transparent', border: `1px solid ${fy === f ? '#4F7FFF' : '#232830'}`, borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: fy === f ? 700 : 500, color: fy === f ? '#F0F2F5' : '#6B7280', cursor: 'pointer' }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : !data ? null : (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {[
              { color: '#34D399', label: '✓ CS received paper copy' },
              { color: '#60A5FA', label: '↑ Director uploaded' },
              { color: '#F87171', label: '✕ Overdue' },
              { color: '#374151', label: '— Not submitted' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                <span style={{ fontSize: 11, color: '#6B7280' }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Matrix */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}>Director / CS</th>
                  {forms.map(f => (
                    <th key={f} style={thStyle}>
                      <div style={{ fontWeight: 700, color: '#F0F2F5' }}>{COMPLIANCE_FORM_META[f].label}</div>
                      <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 400, marginTop: 2 }}>{COMPLIANCE_FORM_META[f].deadlineNote}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row, ri) => (
                  <tr key={row.userId}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #1a1e26', verticalAlign: 'middle' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#F0F2F5', margin: 0 }}>{row.name}</p>
                      <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0 0' }}>{row.role}</p>
                    </td>
                    {row.forms.map(cell => (
                      <td key={cell.formType}
                        onClick={() => { setDrawer({ userId: row.userId, name: row.name, formType: cell.formType }); setNotes(''); }}
                        style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e26', textAlign: 'center', cursor: 'pointer', background: 'transparent' }}>
                        <div style={{ background: cellBg(cell), border: '1px solid #232830', borderRadius: 8, padding: '7px 10px', fontSize: 11, transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}>
                          {cellLabel(cell)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Note — mandatory forms */}
          <p style={{ fontSize: 11, color: '#374151', marginTop: 16, lineHeight: 1.6 }}>
            ⚠ DIR-8 and MBP-1 must be formally noted by the Chairperson at each Board meeting before proceedings can open.
            DIR-2 is collected on appointment. DIR-3 KYC deadline is Sep 30 each financial year.
          </p>
        </>
      )}

      {/* Drawer modal */}
      {drawer && drawerCell() && (
        <div onClick={() => setDrawer(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#191D24', border: '1px solid #232830', borderRadius: 18, width: '100%', maxWidth: 460, padding: '28px 28px 24px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px' }}>
              {COMPLIANCE_FORM_META[drawer.formType].label} — {drawer.name}
            </h3>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              {COMPLIANCE_FORM_META[drawer.formType].description}<br />
              Deadline: {COMPLIANCE_FORM_META[drawer.formType].deadlineNote} · FY {fy}
            </p>

            {drawerCell()?.doc ? (
              <div style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#F0F2F5', margin: '0 0 6px' }}>📄 {drawerCell()!.doc!.fileName}</p>
                {drawerCell()!.doc!.submittedAt && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px' }}>Uploaded: {new Date(drawerCell()!.doc!.submittedAt!).toLocaleDateString('en-IN')}</p>}
                {drawerCell()!.doc!.receivedAt
                  ? <p style={{ fontSize: 11, color: '#34D399', margin: 0 }}>✓ Physical copy received: {new Date(drawerCell()!.doc!.receivedAt!).toLocaleDateString('en-IN')}</p>
                  : <button onClick={() => handleMarkReceived(drawerCell()!.doc!.id, true)}
                      style={{ marginTop: 8, fontSize: 12, color: '#34D399', background: 'none', border: '1px solid #064E3B', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>
                      Mark physical copy received
                    </button>
                }
                {drawerCell()!.doc!.notes && <p style={{ fontSize: 11, color: '#6B7280', marginTop: 8, fontStyle: 'italic' }}>Note: {drawerCell()!.doc!.notes}</p>}
              </div>
            ) : (
              <div style={{ background: '#13161B', border: '1px dashed #232830', borderRadius: 10, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px' }}>No document on file for this form / FY.</p>
                {uploading ? (
                  <div style={{ fontSize: 13, color: '#4F7FFF' }}>Uploading… {uploadPct}%</div>
                ) : (
                  <button onClick={() => { setPendingUpload({ userId: drawer.userId, formType: drawer.formType }); fileRef.current?.click(); }}
                    style={{ ...primaryBtn, fontSize: 12 }}>
                    Upload digital copy
                  </button>
                )}
              </div>
            )}

            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Any exceptions or comments..."
              style={{ ...inputStyle, resize: 'vertical', marginTop: 6, marginBottom: 16 }} />

            <button onClick={() => setDrawer(null)} style={ghostBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Meeting Papers
// ══════════════════════════════════════════════════════════════════════════════

function MeetingPapersTab({ companyId, token }: { companyId: string; token: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6B7280' }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>◈</div>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#9CA3AF', marginBottom: 8 }}>Meeting Papers are managed per meeting</p>
      <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 440, margin: '0 auto 20px' }}>
        Go to a specific meeting and open the <strong style={{ color: '#F0F2F5' }}>Documents</strong> tab to upload draft notices,
        agenda papers, supporting materials, and share them via a secure link in your invitation email.
      </p>
      <Link href={`/companies/${companyId}/meetings`}
        style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' } as React.CSSProperties}>
        Go to Meetings →
      </Link>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 26, height: 26, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9CA3AF' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0D0F12', border: '1px solid #232830', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#F0F2F5', outline: 'none', fontFamily: "'DM Sans', system-ui, sans-serif" };
const primaryBtn: React.CSSProperties = { background: '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { width: '100%', background: '#232830', color: '#9CA3AF', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #1a1e26', textAlign: 'center', whiteSpace: 'nowrap' };
