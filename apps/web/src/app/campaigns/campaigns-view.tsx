'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Badge, Button, Field, Icon, MetricCard, Progress } from '@/app/components/ui';

const STEPS = [
  { key: 'audience', label: 'Público' },
  { key: 'message', label: 'Mensagem' },
  { key: 'preview', label: 'Prévia' },
  { key: 'schedule', label: 'Agendamento' },
  { key: 'results', label: 'Resultados' },
];

const AUDIENCE_FILTERS: Record<string, { filters: Record<string, unknown>; label: string }> = {
  inactive30: {
    label: 'Clientes sem comprar há 30 dias',
    filters: { statuses: ['ATIVO', 'EM_RISCO', 'INATIVO'], inactiveSinceDays: 30, minOrderCount: 1 },
  },
  inactive60: {
    label: 'Clientes sem comprar há 60 dias',
    filters: { statuses: ['ATIVO', 'EM_RISCO', 'INATIVO'], inactiveSinceDays: 60, minOrderCount: 1 },
  },
  atrisk: {
    label: 'Clientes em risco',
    filters: { statuses: ['EM_RISCO'], minOrderCount: 1 },
  },
  reorder: {
    label: 'Clientes aptos a recompra',
    filters: { statuses: ['ATIVO', 'VIP'], activeSinceDays: 60, minOrderCount: 1 },
  },
};

