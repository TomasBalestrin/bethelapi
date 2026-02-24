'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { StatsCards } from '@/components/StatsCards';
import { EventsTable } from '@/components/EventsTable';
import { DlqPanel } from '@/components/DlqPanel';
import { PixelsPanel } from '@/components/PixelsPanel';

type Tab = 'dashboard' | 'events' | 'dlq' | 'pixels';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

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
              onClick={handleLogout}
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
          <StatsCards autoRefresh={autoRefresh} />
        )}
        {activeTab === 'events' && (
          <EventsTable autoRefresh={autoRefresh} />
        )}
        {activeTab === 'dlq' && (
          <DlqPanel autoRefresh={autoRefresh} />
        )}
        {activeTab === 'pixels' && (
          <PixelsPanel />
        )}
      </main>
    </div>
  );
}
