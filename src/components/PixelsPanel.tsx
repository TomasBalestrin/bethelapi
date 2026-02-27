'use client';

import { useState, useEffect, useCallback } from 'react';

interface Pixel {
  id: string;
  name: string;
  pixel_id: string;
  access_token: string;
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

const BETHEL_EVENTS = [
  {
    name: 'PageView',
    description: 'Dispara automaticamente quando a página carrega.',
    auto: true,
    trigger: 'Carregamento da página',
  },
  {
    name: 'ViewContent',
    description: 'Dispara quando o usuário rola ≥ 50% da página E permanece ≥ 15 segundos.',
    auto: true,
    trigger: 'scroll ≥ 50% + tempo ≥ 15s',
  },
  {
    name: 'ClickCTA',
    description: 'Dispara quando o usuário clica em qualquer botão, link ou elemento com role="button".',
    auto: true,
    trigger: 'Click em <button>, <a>, [role="button"]',
  },
];

// SVG icons inline
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function PixelsPanel() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePixel, setShowCreatePixel] = useState(false);
  const [showCreateSite, setShowCreateSite] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPixels, setExpandedPixels] = useState<Set<string>>(new Set());
  const [showEventsFor, setShowEventsFor] = useState<string | null>(null);
  const [deletingPixel, setDeletingPixel] = useState<string | null>(null);
  const [deletingSite, setDeletingSite] = useState<string | null>(null);
  const [testingPixel, setTestingPixel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ pixelId: string; success: boolean; message: string } | null>(null);

  // Create pixel form
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [creatingPixel, setCreatingPixel] = useState(false);
  const [pixelError, setPixelError] = useState<string | null>(null);

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

  const togglePixel = (id: string) => {
    setExpandedPixels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const createPixel = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingPixel(true);
    setPixelError(null);
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
        const result = await res.json();
        setShowCreatePixel(false);
        setPixelName('');
        setPixelId('');
        setAccessToken('');
        setPixelError(null);
        await fetchPixels();
        // Auto-expand the new pixel
        if (result.data?.id) {
          setExpandedPixels((prev) => new Set(prev).add(result.data.id));
        }
      } else {
        const err = await res.json();
        setPixelError(err.error || 'Erro ao criar pixel');
      }
    } catch (err) {
      console.error('Create pixel error:', err);
      setPixelError('Erro de conexão ao criar pixel.');
    } finally {
      setCreatingPixel(false);
    }
  };

  const deletePixel = async (pixelUuid: string, name: string) => {
    if (!confirm(`Apagar o pixel "${name}"?\n\nTodos os domínios vinculados também serão removidos.`)) return;
    setDeletingPixel(pixelUuid);
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pixel', pixel_id: pixelUuid }),
      });
      if (res.ok) {
        await fetchPixels();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao apagar pixel');
      }
    } catch (err) {
      console.error('Delete pixel error:', err);
    } finally {
      setDeletingPixel(null);
    }
  };

  const deleteSite = async (siteId: string, domain: string) => {
    if (!confirm(`Remover o domínio "${domain}"?`)) return;
    setDeletingSite(siteId);
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'site', site_id: siteId }),
      });
      if (res.ok) {
        await fetchPixels();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao remover domínio');
      }
    } catch (err) {
      console.error('Delete site error:', err);
    } finally {
      setDeletingSite(null);
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
        alert(err.error || 'Erro ao adicionar domínio');
      }
    } catch (err) {
      console.error('Create site error:', err);
    }
  };

  const sendTestEvent = async (pixelUuid: string) => {
    setTestingPixel(pixelUuid);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_event', pixel_uuid: pixelUuid }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          pixelId: pixelUuid,
          success: true,
          message: `Evento recebido pela Meta (${data.events_received} evento${data.events_received !== 1 ? 's' : ''}).`,
        });
      } else {
        setTestResult({
          pixelId: pixelUuid,
          success: false,
          message: data.error || 'Falha ao enviar evento teste.',
        });
      }
    } catch {
      setTestResult({
        pixelId: pixelUuid,
        success: false,
        message: 'Erro de conexão ao enviar evento teste.',
      });
    } finally {
      setTestingPixel(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <div className="text-gray-400 text-center py-12">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
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
          {pixelError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-sm text-red-300">
              {pixelError}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <button
              type="submit"
              disabled={creatingPixel}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingPixel ? 'Validando token...' : 'Criar Pixel'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreatePixel(false); setPixelError(null); }}
              disabled={creatingPixel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition disabled:opacity-50"
            >
              Cancelar
            </button>
            {creatingPixel && (
              <span className="text-xs text-gray-400">Verificando access token na Meta API...</span>
            )}
          </div>
        </form>
      )}

      {/* Pixels List */}
      {pixels.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center text-gray-500">
          Nenhum pixel cadastrado. Clique em &quot;Novo Pixel&quot; para começar.
        </div>
      ) : (
        pixels.map((pixel) => {
          const isExpanded = expandedPixels.has(pixel.id);

          return (
            <div key={pixel.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              {/* ── Pixel Header (always visible) ── */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800/40 transition select-none"
                onClick={() => togglePixel(pixel.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isExpanded ? <ChevronDown className="text-gray-400 shrink-0" /> : <ChevronRight className="text-gray-400 shrink-0" />}
                  <h3 className="font-semibold truncate">{pixel.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${pixel.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {pixel.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="text-xs text-gray-500 font-mono hidden sm:inline">{pixel.pixel_id}</span>
                  {pixel.sites?.length > 0 && (
                    <span className="text-[10px] text-gray-500 shrink-0">{pixel.sites.length} domínio{pixel.sites.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => sendTestEvent(pixel.id)}
                    disabled={testingPixel === pixel.id}
                    className="px-2.5 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 rounded text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Enviar evento teste para a Meta"
                  >
                    {testingPixel === pixel.id ? 'Enviando...' : 'Testar'}
                  </button>
                  <button
                    onClick={() => setShowEventsFor(showEventsFor === pixel.id ? null : pixel.id)}
                    className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded text-xs transition"
                  >
                    Eventos
                  </button>
                  <button
                    onClick={() => deletePixel(pixel.id, pixel.name)}
                    disabled={deletingPixel === pixel.id}
                    className="p-1.5 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded transition disabled:opacity-50"
                    title="Apagar pixel"
                  >
                    {deletingPixel === pixel.id ? <span className="text-xs px-1">...</span> : <TrashIcon />}
                  </button>
                </div>
              </div>

              {/* ── Test Event Result ── */}
              {testResult && testResult.pixelId === pixel.id && (
                <div className={`px-5 py-2.5 border-t text-sm flex items-center justify-between ${
                  testResult.success
                    ? 'bg-green-500/10 border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <span>{testResult.success ? 'Integração OK' : 'Falha'} — {testResult.message}</span>
                  <button
                    onClick={() => setTestResult(null)}
                    className="text-xs opacity-60 hover:opacity-100 ml-3 shrink-0"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* ── Events Panel (independent of expand) ── */}
              {showEventsFor === pixel.id && (
                <div className="px-5 py-4 border-t border-gray-800 bg-gray-800/20">
                  <h4 className="text-sm font-medium text-purple-300 mb-3">Eventos Disparados Automaticamente</h4>
                  <p className="text-xs text-gray-500 mb-4">
                    Todos os eventos abaixo são disparados automaticamente pelo script Bethel. Não precisa de nenhum código adicional.
                  </p>
                  <div className="space-y-2">
                    {BETHEL_EVENTS.map((event) => (
                      <div key={event.name} className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-700/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-blue-300 font-semibold">{event.name}</code>
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded text-[10px]">AUTO</span>
                          </div>
                          <span className="text-[11px] text-gray-500 font-mono">{event.trigger}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{event.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Expanded Content ── */}
              {isExpanded && (
                <>
                  {/* Pixel Info */}
                  <div className="px-5 py-3 border-t border-gray-800 bg-gray-800/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500 block">Pixel ID</span>
                        <code className="text-gray-300 font-mono">{pixel.pixel_id}</code>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Access Token</span>
                        <code className="text-gray-300 font-mono">
                          {pixel.access_token ? `${pixel.access_token.substring(0, 8)}...` : 'N/A'}
                        </code>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Criado em</span>
                        <span className="text-gray-300">{new Date(pixel.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Domínios</span>
                        <span className="text-gray-300">{pixel.sites?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Add Site button */}
                  <div className="px-5 py-2 border-t border-gray-800">
                    <button
                      onClick={() => setShowCreateSite(showCreateSite === pixel.id ? null : pixel.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      + Adicionar domínio
                    </button>
                  </div>

                  {/* Create Site Form */}
                  {showCreateSite === pixel.id && (
                    <form onSubmit={(e) => createSite(e, pixel.id)} className="px-5 pb-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={siteDomain}
                          onChange={(e) => setSiteDomain(e.target.value)}
                          placeholder="dominio.com.br"
                          required
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500"
                        />
                        <button type="submit" className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs transition">
                          Adicionar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Sites list */}
                  {pixel.sites && pixel.sites.length > 0 ? (
                    <div className="divide-y divide-gray-800">
                      {pixel.sites.map((site) => {
                        const snippet = `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/api/gtm.js?site=${site.domain}" async></script>`;
                        const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/${site.id}`;
                        return (
                          <div key={site.id} className="px-5 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-sm truncate">{site.domain}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${site.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                  {site.is_active ? 'Ativo' : 'Inativo'}
                                </span>
                              </div>
                              <button
                                onClick={() => deleteSite(site.id, site.domain)}
                                disabled={deletingSite === site.id}
                                className="p-1 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded transition disabled:opacity-50"
                                title="Remover domínio"
                              >
                                {deletingSite === site.id ? <span className="text-[10px] px-1">...</span> : <TrashIcon />}
                              </button>
                            </div>

                            {/* Token */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <code className="text-[11px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded font-mono">
                                {site.ingest_token}
                              </code>
                              <button
                                onClick={() => copyToClipboard(site.ingest_token, `token-${site.id}`)}
                                className="text-[11px] text-blue-400 hover:text-blue-300"
                              >
                                {copiedId === `token-${site.id}` ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>

                            {/* Snippet */}
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-gray-500">Snippet:</span>
                                <button
                                  onClick={() => copyToClipboard(snippet, `snip-${site.id}`)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300"
                                >
                                  {copiedId === `snip-${site.id}` ? 'Copiado!' : 'Copiar'}
                                </button>
                              </div>
                              <code className="text-[11px] text-green-300 block bg-gray-950 px-3 py-2 rounded-lg overflow-x-auto font-mono">
                                {snippet}
                              </code>
                            </div>

                            {/* Webhook PagTrust */}
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-gray-500">Webhook PagTrust:</span>
                                <button
                                  onClick={() => copyToClipboard(webhookUrl, `webhook-${site.id}`)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300"
                                >
                                  {copiedId === `webhook-${site.id}` ? 'Copiado!' : 'Copiar'}
                                </button>
                              </div>
                              <code className="text-[11px] text-yellow-300 block bg-gray-950 px-3 py-2 rounded-lg overflow-x-auto font-mono">
                                {webhookUrl}
                              </code>
                              <p className="text-[10px] text-gray-600 mt-1">
                                Cole na PagTrust: Integrações &rarr; Webhooks &rarr; URL de postback. Selecione &quot;Compra Aprovada&quot;.
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-3 text-xs text-gray-500 border-t border-gray-800">
                      Nenhum domínio vinculado.
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
