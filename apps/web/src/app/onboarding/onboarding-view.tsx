'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fetchMe, MeUser } from '@/lib/auth';
import { Badge, Button, Field, Icon } from '@/app/components/ui';

const STEPS = [
  { id: 1, title: 'Empresa', icon: 'card' },
  { id: 2, title: 'ERP', icon: 'box' },
  { id: 3, title: 'WhatsApp', icon: 'whatsapp' },
  { id: 4, title: 'Produtos', icon: 'product' },
  { id: 5, title: 'Equipe', icon: 'team' },
  { id: 6, title: 'Automações', icon: 'zap' },
  { id: 7, title: 'Concluir', icon: 'check' },
];

const ROLE_ITEMS = [
  { role: 'ADMIN', label: 'Administrador', desc: 'Acesso completo: configurações, equipe, exclusões.' },
  { role: 'GESTOR', label: 'Gestor', desc: 'Opera vendas, CRM, campanhas e automações.' },
  { role: 'COMERCIAL', label: 'Comercial', desc: 'Atende clientes e acompanha oportunidades.' },
  { role: 'ATENDENTE', label: 'Atendente', desc: 'Usa o Inbox do WhatsApp para atendimento humano.' },
  { role: 'MARKETING', label: 'Marketing', desc: 'Cria e acompanha campanhas e materiais.' },
  { role: 'FINANCEIRO', label: 'Financeiro', desc: 'Acessa faturamento e comissões.' },
];

const PRESETS = [
  {
    type: 'INATIVOS',
    name: 'Reativação de inativos',
    desc: 'Clientes sem compra há 20 dias recebem uma mensagem.',
    icon: 'clock',
    payload: {
      name: 'Reativação de inativos',
      description: 'Clientes sem compra há 20 dias recebem uma mensagem.',
      type: 'INATIVOS',
      status: 'ACTIVE',
      enabled: false,
      trigger: { conditions: [{ field: 'daysSinceLastPurchase', op: 'gte', value: 20 }] },
      actions: [{ type: 'send_whatsapp', text: 'Olá {{nome}}, sentimos sua falta! Preparamos condições especiais para sua próxima compra. Quer dar uma olhada?' }],
      config: { limit: 10 },
    },
  },
  {
    type: 'REPOSICAO',
    name: 'Reposição de favoritos',
    desc: 'Avisa clientes quando o produto favorito está disponível.',
    icon: 'product',
    payload: {
      name: 'Reposição de favoritos',
      description: 'Avisa clientes quando o produto favorito está disponível.',
      type: 'REPOSICAO',
      status: 'ACTIVE',
      enabled: false,
      trigger: { conditions: [{ field: 'favoriteCategory', op: 'exists' }] },
      actions: [{ type: 'send_whatsapp', text: '{{nome}}, aquele produto que você tanto gosta está de volta! Quer garantir o seu?' }],
      config: { limit: 15 },
    },
  },
  {
    type: 'LEAD_NURTURE',
    name: 'Nutrição de leads',
    desc: 'Dá sequência ao primeiro contato de leads novos.',
    icon: 'sparkles',
    payload: {
      name: 'Nutrição de leads',
      description: 'Dá sequência ao primeiro contato de leads novos.',
      type: 'LEAD_NURTURE',
      status: 'ACTIVE',
      enabled: false,
      trigger: { conditions: [{ field: 'leadStatus', op: 'in', value: ['CONTATO', 'INTERESSADO'] }] },
      actions: [{ type: 'send_whatsapp', text: 'Olá {{nome}}! Ainda estamos à disposição para tirar dúvidas. Quer conhecer melhor nossos produtos?' }],
      config: { limit: 20 },
    },
  },
];

interface OnboardingState {
  step: number;
  done: boolean;
  saving: boolean;
  creating: boolean;
  error: string;
  companyName: string;
  whatsappBusiness: string;
  provider: string;
  odvixUrl: string;
  odvixToken: string;
  evolutionUrl: string;
  evolutionToken: string;
  instance: string;
  productCount: number | null;
  selectedPresets: string[];
}

const INITIAL: OnboardingState = {
  step: 0,
  done: false,
  saving: false,
  creating: false,
  error: '',
  companyName: '',
  whatsappBusiness: '',
  provider: 'odvix',
  odvixUrl: '',
  odvixToken: '',
  evolutionUrl: '',
  evolutionToken: '',
  instance: '',
  productCount: null,
  selectedPresets: PRESETS.map((p) => p.type),
};

