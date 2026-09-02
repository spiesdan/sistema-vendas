'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/app/components/shell';
import { Badge, Button, Icon, Drawer, Tabs, Skeleton } from '@/app/components/ui';
import { formatCurrency, relativeDays } from '@/lib/format';

interface Lead {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  segment: string | null;
  industry: string | null;
  potential: string | null;
  status: string;
  source: string | null;
  city: { name: string; state: string } | null;
  firstContactAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: Lead[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const STAGES = ['NOVO', 'CONTATO', 'INTERESSADO', 'NEGOCIACAO', 'PRIMEIRO_PEDIDO', 'CLIENTE_ATIVO'];

const STAGE_LABELS: Record<string, string> = {
  NOVO: 'Novos',
  CONTATO: 'Contato',
  INTERESSADO: 'Interessado',
  NEGOCIACAO: 'Negociação',
  PRIMEIRO_PEDIDO: 'Primeiro pedido',
  CLIENTE_ATIVO: 'Cliente ativo',
};

export function LeadsView() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);

  useEffect(() => {
    void api<ListResponse>('/leads?perPage=100').then(setData);
  }, []);

  const leads = data?.data ?? [];
  const buckets = STAGES.map((stage) => ({
    stage,
    items: leads.filter((l) => l.status === stage),
  }));

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="page-title">
            <h1>Leads</h1>
            <p>{data?.meta.total ?? 0} leads no total. Avance o pipeline.</p>
          </div>
          <Button variant="primary" onClick={() => {}}>
            <Icon name="plus" size={14} />
            Novo lead
          </Button>
        </div>

        {!data ? (
          <Skeleton rows={8} lines={3} />
        ) : (
          <div className="stack">
            {buckets.map((b) => (
              <div key={b.stage}>
                <div className="row">
                  <span className="f-h3">{STAGE_LABELS[b.stage] ?? b.stage}</span>
                  <Badge tone={b.items.length > 0 ? 'info' : 'neutral'}>{b.items.length}</Badge>
                </div>
                <div className="card" style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Contato</th>
                        <th>Cidade</th>
                        <th>Potencial</th>
                        <th>Última interação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="f-small t-muted" style={{ padding: 'var(--space-4)' }}>
                            Sem leads nesta etapa.
                          </td>
                        </tr>
                      ) : (
                        b.items.map((l) => (
                          <tr key={l.id} onClick={() => setSelected(l)} tabIndex={0}>
                            <td style={{ fontWeight: 600 }}>{l.companyName}</td>
                            <td className="f-small">{l.contactName ?? '—'}</td>
                            <td className="f-small t-muted">
                              {l.city ? `${l.city.name}, ${l.city.state}` : '—'}
                            </td>
                            <td>
                              <Badge tone={l.potential === 'A' ? 'success' : 'neutral'}>
                                {l.potential ?? '—'}
                              </Badge>
                            </td>
                            <td className="f-small t-muted">
                              {l.firstContactAt ? relativeDays(l.firstContactAt) : 'Sem contato'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={!!selected} title={selected?.companyName} onClose={() => setSelected(null)}>
        {selected ? (
          <LeadDrawer lead={selected} />
        ) : (
          <Skeleton rows={6} lines={2} />
        )}
      </Drawer>
    </AppShell>
  );
}

function LeadDrawer({ lead }: { lead: Lead }) {
  const [tab, setTab] = useState('Visão geral');

  return (
    <div className="stack">
      <div className="f-h3" style={{ margin: 0 }}>{lead.companyName}</div>
      <div className="f-caption t-muted">
        {lead.city ? `${lead.city.name}, ${lead.city.state}` : 'Sem cidade'}
      </div>
      <Badge tone="info" dot>{STAGE_LABELS[lead.status] ?? lead.status}</Badge>

      <div className="divider" />
      <div className="f-label">Dados de contato</div>
      <div className="f-small t-secondary">Contato: {lead.contactName ?? '—'}</div>
      <div className="f-small t-secondary">WhatsApp: {lead.whatsapp ?? '—'}</div>
      <div className="f-small t-secondary">Telefone: {lead.phone ?? '—'}</div>
      <div className="f-small t-secondary">E-mail: {lead.email ?? '—'}</div>
      <div className="f-small t-secondary">Segmento: {lead.segment ?? '—'}</div>
      <div className="f-small t-secondary">Indústria: {lead.industry ?? '—'}</div>
      <div className="f-small t-secondary">Potencial: {lead.potential ?? '—'}</div>
      <div className="f-small t-secondary">Criado: {lead.createdAt ? relativeDays(lead.createdAt) : '—'}</div>

      <div className="divider" />
      <Tabs tabs={['Visão geral', 'Inteligência']} active={tab} onSelect={setTab} />
      {tab === 'Inteligência' && (
        <p className="f-small t-secondary">
          A velocidade de resposta define a conversão. Contate o quanto antes.
        </p>
      )}
    </div>
  );
}