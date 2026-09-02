'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { MetricCard, Badge, Button, Status, Skeleton, MetricCardsSkeleton, Icon } from '@/app/components/ui';
import { formatCurrency, relativeDays } from '@/lib/format';

interface Action {
  type: string;
  customerId: string;
  customerName: string;
  whatsapp: string | null;
  reason: string;
  priority: number;
  expectedValue: number | null;
  payload?: { recommendations?: number; lostSales?: number };
}

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

interface LostSale {
  id: string;
  customerId: string | null;
  customerName: string | null;
  reason: string;
  description: string | null;
  value: number | null;
  recovered: boolean;
  createdAt: string;
}

interface CopilotOverview {
  message?: string;
  atRisk: number;
  dueForReorder: number;
  openLostSales: number;
  recoverableValue: number;
  recoveredValue: number;
  leadsPending: number;
  openOpportunities: number;
  incomingForecast: number | null;
}

interface StoppedProduct {
  id: string;
  name: string;
  quantity: number;
}

interface AbandonedSale {
  customerId: string;
  customerName: string;
  whatsapp: string | null;
  cityId: string | null;
  formerMonthly: number;
  currentMonthly: number;
  dropPct: number;
  stoppedProducts: StoppedProduct[];
  lastPurchaseAt: Date | string | null;
}

const waLink = (phone: string | null, text: string) =>
  phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : '#';

const ACTION_LABELS: Record<string, string> = {
  RECOMPRA: 'Recompra',
  REACTIVAR: 'Reativar',
  RECUPERAR_VENDA: 'Recuperar venda',
  OFERTAR_RECOMENDACION: 'Oferecer recomendação',
};