export function OnboardingView() {
  const [s, setS] = useState<OnboardingState>(INITIAL);
  const [me, setMe] = useState<MeUser | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetchMe().then((u) => {
      setMe(u);
      if (!u) {
        window.location.href = '/login';
        return;
      }
      void api<Record<string, unknown>>('/settings')
        .then((st) => {
          setSettings(st);
          if (st['general.onboarded'] === true) {
            window.location.href = '/dashboard';
            return;
          }
          setS((prev) => ({
            ...prev,
            companyName: String(st['general.company_name'] ?? u.name ?? ''),
            whatsappBusiness: String(st['general.whatsapp_business'] ?? ''),
            provider: String(st['integration.provider'] ?? 'odvix'),
            evolutionUrl: String(st['whatsapp.evolution_url'] ?? ''),
            evolutionToken: String(st['whatsapp.evolution_token'] ?? ''),
            instance: String(st['whatsapp.instance'] ?? ''),
          }));
        })
        .catch(() => {});
    });
  }, []);

  const isAdmin = me?.role === 'ADMIN' || me?.role === 'GESTOR';

  function patch(values: Record<string, unknown>) {
    return api('/settings', { method: 'PATCH', body: JSON.stringify(values) });
  }

  async function next() {
    setS((p) => ({ ...p, saving: true, error: '' }));
    try {
      switch (s.step) {
        case 0:
          if (!s.companyName.trim()) throw new Error('Informe o nome da empresa.');
          await patch({ 'general.company_name': s.companyName.trim(), 'general.whatsapp_business': s.whatsappBusiness.trim() });
          break;
        case 1:
          if (s.provider === 'odvix') {
            if (!s.odvixUrl.trim() || !s.odvixToken.trim()) throw new Error('Preencha a URL e o token da API da ODVIX.');
            await patch({ 'integration.provider': 'odvix', 'integration.odvix_base_url': s.odvixUrl.trim(), 'integration.odvix_token': s.odvixToken.trim() });
          } else {
            await patch({ 'integration.provider': s.provider });
          }
          break;
        case 2:
          if (!s.evolutionUrl.trim()) throw new Error('Preencha a URL da API Evolution.');
          await patch({ 'whatsapp.evolution_url': s.evolutionUrl.trim(), 'whatsapp.evolution_token': s.evolutionToken.trim(), 'whatsapp.instance': s.instance.trim() });
          break;
        case 3:
          try {
            const r = await api<{ meta?: { total?: number } }>('/products?perPage=1');
            setS((p) => ({ ...p, productCount: r.meta?.total ?? 0 }));
          } catch { /* ignore */ }
          break;
        case 4:
          break;
        case 5:
          await createPresets();
          break;
      }
      setS((p) => ({ ...p, step: p.step + 1, saving: false }));
    } catch (err) {
      setS((p) => ({ ...p, saving: false, error: err instanceof Error ? err.message : 'Falha ao salvar.' }));
    }
  }

  async function createPresets() {
    setS((p) => ({ ...p, creating: true }));
    try {
      await Promise.all(
        PRESETS.filter((pr) => s.selectedPresets.includes(pr.type)).map((pr) =>
          api('/automation', { method: 'POST', body: JSON.stringify(pr.payload) }),
        ),
      );
    } finally {
      setS((p) => ({ ...p, creating: false }));
    }
  }

  async function finish() {
    setS((p) => ({ ...p, saving: true }));
    try {
      await patch({ 'general.onboarded': true });
      window.location.href = '/dashboard';
    } finally {
      setS((p) => ({ ...p, saving: false }));
    }
  }

  if (!me || !settings) return null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        background: 'var(--bg)',
      }}
    >
      <div className="card" style={{ width: 520, maxWidth: '100%', padding: 'var(--space-8)' }}>
        <div className="row" style={{ alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <span className="f-h1" style={{ fontWeight: 700 }}>Comercial Ops</span>
          <span className="spacer" />
          <Badge tone="info">{STEPS[Math.min(s.step, 6)].title}</Badge>
        </div>

        <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          {STEPS.map((st) => (
            <button
              key={st.id}
              onClick={() => setS((p) => ({ ...p, step: st.id - 1 }))}
              aria-current={s.step === st.id - 1 ? 'step' : undefined}
              aria-label={`Passo ${st.id}: ${st.title}`}
              className="btn btn-subtle btn-sm"
              style={{
                opacity: s.step === st.id - 1 ? 1 : 0.6,
                borderColor: s.step === st.id - 1 ? 'var(--accent)' : undefined,
              }}
            >
              <Icon name={st.icon} size={13} />
              <span>{st.id}</span>
            </button>
          ))}
        </div>

        {s.step === 0 && (
          <div className="stack">
            <div className="f-h3">Sobre a empresa</div>
            <Field label="Nome da empresa">
              <input className="input" value={s.companyName} onChange={(e) => setS({ ...s, companyName: e.target.value })} placeholder="Minha empresa" />
            </Field>
            <Field label="WhatsApp comercial">
              <input className="input" value={s.whatsappBusiness} onChange={(e) => setS({ ...s, whatsappBusiness: e.target.value })} placeholder="5511999999999" />
            </Field>
          </div>
        )}

        {s.step === 1 && (
          <div className="stack">
            <div className="f-h3">Integração com o ERP</div>
            <Field label="Provedor">
              <select className="input" value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value })}>
                <option value="odvix">ODVIX</option>
                <option value="mercos">Mercos</option>
                <option value="manual">Importação manual</option>
              </select>
            </Field>
            {s.provider === 'odvix' && (
              <>
                <Field label="URL da API ODVIX">
                  <input className="input" value={s.odvixUrl} onChange={(e) => setS({ ...s, odvixUrl: e.target.value })} placeholder="https://api.odvix.com.br/v1" />
                </Field>
                <Field label="Token da API">
                  <input className="input" type="password" value={s.odvixToken} onChange={(e) => setS({ ...s, odvixToken: e.target.value })} />
                </Field>
              </>
            )}
            {s.provider !== 'odvix' && (
              <p className="f-caption t-muted">A sincronização poderá ser configurada depois em Configurações → Integrações.</p>
            )}
          </div>
        )}

        {s.step === 2 && (
          <div className="stack">
            <div className="f-h3">WhatsApp (Evolution API)</div>
            <p className="f-caption t-muted">Conecte a instância do WhatsApp Business. O robô usa esta API para atender e disparar campanhas.</p>
            <Field label="URL da API Evolution">
              <input className="input" value={s.evolutionUrl} onChange={(e) => setS({ ...s, evolutionUrl: e.target.value })} placeholder="https://evolution.your-server.com" />
            </Field>
            <Field label="Token da instância">
              <input className="input" type="password" value={s.evolutionToken} onChange={(e) => setS({ ...s, evolutionToken: e.target.value })} />
            </Field>
            <Field label="Nome da instância">
              <input className="input" value={s.instance} onChange={(e) => setS({ ...s, instance: e.target.value })} placeholder="comercial" />
            </Field>
          </div>
        )}

        {s.step === 3 && (
          <div className="stack">
            <div className="f-h3">Produtos</div>
            {s.productCount === null ? (
              <p className="f-caption t-muted">Na próxima sincronização com o ERP, clientes e pedidos são importados e o catálogo é atualizado automaticamente.</p>
            ) : s.productCount === 0 ? (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <p className="f-small" style={{ fontWeight: 600 }}>Catálogo vazio</p>
                <p className="f-caption t-muted">Rode uma sincronização em Configurações → Integrações ou importe manualmente em Produtos.</p>
              </div>
            ) : (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <p className="f-small" style={{ fontWeight: 600 }}>{s.productCount} produtos disponíveis</p>
                <p className="f-caption t-muted">O catálogo já está pronto para vendas pelo WhatsApp.</p>
              </div>
            )}
          </div>
        )}

        {s.step === 4 && (
          <div className="stack">
            <div className="f-h3">Equipe</div>
            <p className="f-caption t-muted">Cada papel define o que cada pessoa vê e pode fazer. Crie acessos em Equipe & permissões.</p>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {ROLE_ITEMS.map((r) => (
                <div key={r.role} className="card-row row" style={{ gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)' }}>
                  <Badge tone="neutral">{r.label}</Badge>
                  <span className="f-caption t-muted">{r.desc}</span>
                </div>
              ))}
            </div>
            {isAdmin && (
              <a href="/users" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Gerenciar equipe agora
              </a>
            )}
          </div>
        )}

        {s.step === 5 && (
          <div className="stack">
            <div className="f-h3">Automações recomendadas</div>
            <p className="f-caption t-muted">Criamos estas automações (desativadas). Ative em Automatizações depois de configurar o WhatsApp.</p>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {PRESETS.map((p) => (
                <label key={p.type} className="card-row row" style={{ gap: 'var(--space-2)', padding: 'var(--space-3)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={s.selectedPresets.includes(p.type)}
                    onChange={(e) =>
                      setS({
                        ...s,
                        selectedPresets: e.target.checked
                          ? [...s.selectedPresets, p.type]
                          : s.selectedPresets.filter((t) => t !== p.type),
                      })
                    }
                  />
                  <Icon name={p.icon} size={15} />
                  <div style={{ flex: 1 }}>
                    <div className="f-small" style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="f-caption t-muted">{p.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {s.step === 6 && (
          <div className="stack">
            <div className="f-h3">Tudo pronto!</div>
            <p className="f-caption t-muted">
              Sua conta está configurada. Acesse a Central Comercial para acompanhar vendas, atender no WhatsApp e disparar campanhas.
            </p>
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div className="f-small" style={{ fontWeight: 600 }}>Próximos passos</div>
              <ul className="f-caption" style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-4)' }}>
                {s.provider !== 'manual' && <li>Confirmar credenciais do {s.provider.toUpperCase()} para sincronizar catálogo.</li>}
                {!s.evolutionToken && <li>Conectar a instância da Evolution no WhatsApp.</li>}
                <li>Ativar as automações em Automatizações.</li>
              </ul>
            </div>
          </div>
        )}

        {s.error && <Badge tone="danger">{s.error}</Badge>}

        <div className="row" style={{ marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
          {s.step > 0 && !s.saving && (
            <Button variant="subtle" onClick={() => setS((p) => ({ ...p, step: p.step - 1, error: '' }))}>
              Voltar
            </Button>
          )}
          <span className="spacer" />
          {s.step < 6 ? (
            <Button variant="primary" onClick={() => void next()} disabled={s.saving || s.creating}>
              {s.saving ? 'Salvando…' : s.creating ? 'Criando automações…' : 'Continuar'}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void finish()} disabled={s.saving}>
              {s.saving ? 'Finalizando…' : 'Ir para a Central'}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}