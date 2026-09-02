'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Badge, Button, Icon, Drawer, Skeleton } from '@/app/components/ui';
import { MetricCardsSkeleton } from '@/app/components/ui';
import { formatDateTime } from '@/lib/format';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  enabled: boolean;
  createdAt: string;
}

interface AutomationDetail extends Automation {
  executions?: Array<{
    id: string;
    status: string;
    customerId: string | null;
    triggerContext: Record<string, unknown> | null;
    result: string | null;
    error: string | null;
    triggeredAt: string;
    finishedAt: string | null;
  }>;
}

interface ListResponse {
  data: Automation[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const TYPE_LABELS: Record<string, string> = {
  REPOSICAO: 'Reposição',
  INATIVOS: 'Cliente inativo',
  QUEDA_CONSUMO: 'Queda de consumo',
  RECUPERACION: 'Recuperação de venda',
  CROSS_SELL: 'Cross-sell',
  LEAD_NURTURE: 'Nurture de leads',
  CUSTOM: 'Personalizado',
};

const EXEC_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  RUNNING: 'Em andamento',
  SUCCESS: 'Sucesso',
  FAILED: 'Falhou',
  SKIPPED: 'Ignorado',
};

export function AutomationsView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<AutomationDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<ListResponse>('/automation?perPage=50')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'));
  }, []);

  useEffect(() => {
    if (!selected?.id) return;
    setSelectedLoading(true);
    void api<AutomationDetail>(`/automation/${selected.id}`)
      .then((detail) => setSelected(detail))
      .catch(() => {})
      .finally(() => setSelectedLoading(false));
  }, [selected?.id]);

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Automatizações</h1>
            <p>Workflows que recuperam clientes e disparam ações sem atrito.</p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="plus" size={14} />
            Nova automatização
          </Button>
        </div>

        {error ? (
          <div className="empty">
            <div className="empty-title">Não foi possível carregar</div>
            <p className="empty-body">{error}. Seu perfil pode não ter acesso a automatizações.</p>
          </div>
        ) : !data ? (
          <MetricCardsSkeleton count={3} />
        ) : data.data.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Sem automatizações</div>
            <p className="empty-body">Crie seu primeiro workflow de recompra, reativação ou recuperação.</p>
          </div>
        ) : (
          <div className="stack">
            {data.data.map((a) => (
              <div
                key={a.id}
                className="card"
                style={{ padding: 'var(--space-4) var(--space-5)', cursor: 'pointer' }}
                onClick={() => setSelected(a)}
                role="button"
                tabIndex={0}
              >
                <div className="row">
                  <Badge tone={a.enabled ? 'success' : 'neutral'} dot>
                    {a.enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <span className="spacer" />
                  <span className="f-caption t-muted">{a.type.replace('_', ' ').toLowerCase()}</span>
                </div>
                <div className="f-h3" style={{ marginTop: 'var(--space-2)' }}>{a.name}</div>
                {a.description && <div className="f-small t-secondary">{a.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={!!selected} title={selected?.name} onClose={() => setSelected(null)}>
        {selectedLoading ? (
          <Skeleton rows={6} lines={2} />
        ) : selected && (
          <div className="stack">
            <div className="row">
              <Badge tone={selected.enabled ? 'success' : 'neutral'} dot>
                {selected.enabled ? 'Ativo' : 'Inativo'}
              </Badge>
              <span className="f-caption t-muted">{selected.status}</span>
            </div>
            <div className="f-label">Tipo</div>
            <div className="f-small t-secondary">{TYPE_LABELS[selected.type] ?? selected.type}</div>
            {selected.description && (
              <>
                <div className="f-label">Descrição</div>
                <p className="f-small t-secondary">{selected.description}</p>
              </>
            )}
            <div className="divider" />
            <div className="f-label">Últimas execuções</div>
            {!selected.executions || selected.executions.length === 0 ? (
              <p className="f-small t-muted">Nenhuma execução registrada ainda.</p>
            ) : (
              <div className="stack">
                {selected.executions.map((ex) => (
                  <div key={ex.id} className="card-row" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <div className="row">
                      <Badge tone={ex.status === 'SUCCESS' ? 'success' : ex.status === 'FAILED' ? 'danger' : 'neutral'}>
                        {EXEC_STATUS_LABELS[ex.status] ?? ex.status}
                      </Badge>
                      <span className="spacer" />
                      <span className="f-caption t-muted">{formatDateTime(ex.triggeredAt)}</span>
                    </div>
                    {ex.error && <div className="f-small t-danger">{ex.error}</div>}
                    {ex.result && <div className="f-caption t-muted">{ex.result}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="divider" />
            <div className="f-label">Ações</div>
            <Button variant="primary" size="sm" onClick={() => {}}>Abrir no n8n</Button>
            <Button variant="subtle" size="sm" onClick={() => {}}>Executar agora</Button>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}