'use client';

import { Badge } from '@/app/components/ui';

export function RegisterView() {
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
      <div className="card" style={{ width: 400, padding: 'var(--space-8)' }}>
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <span className="f-h1" style={{ fontWeight: 700 }}>Comercial Ops</span>
          <span className="f-small t-secondary">Acesso corporativo.</span>
        </div>

        <div className="stack" style={{ marginTop: 'var(--space-6)' }}>
          <Badge tone="info">Acesso gerenciado</Badge>
          <p className="f-small t-secondary" style={{ lineHeight: 1.6 }}>
            As contas do Comercial Ops são criadas e gerenciadas por um administrador da empresa, com papéis e
            permissões específicos — incluindo a área <strong>Equipe & permissões</strong>.
          </p>
          <p className="f-small t-secondary" style={{ lineHeight: 1.6 }}>
            Precisa de acesso ou perdeu a senha? Peça ao <strong>administrador</strong> da sua empresa para criar ou
            redefinir o seu usuário.
          </p>
        </div>

        <div className="divider" style={{ margin: 'var(--space-6) 0 var(--space-4)' }} />
        <a href="/login" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Voltar ao login
        </a>
      </div>
    </main>
  );
}