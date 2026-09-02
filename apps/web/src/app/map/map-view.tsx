'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/app/components/shell';
import { MetricCardsSkeleton } from '@/app/components/ui';
import { api } from '@/lib/api';
import { fetchMe } from '@/lib/auth';
import { formatCurrency, relativeDays } from '@/lib/format';

interface MapCustomer {
  id: string;
  name: string;
  status: string;
  tier: string;
  whatsapp: string | null;
  totalSpent: number;
  orderCount: number;
  score: number;
  lastPurchaseAt: Date | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

const STATUS_COLOR: Record<string, string> = {
  VIP: '#1450e0',
  ATIVO: '#157f3c',
  NOVO: '#1d6fa5',
  OCASIONAL: '#6e7080',
  EM_RISCO: '#b5690a',
  INATIVO: '#9a9ca8',
  PERDIDO: '#c22a1e',
  LEAD: '#6e7080',
};

const STATUS_LABEL: Record<string, string> = {
  VIP: 'VIP',
  ATIVO: 'Ativo',
  NOVO: 'Novo',
  OCASIONAL: 'Ocasional',
  EM_RISCO: 'Em risco',
  INATIVO: 'Inativo',
  PERDIDO: 'Perdido',
  LEAD: 'Lead',
};

const LEAFLET_VERSION = '1.9.4';

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<{ remove: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<MapCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchMe().then((u) => {
      if (!u) window.location.href = '/login';
    });
    void api<MapCustomer[]>('/customers/map')
      .then((d) => {
        setCustomers(d);
        setStatusFilter(new Set(d.map((c) => c.status)));
      })
      .catch(() => setError('Não foi possível carregar os clientes.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current) return;

    const injected = document.getElementById('leaflet-css');
    if (!injected) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
      document.head.appendChild(link);
    }

    let canceled = false;
    const script = document.createElement('script');
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.onload = () => {
      if (canceled || !mapRef.current) return;
      const L = (window as unknown as { L: any }).L;
      if (!L) return;

      if (mapInstance.current) mapInstance.current.remove();
      const map = L.map(mapRef.current, { zoomControl: true });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const points: Array<[number, number]> = [];
      const byStatus: Record<string, number> = {};
      let totalSpent = 0;

      const visible = customers.filter((c) => statusFilter.has(c.status));
      const layer = L.layerGroup().addTo(map);

      visible.forEach((c) => {
        if (c.latitude == null || c.longitude == null) return;
        points.push([c.latitude, c.longitude]);
        byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        totalSpent += c.totalSpent;
        const radius = 7 + Math.min(9, Math.log10(Math.max(1, c.totalSpent)) * 3);
        const marker = L.circleMarker([c.latitude, c.longitude], {
          radius,
          color: '#ffffff',
          weight: 2,
          fillColor: STATUS_COLOR[c.status] ?? '#6e7080',
          fillOpacity: 0.9,
        });
        const popup = L.popup({ offset: [0, -6] });
        popup.setContent(`
          <div style="min-width:180px;font-family:inherit">
            <div style="font-weight:700;font-size:13.5px;margin-bottom:2px">${escapeHtml(c.name)}</div>
            <div style="font-size:12px;color:#5c5e6b;margin-bottom:8px">
              ${escapeHtml(c.city ?? '—')}${c.state ? `, ${escapeHtml(c.state)}` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;font-size:12px">
              <span><b>${STATUS_LABEL[c.status] ?? c.status}</b>${c.tier === 'VIP' ? ' · VIP' : ''}</span>
              <span>${formatCurrency(c.totalSpent)} em ${c.orderCount} pedidos</span>
              <span>Última compra: ${c.lastPurchaseAt ? relativeDays(c.lastPurchaseAt) : '—'}</span>
              <span>Score: ${c.score}/100</span>
            </div>
            <a href="/customers/${c.id}"
               style="display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:#1450e0;text-decoration:none">
               Abrir cliente →
            </a>
          </div>
        `);
        marker.bindPopup(popup);
        marker.addTo(layer);
      });

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points).pad(0.18));
      } else {
        map.setView([-15.8267, -49.3642], 4);
      }

      setTimeout(() => map.invalidateSize(), 120);
    };
    document.head.appendChild(script);
    return () => {
      canceled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [loading, customers, statusFilter]);

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const counts = useStatusCountsFn(customers);
  const stats = useMemo(
    () => ({
      total: customers.length,
      totalSpent: customers.reduce((acc, c) => acc + c.totalSpent, 0),
      cities: new Set(customers.map((c) => `${c.city}/${c.state}`)).size,
      active: customers.filter((c) => c.status === 'ATIVO' || c.status === 'VIP').length,
    }),
    [customers],
  );

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Mapa de clientes</h1>
          <p>Onde estão seus clientes e quanto movimentam em cada região.</p>
        </div>
      </div>

      <section className="metrics-row">
        <div className="map-stat">
          <div className="v num">{stats.total}</div>
          <div className="l">Clientes mapeados</div>
        </div>
        <div className="map-stat">
          <div className="v num">{formatCurrency(stats.totalSpent)}</div>
          <div className="l">Receita total da base</div>
        </div>
        <div className="map-stat">
          <div className="v num">{stats.cities}</div>
          <div className="l">Cidades cobertas</div>
        </div>
        <div className="map-stat">
          <div className="v num">{stats.active}</div>
          <div className="l">Clientes ativos / VIP</div>
        </div>
      </section>

      {error ? (
        <div className="panel">
          <div className="empty">
            <div className="empty-title">Falha ao carregar</div>
            <p className="empty-body">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div style={{ marginTop: 12 }}>
          <MetricCardsSkeleton count={2} />
        </div>
      ) : (
        <div className="panel">
          <div className="map-wrap">
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="map-legend">
            {Object.keys(STATUS_LABEL)
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <button
                  key={s}
                  className="lg-item"
                  onClick={() => toggleStatus(s)}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    opacity: statusFilter.has(s) ? 1 : 0.35,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span className="lg-dot" style={{ background: STATUS_COLOR[s] }} />
                  {STATUS_LABEL[s]} · {counts[s]}
                </button>
              ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function useStatusCountsFn(customers: MapCustomer[]) {
  const counts: Record<string, number> = {};
  customers.forEach((c) => {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  });
  return counts;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[ch] ?? ch;
  });
}