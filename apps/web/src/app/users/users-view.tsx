'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fetchMe, MeUser } from '@/lib/auth';
import { AppShell } from '@/app/components/shell';
import { Badge, Button, Field, Icon, Skeleton } from '@/app/components/ui';
import { formatDateTime } from '@/lib/format';

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  COMERCIAL: 'Comercial',
  REPRESENTANTE: 'Representante',
  ATENDENTE: 'Atendente',
  MARKETING: 'Marketing',
  FINANCEIRO: 'Financeiro',
  SUPORTE: 'Suporte',
};

const ROLE_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ADMIN: 'danger',
  GESTOR: 'warning',
  COMERCIAL: 'success',
  REPRESENTANTE: 'success',
  ATENDENTE: 'info',
  MARKETING: 'info',
  FINANCEIRO: 'neutral',
  SUPORTE: 'neutral',
};

export function UsersView() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'COMERCIAL' });

  useEffect(() => {
    void fetchMe().then((u) => {
      setMe(u);
      if (u && (u.role === 'ADMIN' || u.role === 'GESTOR')) {
        void api<TeamUser[]>('/users').then(setUsers).catch(() => setUsers([]));
      }
    });
  }, []);

  const load = () => void api<TeamUser[]>('/users').then(setUsers);

  async function saveUser(id: string, data: { role?: string; active?: boolean }) {
    setSaving(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ userId: id, ...data }) });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function createUser() {
    setError('');
    if (!form.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) || form.password.length < 6) {
      setError('Preencha nome, e-mail válido e senha com ao menos 6 caracteres.');
      return;
    }
    setCreating(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role }),
      });
      setForm({ name: '', email: '', password: '', role: 'COMERCIAL' });
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário');
      setCreating(false);
    }
  }

  const isAdmin = me?.role === 'ADMIN';
  const canView = me?.role === 'ADMIN' || me?.role === 'GESTOR';

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Equipe & permissões</h1>
            <p>Gerencie usuários, papéis e acesso ao sistema.</p>
          </div>
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            <Icon name="plus" size={14} />
            {creating ? 'Fechar' : 'Novo usuário'}
          </Button>
        </div>

        {!canView ? (
          <div className="empty">
            <div className="empty-title">Sem permissão</div>
            <p className="empty-body">Somente administradores e gestores acessam a equipe.</p>
          </div>
        ) : (
          <>
            {creating && (
              <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
                <div className="f-h3" style={{ margin: 0 }}>Criar usuário</div>
                <div className="row" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <Field label="Nome">
                    <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field>
                  <Field label="E-mail">
                    <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </Field>
                  <Field label="Senha inicial">
                    <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </Field>
                  <Field label="Papel">
                    <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {error && <Badge tone="danger">{error}</Badge>}
                <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                  <Button variant="primary" onClick={() => void createUser()} disabled={creating}>
                    {creating ? 'Criando…' : 'Criar usuário'}
                  </Button>
                </div>
              </div>
            )}

            <div className="card" style={{ overflowX: 'auto' }}>
              {!users ? (
                <Skeleton rows={6} lines={3} />
              ) : users.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">Sem usuários</div>
                  <p className="empty-body">Crie o primeiro integrante da equipe.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>E-mail</th>
                      <th>Papel</th>
                      <th>Último acesso</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600 }}>{u.name}</td>
                        <td className="f-caption t-muted">{u.email}</td>
                        <td>
                          {isAdmin ? (
                            <select
                              className="input"
                              style={{ padding: '4px 8px', fontSize: 'var(--font-xs)' }}
                              value={u.role}
                              disabled={saving || u.id === me?.id}
                              onChange={(e) => void saveUser(u.id, { role: e.target.value })}
                            >
                              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge tone={ROLE_TONES[u.role] ?? 'neutral'}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                          )}
                        </td>
                        <td className="f-caption t-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}</td>
                        <td>
                          {isAdmin && u.id !== me?.id ? (
                            <Button
                              variant={u.active ? 'subtle' : 'primary'}
                              size="sm"
                              onClick={() => void saveUser(u.id, { active: !u.active })}
                              disabled={saving}
                            >
                              {u.active ? 'Ativo' : 'Inativo'}
                            </Button>
                          ) : (
                            <Badge tone={u.active ? 'success' : 'neutral'} dot>{u.active ? 'Ativo' : 'Inativo'}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}