export function CampaignsView() {
  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState('inactive30');
  const [message, setMessage] = useState(
    'Olá {nome}! Faz tempo que você não compra da gente. Para te receber de volta, preparamos um atendimento especial. Quer que eu te ajude?',
  );
  const [schedule, setSchedule] = useState('now');
  const [datetime, setDatetime] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; campaignId?: string; sent?: number; failed?: number; total?: number } | null>(null);
  const router = useRouter();

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const selected = AUDIENCE_FILTERS[audience];

  const compiledName = useMemo(() => {
    const label = selected.label.toLowerCase();
    return label[0].toUpperCase() + label.slice(1);
  }, [selected.label]);

  const sendCampaign = async () => {
    setSending(true);
    setResult(null);
    try {
      const payload = {
        name: compiledName,
        type: 'REATIVACAO',
        message,
        filters: { ...selected.filters, whatsapp: true },
        status: schedule === 'later' ? 'SCHEDULED' : 'DRAFT',
        scheduledFor: schedule === 'later' && datetime ? datetime : undefined,
        maxMessagesPerCustomer: 1,
        onlyWorkHours: true,
      };
      const campaign = await api<{ id: string }>('/campaigns', { method: 'POST', body: JSON.stringify(payload) });
      await api(`/campaigns/${campaign.id}/prepare`, { method: 'POST' });
      if (schedule === 'now') {
        const stats = await api<{ sent: number; failed: number; remaining: number }>(`/campaigns/${campaign.id}/send`, {
          method: 'POST',
          body: JSON.stringify({ limit: 500 }),
        });
        setResult({ ok: true, campaignId: campaign.id, sent: stats.sent, failed: stats.failed, total: stats.sent + stats.failed });
      } else {
        setResult({ ok: true, campaignId: campaign.id, sent: 0, failed: 0, total: 0 });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao enviar campanha',
      });
    } finally {
      setSending(false);
    }
  };

  const sendLabel = () => {
    if (sending) return 'Enviando…';
    return schedule === 'now' ? 'Enviar campanha' : 'Agendar campanha';
  };

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Campanhas</h1>
            <p>Dispare mensagens em massa pelo WhatsApp em etapas.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setStep(0);
              setResult(null);
            }}
          >
            <Icon name="plus" size={14} />
            Nova campanha
          </Button>
        </div>

        {result?.ok ? (
          <div className="stack">
            <div className="card">
              <div className="row">
                <Badge tone="success" dot>Concluída</Badge>
                <span className="f-small t-secondary">
                  Campanha "{compiledName}" · {schedule === 'now' ? 'enviada agora' : `agendada para ${datetime || 'em breve'}`}
                </span>
              </div>
              <div className="f-h3" style={{ marginTop: 'var(--space-3)' }}>Resultados</div>
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <MetricCard label="Enviadas" value={result.total ? `${result.total}` : 'Agendada'} />
                <MetricCard label="Falhas" value={`${result.failed ?? 0}`} />
                <MetricCard label="Respondidas" value="0" />
              </div>
            </div>
            <div className="empty">
              <div className="empty-title">Acompanhe o desempenho</div>
              <p className="empty-body">As respostas e as conversões aparecerão aqui conforme os clientes responderem.</p>
              <Button variant="primary" onClick={() => router.push('/inbox')}>Abrir caixa de entrada</Button>
            </div>
          </div>
        ) : result?.ok === false ? (
          <div className="card">
            <div className="row">
              <Badge tone="danger" dot>Não enviada</Badge>
            </div>
            <p className="f-small t-secondary" style={{ marginTop: 'var(--space-2)' }}>{result.error}</p>
            <div className="row" style={{ marginTop: 'var(--space-4)' }}>
              <Button variant="primary" onClick={() => { setResult(null); setStep(3); }}>Ajustar agendamento</Button>
              <Button variant="subtle" onClick={() => { setResult(null); sendCampaign(); }} disabled={sending}>Tentar novamente</Button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="row" style={{ gap: 'var(--space-4)' }}>
              <Progress value={progress} />
              <span className="f-caption t-muted" style={{ whiteSpace: 'nowrap' }}>
                Etapa {step + 1} de {STEPS.length} · {STEPS[step].label}
              </span>
            </div>
            <div className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {STEPS.map((s, i) => (
                <Badge key={s.key} tone={i === step ? 'info' : i < step ? 'success' : 'neutral'}>
                  {i + 1}. {s.label}
                </Badge>
              ))}
            </div>

            <div className="stack" style={{ marginTop: 'var(--space-6)' }}>
              {step === 0 && (
                <>
                  <div className="f-h3">Quem receberá esta campanha?</div>
                  <div className="stack">
                    {Object.entries(AUDIENCE_FILTERS).map(([id, a]) => (
                      <button
                        key={id}
                        className="card-row row"
                        style={{ padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', border: audience === id ? '1px solid var(--primary)' : undefined }}
                        onClick={() => setAudience(id)}
                      >
                        <span style={{ fontWeight: 550 }}>{a.label}</span>
                        <span className="spacer" />
                        <span className="f-caption t-muted">base de clientes</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="f-h3">Mensagem da campanha</div>
                  <Field label="Texto" hint="Você pode usar {nome} para personalizar.">
                    <textarea
                      className="input"
                      rows={6}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="f-h3">Prévia da mensagem</div>
                  <div className="card" style={{ background: 'var(--surface-subtle)', maxWidth: 420 }}>
                    <div className="f-caption t-muted">Maria Santos · WhatsApp</div>
                    <div className="f-small" style={{ marginTop: 'var(--space-2)', whiteSpace: 'pre-wrap' }}>
                      {message.replaceAll('{nome}', 'Maria')}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="f-h3">Quando enviar?</div>
                  <div className="stack">
                    <button className="card-row row" style={{ padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', border: schedule === 'now' ? '1px solid var(--primary)' : undefined }} onClick={() => setSchedule('now')}>
                      <Icon name="zap" size={16} />
                      <span style={{ fontWeight: 550 }}>Agora</span>
                      <span className="spacer" />
                      <span className="f-caption t-muted">Envia imediatamente</span>
                    </button>
                    <button className="card-row row" style={{ padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', border: schedule === 'later' ? '1px solid var(--primary)' : undefined }} onClick={() => setSchedule('later')}>
                      <Icon name="clock" size={16} />
                      <span style={{ fontWeight: 550 }}>Agendar</span>
                      <span className="spacer" />
                      <span className="f-caption t-muted">Escolha data e hora</span>
                    </button>
                    {schedule === 'later' && (
                      <Field label="Data e hora">
                        <input className="input" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
                      </Field>
                    )}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="f-h3">Confirmar e enviar</div>
                  <div className="card-row row" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <div>
                      <div className="f-small" style={{ fontWeight: 600 }}>{selected.label}</div>
                      <div className="f-caption t-muted">{schedule === 'now' ? 'enviar agora' : `agendar para ${datetime || '—'}`} · horário comercial respeitado</div>
                    </div>
                  </div>
                  {result?.error && <Badge tone="danger">{result.error}</Badge>}
                  <p className="f-small t-secondary">
                    O envio respeita o limite de mensagens por cliente e o horário comercial configurados.
                  </p>
                  <div className="row">
                    <Button variant="primary" size="lg" onClick={sendCampaign} disabled={sending}>
                      {sendLabel()}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="row" style={{ marginTop: 'var(--space-6)' }}>
              <Button variant="subtle" disabled={step === 0 || sending} onClick={() => setStep(step - 1)}>Voltar</Button>
              <span className="spacer" />
              {step < STEPS.length - 1 && (
                <Button variant="primary" onClick={() => setStep(step + 1)}>
                  Continuar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}