'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface CatalogDetail {
  product: {
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
  };
  store: { storeName: string; whatsapp: string };
  buyUrl: string | null;
  qrUrl: string;
  catalogUrl: string;
}

export function PublicCatalogItemDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<CatalogDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    void fetch(`${API_URL}/public/catalog/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CatalogDetail | null) => {
        if (!d) setMissing(true);
        else setData(d);
      })
      .catch(() => setMissing(true));
  }, [params?.id]);

  if (missing) {
    return (
      <main className="page" style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-8)' }}>
        <div className="empty">
          <div className="empty-title">Produto não encontrado</div>
          <p className="empty-body">O link pode estar expirado ou o produto foi inativado.</p>
          <Link href="/catalog" className="btn btn-primary" style={{ textDecoration: 'none', marginTop: 'var(--space-3)' }}>
            Ver catálogo
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page" style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-8)' }}>
        <p className="f-small t-muted">Carregando…</p>
      </main>
    );
  }

  const p = data.product;

  return (
    <main className="page" style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-6)' }}>
      <Link href="/catalog" className="f-small t-muted" style={{ textDecoration: 'none' }}>
        ← Voltar ao catálogo
      </Link>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 'var(--space-4)' }}>
        <div
          style={{
            height: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-mute, #f4f4f5)',
            fontSize: 'var(--font-xl)',
            fontWeight: 700,
            color: 'var(--text-muted)',
          }}
        >
          {(p.brand ?? p.name).slice(0, 2).toUpperCase()}
        </div>
        <div className="stack" style={{ padding: 'var(--space-5)' }}>
          <div className="f-caption t-muted" style={{ textTransform: 'uppercase', fontSize: 11 }}>
            {p.category ?? p.brand ?? 'Produto'} · {p.code}
          </div>
          <div className="f-h1" style={{ fontWeight: 700 }}>{p.name}</div>
          {p.description && <p className="f-small t-secondary">{p.description}</p>}
          <div className="f-h2" style={{ fontWeight: 700 }}>
            {p.price != null ? formatCurrency(p.price) : 'Sob consulta'}
          </div>
          <div className="f-caption t-muted">
            {p.inStock ? `${p.available} unidade(s) disponível(is)` : 'Produto indisponível no momento'}
          </div>
          {data.buyUrl && (
            <a href={data.buyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ textDecoration: 'none', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
              Comprar pelo WhatsApp
            </a>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
            <img src={data.qrUrl} alt="QR code do produto" width={112} height={112} style={{ borderRadius: 'var(--radius-md)' }} />
            <div style={{ maxWidth: 280 }}>
              <div className="f-small" style={{ fontWeight: 600 }}>Compartilhe este produto</div>
              <p className="f-caption t-muted">Aponte a câmera para o QR code ou envie o link por WhatsApp.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}