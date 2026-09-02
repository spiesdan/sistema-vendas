'use client';

import { useEffect, useRef, useState } from 'react';
import { initials } from '@/lib/format';

/* =========================================================================
   Button
   =========================================================================
*/
export interface ButtonProps {
  variant?: 'default' | 'primary' | 'subtle' | 'danger';
  size?: 'default' | 'sm' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'default', size = 'default', onClick, disabled, children }: ButtonProps) {
  const cls = ['btn'];
  if (variant === 'primary') cls.push('btn-primary');
  if (variant === 'subtle') cls.push('btn-subtle');
  if (variant === 'danger') cls.push('btn-danger');
  if (size === 'sm') cls.push('btn-sm');
  if (size === 'lg') cls.push('btn-lg');
  return (
    <button className={cls.join(' ')} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* =========================================================================
   Icon (dependency-free inline SVG set)
   =========================================================================
*/
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M3 3h11v9h-11v-9zM7.5 7.5h2v1h-2v-1zM9 3h3v9h-3v-9z" />,
  orders: <path d="M3 4h5v9h-2v-4h2v-5zM8 4h5v9h-2v-4h2v-5zM13 3v7h4v2h-5v-6z" />,
  customers: <path d="M3.5 3.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 4.5 3a1.5 1.5 0 1 0 3 6a1.5 1.5 0 1 0 6 6zM3 4.5v3h3v-3z" />,
  leads: <path d="M6.5 4.5a2.5 2.5 0 1 1 6.5 4.5zM6.2 3.5v2h1.2v-1zM8 7.5v2h1.5v-2z" />,
  whatsapp: <path d="M5 4h6v7h-6v-7zM5 4h4.5l6.5 8.5z" />,
  activity: <path d="M4 4h8v1h-8v-1zM10 5v2h3v-1h-3z" />,
  search: <path d="M5.5 6l7 7l7.5 8zM7 7h5v1h-5v-1z" />,
  bell: <path d="M4 4h8v8h-8v-8zM7.5 4a1.5 1.5 0 1 1 8.5 5.5a.5 1.5 0 1 1 7.5 5.5z" />,
  globe: <path d="M4 3.5a3.5 3.5 0 1 1 7.5 4.5h3v5a1.5 1.75 0 1 1 8.5 8.5h-4v-5zM7.5 5.5h2v3h-2v-3z" />,
  sparkles: <path d="M4 5l8 7l10 5l9 3l6 4zM8 8l12 10l11 8l10 6z" />,
  clock: <path d="M4 4a4 4 0 1 1 7.5 7.5zM7.5 4.5v3.5zM8.5 7l1.5 1.5v-2z" />,
  box: <path d="M4 3.5h8v8h-8v-8zM4 3.5h4v2h-4v-2z" />,
  product: <path d="M4 3v10h8v-10zM8 3v7h2v-2h-2v-1z" />,
  settings: <path d="M4 4a3 3 0 1 1 7.5 7h3v6zM7.5 4.5a3 3 0 1 1 7.5 7.5z" />,
  chevronRight: <path d="M4.5 4.5l6.5 6.5l5 7.5z" />,
  chevronDown: <path d="M4.5 5.5l6.5 3.5l5 3z" />,
  x: <path d="M5 5l11 11l11 5l5 11z" />,
  check: <path d="M4 5l8 7l11 6l11 3.5l7.5 2.5z" />,
  plus: <path d="M4 3.5h8v1h-8v-1zM7.5 3.5v8z" />,
  user: <path d="M4 4a3 3 0 1 1 7.5 7h3v6zM7.5 4.5a3 3 0 1 1 7.5 7.5zM8.5 7h2v3h-2v-3z" />,
  mail: <path d="M4 4h8v6h-8v-6zM6 6v2zM7.5 4v3z" />,
  bill: <path d="M3 4v2h10v6zM4 6h8zM3 4v2h10z" />,
  target: <path d="M4.5 4.5a4 4 0 1 1 7.5 7.5zM6 4.5h3v2h-3v-2z" />,
  zap: <path d="M5 4l8 7l7 8l10 11l9 10z" />,
  send: <path d="M3 3l11 7l7 8l-11-5l-4 3l-3-13zM3 3l7 11z" />,
  card: <path d="M3 3.5h10v9h-10v-9zM3 6h10v1h-10v-1zM5.5 9h4v1h-4v-1z" />,
  team: <path d="M4.5 4.5a2.5 2.5 0 1 1 5 4.5h3v3a1.5 1.5 0 0 1-3 3v-1.5h-5v-1.5zM11.5 8a1.5 1.5 0 1 1 3 3z" />,
  map: <path d="M3 4l4.5-1.5L11.5 4 16 2.5v9.5l-4.5 1.5L5 12 3 13.5v-9.5zM6.5 3v9.5M11 4v9" />,
  sun: <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1M8 4.2a3.8 3.8 0 1 1 0 7.6a3.8 3.8 0 0 1 0-7.6Z" />,
  logout: <path d="M10 2.5V8M6.5 4.8A5 5 0 1 0 9.5 10" />,
  collapse: <path d="M3 3.5h10v9H3v-9zM13 3.5h2v9h-2zM6 5.5v5L9 8 6 5.5Z" />,
};

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps) {
  const body = ICONS[name];
  if (!body) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body}
    </svg>
  );
}

