'use client';
// app/(dashboard)/companies/[companyId]/templates/page.tsx
// Meeting template library — system templates + company custom templates

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { meetingTemplates as templatesApi, type MeetingTemplate } from '@/lib/api';
import { SYSTEM_TEMPLATES, type SystemTemplate } from '@/lib/meeting-templates';
import { getToken } from '@/lib/auth';


// ── Types ─────────────────────────────────────────────────────────────────────

interface AgendaDraft {
  id:                string;
  title:             string;
  description:       string;
  itemType:          string;   // 'STANDARD' | 'DOCUMENT_NOTING' | 'COMPLIANCE_NOTING'
  // Document noting
  vaultDocType:      string;   // known vault slot key, or '' for custom/external
  customVaultDocId:  string;   // id of a custom uploaded vault document
  docLabel:          string;   // human label for the document
  externalDocUrl:    string;   // Path B: URL on external platform
  externalDocPlatform: string; // 'MCA21' | 'Google Drive' | 'Dropbox' | 'OneDrive' | 'Other'
  physicalPresence:  boolean;  // Path C: physically present at deemed venue
  // Compliance noting
  complianceScope:   string;   // 'ALL' | 'SPECIFIC'
  specificDirectors: string[]; // userIds when scope is SPECIFIC
}

const VAULT_SLOT_OPTIONS = [
  { value: '',                  label: 'Select a statutory slot…' },
  { value: 'INCORPORATION_CERT',label: 'Certificate of Incorporation (COI)' },
  { value: 'MOA',               label: 'Memorandum of Association (MOA)' },
  { value: 'AOA',               label: 'Articles of Association (AOA)' },
  { value: 'PAN',               label: 'Company PAN Card' },
  { value: 'GST_CERT',          label: 'GST Registration Certificate' },
  { value: 'COMMON_SEAL',       label: 'Common Seal' },
];

const EXTERNAL_PLATFORM_OPTIONS = [
  { value: 'MCA21',         label: 'MCA21 Portal',  hint: 'https://www.mca.gov.in/...' },
  { value: 'Google Drive',  label: 'Google Drive',  hint: 'https://drive.google.com/...' },
  { value: 'Dropbox',       label: 'Dropbox',       hint: 'https://www.dropbox.com/...' },
  { value: 'OneDrive',      label: 'OneDrive',      hint: 'https://onedrive.live.com/...' },
  { value: 'Other',         label: 'Other URL',     hint: 'https://...' },
];

type ViewMode = 'library' | 'builder';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BOARD:     { label: 'Board',     color: '#60A5FA', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)' },
  AGM:       { label: 'AGM',       color: '#34D399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.25)' },
  EGM:       { label: 'EGM',       color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' },
  COMMITTEE: { label: 'Committee', color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' },
  CUSTOM:    { label: 'Custom',    color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
};

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.CUSTOM;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      padding: '2px 8px', borderRadius: 20 }}>
      {cfg.label}
    </span>
  );
}

