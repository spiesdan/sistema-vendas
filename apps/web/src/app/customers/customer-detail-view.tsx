'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/shell';
import { Badge, Status, Progress, MetricCardsSkeleton } from '@/app/components/ui';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, relativeDays } from '@/lib/format';

interface CustomerDetail {
  id: string;
  name: string;
  legalName?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  status: string;
  tier: string;
  score: number;
  city?: { name?: string | null; state?: string | null } | null;
  totalSpent: number;
  orderCount: number;
  averageTicket: number;
  purchaseFrequency: number;
  lastPurchaseAt: Date | null;
  expectedNextPurchaseAt: Date | null;
  intelligence?: { status: string; healthScore: number; expectedNextPurchaseAt: Date | null };
  topProducts?: Array<{ id: string; name: string; code: string; qty: number }>;
  orders?: Array<{
    id: string;
    number: number | null;
    status: string;
    total: number;
    createdAt: Date;
    items: Array<{ product: { name: string }; quantity: number }>;
  }>;
  recommendations?: Array<{
    id: string;
    type: string;
    reason?: string | null;
    confidence: number;
    status: string;
    product: { name: string; code: string };
  }>;
  conversations?: Array<{ id: string; status: string; lastMessageAt: Date | null }>;
}

const SPENT_LABELS: Record<string, string> = {
  LOW: 'Baixo ticket',
  MEDIUM: 'Médio ticket',
  HIGH: 'Alto ticket',
  VIP: 'VIP',
};

