'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchMe, logout, MeUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Icon } from '@/app/components/ui';
import { toggleTheme } from '@/app/components/theme';

interface AppAlert {
  id: string;
  kind: string;
  title: string;
  body: string;
  tone: 'danger' | 'warning' | 'info';
  target: string;
  count: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ROLE_RESTRICTIONS: Record<string, Partial<Record<string, true>>> = {
  COMERCIAL: {
    '/commission': true,
    '/leads': true,
    '/customers': true,
    '/map': true,
    '/orders': true,
    '/inbox': true,
    '/intelligence': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
  REPRESENTANTE: {
    '/commission': true,
    '/orders': true,
    '/customers': true,
    '/map': true,
    '/inbox': true,
    '/intelligence': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
  ATENDENTE: {
    '/inbox': true,
    '/customers': true,
    '/map': true,
    '/orders': true,
    '/commission': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
  MARKETING: {
    '/campaigns': true,
    '/automations': true,
    '/products': true,
    '/intelligence': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
  FINANCEIRO: {
    '/orders': true,
    '/commission': true,
    '/billing': true,
    '/intelligence': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
  SUPORTE: {
    '/inbox': true,
    '/customers': true,
    '/map': true,
    '/automations': true,
    '/settings': true,
    '/dashboard': true,
    '/settings/profile': true,
  },
};

function allowedFor(role: string, href: string) {
  const allowed = ROLE_RESTRICTIONS[role];
  if (!allowed) return true;
  return allowed[href] ?? false;
}

const NAV: NavSection[] = [
  {
    title: 'Principal',
    items: [{ href: '/dashboard', label: 'Visão geral', icon: 'dashboard' }],
  },
  {
    title: 'Vendas',
    items: [
      { href: '/orders', label: 'Pedidos', icon: 'orders' },
      { href: '/commission', label: 'Oportunidades', icon: 'target' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { href: '/customers', label: 'Clientes', icon: 'customers' },
      { href: '/map', label: 'Mapa de clientes', icon: 'map' },
      { href: '/leads', label: 'Leads', icon: 'leads' },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { href: '/inbox', label: 'Inbox', icon: 'whatsapp' },
      { href: '/campaigns', label: 'Campanhas', icon: 'send' },
    ],
  },
  {
    title: 'Inteligência',
    items: [{ href: '/intelligence', label: 'Recomendações', icon: 'sparkles' }],
  },
  {
    title: 'Operação',
    items: [
      { href: '/automations', label: 'Automatizações', icon: 'clock' },
      { href: '/products', label: 'Produtos', icon: 'product' },
      { href: '/users', label: 'Equipe', icon: 'team' },
      { href: '/settings', label: 'Configurações', icon: 'settings' },
      { href: '/billing', label: 'Plano', icon: 'card' },
    ],
  },
];

interface CustomerHit {
  id: string;
  name: string;
  city?: { name?: string | null; state?: string | null } | null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState('Empresa');
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AppAlert[] | null>(null);
  const [integrationsOk, setIntegrationsOk] = useState(false);

  const [cmdkOpen, setCmkdOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CustomerHit[] | null>(null);
  const cmdkInput = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        window.location.href = '/login';
      }
    });
    void api<Record<string, unknown>>('/settings')
      .then((s) => {
        const name = s['general.company_name'];
        if (typeof name === 'string' && name.trim()) setOrg(name.trim());
      })
      .catch(() => {});
    void api<{ allOk: boolean }>('/integrations/health')
      .then((r) => setIntegrationsOk(Boolean(r.allOk)))
      .catch(() => setIntegrationsOk(false));
  }, []);

  useEffect(() => {
    if (!alertsOpen || alerts) return;
    void api<{ unread: number; items: AppAlert[] }>('/alerts')
      .then((r) => setAlerts(r.items))
      .catch(() => setAlerts([]));
  }, [alertsOpen, alerts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmkdOpen((v) => !v);
      }
      if (e.key === 'Escape') setCmkdOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (cmdkOpen) {
      setQuery('');
      setHits(null);
      setTimeout(() => cmdkInput.current?.focus(), 10);
    }
  }, [cmdkOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void api<{ data: CustomerHit[] }>(`/customers?search=${encodeURIComponent(query)}&perPage=6`)
        .then((r) => setHits(r.data ?? []))
        .catch(() => setHits([]));
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navSections = useMemo(() => {
    if (!user) return [];
    return NAV.map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedFor(user.role, item.href)),
    })).filter((s) => s.items.length > 0);
  }, [user]);

  const goto = (href: string) => {
    setCmkdOpen(false);
    router.push(href);
  };