function uid() { return Math.random().toString(36).slice(2); }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const token = getToken()!;

  const [view,         setView]         = useState<ViewMode>('library');
  const [customTpls,   setCustomTpls]   = useState<MeetingTemplate[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [vaultDocs,    setVaultDocs]    = useState<any[]>([]);
  const [companyMembers, setCompanyMembers] = useState<any[]>([]);
  const [previewTpl,   setPreviewTpl]   = useState<typeof SYSTEM_TEMPLATES[0] | MeetingTemplate | null>(null);
  const [editingTpl,   setEditingTpl]   = useState<MeetingTemplate | null>(null); // null = new template

  // Builder state
  const [bName,     setBName]     = useState('');
  const [bDesc,     setBDesc]     = useState('');
  const [bCategory, setBCategory] = useState('BOARD');
  const [bItems,    setBItems]    = useState<AgendaDraft[]>([{ id: uid(), title: '', description: '', itemType: 'STANDARD', vaultDocType: '', customVaultDocId: '', docLabel: '', externalDocUrl: '', externalDocPlatform: 'MCA21', physicalPresence: false, complianceScope: 'ALL', specificDirectors: [] }]);
  const [bSaving,   setBSaving]   = useState(false);
  const [bErr,      setBErr]      = useState('');

  const [filterCat, setFilterCat] = useState<string>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpls, vDocs, members] = await Promise.all([
        templatesApi.list(companyId, token),
        import('@/lib/api').then(a => a.vault.list(companyId, token).catch(() => [])),
        import('@/lib/api').then(a => a.companies.listMembers(companyId, token).catch(() => [])),
      ]);
      setCustomTpls(tpls);
      setVaultDocs(vDocs ?? []);
      setCompanyMembers((members as any[]).filter((m: any) =>
        ['DIRECTOR', 'COMPANY_SECRETARY'].includes(m.role)
      ));
    }
    catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  // ── Builder helpers ─────────────────────────────────────────────────────────
  function openBuilder(tpl?: MeetingTemplate) {
    if (tpl) {
      setEditingTpl(tpl);
      setBName(tpl.name);
      setBDesc(tpl.description ?? '');
      setBCategory(tpl.category);
      setBItems((tpl.agendaItems as any[]).map(a => ({ id: uid(), title: a.title, description: a.description ?? '', itemType: a.itemType ?? 'STANDARD', vaultDocType: a.vaultDocType ?? '', customVaultDocId: a.customVaultDocId ?? '', docLabel: a.docLabel ?? '', externalDocUrl: a.externalDocUrl ?? '', externalDocPlatform: a.externalDocPlatform ?? 'MCA21', physicalPresence: a.physicalPresence ?? false, complianceScope: a.complianceScope ?? 'ALL', specificDirectors: a.specificDirectors ?? [] })));
    } else {
      setEditingTpl(null);
      setBName(''); setBDesc(''); setBCategory('BOARD');
      setBItems([{ id: uid(), title: '', description: '', itemType: 'STANDARD', vaultDocType: '', customVaultDocId: '', docLabel: '', externalDocUrl: '', externalDocPlatform: 'MCA21', physicalPresence: false, complianceScope: 'ALL', specificDirectors: [] }]);
    }
    setBErr('');
    setView('builder');
  }

  function openBuilderFromSystem(tpl: typeof SYSTEM_TEMPLATES[0]) {
    setEditingTpl(null);
    setBName(`${tpl.name} (Custom)`);
    setBDesc(tpl.description);
    setBCategory(tpl.category);
    setBItems(tpl.agendaItems.map(a => ({ id: uid(), title: a.title, description: a.description ?? a.legalBasis ?? '', itemType: a.itemType ?? 'STANDARD', vaultDocType: (a.workItems?.[0] as any)?.vaultDocType ?? '', customVaultDocId: '', docLabel: (a.workItems?.[0] as any)?.docLabel ?? '', externalDocUrl: '', externalDocPlatform: 'MCA21', physicalPresence: false, complianceScope: 'ALL', specificDirectors: [] })));
    setBErr('');
    setView('builder');
  }

  function addItem() { setBItems(p => [...p, { id: uid(), title: '', description: '', itemType: 'STANDARD', vaultDocType: '', customVaultDocId: '', docLabel: '', externalDocUrl: '', externalDocPlatform: 'MCA21', physicalPresence: false, complianceScope: 'ALL', specificDirectors: [] }]); }
  function removeItem(id: string) { setBItems(p => p.length > 1 ? p.filter(a => a.id !== id) : p); }
  function updateItem(id: string, field: keyof AgendaDraft, val: string | boolean | string[]) {
    setBItems(p => p.map(a => a.id === id ? { ...a, [field]: val } : a));
  }
  function moveItem(id: string, dir: -1 | 1) {
    setBItems(prev => {
      const idx = prev.findIndex(a => a.id === id);
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function saveTemplate() {
    if (!bName.trim()) { setBErr('Template name is required.'); return; }
    const validItems = bItems.filter(a => a.title.trim());
    if (validItems.length === 0) { setBErr('At least one agenda item is required.'); return; }

    setBSaving(true); setBErr('');
    try {
      const payload = {
        name: bName.trim(),
        description: bDesc.trim() || undefined,
        category: bCategory,
        agendaItems: validItems.map((a, i) => ({
          title:        a.title.trim(),
          description:  a.description.trim() || undefined,
          order:        i + 1,
          itemType:             a.itemType !== 'STANDARD' ? a.itemType : undefined,
          vaultDocType:         a.itemType === 'DOCUMENT_NOTING' && a.vaultDocType ? a.vaultDocType : undefined,
          customVaultDocId:     a.itemType === 'DOCUMENT_NOTING' && a.customVaultDocId ? a.customVaultDocId : undefined,
          docLabel:             a.itemType === 'DOCUMENT_NOTING' && a.docLabel.trim() ? a.docLabel.trim() : undefined,
          externalDocUrl:       a.itemType === 'DOCUMENT_NOTING' && a.externalDocUrl.trim() ? a.externalDocUrl.trim() : undefined,
          externalDocPlatform:  a.itemType === 'DOCUMENT_NOTING' && a.externalDocUrl.trim() ? a.externalDocPlatform : undefined,
          physicalPresence:     a.itemType === 'DOCUMENT_NOTING' && a.physicalPresence ? true : undefined,
          complianceScope:      a.itemType === 'COMPLIANCE_NOTING' && a.complianceScope === 'SPECIFIC' ? 'SPECIFIC' : undefined,
          specificDirectors:    a.itemType === 'COMPLIANCE_NOTING' && a.complianceScope === 'SPECIFIC' && a.specificDirectors.length > 0 ? a.specificDirectors : undefined,
        })),
      };
      if (editingTpl) {
        await templatesApi.update(companyId, editingTpl.id, payload, token);
      } else {
        await templatesApi.create(companyId, payload, token);
      }
      await load();
      setView('library');
    } catch (err: any) {
      setBErr(err?.body?.message ?? 'Failed to save template.');
    } finally { setBSaving(false); }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    try {
      await templatesApi.remove(companyId, id, token);
      setCustomTpls(p => p.filter(t => t.id !== id));
    } catch { alert('Failed to delete.'); }
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const categories = ['ALL', 'BOARD', 'AGM', 'EGM', 'COMMITTEE'];
  const filteredSystem = filterCat === 'ALL' ? SYSTEM_TEMPLATES : SYSTEM_TEMPLATES.filter(t => t.category === filterCat);
  const filteredCustom = filterCat === 'ALL' ? customTpls : customTpls.filter(t => t.category === filterCat || (filterCat === 'COMMITTEE' && !['BOARD','AGM','EGM'].includes(t.category)));

  // ── Preview Modal ───────────────────────────────────────────────────────────
  function PreviewModal() {
    if (!previewTpl) return null;
    const isSystem = (previewTpl as any).isSystem === true;
    const items = (previewTpl as any).agendaItems as { title: string; description?: string; order?: number }[];
    return (
      <div onClick={() => setPreviewTpl(null)} style={overlay}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#191D24', border: '1px solid #232830', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid #1a1e26' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CategoryBadge category={previewTpl.category} />
                  {isSystem && <span style={{ fontSize: 10, color: '#4B5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>System Template</span>}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F0F2F5', margin: '0 0 6px' }}>{previewTpl.name}</h2>
                {previewTpl.description && <p style={{ fontSize: 13, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>{previewTpl.description}</p>}
              </div>
              <button onClick={() => setPreviewTpl(null)} style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>×</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px' }}>
            <p style={sectionLabel}>Agenda Items ({items.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item, i) => (
                <div key={i} style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#1a1e26', borderBottom: '1px solid #232830', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Item {i + 1}</span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#F0F2F5', margin: '0 0 6px' }}>{item.title}</p>
                    {item.description && <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '16px 32px 24px', borderTop: '1px solid #1a1e26', display: 'flex', gap: 10 }}>
            <button onClick={() => setPreviewTpl(null)} style={ghostBtn}>Close</button>
            {isSystem ? (
              <button onClick={() => { setPreviewTpl(null); openBuilderFromSystem(previewTpl as typeof SYSTEM_TEMPLATES[0]); }}
                style={{ ...primaryBtn, flex: 2 }}>
                Customise Template →
              </button>
            ) : (
              <button onClick={() => { setPreviewTpl(null); router.push(`/companies/${companyId}/meetings`); }}
                style={{ ...primaryBtn, flex: 2 }}>
                Use in New Meeting →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Builder View ────────────────────────────────────────────────────────────
  if (view === 'builder') {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 720, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
          @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} } .item-row{animation:fadeIn 0.15s ease}`}</style>

        {/* Back */}
        <button onClick={() => setView('library')} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          ← Back to Templates
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px', fontFamily: "'Playfair Display', serif", letterSpacing: '-0.02em' }}>
          {editingTpl ? 'Edit Template' : 'New Template'}
        </h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 32 }}>
          {editingTpl ? 'Update this template. Changes apply to new meetings only.' : 'Build a reusable agenda template for your board meetings.'}
        </p>

        {/* Template name */}
        <label style={labelStyle}>Template Name *</label>
        <input value={bName} onChange={e => setBName(e.target.value)} placeholder="e.g. Monthly Finance Committee Meeting" style={inputStyle} autoFocus />

        {/* Description */}
        <label style={{ ...labelStyle, marginTop: 16 }}>Description <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
        <textarea value={bDesc} onChange={e => setBDesc(e.target.value)} placeholder="What type of meeting is this template for?" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />

        {/* Category */}
        <label style={{ ...labelStyle, marginTop: 16 }}>Meeting Type *</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {Object.entries(CATEGORY_CONFIG).filter(([k]) => k !== 'CUSTOM').map(([key, cfg]) => (
            <button key={key} onClick={() => setBCategory(key)}
              style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${bCategory === key ? cfg.border : '#232830'}`, background: bCategory === key ? cfg.bg : 'transparent', color: bCategory === key ? cfg.color : '#6B7280', transition: 'all 0.15s' }}>
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Agenda Builder */}
        <div style={{ marginTop: 28 }}>
          <p style={sectionLabel}>Agenda Items</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bItems.map((item, idx) => (
              <div key={item.id} className="item-row" style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: '#1a1e26', borderBottom: '1px solid #232830', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Item {idx + 1}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0}
                      style={{ background: 'none', border: 'none', color: idx === 0 ? '#2a3040' : '#4B5563', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 13, padding: '0 4px' }}>↑</button>
                    <button onClick={() => moveItem(item.id, 1)} disabled={idx === bItems.length - 1}
                      style={{ background: 'none', border: 'none', color: idx === bItems.length - 1 ? '#2a3040' : '#4B5563', cursor: idx === bItems.length - 1 ? 'default' : 'pointer', fontSize: 13, padding: '0 4px' }}>↓</button>
                    {bItems.length > 1 && (
                      <button onClick={() => removeItem(item.id)}
                        style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>×</button>
                    )}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Item type selector */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { v: 'STANDARD',         l: 'Standard',          desc: 'Voting resolution or general discussion' },
                      { v: 'DOCUMENT_NOTING',  l: 'Document Noting',   desc: 'Note a company document on record' },
                      { v: 'COMPLIANCE_NOTING',l: 'Compliance Noting', desc: 'Director declarations (DIR-8, MBP-1, DIR-2)' },
                    ].map(t => (
                      <button key={t.v} type="button" title={t.desc}
                        onClick={() => updateItem(item.id, 'itemType', t.v)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${item.itemType === t.v ? (t.v === 'DOCUMENT_NOTING' ? '#3B82F6' : t.v === 'COMPLIANCE_NOTING' ? '#10B981' : '#4B5563') : '#232830'}`,
                          background: item.itemType === t.v ? (t.v === 'DOCUMENT_NOTING' ? 'rgba(59,130,246,0.12)' : t.v === 'COMPLIANCE_NOTING' ? 'rgba(16,185,129,0.12)' : 'rgba(75,85,99,0.12)') : 'transparent',
                          color: item.itemType === t.v ? (t.v === 'DOCUMENT_NOTING' ? '#60A5FA' : t.v === 'COMPLIANCE_NOTING' ? '#34D399' : '#9CA3AF') : '#4B5563',
                          transition: 'all 0.15s',
                        }}>
                        {t.l}
                      </button>
                    ))}
                  </div>

                  <input value={item.title} onChange={e => updateItem(item.id, 'title', e.target.value)}
                    placeholder={
                      item.itemType === 'DOCUMENT_NOTING'  ? 'e.g. To take note of the Shareholders Agreement' :
                      item.itemType === 'COMPLIANCE_NOTING' ? 'e.g. To take note of Director Declarations' :
                      'e.g. To consider and approve the Business Plan'
                    }
                    style={{ ...inputStyle, fontSize: 13, fontWeight: 600, padding: '9px 12px' }} />

                  {/* ── Document Noting sub-form ──────────────────────────────── */}
                  {item.itemType === 'DOCUMENT_NOTING' && (
                    <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Document Source</p>

                      {/* Document label */}
                      <input
                        value={item.docLabel}
                        onChange={e => updateItem(item.id, 'docLabel', e.target.value)}
                        placeholder="Document name (e.g. Shareholders Agreement, Brand Licence Agreement)"
                        style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }}
                      />

                      {/* Source tabs */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { k: 'vault',    l: '📁 BoardOS Vault' },
                          { k: 'external', l: '🔗 External URL' },
                          { k: 'physical', l: '📄 Physical Copy' },
                        ].map(tab => {
                          const active =
                            tab.k === 'vault'    ? (!item.physicalPresence && !item.externalDocUrl) :
                            tab.k === 'external' ? (!!item.externalDocUrl) :
                            item.physicalPresence;
                          return (
                            <button key={tab.k} type="button"
                              onClick={() => {
                                if (tab.k === 'vault')    { updateItem(item.id, 'externalDocUrl', ''); (item as any).physicalPresence = false; updateItem(item.id, 'physicalPresence' as any, false); }
                                if (tab.k === 'external') { updateItem(item.id, 'physicalPresence' as any, false); if (!item.externalDocUrl) updateItem(item.id, 'externalDocUrl', 'https://'); }
                                if (tab.k === 'physical') { updateItem(item.id, 'externalDocUrl', ''); updateItem(item.id, 'physicalPresence' as any, true); }
                              }}
                              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? '#3B82F6' : '#232830'}`, background: active ? 'rgba(59,130,246,0.12)' : 'transparent', color: active ? '#60A5FA' : '#6B7280', transition: 'all 0.15s' }}>
                              {tab.l}
                            </button>
                          );
                        })}
                      </div>

                      {/* Vault sub-form */}
                      {!item.physicalPresence && !item.externalDocUrl && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {/* Statutory slot */}
                          <div>
                            <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Statutory vault slot (auto-links at meeting time)</p>
                            <select value={item.vaultDocType} onChange={e => updateItem(item.id, 'vaultDocType', e.target.value)}
                              style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }}>
                              {VAULT_SLOT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                          {/* Custom uploaded docs */}
                          {!item.vaultDocType && vaultDocs.filter((d: any) => d.docType === 'CUSTOM').length > 0 && (
                            <div>
                              <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Or pick a custom vault document</p>
                              <select value={item.customVaultDocId} onChange={e => updateItem(item.id, 'customVaultDocId', e.target.value)}
                                style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }}>
                                <option value="">— Select uploaded document —</option>
                                {vaultDocs.filter((d: any) => d.docType === 'CUSTOM').map((d: any) => (
                                  <option key={d.id} value={d.id}>{d.label || d.fileName}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {!item.vaultDocType && vaultDocs.filter((d: any) => d.docType === 'CUSTOM').length === 0 && (
                            <p style={{ fontSize: 10, color: '#4B5563', fontStyle: 'italic' }}>No custom documents in vault yet — upload first, then link here.</p>
                          )}
                        </div>
                      )}

                      {/* External URL sub-form */}
                      {!!item.externalDocUrl && !item.physicalPresence && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {EXTERNAL_PLATFORM_OPTIONS.map(p => (
                              <button key={p.value} type="button"
                                onClick={() => updateItem(item.id, 'externalDocPlatform', p.value)}
                                style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: `1px solid ${item.externalDocPlatform === p.value ? '#3B82F6' : '#232830'}`, background: item.externalDocPlatform === p.value ? 'rgba(59,130,246,0.12)' : 'transparent', color: item.externalDocPlatform === p.value ? '#60A5FA' : '#6B7280' }}>
                                {p.label}
                              </button>
                            ))}
                          </div>
                          <input value={item.externalDocUrl} onChange={e => updateItem(item.id, 'externalDocUrl', e.target.value)}
                            placeholder={EXTERNAL_PLATFORM_OPTIONS.find(p => p.value === item.externalDocPlatform)?.hint ?? 'https://...'}
                            style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }} />
                          <p style={{ fontSize: 10, color: '#92400E', background: 'rgba(146,64,14,0.08)', border: '1px solid rgba(146,64,14,0.2)', borderRadius: 4, padding: '4px 8px', margin: 0 }}>
                            ⚠ Directors must have access to this URL. BoardOS cannot verify access for external platforms.
                          </p>
                        </div>
                      )}

                      {/* Physical presence sub-form */}
                      {item.physicalPresence && (
                        <p style={{ fontSize: 11, color: '#6B7280', background: 'rgba(75,85,99,0.08)', border: '1px solid #232830', borderRadius: 6, padding: '8px 10px', margin: 0, lineHeight: 1.5 }}>
                          The Chairperson will confirm at the meeting that this document was physically present at the deemed venue and placed before the Board.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Compliance Noting sub-form ─────────────────────────────── */}
                  {item.itemType === 'COMPLIANCE_NOTING' && (
                    <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Director Scope</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[{ v: 'ALL', l: 'All directors' }, { v: 'SPECIFIC', l: 'Specific directors' }].map(opt => (
                          <button key={opt.v} type="button"
                            onClick={() => updateItem(item.id, 'complianceScope', opt.v)}
                            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${item.complianceScope === opt.v ? '#10B981' : '#232830'}`, background: item.complianceScope === opt.v ? 'rgba(16,185,129,0.12)' : 'transparent', color: item.complianceScope === opt.v ? '#34D399' : '#6B7280', transition: 'all 0.15s' }}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                      {item.complianceScope === 'SPECIFIC' && (
                        companyMembers.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {companyMembers.map((m: any) => (
                              <label key={m.user?.id ?? m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox"
                                  checked={item.specificDirectors.includes(m.user?.id ?? m.userId)}
                                  onChange={e => {
                                    const uid = m.user?.id ?? m.userId;
                                    const current = item.specificDirectors;
                                    updateItem(item.id, 'specificDirectors' as any,
                                      e.target.checked ? [...current, uid] : current.filter((id: string) => id !== uid)
                                    );
                                  }}
                                  style={{ accentColor: '#34D399', width: 13, height: 13 }} />
                                <span style={{ fontSize: 12, color: '#D1D5DB' }}>
                                  {m.user?.name ?? m.name}
                                  <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6 }}>{m.role}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic' }}>No directors loaded — save this template and re-open to select specific directors.</p>
                        )
                      )}
                      {item.complianceScope === 'ALL' && (
                        <p style={{ fontSize: 11, color: '#34D399', margin: 0, lineHeight: 1.5 }}>
                          DIR-8 and MBP-1 will be required for all directors at the first meeting of each financial year. DIR-2 will be required for each new director on their first appointment.
                        </p>
                      )}
                    </div>
                  )}

                  <textarea value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Notes for CS / legal basis (optional — shown to CS, not in minutes)" rows={2}
                    style={{ ...inputStyle, fontSize: 12, color: '#9CA3AF', resize: 'vertical', padding: '8px 12px' }} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={addItem}
            style={{ marginTop: 10, background: 'none', border: '1px dashed #2A3040', borderRadius: 10, color: '#4F7FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '9px 0', width: '100%' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#4F7FFF')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A3040')}>
            + Add Agenda Item
          </button>
        </div>

        {bErr && <div style={{ marginTop: 16, background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13 }}>{bErr}</div>}

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={() => setView('library')} style={ghostBtn}>Cancel</button>
          <button onClick={saveTemplate} disabled={bSaving} style={{ ...primaryBtn, flex: 2, opacity: bSaving ? 0.6 : 1 }}>
            {bSaving ? 'Saving…' : editingTpl ? 'Save Changes' : 'Save Template'}
          </button>
        </div>
      </div>
    );
  }

  // ── Library View ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px 36px', maxWidth: 960, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');`}</style>

      <PreviewModal />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px', fontFamily: "'Playfair Display', serif", letterSpacing: '-0.02em' }}>
            Meeting Templates
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
            Start meetings faster with pre-built and custom templates.
          </p>
        </div>
        <button onClick={() => openBuilder()} style={primaryBtn}>+ New Template</button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterCat === cat ? '#4F7FFF' : '#232830'}`, background: filterCat === cat ? 'rgba(79,127,255,0.12)' : 'transparent', color: filterCat === cat ? '#60A5FA' : '#6B7280', transition: 'all 0.15s' }}>
            {cat === 'ALL' ? 'All Types' : cat}
          </button>
        ))}
      </div>

      {/* System Templates */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <p style={sectionLabel}>System Templates</p>
          <span style={{ fontSize: 11, color: '#374151', background: '#1a1e26', border: '1px solid #232830', borderRadius: 20, padding: '1px 8px' }}>Companies Act 2013</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filteredSystem.map(tpl => (
            <div key={tpl.id} style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}>
              <div style={{ padding: '18px 20px 14px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <CategoryBadge category={tpl.category} />
                  <span style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>{tpl.agendaItems.length} items</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', margin: '0 0 6px' }}>{tpl.name}</p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tpl.description}</p>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1a1e26', display: 'flex', gap: 8 }}>
                <button onClick={() => setPreviewTpl(tpl as any)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid #232830', borderRadius: 8, color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 0' }}>
                  Preview
                </button>
                <button onClick={() => openBuilderFromSystem(tpl)}
                  style={{ flex: 1, background: 'rgba(79,127,255,0.12)', border: '1px solid rgba(79,127,255,0.3)', borderRadius: 8, color: '#60A5FA', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 0' }}>
                  Customise →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Templates */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={sectionLabel}>Your Templates</p>
            {customTpls.length > 0 && (
              <span style={{ fontSize: 11, color: '#374151', background: '#1a1e26', border: '1px solid #232830', borderRadius: 20, padding: '1px 8px' }}>{customTpls.length}</span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filteredCustom.length === 0 ? (
          <div style={{ background: '#13161B', border: '1px dashed #232830', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>◈</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF', marginBottom: 6 }}>No custom templates yet</p>
            <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Customise a system template or build your own from scratch.</p>
            <button onClick={() => openBuilder()} style={primaryBtn}>+ New Template</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filteredCustom.map(tpl => (
              <div key={tpl.id} style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}>
                <div style={{ padding: '18px 20px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <CategoryBadge category={tpl.category} />
                    <span style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>
                      {(tpl.agendaItems as any[]).length} items
                    </span>
                    {tpl.usageCount > 0 && (
                      <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, marginLeft: 'auto' }}>
                        Used {tpl.usageCount}×
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', margin: '0 0 6px' }}>{tpl.name}</p>
                  {tpl.description && <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tpl.description}</p>}
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #1a1e26', display: 'flex', gap: 8 }}>
                  <button onClick={() => setPreviewTpl(tpl as any)}
                    style={{ flex: 1, background: 'transparent', border: '1px solid #232830', borderRadius: 8, color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 0' }}>
                    Preview
                  </button>
                  <button onClick={() => openBuilder(tpl)}
                    style={{ flex: 1, background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 0' }}>
                    Edit
                  </button>
                  <button onClick={() => deleteTemplate(tpl.id, tpl.name)}
                    style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 8, color: '#4B5563', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 10px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.borderColor = '#7F1D1D'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#4B5563'; e.currentTarget.style.borderColor = 'transparent'; }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 6,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0D0F12', border: '1px solid #232830', borderRadius: 10,
  padding: '10px 14px', fontSize: 13, color: '#F0F2F5', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const primaryBtn: React.CSSProperties = {
  background: '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  flex: 1, background: '#232830', color: '#9CA3AF', border: 'none', borderRadius: 10,
  padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
};
