'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { DataTable, Column } from '@/app/components/table';
import { Status, Drawer } from '@/app/components/ui';
import { Icon, Field, Button, Skeleton } from '@/app/components/ui';
import { formatCurrency, formatDateTime } from '@/lib/format';

interface OrderItem {
  product: { name: string; unit: string | null };
  quantity: number;
  unitPrice: number;
}

interface Order {
  id: string;
  number: number | null;
  customer: { name: string };
  customerId: string;
  source: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentTerm: string | null;
  salesperson: { name: string } | null;
  createdAt: string;
  items: OrderItem[];
}

interface ListResponse {
  data: Order[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export function OrdersView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    void api<ListResponse>(
      `/orders?page=${page}&perPage=20${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ''}`,
    ).then(setData);
  }, [page, statusFilter]);

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Pedido',
      sortable: true,
      render: (o) => <span className="t-mono">{o.number ? `#${o.number}` : '—'}</span>,
    },
    {
      key: 'customerId',
      header: 'Cliente',
      sortable: true,
      render: (o) => <span style={{ fontWeight: 600 }}>{o.customer.name}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      render: (o) => <span style={{ fontWeight: 600 }}>{formatCurrency(o.total)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (o) => <Status status={o.status} />,
    },
    {
      key: 'source',
      header: 'Origem',
      render: (o) => <span className="f-caption t-muted">{o.source.replace('_', ' ').toLowerCase()}</span>,
    },
    {
      key: 'salesperson',
      header: 'Responsável',
      render: (o) => <span className="f-small t-muted">{o.salesperson?.name ?? '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Data',
      sortable: true,
      render: (o) => <span className="f-small t-muted">{formatDateTime(o.createdAt)}</span>,
    },
  ];

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Pedidos</h1>
            <p>Acompanhe o status desde a criação até a faturação.</p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="plus" size={14} />
            Novo pedido
          </Button>
        </div>

        <Field label="" hint="">
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            <option value="ORCAMENTO">Orçamento</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="ENVIADO_ERP">Enviado ao ERP</option>
            <option value="FATURADO">Faturado</option>
            <option value="PARCIAL">Parcial</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="PROBLEMA">Problema</option>
          </select>
        </Field>

        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          <DataTable
            columns={columns}
            rows={data?.data}
            loading={!data}
            total={data?.meta.total}
            page={data?.meta.page}
            onPage={setPage}
            emptyTitle="Nenhum pedido encontrado"
            emptyBody="Crie um pedido ou ajuste os filtros."
            onRowClick={(o) => setSelected(o)}
          />
        </div>
      </div>

      <Drawer open={!!selected} title={selected?.number ? `Pedido #${selected.number}` : 'Pedido'} onClose={() => setSelected(null)}>
        {selected ? (
          <OrderDrawer order={selected} />
        ) : (
          <Skeleton rows={6} lines={2} />
        )}
      </Drawer>
    </AppShell>
  );
}

function OrderDrawer({ order }: { order: Order }) {
  return (
    <div className="stack">
      <div className="row">
        <Status status={order.status} />
        <span className="f-caption t-muted">{order.source.replace('_', ' ').toLowerCase()}</span>
      </div>

      <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)', gap: 'var(--space-6)' }}>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Total</div>
          <div className="f-h3">{formatCurrency(order.total)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Subtotal</div>
          <div className="f-h3">{formatCurrency(order.subtotal)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Cliente</div>
          <div className="f-h3">{order.customer.name}</div>
        </div>
      </div>

      <div className="f-label">Detalhes do pedido</div>
      <div className="f-small t-secondary">Responsável: {order.salesperson?.name ?? '—'}</div>
      <div className="f-small t-secondary">Condição de pagamento: {order.paymentTerm ?? '—'}</div>
      <div className="f-small t-secondary">Criado: {formatDateTime(order.createdAt)}</div>

      <div className="divider" />
      <div className="f-label">Produtos</div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Preço</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.product.name}>
                <td>{it.product.name}</td>
                <td>{it.quantity} {it.product.unit ?? ''}</td>
                <td>{formatCurrency(it.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}