/* =========================================================================
   Card
   =========================================================================
*/
export function Card({ children, pad = false }: { children: React.ReactNode; pad?: boolean }) {
  return <section className={`card${pad ? ' card-pad' : ''}`}>{children}</section>;
}

/* =========================================================================
   MetricCard
   =========================================================================
*/
export interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="f-caption t-muted">{hint}</span>}
    </div>
  );
}

/* =========================================================================
   Badge
   =========================================================================
*/
export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai';
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className={`status-dot ${tone}`} />}
      {children}
    </span>
  );
}

/* =========================================================================
   Status (normalized tone -> badge)
   =========================================================================
*/
const STATUS_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai'> = {
  // Customer
  ATIVO: 'success',
  VIP: 'success',
  NOVO: 'info',
  OCASIONAL: 'neutral',
  EM_RISCO: 'warning',
  INATIVO: 'warning',
  PERDIDO: 'danger',
  LEAD: 'neutral',
  // Order
  FATURADO: 'success',
  ENVIADO_ERP: 'success',
  CONFIRMADO: 'success',
  PENDENTE: 'warning',
  ORCAMENTO: 'neutral',
  PARCIAL: 'info',
  CANCELADO: 'danger',
  PROBLEMA: 'danger',
  // Lead
  NEGOCIACAO: 'info',
  INTERESSADO: 'info',
  CONTATO: 'neutral',
  PRIMEIRO_PEDIDO: 'success',
  CLIENTE_ATIVO: 'success',
  PERDIDO_LEAD: 'danger',
};

export function statusBadgeTone(status: string): BadgeProps['tone'] {
  return STATUS_TONES[status] ?? 'neutral';
}

export function Status({ status }: { status: string }) {
  const tone = statusBadgeTone(status);
  const label = status.replace('_', ' ');
  return (
    <Badge tone={tone} dot>
      {label.toLowerCase()}
    </Badge>
  );
}

/* =========================================================================
   Avatar
   =========================================================================
*/
export interface AvatarProps {
  name: string;
  size?: 'sm' | 'default' | 'lg';
}

export function Avatar({ name, size = 'default' }: AvatarProps) {
  const cls = `avatar${size === 'sm' ? ' avatar-sm' : ''}${size === 'lg' ? ' avatar-lg' : ''}`;
  return (
    <span className={cls} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* =========================================================================
   Field / Input / Select
   =========================================================================
*/
export interface FieldProps {
  label?: string;
  children: React.ReactNode;
  hint?: string;
}

export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="field">
      {label && <span className="f-label">{label}</span>}
      {children}
      {hint && <span className="f-caption t-muted">{hint}</span>}
    </label>
  );
}

/* =========================================================================
   Tabs
   =========================================================================
*/
export interface TabsProps {
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
}

export function Tabs({ tabs, active, onSelect }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          className="tab"
          role="tab"
          aria-selected={t === active}
          onClick={() => onSelect(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
   Skeleton
   =========================================================================
*/
export interface SkeletonProps {
  rows?: number;
  lines?: number;
}

export function Skeleton({ rows = 6, lines = 1 }: SkeletonProps) {
  const items: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const row: React.ReactNode[] = [];
    for (let c = 0; c < lines; c++) {
      row.push(
        <span
          key={`${r}-${c}`}
          className="skeleton"
          style={{ width: `${40 + ((c * 17 + r * 13) % 45)}%` }}
        />,
      );
    }
    items.push(
      <div key={r} className="row" style={{ width: '100%' }}>
        {row}
      </div>,
    );
  }
  return (
    <div className="stack" aria-busy="true" aria-label="Carregando">
      {items}
    </div>
  );
}

/* =========================================================================
   MetricCardsSkeleton
   =========================================================================
*/
export function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  const items: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    items.push(
      <div key={i} className="metric">
        <span className="skeleton" style={{ width: '40%', height: 12 }} />
        <span className="skeleton" style={{ width: '60%', height: 20 }} />
        <span className="skeleton" style={{ width: '30%', height: 10 }} />
      </div>,
    );
  }
  return <div className="metric-grid">{items}</div>;
}

/* =========================================================================
   EmptyState
   =========================================================================
*/
export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onClick?: () => void };
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {body && <p className="empty-body">{body}</p>}
      {action && <Button variant="primary" onClick={action.onClick} size="sm">{action.label}</Button>}
    </div>
  );
}

/* =========================================================================
   Toast
   =========================================================================
*/
export interface ToastProps {
  message: string;
  tone?: 'success' | 'danger' | 'info';
}

export function Toast({ message, tone = 'info' }: ToastProps) {
  return (
    <div className="toast" role="status">
      <span className={`status-dot ${tone}`} />
      <span>{message}</span>
    </div>
  );
}

/* =========================================================================
   Drawer
   =========================================================================
*/
export interface DrawerProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Drawer({ open, title, onClose, children }: DrawerProps) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={title ?? 'Panel'}>
        <div className="drawer-header row">
          <span className="f-h3">{title}</span>
          <span className="spacer" />
          <Button variant="subtle" size="sm" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={14} />
          </Button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

/* =========================================================================
   Progress
   =========================================================================
*/
export interface ProgressProps {
  value: number; // 0-100
}

export function Progress({ value }: ProgressProps) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span />
    </div>
  );
}

/* =========================================================================
   Use Escape to close
   =========================================================================
*/
export function useEscape(handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}