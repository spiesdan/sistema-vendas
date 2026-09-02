'use client';

import { AppShell } from '@/app/components/shell';
import { Badge, Button, Icon, Progress } from '@/app/components/ui';

const LIMITS = [
  { label: 'Clientes', used: 1284, max: 5000 },
  { label: 'Mensagens', used: 8420, max: 20000 },
  { label: 'Usuários', used: 7, max: 10 },
  { label: 'Automações', used: 18, max: 50 },
];

export function BillingView() {
  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Seu plano</h1>
            <p>Utilização da sua assinatura e limites da operação.</p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="card" size={14} />
            Gerenciar cobrança
          </Button>
        </div>

        <div className="card">
          <div className="row">
            <div>
              <Badge tone="info" dot>Plano atual</Badge>
              <div className="f-h1" style={{ margin: 'var(--space-2) 0' }}>Professional</div>
              <div className="f-small t-muted">R$ 297/mês</div>
            </div>
            <span className="spacer" />
            <Button variant="subtle" onClick={() => {}}>Alterar plano</Button>
          </div>
        </div>

        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 'var(--space-6)' }}>
          {LIMITS.map((l) => {
            const pct = Math.round((l.used / l.max) * 100);
            return (
              <div key={l.label} className="card">
                <div className="row">
                  <span className="f-label">{l.label}</span>
                  <span className="spacer" />
                  <span className="f-small t-muted">{l.used.toLocaleString('pt-BR')} / {l.max.toLocaleString('pt-BR')}</span>
                </div>
                <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
                  <Progress value={pct} />
                  <span className="f-caption t-muted">{pct}% utilizado</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
          <div className="f-h3">Faturamento</div>
          <div className="stack">
            <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)' }}>
              <div>
                <div className="f-small" style={{ fontWeight: 600 }}>Próxima cobrança</div>
                <div className="f-caption t-muted">01/10/2026 · R$ 297,00</div>
              </div>
              <span className="spacer" />
              <Badge tone="success">Em dia</Badge>
            </div>
            <div className="card-row row" style={{ padding: 'var(--space-4) var(--space-5)' }}>
              <div>
                <div className="f-small" style={{ fontWeight: 600 }}>Forma de pagamento</div>
                <div className="f-caption t-muted">•••• 4242 · Cartão de crédito</div>
              </div>
              <span className="spacer" />
              <Button variant="subtle" size="sm" onClick={() => {}}>Atualizar</Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}