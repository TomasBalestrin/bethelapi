'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  autoRefresh: boolean;
}

interface MetaResponse {
  events_received?: number;
  fbtrace_id?: string;
  messages?: string[];
  fb_api_latency_ms?: number;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

interface EventRow {
  id: number;
  event_id: string;
  event_name: string;
  status: string;
  source_type: string;
  retries: number;
  created_at: string;
  queued_at: string | null;
  processing_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  site_id: string | null;
  meta_response: MetaResponse | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function getLatencyColor(ms: number): string {
  if (ms <= 5000) return 'text-green-400';
  if (ms <= 30000) return 'text-yellow-400';
  return 'text-red-400';
}

function getLatencyBgColor(ms: number): string {
  if (ms <= 5000) return 'bg-green-500/10';
  if (ms <= 30000) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
}

function getDeliveryInfo(event: EventRow): {
  label: string;
  color: string;
  bgColor: string;
  detail: string;
} {
  if (event.status === 'queued' || event.status === 'processing') {
    return {
      label: 'Pendente',
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/20',
      detail: 'Aguardando envio ao Facebook',
    };
  }

  if (event.status === 'skipped') {
    return {
      label: 'Ignorado',
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      detail: 'Evento ignorado (sem consentimento)',
    };
  }

  if (!event.meta_response) {
    if (event.status === 'failed' || event.status === 'dlq') {
      return {
        label: 'Falhou',
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        detail: event.error_message || 'Erro ao enviar',
      };
    }
    return {
      label: 'Sem resposta',
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      detail: 'Nenhuma resposta da Meta API',
    };
  }

  const meta = event.meta_response;

  if (meta.error) {
    return {
      label: 'Rejeitado',
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      detail: `[${meta.error.code}] ${meta.error.message}`,
    };
  }

  if (meta.events_received && meta.events_received > 0) {
    return {
      label: 'Confirmado',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      detail: `Facebook confirmou ${meta.events_received} evento(s)${meta.fbtrace_id ? ` | trace: ${meta.fbtrace_id}` : ''}`,
    };
  }

  return {
    label: 'Incerto',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    detail: JSON.stringify(meta).substring(0, 200),
  };
}

export function EventsTable({ autoRefresh }: Props) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: '50',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (eventNameFilter) params.set('event_name', eventNameFilter);

