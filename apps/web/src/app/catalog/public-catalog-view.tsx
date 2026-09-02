'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

export interface PublicCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string | null;
  packaging: string | null;
  category: string | null;
  price: number | null;
  available: number;
  inStock: boolean;
}

interface CatalogResponse {
  store: { storeName: string; whatsapp: string };
  total: number;
  items: PublicCatalogItem[];
}

function buyUrl(whatsapp: string, item: PublicCatalogItem): string | null {
  if (!whatsapp) return null;
  const text = `Olá! Vi o produto ${item.name} (${item.code}) no catálogo e gostaria de comprar.`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}

export function PublicCatalogView() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetch(`${API_URL}/public/catalog`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => {});
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.brand ?? '').toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q),
    );
  }, [data, query]);

  const storeName = data?.store.storeName ?? 'Catálogo';
  const whatsapp = data?.store.whatsapp ?? '';

  return (
    <main className="page" style={{ maxWidth: 1024, margin: '0 auto', padding: 'var(--space-6)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        <div>
          <div className="f-h1" style={{ fontWeight: 700 }}>{storeName}</div>
          <div className="f-small t-muted">Catálogo digital</div>
        </div>
        <span className="spacer" />
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Buscar produto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar produto"
        />
      </header>

      {!data ? (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <p className="f-small t-muted">Carregando catálogo…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty" style={{ padding: 'var(--space-8)' }}>
          <div className="empty-title">Nenhum produto encontrado</div>
          <p className="empty-body">Volte em breve ou fale conosco pelo WhatsApp.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {items.map((item) => {
            const url = buyUrl(whatsapp, item);
            return (
              <Link key={item.id} href={`/catalog/${item.id}`} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none' }}>
                <div
                  style={{
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-mute, #f4f4f5)',
                    fontSize: 'var(--font-lg)',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  {(item.brand ?? item.name).slice(0, 2).toUpperCase()}
                </div>
                <div style={{ padding: 'var(--space-3)', flex: 1 }}>
                  <div className="f-small t-muted" style={{ textTransform: 'uppercase', fontSize: 11 }}>{item.category ?? item.brand ?? 'Produto'}</div>
                  <div className="f-small" style={{ fontWeight: 600, marginTop: 2 }}>{item.name}</div>
                  <div className="f-h3" style={{ marginTop: 'var(--space-2)' }}>
                    {item.price != null ? formatCurrency(item.price) : '—'}
                  </div>
                  <div className="f-caption t-muted" style={{ marginTop: 2 }}>
                    {item.inStock ? `${item.available} disponível(is)` : 'Indisponível'}
                  </div>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ margin: '0 var(--space-3) var(--space-3)', textDecoration: 'none', textAlign: 'center', justifyContent: 'center' }}
                  >
                    Pedir pelo WhatsApp
                  </a>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}