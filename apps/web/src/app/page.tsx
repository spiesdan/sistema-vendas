'use client';

import { useEffect, useState } from 'react';
import { fetchMe } from '@/lib/auth';
import { Icon } from '@/app/components/ui';

const FEATURES = [
  { icon: 'sparkles', title: 'Inteligência', desc: 'Priorize as ações que geram mais rentabilidade hoje.' },
  { icon: 'whatsapp', title: 'WhatsApp', desc: 'Conversas, campanhas e recuperação de vendas no canal certo.' },
  { icon: 'target', title: 'Oportunidades', desc: 'Pipeline comercial claro, com receita potencial em cada etapa.' },
  { icon: 'clock', title: 'Automações', desc: 'Workflows que recuperam clientes e disparam ações sem atrito.' },
  { icon: 'customers', title: 'CRM', desc: 'Carteira completa, risco de churn e prioridade de contato.' },
  { icon: 'product', title: 'Produtos', desc: 'Catálogo, preços e estoque sempre visíveis.' },
];

export default function LandingPage() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetchMe().then((u) => {
      if (u) window.location.href = '/dashboard';
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return (
      <main className="page" style={{ minHeight: '100vh' }}>
        <div className="page-title">
          <h1>Carregando…</h1>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'var(--font-base)' }}>
      {/* Hero */}
      <section style={{ padding: 'var(--space-16, 96px) var(--space-8) 64px', textAlign: 'center' }}>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--space-8)' }}>
          <a href="/" className="f-h3" style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>Comercial Ops</a>
        </div>
        <h1 className="f-h1" style={{ maxWidth: 720, margin: '0 auto', fontSize: 44, lineHeight: 1.15 }}>
          Sua equipe comercial, agora trabalha 24 horas por dia.
        </h1>
        <p className="f-body t-secondary" style={{ maxWidth: 560, margin: 'var(--space-4) auto 0' }}>
          A plataforma que encontra oportunidades, conversa com seus clientes e transforma intenção em vendas.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
          <a className="btn btn-primary" href="/login">Começar agora</a>
          <a className="btn btn-subtle" href="#como-funciona">Ver como funciona</a>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" style={{ padding: '64px var(--space-8)', maxWidth: 1080, margin: '0 auto' }}>
        <h2 className="f-h2" style={{ textAlign: 'center' }}>O que a plataforma faz por você</h2>
        <div className="metric-grid" style={{ marginTop: 'var(--space-8)' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <Icon name={f.icon} size={20} />
              <div className="f-h3" style={{ margin: 'var(--space-3) 0 0' }}>{f.title}</div>
              <p className="f-small t-secondary" style={{ margin: 'var(--space-2) 0 0' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '64px var(--space-8)', textAlign: 'center' }}>
        <h2 className="f-h2">Pronto para vender mais?</h2>
        <p className="f-body t-secondary" style={{ margin: 'var(--space-2) auto 0', maxWidth: 480 }}>
          Configure sua operação em minutos e deixe a inteligência encontrar as oportunidades.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <a className="btn btn-primary" href="/login">Começar agora</a>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: 'var(--space-6) var(--space-8)', textAlign: 'center' }}>
        <span className="f-caption t-muted">Comercial Ops · Tecnologia que entende vendas.</span>
      </footer>
    </main>
  );
}