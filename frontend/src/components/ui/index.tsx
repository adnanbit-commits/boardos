// src/components/ui/index.tsx
// Shared primitives — warm-light palette (stone/ink/crimson/gold)

import { cn } from '@/lib/utils';

// ── Design tokens ─────────────────────────────────────────────────────────────
export const T = {
  stone:      '#F5F2EE',
  stoneMid:   '#EBE6DF',
  rule:       '#E0DAD2',
  white:      '#FDFCFB',
  ink:        '#231F1B',
  inkMid:     '#5C5750',
  inkMute:    '#96908A',
  crimson:    '#8B1A1A',
  crimsonMid: '#A52020',
  crimsonBg:  'rgba(139,26,26,0.08)',
  crimsonBdr: 'rgba(139,26,26,0.22)',
  crimsonText:'#8B1A1A',
  gold:       '#C4973A',
  goldBg:     'rgba(196,151,58,0.09)',
  goldBdr:    'rgba(196,151,58,0.22)',
  goldText:   '#7A5C18',
  charcoal:   '#1C1A18',
};

// ── StatusBadge ───────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; bg: string; bdr: string }> = {
  draft:              { label: 'Draft',        color: T.inkMute,    bg: T.stoneMid,  bdr: T.rule },
  scheduled:          { label: 'Scheduled',    color: '#1D4ED8',    bg: '#EFF6FF',   bdr: '#BFDBFE' },
  in_progress:        { label: 'In Progress',  color: '#166534',    bg: '#F0FDF4',   bdr: '#86EFAC' },
  voting:             { label: 'Voting',       color: '#92400E',    bg: '#FFFBEB',   bdr: '#FCD34D' },
  minutes_draft:      { label: 'Minutes',      color: '#6B21A8',    bg: '#FAF5FF',   bdr: '#D8B4FE' },
  minutes_circulated: { label: 'Circulated',   color: '#6B21A8',    bg: '#FAF5FF',   bdr: '#D8B4FE' },
  signed:             { label: 'Signed',       color: '#166534',    bg: '#F0FDF4',   bdr: '#86EFAC' },
  locked:             { label: 'Locked',       color: T.inkMid,     bg: T.stoneMid,  bdr: T.rule },
  proposed:           { label: 'Proposed',     color: '#1D4ED8',    bg: '#EFF6FF',   bdr: '#BFDBFE' },
  approved:           { label: 'Passed',       color: '#166534',    bg: '#F0FDF4',   bdr: '#86EFAC' },
  rejected:           { label: 'Rejected',     color: T.crimson,    bg: T.crimsonBg, bdr: T.crimsonBdr },
  noted:              { label: 'Noted',        color: T.inkMid,     bg: T.stoneMid,  bdr: T.rule },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status.toLowerCase()] ?? STATUS_MAP.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.bdr}`,
    }}>
      {s.label}
    </span>
  );
}

// ── VoteBar ───────────────────────────────────────────────────────────────────
interface VoteBarProps { approve: number; reject: number; abstain: number; total: number; showLabels?: boolean; }

export function VoteBar({ approve, reject, abstain, total, showLabels = true }: VoteBarProps) {
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: T.stoneMid, gap: 1 }}>
        <div style={{ width: `${pct(approve)}%`, background: '#16A34A', transition: 'width 0.7s' }} />
        <div style={{ width: `${pct(abstain)}%`, background: T.gold, transition: 'width 0.7s' }} />
        <div style={{ width: `${pct(reject)}%`,  background: T.crimson, transition: 'width 0.7s' }} />
      </div>
      {showLabels && (
        <div style={{ display: 'flex', gap: 16, fontSize: 11, marginTop: 6 }}>
          <span style={{ color: '#16A34A', fontWeight: 600 }}>✓ {approve} Approve</span>
          <span style={{ color: T.crimson, fontWeight: 600 }}>✕ {reject} Reject</span>
          <span style={{ color: T.gold, fontWeight: 600 }}>— {abstain} Abstain</span>
          <span style={{ color: T.inkMute, marginLeft: 'auto' }}>{total - approve - reject - abstain} pending</span>
        </div>
      )}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dim = size === 'sm' ? 28 : 36;
  return (
    <div style={{ width: dim, height: dim, borderRadius: '50%', background: T.goldBg, border: `1px solid ${T.goldBdr}`, color: T.goldText, fontWeight: 700, fontSize: size === 'sm' ? 10 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <div style={{ width: 18, height: 18, border: `2px solid ${T.rule}`, borderTopColor: T.crimson, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
      className={className} />
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, style, disabled, ...props }: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.55 : 1, border: 'none', transition: 'all 0.15s',
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
    fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? '6px 14px' : '9px 18px',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: T.crimson, color: '#fff' },
    ghost:   { background: 'transparent', color: T.inkMid, border: `1px solid ${T.rule}` },
    danger:  { background: T.crimsonBg, color: T.crimson, border: `1px solid ${T.crimsonBdr}` },
    outline: { background: 'transparent', border: `1px solid ${T.rule}`, color: T.inkMid },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: 12 }} className={className}>
      {children}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ className, style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{ width: '100%', background: T.white, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '9px 13px', fontSize: 13, color: T.ink, outline: 'none', fontFamily: "'Instrument Sans', system-ui, sans-serif", ...style }}
      className={className}
      {...props}
    />
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export function Textarea({ className, style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ width: '100%', background: T.white, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '9px 13px', fontSize: 13, color: T.ink, outline: 'none', resize: 'vertical', fontFamily: "'Instrument Sans', system-ui, sans-serif", ...style }}
      className={className}
      {...props}
    />
  );
}
