'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fetchMe, MeUser } from '@/lib/auth';
import { AppShell } from '@/app/components/shell';
import { Status, Icon, MetricCardsSkeleton } from '@/app/components/ui';
import { formatCurrency, relativeDays } from '@/lib/format';

interface DashboardOverview {
  cards: {
    todayRevenue: number;
    monthRevenue: number;
    todayOrders: number;
    averageTicket: number;
    activeCustomers: number;
    newCustomers: number;
    atRiskCustomers: number;
    inactiveCustomers: number;
    leads: number;
    vipCustomers: number;
    lowStockCount: number;
    lostSalesValue: number;
    openOpportunities: number;
    digitalOrders: number;
    activeAutomations: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byCity: Array<{ city: string | null; state: string; customers: number; revenue: number }>;
  lastOrders: Array<{
    id: string;
    number: number | null;
    customerName: string;
    total: number;
    status: string;
    source: string;
    createdAt: Date;
  }>;
}

interface Action {
  type: string;
  customerId: string;
  customerName: string;
  whatsapp: string | null;
  reason: string;
  priority: number;
  expectedValue: number | null;
}

const ACTION_LABELS: Record<string, string> = {
  RECOMPRA: 'RECOMPRA',
  REACTIVAR: 'REATIVAÇÃO',
  RECUPERAR_VENDA: 'VENDA PERDIDA',
  OFERTAR_RECOMENDACION: 'RECOMENDAÇÃO',
};

function sparkPoints(seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = i * 10.5;
    const noise = Math.abs(Math.sin(seed * 13.7 + i * 3.1) * 9);
    const y = 22 - ((seed * 7 + i * 11 + noise) % 18);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function Spark({ seed, tone = 'var(--success)' }: { seed: number; tone?: string }) {
  return (
    <svg className="metric-spark" width="64" height="26" viewBox="0 0 64 26">
      <polyline
        points={sparkPoints(seed > 0 ? seed : 42)}
        fill="none"
        stroke={tone}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  delta,
  context,
  seed,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  context: string;
  seed: number;
  tone?: 'up' | 'down' | 'flat';
}) {
  const dirClass = tone === 'down' ? 'delta-down' : tone === 'flat' ? '' : 'delta-up';
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value-row">
        <div className="metric-value num">{value}</div>
        <Spark seed={seed} tone={tone === 'down' ? 'var(--danger)' : 'var(--success)'} />
      </div>
      <div className="metric-delta">
        {tone !== 'flat' && <span className={dirClass}>{delta}</span>}
        <span className="delta-context">{context}</span>
      </div>
    </div>
  );
}

interface Attention {
  tag: string;
  toneClass: 'warning' | 'info' | 'danger' | 'neutral';
  title: string;
  desc: string;
  icon: string;
  action: string;
  target: string;
}

export function DashboardView() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [user, setUser] = useState<MeUser | null>(null);
  const [period, setPeriod] = useState('7d');
  const router = useRouter();

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      if (!u) return;
      void api<Record<string, unknown>>('/settings')
        .then((st) => {
          if (st['general.onboarded'] !== true && (u.role === 'ADMIN' || u.role === 'GESTOR')) {
            router.replace('/onboarding');
          }
        })
        .catch(() => {});
    });
    void api<DashboardOverview>('/dashboard/overview').then(setData);
    void api<Action[]>('/intelligence/actions?limit=6').then(setActions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
  const userName = user?.name?.split(' ')[0] ?? 'Daniel';

  if (!data) {
    return (
      <AppShell>
        <div className="page">
          <div className="page-title">
            <h1>{greeting}, {userName}</h1>
            <p>Aqui está o que precisa da sua atenção hoje.</p>
          </div>
          <div style={{ marginTop: 16 }}>
            <MetricCardsSkeleton count={4} />
          </div>
        </div>
      </AppShell>
    );
  }

  const c = data.cards;
  const monthShare = c.monthRevenue > 0 ? (c.todayRevenue / c.monthRevenue) * 100 : 0;
  const totalCustomers = data.byStatus.reduce((acc, s) => acc + s.count, 0);

  const attention: Attention[] = [];
  for (const a of actions.slice(0, 3)) {
    attention.push({
      tag: ACTION_LABELS[a.type] ?? a.type.replace('_', ' ').toUpperCase(),
      toneClass: a.type === 'RECUPERAR_VENDA' ? 'danger' : a.type === 'REACTIVAR' ? 'warning' : 'info',
      title: a.customerName,
      desc: a.reason,
      icon: a.type === 'RECUPERAR_VENDA' ? 'send' : 'activity',
      action: 'Atender',
      target: '/intelligence',
    });
  }
  const statusRisk = data.byStatus.find((s) => s.status === 'EM_RISCO');
  if (statusRisk && statusRisk.count > 0) {
    attention.push({
      tag: 'CLIENTE EM RISCO',
      toneClass: 'warning',
      title: `${statusRisk.count} clientes em risco`,
      desc: 'Há mais tempo sem comprar do que o habitual. Pronto para contato.',
      icon: 'bell',
      action: 'Contatar',
      target: '/customers',
    });
  }
  if (c.lowStockCount > 0) {
    attention.push({
      tag: 'ESTOQUE',
      toneClass: 'danger',
      title: `${c.lowStockCount} produtos críticos`,
      desc: 'Separe a reposição antes que afete as vendas.',
      icon: 'box',
      action: 'Repor',
      target: '/products',
    });
  }
  if (c.openOpportunities > 0) {
    attention.push({
      tag: 'NEGOCIAÇÃO',
      toneClass: 'info',
      title: `${c.openOpportunities} negociações em andamento`,
      desc: 'Priorize o contato para acelerar o fechamento.',
      icon: 'target',
      action: 'Ver',
      target: '/commission',
    });
  }

  const funnel = [
    { name: 'Leads', value: c.leads },
    { name: 'Oportunidades', value: c.openOpportunities },
    { name: 'Pedidos hoje', value: c.todayOrders },
  ];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);
  const oppConv = c.leads > 0 ? Math.round((c.openOpportunities / c.leads) * 100) : 0;
  const orderConv = c.openOpportunities > 0 ? Math.round((c.todayOrders / c.openOpportunities) * 100) : 0;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>{greeting}, {userName}</h1>
          <p>Aqui está o que precisa da sua atenção hoje.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Período">
          {[
            { id: '1d', label: 'Hoje' },
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: '90d', label: '90 dias' },
          ].map((p) => (
            <button key={p.id} className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <section className="metrics-row">
        <MetricCard
          label="Vendas hoje"
          value={formatCurrency(c.todayRevenue)}
          delta={`↑ ${monthShare.toFixed(0)}%`}
          context="do previsto no mês"
          seed={c.todayRevenue}
        />
        <MetricCard
          label="Vendas do mês"
          value={formatCurrency(c.monthRevenue)}
          delta={`Ticket médio ${formatCurrency(c.averageTicket)}`}
          context={`${c.todayOrders} pedidos hoje`}
          seed={c.monthRevenue}
        />
        <MetricCard
          label="Clientes ativos"
          value={`${c.activeCustomers}`}
          delta={`+${c.newCustomers} novos`}
          context={`${c.vipCustomers} VIP`}
          seed={c.activeCustomers}
        />
        <MetricCard
          label="Vendas recuperáveis"
          value={formatCurrency(c.lostSalesValue)}
          delta={`${c.openOpportunities} oportunidades`}
          context="em negociação"
          seed={c.lostSalesValue}
          tone="flat"
        />
      </section>

      <section className="metrics-row">
        <MetricCard
          label="Pedidos digitais"
          value={`${c.digitalOrders}`}
          delta="↑"
          context="WhatsApp · web · campanhas"
          seed={c.digitalOrders}
        />
        <MetricCard
          label="Leads"
          value={`${c.leads}`}
          delta="↑"
          context="aguardando avanço do funil"
          seed={c.leads}
        />
        <MetricCard
          label="Clientes em risco"
          value={`${c.atRiskCustomers}`}
          delta={`${c.inactiveCustomers} inativos`}
          context="priorize contato"
          seed={c.atRiskCustomers}
          tone="down"
        />
        <MetricCard
          label="Automações ativas"
          value={`${c.activeAutomations}`}
          delta="↺"
          context="fluxos no piloto automático"
          seed={c.activeAutomations}
          tone="flat"
        />
      </section>

      <section className="split-row" style={{ marginTop: 12 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>O que precisa de atenção</h2>
            <span className="count-tag">{attention.length} itens</span>
          </div>
          <div className="attn-list">
            {attention.length === 0 ? (
              <div className="empty">
                <div className="empty-title">Tudo sob controle</div>
                <p className="empty-body">Sem urgências pendentes. Continue assim.</p>
              </div>
            ) : (
              attention.map((a) => (
                <div className="attn-item" key={`${a.tag}-${a.title}`}>
                  <div className={`attn-icon ${a.toneClass}`}>
                    <Icon name={a.icon} size={16} />
                  </div>
                  <div className="attn-body">
                    <div className={`attn-tag ${a.toneClass}`}>{a.tag}</div>
                    <div className="attn-title">{a.title}</div>
                    <div className="attn-desc">{a.desc}</div>
                  </div>
                  <button className="attn-action" onClick={() => router.push(a.target)}>{a.action}</button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Funil comercial</h2>
            <span className="panel-link" onClick={() => router.push('/leads')}>Ver detalhes</span>
          </div>
          <div className="funnel-wrap">
            {funnel.map((f, i) => (
              <div key={f.name}>
                <div className="funnel-stage">
                  <div className="funnel-top-row">
                    <span className="funnel-name">{f.name}</span>
                    <span className="funnel-value num">{f.value}</span>
                  </div>
                  <div className="funnel-bar-track">
                    <div className="funnel-bar-fill" style={{ width: `${Math.max(6, (f.value / maxFunnel) * 100)}%` }} />
                  </div>
                </div>
                {i < funnel.length - 1 && (
                  <div className="funnel-conv">{i === 0 ? `${oppConv}% avançam para oportunidade` : `${orderConv}% avançam para pedido`}</div>
                )}
              </div>
            ))}
          </div>
          <div className="funnel-total">
            <span className="label">Base total de clientes</span>
            <span className="value num">{totalCustomers}</span>
          </div>
        </div>
      </section>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <h2>Últimos pedidos</h2>
          <span className="panel-link" onClick={() => router.push('/orders')}>Ver todos</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Origem</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {data.lastOrders.map((o) => (
                <tr key={o.id} onClick={() => router.push('/orders')}>
                  <td className="t-mono">{o.number ? `#${o.number}` : '—'}</td>
                  <td>{o.customerName}</td>
                  <td className="num">{formatCurrency(o.total)}</td>
                  <td><Status status={o.status} /></td>
                  <td className="f-caption t-muted">{o.source.replace('_', ' ').toLowerCase()}</td>
                  <td className="f-caption t-muted">{relativeDays(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}