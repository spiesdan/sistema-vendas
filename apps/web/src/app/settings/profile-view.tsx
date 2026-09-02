'use client';

import { useEffect, useState } from 'react';
import { fetchMe, logout, MeUser } from '@/lib/auth';
import { AppShell } from '@/app/components/shell';
import { Avatar, Badge, Button, Field, Skeleton } from '@/app/components/ui';

export function ProfileView() {
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    void fetchMe().then(setUser);
  }, []);

  if (!user) {
    return (
      <AppShell>
        <div className="page">
          <div className="page-title">
            <h1>Perfil</h1>
            <p>Seus dados de acesso à plataforma.</p>
          </div>
          <Skeleton rows={6} lines={2} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Perfil</h1>
            <p>Seus dados de acesso à plataforma.</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 480 }}>
          <div className="row" style={{ gap: 'var(--space-4)' }}>
            <Avatar name={user.name} size="lg" />
            <div style={{ flex: 1 }}>
              <div className="f-h3" style={{ margin: 0 }}>{user.name}</div>
              <div className="f-small t-muted">{user.email}</div>
            </div>
            <Badge tone={user.role === 'ADMIN' ? 'success' : 'neutral'}>
              {user.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
            </Badge>
          </div>
        </div>

        <div className="stack" style={{ maxWidth: 480, marginTop: 'var(--space-6)' }}>
          <div className="card">
            <div className="card-header">
              <span className="f-h3">Dados de acesso</span>
            </div>
            <div className="stack">
              <Field label="Nome">
                <input className="input" defaultValue={user.name} />
              </Field>
              <Field label="E-mail">
                <input className="input" type="email" defaultValue={user.email} />
              </Field>
              <Field label="Nova senha" hint="Deixe em branco para manter a senha atual.">
                <input className="input" type="password" placeholder="••••••••" />
              </Field>
              <Button variant="primary">Salvar alterações</Button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="f-h3">Sessão</span>
            </div>
            <div className="row">
              <span className="f-small t-secondary">Você está conectado como {user.email}</span>
              <span className="spacer" />
              <Button variant="subtle" onClick={() => { logout(); window.location.href = '/login'; }}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}