  if (loading) {
    return (
      <div className="shell">
        <main className="main">
          <div className="page-head">
            <h1>Carregando…</h1>
            <p>Preparando o ambiente</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}${navOpen ? ' nav-open' : ''}`}>
      <header className="topbar">
        <a href="/dashboard" className="brand" aria-label="Comercial.io">
          <div className="brand-mark">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <path d="M3 15L8 9L11.5 12.5L17 5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.5 5H17V9.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="brand-name-group">
            <span className="brand-name">Comercial<em>.io</em></span>
            <span className="brand-org">{org}</span>
          </div>
        </a>

        <button
          className="icon-btn hamburger"
          aria-label="Abrir menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6H17M3 10H17M3 14H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <button className="topbar-search" role="button" aria-haspopup="dialog" onClick={() => setCmkdOpen(true)}>
          <Icon name="search" size={15} />
          <span className="hint">Buscar cliente, pedido, produto…</span>
          <span className="kbd">⌘K</span>
        </button>

        <div className="topbar-right">
          {integrationsOk && (
            <div className="integration-pill">
              <span className="pulse-dot" />
              Integrações OK
            </div>
          )}
          <button className="icon-btn" title="Alternar tema" aria-label="Alternar tema" onClick={() => toggleTheme()}>
            <Icon name="sun" size={17} />
          </button>
          <button className="icon-btn" title="Ajuda" aria-label="Ajuda" onClick={() => goto('/settings')}>
            <Icon name="box" size={17} />
          </button>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" title="Notificações" aria-label="Notificações" onClick={() => setAlertsOpen((v) => !v)}>
              <Icon name="bell" size={17} />
              {alerts && alerts.length > 0 && <span className="dot-badge" />}
            </button>
            {alertsOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAlertsOpen(false)} />
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 320,
                    zIndex: 41,
                    padding: 8,
                    maxHeight: 420,
                    overflowY: 'auto',
                  }}
                >
                  <div className="row" style={{ padding: '8px 12px' }}>
                    <span className="f-small" style={{ fontWeight: 700 }}>Notificações</span>
                    <span className="spacer" />
                    {alerts && <Badge tone={alerts.length ? 'danger' : 'neutral'}>{alerts.length}</Badge>}
                  </div>
                  {alerts === null ? (
                    <p className="f-caption t-muted" style={{ padding: 12 }}>Carregando…</p>
                  ) : alerts.length === 0 ? (
                    <p className="f-caption t-muted" style={{ padding: 12 }}>
                      Tudo em dia por aqui. Nenhum alerta no momento.
                    </p>
                  ) : (
                    alerts.map((a) => (
                      <a
                        key={a.id}
                        href={a.target}
                        className="card-row row"
                        style={{ padding: '8px 12px', gap: 8 }}
                        onClick={() => setAlertsOpen(false)}
                      >
                        <span className={`status-dot ${a.tone}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="f-small" style={{ fontWeight: 600 }}>{a.title}</div>
                          <div className="f-caption t-muted">{a.body}</div>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <button className="icon-btn" title="Sair" aria-label="Sair" onClick={() => { logout(); window.location.href = '/login'; }}>
            <Icon name="logout" size={17} />
          </button>
          <a href="/settings/profile" title="Perfil" aria-label="Perfil" className="avatar" style={{ cursor: 'pointer', textDecoration: 'none' }}>
            {user.name.slice(0, 1).toUpperCase()}
          </a>
        </div>
      </header>

      <nav className="sidebar" aria-label="Navegação principal">
        {navSections.map((section) => (
          <div className="nav-group" key={section.title}>
            <div className="nav-label">{section.title}</div>
            {section.items.map((item) => (
              <a
                key={item.href}
                className="nav-item"
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                onClick={() => setNavOpen(false)}
              >
                <Icon name={item.icon} size={16} />
                <span className="label">{item.label}</span>
              </a>
            ))}
          </div>
        ))}
        <div className="sidebar-footer">
          <button className="collapse-btn" aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}>
            <Icon name="collapse" size={16} />
            <span className="label">Recolher menu</span>
          </button>
        </div>
      </nav>

      <div className={`sidebar-backdrop${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} />

      <main className="main">{children}</main>

      <div className={`cmdk-backdrop${cmdkOpen ? ' open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setCmkdOpen(false); }}>
        <div className="cmdk" role="dialog" aria-label="Busca rápida">
          <div className="cmdk-input-row">
            <Icon name="search" size={16} />
            <input
              ref={cmdkInput}
              type="text"
              placeholder="Buscar cliente, pedido, produto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'ArrowDown') e.preventDefault(); }}
            />
            <span className="kbd">esc</span>
          </div>
          <div className="cmdk-results">
            <div className="cmdk-group-label">NAVEGAÇÃO</div>
            {navSections.flatMap((s) => s.items).map((item) => (
              <div key={item.href} className="cmdk-row" onClick={() => goto(item.href)}>
                <Icon name={item.icon} size={15} />
                {item.label}
                <span className="muted">{item.href}</span>
              </div>
            ))}
            {query.trim().length >= 2 && (
              <>
                <div className="cmdk-group-label">CLIENTES</div>
                {hits === null ? (
                  <div className="cmdk-row">Buscando…</div>
                ) : hits.length === 0 ? (
                  <div className="cmdk-empty">Nenhum cliente encontrado para “{query}”</div>
                ) : (
                  hits.map((c) => (
                    <div key={c.id} className="cmdk-row" onClick={() => goto(`/customers/${c.id}`)}>
                      <Icon name="customers" size={15} />
                      {c.name}
                      <span className="muted">{c.city?.name ? `${c.city.name}, ${c.city.state ?? ''}` : ''}</span>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}