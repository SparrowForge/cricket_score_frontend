'use client';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-mut">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-grass" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card px-6 py-12 text-center text-sm text-mut">{children}</div>;
}

export function ErrorBox({ error }: { error: { message?: string } | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-cherry/40 bg-cherry/10 px-4 py-3 text-sm text-cherry">
      {error.message ?? 'Something went wrong'}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const live = ['live', 'innings_break', 'rain_delay', 'toss'].includes(status);
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
      live ? 'bg-cherry/15 text-cherry' : status === 'completed' ? 'bg-grass/15 text-grass' : 'bg-panel-2 text-mut'
    }`}>
      {live && <span className="live-dot" />}
      {label}
    </span>
  );
}

export function BallChip({ label }: { label: string }) {
  const cls = label === 'W' ? 'ball-chip-w'
    : label === '4' ? 'ball-chip-4'
    : label === '6' ? 'ball-chip-6'
    : label === '0' ? 'ball-chip-0'
    : /wd|nb/.test(label) ? 'ball-chip-x'
    : '';
  return <span className={`ball-chip ${cls}`}>{label}</span>;
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`tab ${active === t.key ? 'tab-active' : ''}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }: {
  title: string; onClose?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          {onClose && <button onClick={onClose} className="text-mut hover:text-ink">✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Destructive-action confirmation dialog. */
export function Confirm({ title, message, confirmLabel = 'Delete', danger = true, busy, error, onConfirm, onClose }: {
  title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean;
  busy?: boolean; error?: { message?: string } | null; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-mut">{message}</div>
        <ErrorBox error={error ?? null} />
        <div className="flex gap-2">
          <button className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`} disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

/** Small pencil/trash icon button for inline row actions. */
export function IconButton({ title, onClick, variant = 'ghost', children }: {
  title: string; onClick: () => void; variant?: 'ghost' | 'danger'; children: React.ReactNode;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        variant === 'danger' ? 'text-cherry hover:bg-cherry/10' : 'text-mut hover:bg-panel-2 hover:text-ink'
      }`}>
      {children}
    </button>
  );
}
