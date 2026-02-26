'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DashboardStats } from '@/types/database';

interface Props {
  autoRefresh: boolean;
}

interface StatsResponse extends DashboardStats {
  events_per_hour: Record<string, { total: number; sent: number; failed: number }>;
}

interface PixelWithSites {
  id: string;
  name: string;
  pixel_id: string;
  sites: { id: string; domain: string }[];
}

type FilterValue = { type: 'all' } | { type: 'pixel'; pixel_uuid: string } | { type: 'site'; site_id: string };

export function StatsCards({ autoRefresh }: Props) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [pixels, setPixels] = useState<PixelWithSites[]>([]);
  const [filter, setFilter] = useState<FilterValue>({ type: 'all' });

  useEffect(() => {
    fetch('/api/admin/pixels')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.data) setPixels(data.data);
      })
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({ hours: String(hours) });
      if (filter.type === 'site') params.set('site_id', filter.site_id);
      if (filter.type === 'pixel') params.set('pixel_uuid', filter.pixel_uuid);

      const res = await fetch(`/api/admin/stats?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [hours, filter]);

  useEffect(() => {
    fetchStats();
    if (!autoRefresh) return;
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats, autoRefresh]);

  if (loading) {
    return <div className="text-gray-400 text-center py-12">Carregando...</div>;
  }

  if (!stats) {
    return <div className="text-red-400 text-center py-12">Erro ao carregar stats</div>;
  }

  const cards = [
    { label: 'Total Eventos', value: stats.total_events, color: 'blue' },
    { label: 'Taxa de Sucesso', value: `${stats.success_rate}%`, color: stats.success_rate >= 95 ? 'green' : stats.success_rate >= 80 ? 'yellow' : 'red' },
    { label: 'Latência Média', value: `${stats.avg_latency_ms}ms`, color: stats.avg_latency_ms <= 90000 ? 'green' : 'yellow' },
    { label: 'DLQ Pendentes', value: stats.dlq_count, color: stats.dlq_count === 0 ? 'green' : 'red' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
  };

  const handleFilterChange = (value: string) => {
    if (value === 'all') {
      setFilter({ type: 'all' });
    } else if (value.startsWith('pixel:')) {
      setFilter({ type: 'pixel', pixel_uuid: value.slice(6) });
    } else if (value.startsWith('site:')) {
      setFilter({ type: 'site', site_id: value.slice(5) });
    }
  };

  const currentFilterValue =
    filter.type === 'all'
      ? 'all'
      : filter.type === 'pixel'
        ? `pixel:${filter.pixel_uuid}`
        : `site:${filter.site_id}`;

  return (
    <div className="space-y-6">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Pixel/Site filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filtrar:</label>
          <select
            value={currentFilterValue}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none min-w-[200px]"
          >
            <option value="all">Todos os pixels</option>
            {pixels.map((pixel) => (
              <optgroup key={pixel.id} label={`${pixel.name} (${pixel.pixel_id})`}>
                <option value={`pixel:${pixel.id}`}>
                  {pixel.name} — todos os sites
                </option>
                {pixel.sites?.map((site) => (
                  <option key={site.id} value={`site:${site.id}`}>
                    {site.domain}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Time range selector */}
        <div className="flex gap-2">
          {[1, 6, 12, 24, 48, 168].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-3 py-1 rounded text-sm ${
                hours === h
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`p-6 rounded-xl border ${colorMap[card.color]}`}
          >
            <div className="text-sm opacity-80 mb-1">{card.label}</div>
            <div className="text-3xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* By Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Por Status</h3>
          <div className="space-y-2">
            {Object.entries(stats.by_status || {}).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span className="text-gray-400 capitalize">{status}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
            {Object.keys(stats.by_status || {}).length === 0 && (
              <div className="text-gray-500 text-sm">Nenhum evento no período</div>
            )}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Por Evento</h3>
          <div className="space-y-2">
            {Object.entries(stats.by_event_name || {}).map(([name, count]) => (
              <div key={name} className="flex justify-between items-center">
                <span className="text-gray-400">{name}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
            {Object.keys(stats.by_event_name || {}).length === 0 && (
              <div className="text-gray-500 text-sm">Nenhum evento no período</div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {stats.events_per_hour && Object.keys(stats.events_per_hour).length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Eventos por Hora</h3>
          <div className="overflow-x-auto">
            <div className="flex gap-1 items-end min-w-max" style={{ height: 120 }}>
              {Object.entries(stats.events_per_hour)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([hour, data]) => {
                  const maxVal = Math.max(
                    ...Object.values(stats.events_per_hour).map((d) => d.total),
                    1
                  );
                  const height = Math.max((data.total / maxVal) * 100, 4);
                  return (
                    <div key={hour} className="flex flex-col items-center gap-1">
                      <div
                        className="w-6 bg-blue-500/60 rounded-t hover:bg-blue-500 transition"
                        style={{ height: `${height}px` }}
                        title={`${hour}:00 — ${data.total} total, ${data.sent} sent, ${data.failed} failed`}
                      />
                      <span className="text-xs text-gray-600 -rotate-45 origin-top-left">
                        {hour.slice(11)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
