'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Button, Field, Icon, Skeleton, Toast } from '@/app/components/ui';

interface SettingsShape {
  [key: string]: unknown;
}

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Classificação de clientes',
    keys: [
      'classify.novo_ultimos_dias',
      'classify.inativo_limite_dias',
      'classify.perdido_limite_dias',
      'classify.vip_faturamento_mensual',
    ],
  },
  {
    title: 'Automações',
    keys: ['automatizacao.inativo_limite_dias'],
  },
  {
    title: 'WhatsApp',
    keys: [
      'whatsapp.max_messages_per_customer',
      'whatsapp.interval_min_minutes',
      'whatsapp.working_hours_start',
      'whatsapp.working_hours_end',
      'whatsapp.working_days',
    ],
  },
  {
    title: 'Vendas',
    keys: ['sale.low_stock_threshold'],
  },
];

const LABELS: Record<string, string> = {
  'classify.novo_ultimos_dias': 'Novo cliente (dias)',
  'classify.inativo_limite_dias': 'Inativo após (dias)',
  'classify.perdido_limite_dias': 'Perdido após (dias)',
  'classify.vip_faturamento_mensual': 'VIP: faturamento mensal (R$)',
  'automatizacao.inativo_limite_dias': 'Automatização: inativo após (dias)',
  'whatsapp.max_messages_per_customer': 'Mensagens por cliente',
  'whatsapp.interval_min_minutes': 'Intervalo mínimo (min)',
  'whatsapp.working_hours_start': 'Início do horário comercial',
  'whatsapp.working_hours_end': 'Fim do horário comercial',
  'whatsapp.working_days': 'Dias de trabalho',
  'sale.low_stock_threshold': 'Estoque baixo (quantidade)',
};

export function SettingsView() {
  const [data, setData] = useState<SettingsShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api<SettingsShape>('/settings').then(setData).catch(() => setData({}));
  }, []);

  function set(key: string, value: unknown) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const next = await api<SettingsShape>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      setData(next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Configurações</h1>
            <p>Ajuste as regras de classificação, automação e canais da sua operação.</p>
          </div>
          <Button variant="primary" onClick={() => void save()} disabled={!data || saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>

        {saved && <Toast message="Configurações salvas com sucesso." tone="success" />}

        {!data ? (
          <Skeleton rows={8} lines={2} />
        ) : (
          <div className="stack" style={{ maxWidth: 640 }}>
            {GROUPS.map((g) => (
              <div key={g.title} className="card">
                <div className="card-header">
                  <Icon name="settings" size={16} />
                  <span className="f-h3">{g.title}</span>
                </div>
                <div className="stack">
                  {g.keys.map((key) => (
                    <Field key={key} label={LABELS[key] ?? key}>
                      {key === 'whatsapp.working_days' ? (
                        <select
                          className="input"
                          value={Array.isArray(data[key]) ? (data[key] as string[]).join(',') : ''}
                          onChange={(e) => set(key, e.target.value.split(',').filter(Boolean))}
                        >
                          {['MON,TUE,WED,THU,FRI', 'MON,TUE,WED,THU,FRI,SAT', 'MON,TUE,WED,THU,FRI,SAT,SUN'].map(
                            (opt) => (
                              <option key={opt} value={opt}>
                                {opt
                                  .split(',')
                                  .map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3).toLowerCase())
                                  .join(', ')}
                              </option>
                            ),
                          )}
                        </select>
                      ) : typeof data[key] === 'number' ? (
                        <input
                          className="input"
                          type="number"
                          value={String(data[key])}
                          onChange={(e) => set(key, Number(e.target.value))}
                        />
                      ) : (
                        <input
                          className="input"
                          type={String(data[key]).includes(':') ? 'time' : 'text'}
                          value={String(data[key])}
                          onChange={(e) => set(key, e.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}