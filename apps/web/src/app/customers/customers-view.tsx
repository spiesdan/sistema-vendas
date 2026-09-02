'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { DataTable, Column } from '@/app/components/table';
import { Status, Badge } from '@/app/components/ui';
import { Field, Button, Icon, Drawer, Tabs, Skeleton } from '@/app/components/ui';
import { formatCurrency, formatDate, relativeDays } from '@/lib/format';

interface Customer {
  id: string;
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  status: string;
  tier: string;
  totalSpent: number;
  averageTicket: number;
  purchaseFrequency: number;
  orderCount: number;
  lastPurchaseAt: string | null;
  firstPurchaseAt: string | null;
  churnRisk: number;
  created: string;
  city: { name: string; state: string; region: { name: string } | null } | null;
  salesperson: { name: string } | null;
}

interface ListResponse {
  data: Customer[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const TIER_LABELS: Record<string, string> = {
  LOW: 'Baixo',
  MEDIUM: 'Médio',
  HIGH: 'Alto',
  VIP: 'VIP',
};

function riskLabel(c: Customer): string {
  if (c.churnRisk >= 0.7) return 'Alto';
  if (c.churnRisk >= 0.4) return 'Médio';
  return 'Baixo';
}

export function CustomersView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Customer | null>(null);

  useEffect(() => {
    void api<ListResponse>(
      `/customers?page=${page}&perPage=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    ).then(setData);
  }, [page, search]);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      sortable: true,
      render: (c) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{c.name}</span>
          {c.legalName && c.legalName !== c.name && (
            <span className="f-caption t-muted">{c.legalName}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (c) => <Status status={c.status} />,
    },
    {
      key: 'tier',
      header: 'Classe',
      render: (c) => (
        <Badge tone={c.tier === 'VIP' ? 'success' : c.tier === 'HIGH' ? 'info' : 'neutral'}>
          {TIER_LABELS[c.tier] ?? c.tier}
        </Badge>
      ),
    },
    {
      key: 'lastPurchaseAt',
      header: 'Última compra',
      sortable: true,
      render: (c) => (
        <span className="f-small t-secondary">
          {c.lastPurchaseAt ? relativeDays(c.lastPurchaseAt) : 'Sem compras'}
        </span>
      ),
    },
    {
      key: 'averageTicket',
      header: 'Ticket médio',
      sortable: true,
      render: (c) => <span className="f-small">{formatCurrency(c.averageTicket)}</span>,
    },
    {
      key: 'purchaseFrequency',
      header: 'Frequência',
      sortable: true,
      render: (c) => (
        <span className="f-small t-secondary">
          {c.purchaseFrequency > 0 ? `cada ${c.purchaseFrequency} dias` : '—'}
        </span>
      ),
    },
    {
      key: 'churnRisk',
      header: 'Risco',
      sortable: true,
      render: (c) => (
        <Badge tone={c.churnRisk >= 0.7 ? 'danger' : c.churnRisk >= 0.4 ? 'warning' : 'success'}>
          {riskLabel(c)}
        </Badge>
      ),
    },
    {
      key: 'salesperson',
      header: 'Responsável',
      render: (c) => (
        <span className="f-small t-muted">
          {c.salesperson?.name ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Clientes</h1>
            <p>Gerencie a carteira, priorize o contato e entenda o risco.</p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="plus" size={14} />
            Novo cliente
          </Button>
        </div>

        <Field label="" hint="">
          <input
            className="input"
            placeholder="Buscar por nome, documento ou WhatsApp…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%', maxWidth: 360 }}
          />
        </Field>

        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          <DataTable
            columns={columns}
            rows={data?.data}
            loading={!data}
            total={data?.meta.total}
            page={data?.meta.page}
            onPage={setPage}
            emptyTitle="Nenhum cliente encontrado"
            emptyBody="Tente outra busca ou crie o primeiro cliente."
            onRowClick={(c) => setSelected(c)}
          />
        </div>
      </div>

      <Drawer open={!!selected} title={selected?.name} onClose={() => setSelected(null)}>
        {selected ? (
          <CustomerDrawer customer={selected} />
        ) : (
          <Skeleton rows={6} lines={2} />
        )}
      </Drawer>
    </AppShell>
  );
}

function CustomerDrawer({ customer }: { customer: Customer }) {
  const [tab, setTab] = useState('Visão geral');

  return (
    <div className="stack">
      <div className="row">
        <span className="avatar avatar-lg" aria-hidden="true">
          {customer.name.slice(0, 2).toUpperCase()}
        </span>
        <div style={{ flex: 1 }}>
          <div className="f-h2" style={{ margin: 0 }}>{customer.name}</div>
          <div className="f-caption t-muted">
            {customer.city ? `${customer.city.name}, ${customer.city.state}` : 'Sem cidade'}
            {customer.whatsapp ? ` · ${customer.whatsapp}` : ''}
          </div>
        </div>
      </div>

      <div className="row">
        <Status status={customer.status} />
        {customer.tier === 'VIP' && <Badge tone="success">VIP</Badge>}
      </div>

      <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)', gap: 'var(--space-6)' }}>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Ticket médio</div>
          <div className="f-h3">{formatCurrency(customer.averageTicket)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Frequência</div>
          <div className="f-h3">
            {customer.purchaseFrequency > 0 ? `cada ${customer.purchaseFrequency} dias` : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Última compra</div>
          <div className="f-h3">{customer.lastPurchaseAt ? relativeDays(customer.lastPurchaseAt) : '—'}</div>
        </div>
      </div>

      <Tabs
        tabs={['Visão geral', 'Compras', 'Inteligência']}
        active={tab}
        onSelect={setTab}
      />

      {tab === 'Visão geral' && (
        <div className="stack">
          <div className="f-label">Dados</div>
          <div className="f-small t-secondary">WhatsApp: {customer.whatsapp ?? '—'}</div>
          <div className="f-small t-secondary">Telefone: {customer.phone ?? '—'}</div>
          <div className="f-small t-secondary">E-mail: {customer.email ?? '—'}</div>
          <div className="f-small t-secondary">Documento: {customer.document ?? '—'}</div>
          <div className="f-small t-secondary">Total gasto: {formatCurrency(customer.totalSpent)}</div>
          <div className="f-small t-secondary">Pedidos: {customer.orderCount}</div>
          <div className="divider" />
          <div className="f-label">Inteligência</div>
          <div className="f-small t-secondary">Risco de churn: <b>{riskLabel(customer)}</b> ({Math.round(customer.churnRisk * 100)}%)</div>
        </div>
      )}

      {tab === 'Inteligência' && (
        <div className="col">
          <p className="f-small t-secondary">
            Recomendação baseada em frequência de compra, ticket e atividade recente.
          </p>
          <Button variant="primary" size="sm" onClick={() => {}}>Recomendar contato</Button>
        </div>
      )}
    </div>
  );
}