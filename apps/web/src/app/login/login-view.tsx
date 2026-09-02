'use client';

import { useState } from 'react';
import { login } from '@/lib/auth';
import { Button, Field } from '@/app/components/ui';

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar');
    } finally {
      setBusy(false);
    }
  }

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
      <div className="card" style={{ width: 360, padding: 'var(--space-8)' }}>
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <span className="f-h1" style={{ fontWeight: 700 }}>Comercial Ops</span>
          <span className="f-small t-secondary">
            Plataforma de inteligência comercial que encontra oportunidades e transforma intenção em vendas.
          </span>
        </div>

        <form
          className="stack"
          style={{ marginTop: 'var(--space-6)' }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="E-mail">
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && (
            <div className="row" style={{ color: 'var(--danger)', fontSize: 'var(--font-small)' }}>
              <span className="status-dot danger" />
              <span>{error}</span>
            </div>
          )}

          <Button variant="primary" size="lg" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
          <a
            href="/register"
            className="f-small t-muted"
            style={{ textDecoration: 'none' }}
          >
            Esqueci minha senha
          </a>
        </div>

        <div className="divider" style={{ margin: 'var(--space-6) 0 var(--space-4)' }} />
        <p className="f-caption t-muted" style={{ textAlign: 'center', margin: 0 }}>
          Tecnologia que entende vendas.
        </p>
      </div>
    </main>
  );
}