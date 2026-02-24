'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  adminSecret: string;
  autoRefresh: boolean;
}

interface DlqEvent {
  id: number;
  event_id: string;
  event_name: string;
  error_message: string | null;
  failure_reason: string | null;
  retries: number;
  moved_at: string;
  reprocessed_at: string | null;
}

export function DlqPanel({ adminSecret, autoRefresh }: Props) {
  const [events, setEvents] = useState<DlqEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [reprocessingAll, setReprocessingAll] = useState(false);

  const fetchDlq = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/events?source=dlq&limit=100', {
        headers: { 'x-admin-secret': adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch DLQ:', err);
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    fetchDlq();
    if (!autoRefresh) return;
    const interval = setInterval(fetchDlq, 15000);
    return () => clearInterval(interval);
  }, [fetchDlq, autoRefresh]);

  const reprocessEvent = async (eventId: string) => {
    setReprocessing(eventId);
    try {
      const res = await fetch('/api/admin/reprocess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({ event_id: eventId }),
      });
      if (res.ok) {
        await fetchDlq();
      }
    } catch (err) {
      console.error('Reprocess failed:', err);
    } finally {
      setReprocessing(null);
    }
  };

  const reprocessAll = async () => {
    setReprocessingAll(true);
    try {
      const res = await fetch('/api/admin/reprocess-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Reprocessados: ${data.reprocessed} | Falhas: ${data.failed}`);
        await fetchDlq();
      }
    } catch (err) {
      console.error('Reprocess all failed:', err);
    } finally {
      setReprocessingAll(false);
    }
  };

  const pendingEvents = events.filter((e) => !e.reprocessed_at);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dead Letter Queue</h2>
          <p className="text-sm text-gray-400">
            {pendingEvents.length} eventos pendentes de reprocessamento
          </p>
        </div>
        {pendingEvents.length > 0 && (
          <button
            onClick={reprocessAll}
            disabled={reprocessingAll}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
          >
            {reprocessingAll ? 'Reprocessando...' : 'Reprocessar Tudo'}
          </button>
        )}
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
                  <th className="px-4 py-3">Razão</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Erro</th>
                  <th className="px-4 py-3">Movido em</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.event_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium">{event.event_name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs">
                        {event.failure_reason || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{event.retries}</td>
                    <td className="px-4 py-3 text-red-400 max-w-xs truncate" title={event.error_message || ''}>
                      {event.error_message || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(event.moved_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      {event.reprocessed_at ? (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                          Reprocessado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!event.reprocessed_at && (
                        <button
                          onClick={() => reprocessEvent(event.event_id)}
                          disabled={reprocessing === event.event_id}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs transition"
                        >
                          {reprocessing === event.event_id ? '...' : 'Reprocessar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      DLQ vazia — tudo funcionando bem!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
