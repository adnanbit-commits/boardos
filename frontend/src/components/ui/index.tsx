// src/components/ui/index.tsx
// Shared primitives used by both the invite page and the meeting workspace.
// All styled with Tailwind utility classes — no extra deps needed.

import { cn } from '@/lib/utils';

// ── StatusBadge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft:         { label: 'Draft',       className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  scheduled:     { label: 'Scheduled',   className: 'bg-blue-950 text-blue-400 border-blue-800' },
  in_progress:   { label: 'In Progress', className: 'bg-green-950 text-green-400 border-green-800' },
  voting:        { label: 'Voting',      className: 'bg-amber-950 text-amber-400 border-amber-800' },
  minutes_draft: { label: 'Minutes',     className: 'bg-purple-950 text-purple-400 border-purple-800' },
  signed:        { label: 'Signed',      className: 'bg-green-950 text-green-400 border-green-800' },
  locked:        { label: 'Locked',      className: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
  proposed:      { label: 'Proposed',    className: 'bg-blue-950 text-blue-400 border-blue-800' },
  approved:      { label: 'Passed',      className: 'bg-green-950 text-green-400 border-green-800' },
  rejected:      { label: 'Rejected',    className: 'bg-red-950 text-red-400 border-red-800' },
  noted:         { label: 'Noted',       className: 'bg-zinc-800 text-zinc-300 border-zinc-600' },
  minutes_circulated: { label: 'Circulated', className: 'bg-purple-950 text-purple-400 border-purple-800' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status.toLowerCase()] ?? STATUS_MAP.draft;
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
      'tracking-wide uppercase border',
      s.className,
    )}>
      {s.label}
    </span>
  );
}

// ── VoteBar ───────────────────────────────────────────────────────────────────

interface VoteBarProps {
  approve: number;
  reject: number;
  abstain: number;
  total: number;
  showLabels?: boolean;
}

export function VoteBar({ approve, reject, abstain, total, showLabels = true }: VoteBarProps) {
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;

  return (
    <div className="w-full space-y-1.5">
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-zinc-800">
        <div
          className="bg-green-500 rounded-l-full transition-all duration-700"
          style={{ width: `${pct(approve)}%` }}
        />
        <div
          className="bg-amber-500 transition-all duration-700"
          style={{ width: `${pct(abstain)}%` }}
        />
        <div
          className="bg-red-500 rounded-r-full transition-all duration-700"
          style={{ width: `${pct(reject)}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex gap-4 text-[11px]">
          <span className="text-green-500">✓ {approve} Approve</span>
          <span className="text-red-400">✕ {reject} Reject</span>
          <span className="text-amber-400">— {abstain} Abstain</span>
          <span className="text-zinc-600 ml-auto">{total - approve - reject - abstain} pending</span>
        </div>
      )}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className={cn(
      'rounded-full bg-blue-950 border border-blue-800/50 text-blue-400 font-bold',
      'flex items-center justify-center flex-shrink-0',
      size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs',
    )}>
      {initials}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn(
      'w-5 h-5 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin',
      className,
    )} />
  );
}

// ── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    ghost:   'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200',
    danger:  'bg-red-950 hover:bg-red-900 text-red-400 border border-red-800',
    outline: 'bg-transparent border border-zinc-700 hover:border-zinc-500 text-zinc-300',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'bg-[#191D24] border border-[#232830] rounded-2xl',
      className,
    )}>
      {children}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full bg-[#13161B] border border-[#232830] rounded-lg px-3.5 py-2.5',
        'text-sm text-zinc-200 placeholder:text-zinc-600',
        'focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/30',
        'transition-colors',
        className,
      )}
      {...props}
    />
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full bg-[#13161B] border border-[#232830] rounded-lg px-3.5 py-2.5',
        'text-sm text-zinc-200 placeholder:text-zinc-600',
        'focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/30',
        'resize-none transition-colors',
        className,
      )}
      {...props}
    />
  );
}