export function CustomerDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<CustomerDetail>(`/customers/${id}?analyze=true`)
      .then(setData)
      .catch(() => setError('Cliente não encontrado ou sem acesso.'));
  }, [id]);

  if (error) {
    return (
      <AppShell>
        <div className="panel" style={{ margin: '24px 32px' }}>
          <div className="empty">
            <div className="empty-title">{error}</div>
            <button className="btn btn-subtle" onClick={() => router.push('/customers')}>Voltar para clientes</button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="page">
          <div className="page-title">
            <h1>Cliente</h1>
            <p>Carregando perfil…</p>
          </div>
          <MetricCardsSkeleton count={4} />
        </div>
      </AppShell>
    );
  }

  const intel = data.intelligence;
  const health = intel?.healthScore ?? data.score ?? 0;
  const lastPurchase = data.lastPurchaseAt ?? null;
  const city = data.city?.name ? `${data.city.name}, ${data.city.state ?? ''}` : '—';

  return (
    <AppShell>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="avatar avatar-lg" style={{ width: 44, height: 44, fontSize: 15 }}>
            {(data.name || 'C').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h1 style={{ margin: 0 }}>{data.name}</h1>
              <Status status={data.status} />
              {data.tier === 'VIP' && <Badge tone="ai" dot>VIP</Badge>}
            </div>
            <div className="f-small t-muted" style={{ marginTop: 4 }}>
              {city} · {data.whatsapp ? `WhatsApp ${data.whatsapp}` : 'sem WhatsApp'} {data.document ? `· ${data.document}` : ''}
            </div>
            <div className="f-caption t-muted" style={{ marginTop: 2 }}>
              {SPENT_LABELS[data.tier] ?? data.tier} · Score de saúde {health}/100
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-subtle btn-sm" onClick={() => router.push('/map')}>Ver no mapa</button>
          <button className="btn btn-subtle btn-sm" onClick={() => router.push('/customers')}>Voltar</button>
        </div>
      </div>

      <section className="metrics-row">
        <div className="metric-card">
          <div className="metric-label">Receita total</div>
          <div className="metric-value-row">
            <div className="metric-value num">{formatCurrency(data.totalSpent)}</div>
          </div>
          <div className="metric-delta">
            <span className="delta-context">{data.orderCount} pedidos</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ticket médio</div>
          <div className="metric-value-row">
            <div className="metric-value num">{formatCurrency(data.averageTicket)}</div>
          </div>
          <div className="metric-delta">
            <span className="delta-context">por pedido</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Última compra</div>
          <div className="metric-value-row">
            <div className="metric-value" style={{ fontSize: 20 }}>
              {lastPurchase ? relativeDays(lastPurchase) : '—'}
            </div>
          </div>
          <div className="metric-delta">
            <span className="delta-context">{lastPurchase ? formatDate(lastPurchase) : 'nunca comprou'}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Próxima compra</div>
          <div className="metric-value-row">
            <div className="metric-value" style={{ fontSize: 20 }}>
              {data.expectedNextPurchaseAt ? relativeDays(data.expectedNextPurchaseAt) : '—'}
            </div>
          </div>
          <div className="metric-delta">
            <span className="delta-context">intervalo ~{data.purchaseFrequency || '—'} dias</span>
          </div>
        </div>
      </section>

      <section className="split-row" style={{ marginTop: 12 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Saúde do relacionamento</h2>
            <span className="count-tag">{intel?.status ?? data.status}</span>
          </div>
          <div style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="f-label">Health score</span>
              <span className="num" style={{ fontWeight: 700 }}>{health}/100</span>
            </div>
            <Progress value={health} />
            <p className="f-small t-secondary" style={{ marginTop: 12 }}>
              {health >= 70 ? 'Relação saudável. Mantenha o ritmo de contato.' :
               health >= 40 ? 'Sinais de desaceleração. Um contato proativo pode reverter.' :
               'Cliente em risco de churn. Priorize abordagem de recuperação.'}
            </p>
          </div>

          <div className="panel-head" style={{ borderTop: '1px solid var(--border)' }}>
            <h2>Produtos mais comprados</h2>
          </div>
          <div style={{ padding: '10px 18px' }}>
            {!data.topProducts || data.topProducts.length === 0 ? (
              <p className="f-caption t-muted" style={{ padding: '8px 0' }}>Sem compras registradas.</p>
            ) : (
              data.topProducts.map((p) => (
                <div key={p.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                  <span className="f-caption t-muted">{p.code}</span>
                  <span className="num f-small" style={{ marginLeft: 12, width: 48, textAlign: 'right' }}>{p.qty} un</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Recomendações</h2>
            </div>
            <div style={{ padding: '10px 18px' }}>
              {!data.recommendations || data.recommendations.length === 0 ? (
                <p className="f-caption t-muted" style={{ padding: '8px 0' }}>Nenhuma recomendação ativa.</p>
              ) : (
                data.recommendations.slice(0, 5).map((r) => (
                  <div key={r.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <Badge tone="ai">{r.type.replace('_', ' ').toLowerCase()}</Badge>
                    <span style={{ flex: 1, fontSize: 13 }}>{r.product.name}</span>
                    <span className="f-caption t-muted">{Math.round(r.confidence * 100)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Conversas recentes</h2>
            </div>
            <div style={{ padding: '10px 18px' }}>
              {!data.conversations || data.conversations.length === 0 ? (
                <p className="f-caption t-muted" style={{ padding: '8px 0' }}>Nenhuma conversa recente.</p>
              ) : (
                data.conversations.slice(0, 4).map((c) => (
                  <div key={c.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className={`status-dot ${c.status?.includes('HUMAN') ? 'success' : c.status === 'CLOSED' ? 'neutral' : 'info'}`} />
                    <span style={{ flex: 1, fontSize: 13 }}>{c.status?.replaceAll('_', ' ').toLowerCase()}</span>
                    <span className="f-caption t-muted">{c.lastMessageAt ? relativeDays(c.lastMessageAt) : '—'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <h2>Pedidos recentes</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {(data.orders ?? []).slice(0, 12).map((o) => (
                <tr key={o.id}>
                  <td className="t-mono">{o.number ? `#${o.number}` : '—'}</td>
                  <td className="f-caption t-muted">{o.items.length} linha(s)</td>
                  <td className="num">{formatCurrency(o.total)}</td>
                  <td><Status status={o.status} /></td>
                  <td className="f-caption t-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}