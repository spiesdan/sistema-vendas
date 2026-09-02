'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Badge, Button, Icon, Status, Skeleton, Drawer } from '@/app/components/ui';
import { formatCurrency, relativeDays } from '@/lib/format';

interface Opportunity {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
  value: number | null;
  status: string;
  source: string | null;
  createdAt: string;
}

const STAGES = ['ABERTA', 'EM_NEGOCIACAO', 'GANHA', 'PERDIDA', 'PARADA'];
const STAGE_LABELS: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_NEGOCIACAO: 'Em negociação',
  GANHA: 'Ganha',
  PERDIDA: 'Perdida',
  PARADA: 'Parada',
};

export function CommissionView() {
  const [data, setData] = useState<Opportunity[] | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  useEffect(() => {
    void api<Opportunity[]>('/intelligence/opportunities').then(setData);
  }, []);

  if (!data) {
    return (
      <AppShell>
        <div className="page">
          <div className="page-title">
            <h1>Oportunidades</h1>
            <p>Pipeline comercial em andamento.</p>
          </div>
          <Skeleton rows={8} lines={3} />
        </div>
      </AppShell>
    );
  }

  const totalValue = data.reduce((s, o) => s + (o.value ?? 0), 0);
  const buckets = STAGES.map((stage) => ({
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    items: data.filter((o) => o.status === stage),
  }));

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Oportunidades</h1>
            <p>
              {formatCurrency(totalValue)} em valor potencial · {data.length} oportunidades abertas
            </p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="plus" size={14} />
            Nova oportunidade
          </Button>
        </div>

        <div className="stack">
          {buckets.map((b) => (
            <div key={b.stage}>
              <div className="row">
                <span className="f-h3">{b.stageLabel}</span>
                <Badge tone={b.items.length > 0 ? 'info' : 'neutral'}>{b.items.length}</Badge>
                {b.items.reduce((s, o) => s + (o.value ?? 0), 0) > 0 && (
                  <span className="f-small t-muted">
                    {formatCurrency(b.items.reduce((s, o) => s + (o.value ?? 0), 0))}
                  </span>
                )}
              </div>
              <div className="card" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Oportunidade</th>
                      <th>Cliente</th>
                      <th>Valor</th>
                      <th>Fonte</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="f-small t-muted" style={{ padding: 'var(--space-4)' }}>
                          Sem oportunidades nesta etapa.
                        </td>
                      </tr>
                    ) : (
                      b.items.map((o) => (
                        <tr key={o.id} onClick={() => setSelected(o)} tabIndex={0}>
                          <td style={{ fontWeight: 600 }}>{o.title}</td>
                          <td className="f-small">{o.customerName ?? '—'}</td>
                          <td>{o.value ? formatCurrency(o.value) : '—'}</td>
                          <td className="f-caption t-muted">{o.source ?? '—'}</td>
                          <td className="f-caption t-muted">{relativeDays(o.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Drawer open={!!selected} title={selected?.title} onClose={() => setSelected(null)}>
        {selected && (
          <div className="stack">
            <Status status={selected.status} />
            <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)', gap: 'var(--space-6)' }}>
              <div style={{ flex: 1 }}>
                <div className="metric-label">Valor</div>
                <div className="f-h3">{selected.value ? formatCurrency(selected.value) : '—'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="metric-label">Cliente</div>
                <div className="f-h3">{selected.customerName ?? '—'}</div>
              </div>
            </div>
            <div className="f-label">Detalhes</div>
            <div className="f-small t-secondary">Fonte: {selected.source ?? '—'}</div>
            <div className="f-small t-secondary">Criada: {relativeDays(selected.createdAt)}</div>
            <div className="divider" />
            <Button variant="primary" size="sm" onClick={() => {}}>Gerenciar</Button>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}