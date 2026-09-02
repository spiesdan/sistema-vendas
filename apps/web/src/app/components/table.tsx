'use client';

import { useState } from 'react';
import { Button, Skeleton } from './ui';
import { Icon } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T extends { id: string | number }> {
  columns: Column<T>[];
  rows?: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  onRowClick?: (row: T) => void;
  total?: number;
  page?: number;
  onPage?: (page: number) => void;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading,
  emptyTitle,
  emptyBody,
  onRowClick,
  total,
  page,
  onPage,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const clickCol = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const visible = rows ?? [];
  const sorted = sortKey ? [...visible].sort((a, b) => {
    const ca = String(a[sortKey as keyof T] ?? '');
    const cb = String(b[sortKey as keyof T] ?? '');
    return (ca < cb ? -1 : ca > cb ? 1 : 0) * sortDir;
  }) : visible;

  const totalPages = total ? Math.max(1, Math.ceil(total / 20)) : 1;
  const pageNum = page ?? 1;

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      {loading ? (
        <Skeleton rows={6} lines={4} />
      ) : sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-title">{emptyTitle ?? 'Sem resultados'}</div>
          {emptyBody && <p className="empty-body">{emptyBody}</p>}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  {c.sortable ? (
                    <button
                      className="tab"
                      onClick={() => clickCol(c.key)}
                      aria-label={`Ordenar por ${c.header}`}
                    >
                      {c.header}
                      {sortKey === c.key && (
                        <Icon name={sortDir === 1 ? 'chevronDown' : 'chevronRight'} size={12} />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={String(row.id)}
                onClick={() => onRowClick && onRowClick(row)}
                role="button"
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total && totalPages > 1 && (
        <div className="row" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <span className="f-caption t-muted">
            Página {pageNum} de {totalPages} · {total} registros
          </span>
          <span className="spacer" />
          <Button variant="subtle" size="sm" disabled={pageNum <= 1} onClick={() => onPage && onPage(pageNum - 1)}>
            Anterior
          </Button>
          <Button variant="subtle" size="sm" disabled={pageNum >= totalPages} onClick={() => onPage && onPage(pageNum + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}