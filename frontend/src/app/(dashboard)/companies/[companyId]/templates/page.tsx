'use client';
// app/(dashboard)/companies/[companyId]/templates/page.tsx
// Meeting template library — system templates + company custom templates

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { meetingTemplates as templatesApi, type MeetingTemplate } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ── System Templates ──────────────────────────────────────────────────────────
// Hardcoded — same for every company, based on Companies Act 2013 + SS-1/SS-2

export const SYSTEM_TEMPLATES = [
  {
    id: 'sys_first_board',
    name: 'First Board Meeting',
    description: 'Post-incorporation first meeting of the Board of Directors. Covers all mandatory agenda items under the Companies Act 2013.',
    category: 'BOARD',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Disclosure of Interest by Directors', description: 'Directors to disclose their interests in other entities as required under Section 184. Collection of MBP-1 forms from all directors.' },
      { order: 2, title: 'Appointment of Chairperson', description: 'Elect a Chairperson for the current meeting and authorise the Chairperson to conduct proceedings in accordance with SS-1.' },
      { order: 3, title: 'Appointment of First Statutory Auditor', description: 'Appointment of the first Statutory Auditor under Section 139(6) of the Companies Act 2013, to hold office until conclusion of the first AGM.' },
      { order: 4, title: 'Opening of Bank Account', description: 'Authorise the Company to open a current/savings account with a scheduled bank. Designate authorised signatories and signing authority limits.' },
      { order: 5, title: 'Adoption of Common Seal', description: 'Adopt the common seal of the Company (if applicable) and authorise the Company Secretary or a Director to have custody of the seal.' },
      { order: 6, title: 'Approval of Preliminary Expenses', description: 'Ratify and approve expenses incurred by the promoters prior to and in connection with the incorporation of the Company.' },
      { order: 7, title: 'Appointment of Key Managerial Personnel', description: 'Consider appointment of Managing Director, Whole-Time Director, or other KMPs as applicable under Section 196.' },
      { order: 8, title: 'Fixing of Registered Office', description: 'Confirm the registered office address and authorise filing of INC-22 if applicable.' },
      { order: 9, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson.' },
    ],
  },
  {
    id: 'sys_quarterly_board',
    name: 'Quarterly Board Meeting',
    description: 'Standard quarterly board meeting agenda covering financial review, compliance update, and operational matters.',
    category: 'BOARD',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Confirmation of Previous Meeting Minutes', description: 'Read and confirm the minutes of the previous Board Meeting. Chairperson to sign the minutes.' },
      { order: 2, title: 'Financial Performance Review', description: 'Review of financial statements including P&L, Balance Sheet, and Cash Flow Statement for the quarter. Comparison against budget and prior period.' },
      { order: 3, title: 'Compliance and Secretarial Report', description: 'Company Secretary to present status of statutory compliances, pending filings, and any notices received from regulatory authorities.' },
      { order: 4, title: 'Business Operations Update', description: 'Management to present operational highlights, key metrics, strategic initiatives, and material developments since the last meeting.' },
      { order: 5, title: 'Related Party Transactions', description: 'Review and approval of any related party transactions under Section 188. Ensure compliance with arm\'s length pricing.' },
      { order: 6, title: 'Investment and Borrowings Update', description: 'Update on any borrowings, investments, or guarantees. Review against approved limits.' },
      { order: 7, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson.' },
    ],
  },
  {
    id: 'sys_agm',
    name: 'Annual General Meeting (AGM)',
    description: 'Annual General Meeting agenda covering all mandatory items under Section 102 of the Companies Act 2013.',
    category: 'AGM',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Adoption of Financial Statements', description: 'Ordinary Resolution — Adoption of the audited financial statements for the financial year, together with the reports of the Board of Directors and Auditors.' },
      { order: 2, title: 'Declaration of Dividend', description: 'Ordinary Resolution — Declaration of dividend on equity shares for the financial year, if recommended by the Board.' },
      { order: 3, title: 'Re-appointment of Director Retiring by Rotation', description: 'Ordinary Resolution — Re-appointment of Director who retires by rotation under Section 152(6) and being eligible offers himself for re-appointment.' },
      { order: 4, title: 'Appointment / Ratification of Statutory Auditor', description: 'Ordinary Resolution — Appointment or ratification of Statutory Auditor under Section 139 and fixing their remuneration.' },
      { order: 5, title: 'Special Business — Increase in Authorised Capital', description: 'Special Resolution (if applicable) — Increase in the Authorised Share Capital of the Company and amendment of the Memorandum of Association.' },
      { order: 6, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson, with prior intimation as required under the Act.' },
    ],
  },
  {
    id: 'sys_egm',
    name: 'Extraordinary General Meeting (EGM)',
    description: 'Extraordinary General Meeting for special business requiring shareholder approval outside the AGM cycle.',
    category: 'EGM',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Appointment of Chairperson for the Meeting', description: 'Elect a Chairperson to conduct the EGM proceedings in accordance with the Articles of Association and SS-2.' },
      { order: 2, title: 'Increase in Authorised Share Capital', description: 'Special Resolution — Increase the Authorised Share Capital of the Company. Consequential alteration of the Memorandum of Association under Section 61.' },
      { order: 3, title: 'Alteration of Articles of Association', description: 'Special Resolution — Alteration of the Articles of Association of the Company under Section 14 to reflect the capital structure change.' },
      { order: 4, title: 'Issue of Shares / Securities', description: 'Special Resolution — Authorise issuance of equity shares, preference shares, CCDs, or other securities under Section 62, including to specific investors.' },
      { order: 5, title: 'Approval of Material Related Party Transaction', description: 'Ordinary / Special Resolution — Approval of a material related party transaction under Section 188 read with applicable SEBI regulations.' },
      { order: 6, title: 'Any Other Special Business', description: 'Any other special business as specified in the notice of the EGM.' },
    ],
  },
  {
    id: 'sys_audit_committee',
    name: 'Audit Committee Meeting',
    description: 'Quarterly Audit Committee meeting covering financial oversight, internal audit review, and related party transactions.',
    category: 'COMMITTEE',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Review of Quarterly Financial Results', description: 'Review and recommend to the Board the quarterly financial results before publication. Examine accounting policies and estimates.' },
      { order: 2, title: 'Review of Internal Audit Report', description: 'Discussion of the internal audit report, significant findings, management responses, and follow-up on prior period observations.' },
      { order: 3, title: 'Review of Related Party Transactions', description: 'Review all related party transactions entered into during the quarter. Verify arm\'s length pricing and compliance with the policy.' },
      { order: 4, title: 'Auditor Observations and Management Representation', description: 'Discussion with Statutory Auditors on audit observations, qualifications, and management letters.' },
      { order: 5, title: 'Risk Management Update', description: 'Review of key risks identified by management and status of mitigation measures.' },
      { order: 6, title: 'Any Other Matter', description: 'Any other matter referred by the Board or raised by the auditors.' },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgendaDraft {
  id: string;
  title: string;
  description: string;
}

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
  const [previewTpl,   setPreviewTpl]   = useState<typeof SYSTEM_TEMPLATES[0] | MeetingTemplate | null>(null);
  const [editingTpl,   setEditingTpl]   = useState<MeetingTemplate | null>(null); // null = new template

  // Builder state
  const [bName,     setBName]     = useState('');
  const [bDesc,     setBDesc]     = useState('');
  const [bCategory, setBCategory] = useState('BOARD');
  const [bItems,    setBItems]    = useState<AgendaDraft[]>([{ id: uid(), title: '', description: '' }]);
  const [bSaving,   setBSaving]   = useState(false);
  const [bErr,      setBErr]      = useState('');

  const [filterCat, setFilterCat] = useState<string>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomTpls(await templatesApi.list(companyId, token)); }
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
      setBItems((tpl.agendaItems as any[]).map(a => ({ id: uid(), title: a.title, description: a.description ?? '' })));
    } else {
      setEditingTpl(null);
      setBName(''); setBDesc(''); setBCategory('BOARD');
      setBItems([{ id: uid(), title: '', description: '' }]);
    }
    setBErr('');
    setView('builder');
  }

  function openBuilderFromSystem(tpl: typeof SYSTEM_TEMPLATES[0]) {
    setEditingTpl(null);
    setBName(`${tpl.name} (Custom)`);
    setBDesc(tpl.description);
    setBCategory(tpl.category);
    setBItems(tpl.agendaItems.map(a => ({ id: uid(), title: a.title, description: a.description })));
    setBErr('');
    setView('builder');
  }

  function addItem() { setBItems(p => [...p, { id: uid(), title: '', description: '' }]); }
  function removeItem(id: string) { setBItems(p => p.length > 1 ? p.filter(a => a.id !== id) : p); }
  function updateItem(id: string, field: 'title' | 'description', val: string) {
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
        agendaItems: validItems.map((a, i) => ({ title: a.title.trim(), description: a.description.trim() || undefined, order: i + 1 })),
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
                  <input value={item.title} onChange={e => updateItem(item.id, 'title', e.target.value)}
                    placeholder="Agenda item title" style={{ ...inputStyle, fontSize: 13, fontWeight: 600, padding: '9px 12px' }} />
                  <textarea value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Description / notes for CS (optional)" rows={2}
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
