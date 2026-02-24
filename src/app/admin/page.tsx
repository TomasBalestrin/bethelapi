'use client';

import { useState, useEffect } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { EventsTable } from '@/components/EventsTable';
import { DlqPanel } from '@/components/DlqPanel';
import { PixelsPanel } from '@/components/PixelsPanel';

type Tab = 'dashboard' | 'events' | 'dlq' | 'pixels';

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_secret');
    if (stored) {
      setAdminSecret(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem('admin_secret', adminSecret);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-gray-900 p-8 rounded-xl border border-gray-800 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white mb-6">Bethel GTM Admin</h1>
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="Admin Secret"
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'events', label: 'Eventos' },
    { id: 'dlq', label: 'DLQ' },
    { id: 'pixels', label: 'Pixels & Sites' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Bethel GTM Admin</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-700"
              />
              Auto-refresh
            </label>
            <button
              onClick={() => {
                sessionStorage.removeItem('admin_secret');
                setIsAuthenticated(false);
                setAdminSecret('');
              }}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <StatsCards adminSecret={adminSecret} autoRefresh={autoRefresh} />
        )}
        {activeTab === 'events' && (
          <EventsTable adminSecret={adminSecret} autoRefresh={autoRefresh} />
        )}
        {activeTab === 'dlq' && (
          <DlqPanel adminSecret={adminSecret} autoRefresh={autoRefresh} />
        )}
        {activeTab === 'pixels' && (
          <PixelsPanel adminSecret={adminSecret} />
        )}
      </main>
    </div>
  );
}
