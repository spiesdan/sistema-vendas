'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { DataTable, Column } from '@/app/components/table';
import { MetricCard, Drawer, Badge, Button, Icon, Skeleton } from '@/app/components/ui';
import { Field } from '@/app/components/ui';
import { formatCurrency } from '@/lib/format';

interface StockRow {
  id: string;
  quantity: number;
  warehouse: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string | null;
  packaging: string | null;
  active: boolean;
  category: { id: string; name: string } | null;
  prices: Array<{ value: number; active: boolean }>;
  stocks: StockRow[];
}

interface ListResponse {
  data: Product[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

interface LowStockItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
}

export function ProductsView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    void api<ListResponse>(
      `/products?page=${page}&perPage=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    ).then(setData);
    void api<LowStockItem[]>('/products/low-stock?min=5').then(setLowStock).catch(() => {});
  }, [page, search]);

  function stockTotal(p: Product): number {
    return p.stocks.reduce((s, st) => s + st.quantity, 0);
  }

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Produto',
      sortable: true,
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{p.name}</span>
          <span className="f-caption t-muted t-mono">{p.code}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      render: (p) => <span className="f-small t-secondary">{p.category?.name ?? '—'}</span>,
    },
    {
      key: 'brand',
      header: 'Marca',
      render: (p) => <span className="f-small t-secondary">{p.brand ?? '—'}</span>,
    },
    {
      key: 'packaging',
      header: 'Embalagem',
      render: (p) => <span className="f-small t-muted">{p.packaging ?? '—'}</span>,
    },
    {
      key: 'price',
      header: 'Preço',
      render: (p) => (
        <span style={{ fontWeight: 600 }}>
          {p.prices[0] ? formatCurrency(p.prices[0].value) : '—'}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Estoque',
      sortable: true,
      render: (p) => {
        const total = stockTotal(p);
        return (
          <Badge tone={total <= 5 ? 'danger' : total <= 10 ? 'warning' : 'success'}>
            {total} {p.unit ?? ''}
          </Badge>
        );
      },
    },
    {
      key: 'active',
      header: 'Ativo',
      render: (p) => (
        <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Produtos</h1>
            <p>Catálogo comercial com estoque e preços.</p>
          </div>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <a href="/catalog" target="_blank" rel="noopener noreferrer" className="btn btn-subtle" style={{ textDecoration: 'none' }}>
              <Icon name="globe" size={14} />
              Catálogo público
            </a>
            <Button variant="primary" onClick={() => {}}>
              <Icon name="plus" size={14} />
              Novo produto
            </Button>
          </div>
        </div>

        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 'var(--space-6)' }}>
          <MetricCard label="Produtos" value={`${data?.meta.total ?? 0}`} hint="no catálogo" />
          <MetricCard label="Estoque baixo" value={`${lowStock?.length ?? 0}`} hint="menos de 5 unidades" />
        </div>

        <Field label="" hint="">
          <input
            className="input"
            placeholder="Buscar por nome, SKU ou código…"
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
            emptyTitle="Nenhum produto encontrado"
            emptyBody="Crie o primeiro produto ou ajuste a busca."
            onRowClick={(p) => setSelected(p)}
          />
        </div>
      </div>

      <Drawer open={!!selected} title={selected?.name} onClose={() => setSelected(null)}>
        {selected ? (
          <ProductDrawer product={selected} />
        ) : (
          <Skeleton rows={6} lines={2} />
        )}
      </Drawer>
    </AppShell>
  );
}

function ProductDrawer({ product }: { product: Product }) {
  const stock = product.stocks.reduce((s, st) => s + st.quantity, 0);
  return (
    <div className="stack">
      <div className="row">
        <Badge tone={product.active ? 'success' : 'neutral'}>
          {product.active ? 'Ativo' : 'Inativo'}
        </Badge>
        <span className="f-caption t-muted t-mono">{product.code}</span>
      </div>

      <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)', gap: 'var(--space-6)' }}>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Estoque</div>
          <div className="f-h3">{stock} {product.unit ?? ''}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Preço</div>
          <div className="f-h3">
            {product.prices[0] ? formatCurrency(product.prices[0].value) : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="metric-label">Categoria</div>
          <div className="f-h3">{product.category?.name ?? '—'}</div>
        </div>
      </div>

      <div className="divider" />
      <div className="f-label">Detalhes</div>
      <div className="f-small t-secondary">Marca: {product.brand ?? '—'}</div>
      <div className="f-small t-secondary">Embalagem: {product.packaging ?? '—'}</div>
      <div className="f-small t-secondary">Unidade: {product.unit ?? '—'}</div>
      <div className="f-small t-secondary">Descrição: {product.description ?? '—'}</div>

      <div className="divider" />
      <div className="f-label">Estoque por armazém</div>
      {product.stocks.length === 0 ? (
        <p className="f-small t-muted">Sem registro de estoque.</p>
      ) : (
        product.stocks.map((st) => (
          <div key={st.id} className="row">
            <span className="f-small">{st.warehouse ?? 'principal'}</span>
            <span className="spacer" />
            <Badge tone={st.quantity <= 5 ? 'danger' : 'success'}>{st.quantity} {product.unit ?? ''}</Badge>
          </div>
        ))
      )}

      <div className="divider" />
      <a
        href={`/catalog/${product.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-subtle"
        style={{ textDecoration: 'none', justifyContent: 'center' }}
      >
        <Icon name="globe" size={14} />
        Compartilhar no catálogo público
      </a>
    </div>
  );
}