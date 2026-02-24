'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  autoRefresh: boolean;
}

interface EventRow {
  id: number;
  event_id: string;
  event_name: string;
  status: string;
  source_type: string;
  retries: number;
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
  site_id: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Criado</th>
                  <th className="px-4 py-3">Enviado</th>
                  <th className="px-4 py-3">Erro</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.event_id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === event.event_id ? null : event.event_id)}
                  >
                    <td className="px-4 py-3 font-medium">{event.event_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusColors[event.status] || ''}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{event.source_type}</td>
                    <td className="px-4 py-3 text-gray-400">{event.retries}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {event.sent_at ? new Date(event.sent_at).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-red-400 max-w-xs truncate" title={event.error_message || ''}>
                      {event.error_message || '—'}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Nenhum evento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
            Próximo
          </button>
        </div>
      )}
    </div>
  );
}