      const res = await fetch(`/api/admin/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data || []);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, statusFilter, eventNameFilter]);

  useEffect(() => {
    setLoading(true);
    fetchEvents();
    if (!autoRefresh) return;
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [fetchEvents, autoRefresh]);

  const statusColors: Record<string, string> = {
    queued: 'bg-yellow-500/20 text-yellow-300',
    processing: 'bg-blue-500/20 text-blue-300',
    sent: 'bg-green-500/20 text-green-300',
    failed: 'bg-red-500/20 text-red-300',
    dlq: 'bg-red-700/20 text-red-400',
    skipped: 'bg-gray-500/20 text-gray-400',
    received: 'bg-purple-500/20 text-purple-300',
  };

  const calculateLatency = (event: EventRow): { total: number | null; toFb: number | null } => {
    const created = new Date(event.created_at).getTime();
    const sent = event.sent_at ? new Date(event.sent_at).getTime() : null;
    const queued = event.queued_at ? new Date(event.queued_at).getTime() : null;
    const processing = event.processing_at ? new Date(event.processing_at).getTime() : null;

    return {
      total: sent ? sent - created : null,
      toFb: sent && processing ? sent - processing : (sent && queued ? sent - queued : null),
    };
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">Todos os status</option>
          {['received', 'queued', 'processing', 'sent', 'failed', 'dlq', 'skipped'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          value={eventNameFilter}
          onChange={(e) => { setEventNameFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          placeholder="Filtrar por evento..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />

        <div className="ml-auto text-sm text-gray-400 flex items-center">
          {pagination.total} eventos encontrados
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>Latencia: <span className="text-green-400">verde &le;5s</span> | <span className="text-yellow-400">amarelo &le;30s</span> | <span className="text-red-400">vermelho &gt;30s</span></span>
        <span>Entrega FB: <span className="text-green-400">Confirmado</span> | <span className="text-yellow-400">Incerto</span> | <span className="text-red-400">Rejeitado/Falhou</span></span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="text-gray-400 text-center py-12">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800">
                <tr className="text-gray-400 text-left">
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Latencia</th>
                  <th className="px-4 py-3">Entrega FB</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Criado</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const latency = calculateLatency(event);
                  const delivery = getDeliveryInfo(event);
                  const isExpanded = expandedId === event.event_id;

                  return (
                    <tr
                      key={event.event_id}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer ${isExpanded ? 'bg-gray-800/20' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : event.event_id)}
                    >
                      <td className="px-4 py-3 font-medium">{event.event_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${statusColors[event.status] || ''}`}>
                          {event.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{event.source_type}</td>
                      {/* Latency column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {latency.total !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono ${getLatencyColor(latency.total)} ${getLatencyBgColor(latency.total)}`}
                            title={`Total: ${formatLatency(latency.total)}${latency.toFb !== null ? ` | Envio FB: ${formatLatency(latency.toFb)}` : ''}`}
                          >
                            {formatLatency(latency.total)}
                          </span>
                        ) : event.status === 'queued' || event.status === 'processing' ? (
                          <span className="text-gray-500 text-xs animate-pulse">em fila...</span>
                        ) : (
                          <span className="text-gray-600 text-xs">--</span>
                        )}
                      </td>
                      {/* FB Delivery column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${delivery.color} ${delivery.bgColor}`}
                          title={delivery.detail}
                        >
                          {delivery.label === 'Confirmado' && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {delivery.label === 'Rejeitado' && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          {delivery.label === 'Falhou' && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          {(delivery.label === 'Pendente' || delivery.label === 'Incerto') && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          {delivery.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{event.retries}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(event.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
                {/* Expanded detail rows rendered separately */}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Nenhum evento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Expanded detail panel (below table) */}
            {expandedId && (() => {
              const event = events.find(e => e.event_id === expandedId);
              if (!event) return null;
              const latency = calculateLatency(event);
              const delivery = getDeliveryInfo(event);

              return (
                <div className="border-t border-gray-700 bg-gray-800/40 px-6 py-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    {/* Timing breakdown */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-300 text-sm">Linha do Tempo</h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Criado:</span>
                          <span className="font-mono">{new Date(event.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        {event.queued_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Na fila:</span>
                            <span className="font-mono">{new Date(event.queued_at).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                        {event.processing_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Processando:</span>
                            <span className="font-mono">{new Date(event.processing_at).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                        {event.sent_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Enviado:</span>
                            <span className="font-mono">{new Date(event.sent_at).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                        {latency.total !== null && (
                          <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                            <span className="text-gray-300 font-medium">Latencia total:</span>
                            <span className={`font-mono font-bold ${getLatencyColor(latency.total)}`}>
                              {formatLatency(latency.total)}
                            </span>
                          </div>
                        )}
                        {latency.toFb !== null && (
                          <div className="flex justify-between">
                            <span className="text-gray-300 font-medium">Tempo envio FB:</span>
                            <span className={`font-mono font-bold ${getLatencyColor(latency.toFb)}`}>
                              {formatLatency(latency.toFb)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* FB Delivery detail */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-300 text-sm">Entrega Facebook</h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Status:</span>
                          <span className={`font-medium ${delivery.color}`}>{delivery.label}</span>
                        </div>
                        {event.meta_response && (
                          <>
                            {event.meta_response.events_received !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Eventos recebidos pelo FB:</span>
                                <span className="font-mono">{event.meta_response.events_received}</span>
                              </div>
                            )}
                            {event.meta_response.fb_api_latency_ms !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Tempo resposta Meta API:</span>
                                <span className={`font-mono font-bold ${getLatencyColor(event.meta_response.fb_api_latency_ms)}`}>
                                  {formatLatency(event.meta_response.fb_api_latency_ms)}
                                </span>
                              </div>
                            )}
                            {event.meta_response.fbtrace_id && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">FB Trace ID:</span>
                                <span className="font-mono text-gray-300">{event.meta_response.fbtrace_id}</span>
                              </div>
                            )}
                            {event.meta_response.messages && event.meta_response.messages.length > 0 && (
                              <div className="mt-1">
                                <span className="text-gray-400">Mensagens:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {event.meta_response.messages.map((msg, i) => (
                                    <li key={i} className="text-yellow-400 pl-2 border-l border-yellow-500/30">{msg}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {event.meta_response.error && (
                              <div className="mt-1 p-2 bg-red-500/10 rounded border border-red-500/20">
                                <div className="text-red-400 font-medium">Erro Meta API:</div>
                                <div className="text-red-300 mt-1">{event.meta_response.error.message}</div>
                                <div className="text-red-400/60 mt-0.5">
                                  Tipo: {event.meta_response.error.type} | Codigo: {event.meta_response.error.code}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {event.error_message && !event.meta_response?.error && (
                          <div className="mt-1 p-2 bg-red-500/10 rounded border border-red-500/20">
                            <div className="text-red-400">{event.error_message}</div>
                          </div>
                        )}
                        {!event.meta_response && event.status !== 'queued' && event.status !== 'processing' && event.status !== 'skipped' && (
                          <div className="text-gray-500 italic">Nenhuma resposta da Meta API registrada</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Event ID */}
                  <div className="mt-3 pt-2 border-t border-gray-700 flex justify-between text-xs text-gray-500">
                    <span>ID: {event.event_id}</span>
                    <span>Site: {event.site_id || 'N/A'}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="px-3 py-1 bg-gray-800 rounded text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-400">
            {pagination.page} / {pagination.pages}
          </span>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="px-3 py-1 bg-gray-800 rounded text-sm disabled:opacity-50"
          >
            Proximo
          </button>
        </div>
      )}
    </div>
  );
}