export function IntelligenceView() {
  const router = useRouter();
  const [actions, setActions] = useState<Action[] | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [lostSales, setLostSales] = useState<LostSale[] | null>(null);
  const [overview, setOverview] = useState<CopilotOverview | null>(null);
  const [abandoned, setAbandoned] = useState<AbandonedSale[] | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = () => {
    void api<Action[]>('/intelligence/actions?limit=20').then(setActions);
    void api<Opportunity[]>('/intelligence/opportunities').then(setOpportunities);
    void api<LostSale[]>('/intelligence/lost-sales').then(setLostSales);
    void api<AbandonedSale[]>('/intelligence/abandoned').then(setAbandoned);
    void api<CopilotOverview>('/copilot/overview').then(setOverview).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const recompute = () => {
    setRecomputing(true);
    void api('/intelligence/recompute')
      .then(load)
      .finally(() => setRecomputing(false));
  };

  const loaded = actions !== null && opportunities !== null && lostSales !== null;

  if (!loaded) {
    return (
      <AppShell>
        <div className="page">
          <div className="page-title">
            <h1>Inteligência</h1>
            <p>Priorize as ações que geram mais rentabilidade hoje.</p>
          </div>
          <MetricCardsSkeleton count={4} />
          <Skeleton rows={6} lines={3} />
        </div>
      </AppShell>
    );
  }

  const actionTone = (type: string): 'success' | 'warning' | 'danger' | 'info' =>
    type === 'RECOMPRA' || type === 'OFERTAR_RECOMENDACION' ? 'success'
    : type === 'RECUPERAR_VENDA' ? 'danger'
    : 'warning';

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Inteligência</h1>
            <p>{overview?.message}</p>
          </div>
        </div>

        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <MetricCard
            label="Clientes por contactar"
            value={`${actions.length}`}
            hint="próximas ações recomendadas"
          />
          <MetricCard
            label="Em risco"
            value={`${overview?.atRisk ?? 0}`}
            hint="risco de inatividade"
          />
          <MetricCard
            label="Oportunidades"
            value={`${overview?.openOpportunities ?? opportunities.length}`}
            hint="abertas e em negociação"
          />
          <MetricCard
            label="Vendas recuperáveis"
            value={formatCurrency(overview?.recoverableValue ?? 0)}
            hint="valor de vendas perdidas"
          />
        </div>

        <div className="stack" style={{ marginTop: 'var(--space-8)' }}>
          <div className="row">
            <span className="f-h3">Deixando dinheiro na mesa</span>
            <span className="spacer" />
            <Button variant="subtle" size="sm" onClick={() => router.push('/customers')}>Ver clientes</Button>
          </div>
          <p className="f-caption t-muted">
            Clientes cujo consumo despencou em relação ao histórico — e os produtos que sumiram do carrinho deles.
          </p>
          {abandoned === null ? (
            <Skeleton rows={4} lines={2} />
          ) : abandoned.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Nenhum cliente desacelerou</div>
              <p className="empty-body">Quando alguém reduzir o ritmo de compras, aparecerá aqui para você agir antes de perder a conta.</p>
            </div>
          ) : (
            <div className="stack">
              {abandoned.map((s) => (
                <div key={s.customerId} className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                  <div className="row">
                    <div className="f-h3">{s.customerName}</div>
                    <span className="spacer" />
                    <Badge tone={s.dropPct >= 0.5 ? 'danger' : 'warning'} dot>
                      {Math.round(s.dropPct * 100)}% do ritmo
                    </Badge>
                  </div>
                  <div className="row" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-6)' }}>
                    <div className="f-small">
                      <span className="t-muted">comprava </span>
                      <strong>{formatCurrency(s.formerMonthly)}/mês</strong>
                    </div>
                    <div className="f-small">
                      <span className="t-muted">saiu para </span>
                      <strong className="t-danger">{formatCurrency(s.currentMonthly)}/mês</strong>
                      <span className="t-muted"> · {s.lastPurchaseAt ? `última compra ${relativeDays(s.lastPurchaseAt)}` : ''}</span>
                    </div>
                  </div>
                  {s.stoppedProducts.length > 0 && (
                    <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      <span className="f-caption t-muted">sumiram do mix:</span>
                      {s.stoppedProducts.map((p) => (
                        <Badge key={p.id} tone="neutral">{p.name}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="primary" size="sm" disabled={!s.whatsapp}
                      onClick={() => window.open(waLink(s.whatsapp, `Olá ${s.customerName}! Vi que o consumo caiu em relação ao histórico. Posso montar uma proposta personalizada para retomar o ritmo?`), '_blank')}>
                      <Icon name="whatsapp" size={14} />
                      Retomar contato
                    </Button>
                    {s.whatsapp && <span className="f-caption t-muted">{s.whatsapp}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack" style={{ marginTop: 'var(--space-8)' }}>
          <div className="f-h3">Ações de hoje</div>
          <div className="row">
            <span className="f-caption t-muted">Priorizadas por impacto financeiro</span>
            <span className="spacer" />
            <Button variant="subtle" size="sm" onClick={recompute} disabled={recomputing}>
              {recomputing ? 'Recalculando…' : 'Recalcular'}
            </Button>
          </div>

          {actions.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Sem ações pendentes</div>
              <p className="empty-body">Não há contatos urgentes recomendados neste momento.</p>
            </div>
          ) : (
            <div className="stack">
              {actions.map((a) => (
                <div key={`${a.customerId}-${a.type}`} className="card-row" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                  <div className="row">
                    <Badge tone={actionTone(a.type)} dot>{ACTION_LABELS[a.type] ?? a.type.replace('_', ' ').toLowerCase()}</Badge>
                    <span className="spacer" />
                    <span className="f-caption t-muted">
                      {a.expectedValue ? `potencial ${formatCurrency(a.expectedValue)}` : ''}
                    </span>
                  </div>
                  <div className="f-h3" style={{ marginTop: 'var(--space-2)' }}>{a.customerName}</div>
                  <div className="f-small t-secondary">{a.reason}</div>
                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="primary" size="sm" disabled={!a.whatsapp}
                      onClick={() => window.open(waLink(a.whatsapp, `Olá ${a.customerName}! ${a.reason}`), '_blank')}>
                      <Icon name="whatsapp" size={14} />
                      Contatar no WhatsApp
                    </Button>
                    {a.whatsapp && <span className="f-caption t-muted">{a.whatsapp}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack" style={{ marginTop: 'var(--space-8)' }}>
          <div className="f-h3">Oportunidades abertas</div>
          <div className="card" style={{ overflowX: 'auto' }}>
            {opportunities.length === 0 ? (
              <div className="empty">
                <div className="empty-title">Sem oportunidades abertas</div>
                <p className="empty-body">Quando seus clientes demonstrarem intenção de compra, elas aparecerão aqui.</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Oportunidade</th>
                    <th>Cliente</th>
                    <th>Valor</th>
                    <th>Estado</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.title}</td>
                      <td className="f-small">{o.customerName ?? '—'}</td>
                      <td>{o.value ? formatCurrency(o.value) : '—'}</td>
                      <td><Status status={o.status} /></td>
                      <td className="f-caption t-muted">{o.source ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="stack" style={{ marginTop: 'var(--space-8)' }}>
          <div className="f-h3">Vendas perdidas</div>
          <div className="card">
            {lostSales.length === 0 ? (
              <div className="empty">
                <div className="empty-title">Sem vendas perdidas</div>
                <p className="empty-body">As vendas que forem perdidas aparecerão aqui para recuperação.</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Motivo</th>
                    <th>Valor</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lostSales.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.customerName ?? '—'}</td>
                      <td className="f-small">{l.reason.replace('_', ' ').toLowerCase()}</td>
                      <td>{l.value ? formatCurrency(l.value) : '—'}</td>
                      <td>{l.recovered ? <Badge tone="success">Recuperada</Badge> : <Badge tone="danger">Pendente</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}