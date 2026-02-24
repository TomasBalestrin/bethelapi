'use client';

import { useState, useEffect, useCallback } from 'react';

interface Pixel {
  id: string;
  name: string;
  pixel_id: string;
  is_active: boolean;
  created_at: string;
  sites: Site[];
}

interface Site {
  id: string;
  domain: string;
  ingest_token: string;
  is_active: boolean;
  created_at: string;
}

export function PixelsPanel() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePixel, setShowCreatePixel] = useState(false);
  const [showCreateSite, setShowCreateSite] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Create pixel form
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  // Create site form
  const [siteDomain, setSiteDomain] = useState('');

  const fetchPixels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pixels');
      if (res.ok) {
        const data = await res.json();
        setPixels(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch pixels:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPixels();
  }, [fetchPixels]);

  const createPixel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_pixel',
          name: pixelName,
          pixel_id: pixelId,
          access_token: accessToken,
        }),
      });
      if (res.ok) {
        setShowCreatePixel(false);
        setPixelName('');
        setPixelId('');
        setAccessToken('');
        await fetchPixels();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao criar pixel');
      }
    } catch (err) {
      console.error('Create pixel error:', err);
    }
  };

  const createSite = async (e: React.FormEvent, pixelUuid: string) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_site',
          pixel_uuid: pixelUuid,
          domain: siteDomain,
        }),
      });
      if (res.ok) {
        setShowCreateSite(null);
        setSiteDomain('');
        await fetchPixels();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao criar site');
      }
    } catch (err) {
      console.error('Create site error:', err);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (loading) {
    return <div className="text-gray-400 text-center py-12">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pixels & Sites</h2>
        <button
          onClick={() => setShowCreatePixel(!showCreatePixel)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
        >
          Novo Pixel
        </button>
      </div>

      {/* Create Pixel Form */}
      {showCreatePixel && (
        <form onSubmit={createPixel} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <h3 className="font-medium">Cadastrar Pixel Meta</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={pixelName}
              onChange={(e) => setPixelName(e.target.value)}
              placeholder="Nome (ex: Julia Ottoni)"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <input
              type="text"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="Pixel ID"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Access Token"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition">
              Criar Pixel
            </button>
            <button
              type="button"
              onClick={() => setShowCreatePixel(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Pixels List */}
      {pixels.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center text-gray-500">
          Nenhum pixel cadastrado. Clique em &quot;Novo Pixel&quot; para começar.
        </div>
      ) : (
        pixels.map((pixel) => (
          <div key={pixel.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {/* Pixel header */}
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{pixel.name}</h3>
                  <p className="text-sm text-gray-400 font-mono">Pixel: {pixel.pixel_id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${pixel.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {pixel.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  <button
                    onClick={() => setShowCreateSite(showCreateSite === pixel.id ? null : pixel.id)}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                  >
                    + Site
                  </button>
                </div>
              </div>
            </div>

            {/* Create Site Form */}
            {showCreateSite === pixel.id && (
              <form onSubmit={(e) => createSite(e, pixel.id)} className="p-4 border-b border-gray-800 bg-gray-800/50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={siteDomain}
                    onChange={(e) => setSiteDomain(e.target.value)}
                    placeholder="dominio.com.br"
                    required
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
                    Criar
                  </button>
                </div>
              </form>
            )}

            {/* Sites list */}
            {pixel.sites && pixel.sites.length > 0 && (
              <div className="divide-y divide-gray-800">
                {pixel.sites.map((site) => (
                  <div key={site.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <span className="font-medium">{site.domain}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded font-mono">
                          {site.ingest_token}
                        </code>
                        <button
                          onClick={() => copyToken(site.ingest_token)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {copiedToken === site.ingest_token ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${site.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {site.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(!pixel.sites || pixel.sites.length === 0) && (
              <div className="px-6 py-4 text-sm text-gray-500">
                Nenhum site vinculado. Adicione um domínio.
              </div>
            )}

            {/* SDK snippet */}
            {pixel.sites && pixel.sites.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-800 bg-gray-800/30">
                <p className="text-xs text-gray-400 mb-2">Snippet para instalar no site ({pixel.sites[0].domain}):</p>
                <code className="text-xs text-green-300 block bg-gray-950 p-3 rounded-lg overflow-x-auto">
                  {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/api/gtm.js?site=${pixel.sites[0].domain}" async></script>`}
                </code>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
