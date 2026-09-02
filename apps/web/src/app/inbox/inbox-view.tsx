'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Icon, Badge, Button, Field, Skeleton } from '@/app/components/ui';
import { formatCurrency, formatDateTime, relativeDays } from '@/lib/format';

interface Message {
  id: string;
  direction: string;
  type: string;
  content: string;
  sentAt: string;
}

interface ConversationOrder {
  id: string;
  number: number | null;
  total: number;
  status: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  whatsapp: string;
  status: string;
  queue: string | null;
  priority: number;
  botEnabled: boolean;
  lastMessageAt: string;
  customer: {
    id: string;
    name: string;
    whatsapp: string | null;
    city: { name: string; state: string } | null;
  } | null;
  assignedUser: { id: string; name: string } | null;
  messages: Message[];
  orders: ConversationOrder[];
}

interface ListResponse {
  data: Conversation[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

interface HandoffContext {
  customer: {
    id: string;
    name: string | null;
    whatsapp: string | null;
    status: string;
    city: string | null;
    totalSpent: number;
    averageTicket: number | null;
    orderCount: number;
    lastPurchaseAt: string | null;
    reorderProbability: number | null;
    avgIntervalDays: number | null;
  };
  lastOrder: { number: number | null; total: number; status: string; createdAt: string } | null;
  frequentProducts: Array<{ name: string; quantity: number }>;
  cart: Array<{ product: string; quantity: number }>;
  recoverableValue: number;
  recommendedApproach: string;
}

export function InboxView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [ctx, setCtx] = useState<HandoffContext | null>(null);
  const [handingOff, setHandingOff] = useState(false);

  useEffect(() => {
    void api<ListResponse>(`/whatsapp/conversations?perPage=50${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then(setData);
  }, [search]);

  useEffect(() => {
    if (!selectedId) return;
    setCtx(null);
    void api<Conversation>(`/whatsapp/conversations/${selectedId}`).then((c) => {
      setSelected(c);
      setReplyText('');
      if (c.customer && (c.status === 'WAITING_HUMAN' || c.status === 'HUMAN_ACTIVE')) {
        void api<HandoffContext>(`/whatsapp/conversations/${selectedId}/handoff-context`).then(setCtx).catch(() => {});
      }
    });
  }, [selectedId]);

  async function transfer() {
    if (!selected || !selected.customer) return;
    setHandingOff(true);
    try {
      const res = await api<{ conversation: Conversation; context: HandoffContext | null }>(`/whatsapp/conversations/${selected.id}/handoff`, {
        method: 'POST',
      });
      setSelected(res.conversation);
      setCtx(res.context);
    } catch {
      void 0;
    } finally {
      setHandingOff(false);
    }
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await api(`/whatsapp/conversations/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ to: selected.whatsapp, text: replyText.trim() }),
      });
      setReplyText('');
      const fresh = await api<Conversation>(`/whatsapp/conversations/${selected.id}`);
      setSelected(fresh);
    } catch {
      void replyText;
    } finally {
      setSending(false);
    }
  }

  const conversations = data?.data ?? [];

  return (
    <AppShell>
      <div className="page" style={{ padding: 'var(--space-4) var(--space-6)' }}>
        <div className="card" style={{ display: 'flex', height: 'calc(100vh - var(--topbar-h) - var(--space-8))', overflow: 'hidden' }}>
          {/* Pane 1: conversations */}
          <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div className="row" style={{ padding: 'var(--space-3)' }}>
              <input
                className="input"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!data ? (
                <Skeleton rows={8} lines={2} />
              ) : conversations.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">Sem conversas</div>
                  <p className="empty-body">As conversas recebidas no WhatsApp aparecerão aqui.</p>
                </div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    className="nav-item"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={selectedId === c.id ? 'page' : undefined}
                    style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <span style={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.customer?.name ?? c.whatsapp}
                        </span>
                        <span className="f-caption t-muted">{relativeDays(c.lastMessageAt)}</span>
                      </div>
                      <div className="f-caption t-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.messages[0]?.content ?? 'Sem mensagens'}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Pane 2: thread */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!selected ? (
              <div className="empty" style={{ flex: 1 }}>
                <Icon name="whatsapp" size={28} />
                <div className="empty-title">Selecione uma conversa</div>
                <p className="empty-body">Escolha uma conversa à esquerda para ver as mensagens.</p>
              </div>
            ) : (
              <>
                <div className="row" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="f-h3" style={{ margin: 0 }}>{selected.customer?.name ?? selected.whatsapp}</div>
                    <div className="f-caption t-muted">{selected.whatsapp}</div>
                  </div>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <Badge tone={selected.botEnabled ? 'ai' : 'neutral'} dot>
                      {selected.botEnabled ? 'IA' : 'Humano'}
                    </Badge>
                    {selected.customer && <Button variant="subtle" size="sm" onClick={() => void transfer()} disabled={handingOff}>
                      {handingOff ? 'Transferindo…' : 'Transferir para atendente'}
                    </Button>}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {selected.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>

                <div className="row" style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)' }}>
                  <input
                    className="input"
                    placeholder="Escreva uma resposta…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && replyText.trim() && !sending) void sendReply();
                    }}
                    style={{ flex: 1 }}
                    disabled={sending}
                  />
                  <Button variant="primary" size="sm" onClick={() => void sendReply()} disabled={!replyText.trim() || sending}>
                    Enviar
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Pane 3: customer */}
          <div style={{ width: 260, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {selected?.customer ? (
<div className="stack" style={{ padding: 'var(--space-4)' }}>
                  <div className="f-label">Cliente</div>
                  <div className="f-h3" style={{ margin: 0 }}>{selected.customer.name}</div>
                  <div className="f-caption t-muted">
                    {ctx?.customer.city ?? (selected.customer.city ? `${selected.customer.city.name}, ${selected.customer.city.state}` : '—')}
                  </div>

                  {ctx && (
                    <>
                      <div className="divider" />
                      <div className="f-label">Resumo para o atendente</div>
                      <p className="f-small" style={{ margin: 0 }}>{ctx.recommendedApproach}</p>

                      <div className="divider" />
                      <div className="stack" style={{ gap: 'var(--space-1)' }}>
                        <SummaryRow label="Receita total" value={formatCurrency(ctx.customer.totalSpent)} />
                        <SummaryRow label="Ticket médio" value={ctx.customer.averageTicket ? formatCurrency(ctx.customer.averageTicket) : '—'} />
                        <SummaryRow label="Pedidos" value={`${ctx.customer.orderCount}`} />
                        <SummaryRow
                          label="Frequência"
                          value={
                            ctx.customer.avgIntervalDays
                              ? `a cada ~${ctx.customer.avgIntervalDays} ${ctx.customer.avgIntervalDays === 1 ? 'dia' : 'dias'}`
                              : '—'
                          }
                        />
                        <SummaryRow
                          label="Última compra"
                          value={ctx.customer.lastPurchaseAt ? relativeDays(ctx.customer.lastPurchaseAt) : '—'}
                        />
                      </div>

                      {ctx.frequentProducts.length > 0 && (
                        <>
                          <div className="divider" />
                          <div className="f-label">Produtos habituais</div>
                          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                            {ctx.frequentProducts.map((p) => (
                              <Badge key={p.name} tone="neutral">{p.name}</Badge>
                            ))}
                          </div>
                        </>
                      )}

                      {ctx.cart.length > 0 && (
                        <>
                          <div className="divider" />
                          <div className="f-label">Carrinho em aberto</div>
                          <div className="stack" style={{ gap: 'var(--space-1)' }}>
                            {ctx.cart.map((i) => (
                              <div key={i.product} className="row">
                                <span className="f-small">{i.product}</span>
                                <span className="spacer" />
                                <span className="f-caption t-muted">{i.quantity}×</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {ctx.recoverableValue > 0 && (
                        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                          <Badge tone="danger">{formatCurrency(ctx.recoverableValue)} recuperáveis</Badge>
                        </div>
                      )}
                    </>
                  )}

                  <div className="divider" />
                  <div className="f-label">Pedidos recentes</div>
                {selected.orders.length === 0 ? (
                  <p className="f-caption t-muted">Sem pedidos.</p>
                ) : (
                  selected.orders.map((o) => (
                    <div key={o.id} className="card-row" style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      <div className="row">
                        <span className="t-mono">{o.number ? `#${o.number}` : '—'}</span>
                        <span className="spacer" />
                        <Badge tone="neutral">{o.status.replace('_', ' ').toLowerCase()}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-title">Cliente</div>
                <p className="empty-body">Selecione uma conversa.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="f-caption t-muted">{label}</span>
      <span className="spacer" />
      <span className="f-small" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'OUTBOUND';
  const isSystem = message.direction === 'SYSTEM';
  const isAi = isOutbound; // simplified: outbound = IA/human from platform

  if (isSystem) {
    return (
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className="f-caption t-muted">{message.content}</span>
      </div>
    );
  }

  return (
    <div className="row" style={{ justifyContent: isOutbound ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}>
      <div
        className="f-small"
        style={{
          maxWidth: '70%',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-md)',
          background: isAi ? 'var(--ai-soft)' : isOutbound ? 'var(--primary-soft)' : 'var(--surface-subtle)',
          color: isAi ? 'var(--ai)' : 'var(--text)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {isAi && (
          <div className="f-caption" style={{ fontWeight: 600, marginBottom: 2 }}>
            <Badge tone="ai" dot>IA</Badge>
          </div>
        )}
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        <div className="f-caption t-muted" style={{ marginTop: 4, fontSize: 10 }}>
          {formatDateTime(message.sentAt)}
          {message.direction === 'INBOUND' ? ' · cliente' : ' · plataforma'}
        </div>
      </div>
    </div>
  );
}