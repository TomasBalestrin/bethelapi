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

// Standard Facebook Pixel events
const FB_STANDARD_EVENTS = [
  { name: 'PageView', description: 'Visualização de página', auto: true },
  { name: 'ViewContent', description: 'Visualização de conteúdo (produto, artigo, etc.)' },
  { name: 'Search', description: 'Pesquisa no site' },
  { name: 'AddToCart', description: 'Adição ao carrinho' },
  { name: 'AddToWishlist', description: 'Adição à lista de desejos' },
  { name: 'InitiateCheckout', description: 'Início do checkout' },
  { name: 'AddPaymentInfo', description: 'Adição de informações de pagamento' },
  { name: 'Purchase', description: 'Compra realizada' },
  { name: 'Lead', description: 'Captação de lead (formulário, cadastro)' },
  { name: 'CompleteRegistration', description: 'Registro/cadastro completo' },
  { name: 'Contact', description: 'Contato (telefone, email, chat)' },
  { name: 'CustomizeProduct', description: 'Personalização de produto' },
  { name: 'Donate', description: 'Doação' },
  { name: 'FindLocation', description: 'Busca de localização/loja' },
  { name: 'Schedule', description: 'Agendamento' },
  { name: 'StartTrial', description: 'Início de trial/teste grátis' },
  { name: 'SubmitApplication', description: 'Envio de aplicação/formulário' },
  { name: 'Subscribe', description: 'Assinatura' },
];

export function PixelsPanel() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePixel, setShowCreatePixel] = useState(false);
  const [showCreateSite, setShowCreateSite] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [expandedPixel, setExpandedPixel] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState<string | null>(null);
  const [deletingPixel, setDeletingPixel] = useState<string | null>(null);

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

  const deletePixel = async (pixelUuid: string, pixelName: string) => {
    if (!confirm(`Tem certeza que deseja apagar o pixel "${pixelName}"?\n\nIsso também removerá todos os sites vinculados.`)) {
      return;
    }
    setDeletingPixel(pixelUuid);
    try {
      const res = await fetch('/api/admin/pixels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixel_id: pixelUuid }),
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

  const copySnippet = (snippet: string, siteId: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(siteId);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const copyEventCode = (eventName: string) => {
    const code = eventName === 'PageView'
      ? '// PageView é disparado automaticamente pelo script'
      : `BethelGTM.track("${eventName}", {\n  custom_data: {\n    // seus parâmetros aqui\n  }\n});`;
    navigator.clipboard.writeText(code);
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
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{pixel.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${pixel.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {pixel.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 font-mono mt-1">Pixel ID: {pixel.pixel_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedPixel(expandedPixel === pixel.id ? null : pixel.id)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                    title="Ver informações"
                  >
                    {expandedPixel === pixel.id ? 'Ocultar Info' : 'Info'}
                  </button>
                  <button
                    onClick={() => setShowEvents(showEvents === pixel.id ? null : pixel.id)}
                    className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded text-xs transition"
                    title="Ver eventos disponíveis"
                  >
                    Eventos
                  </button>
                  <button
                    onClick={() => setShowCreateSite(showCreateSite === pixel.id ? null : pixel.id)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                  >
                    + Site
                  </button>
                  <button
                    onClick={() => deletePixel(pixel.id, pixel.name)}
                    disabled={deletingPixel === pixel.id}
                    className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs transition disabled:opacity-50"
                    title="Apagar pixel"
                  >
                    {deletingPixel === pixel.id ? 'Apagando...' : 'Apagar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Pixel Info Expanded */}
            {expandedPixel === pixel.id && (
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/30 space-y-3">
                <h4 className="text-sm font-medium text-gray-300">Informações do Pixel</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">ID interno:</span>
                    <code className="ml-2 text-xs bg-gray-800 px-2 py-0.5 rounded font-mono text-gray-300">{pixel.id}</code>
                  </div>
                  <div>
                    <span className="text-gray-500">Pixel ID Meta:</span>
                    <code className="ml-2 text-xs bg-gray-800 px-2 py-0.5 rounded font-mono text-gray-300">{pixel.pixel_id}</code>
                  </div>
                  <div>
                    <span className="text-gray-500">Access Token:</span>
                    <code className="ml-2 text-xs bg-gray-800 px-2 py-0.5 rounded font-mono text-gray-300">
                      {pixel.access_token ? `${pixel.access_token.substring(0, 12)}...${pixel.access_token.substring(pixel.access_token.length - 6)}` : 'N/A'}
                    </code>
                  </div>
                  <div>
                    <span className="text-gray-500">Criado em:</span>
                    <span className="ml-2 text-gray-300">{new Date(pixel.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sites vinculados:</span>
                    <span className="ml-2 text-gray-300">{pixel.sites?.length || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <span className={`ml-2 ${pixel.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      {pixel.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Facebook Events List */}
            {showEvents === pixel.id && (
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/20">
                <h4 className="text-sm font-medium text-purple-300 mb-3">Eventos Facebook Disponíveis</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Estes são os eventos padrão do Facebook Pixel que podem ser disparados. O <strong>PageView</strong> é disparado automaticamente.
                  Para os demais, use <code className="bg-gray-800 px-1 rounded">BethelGTM.track(&quot;NomeEvento&quot;, dados)</code> ou <code className="bg-gray-800 px-1 rounded">fbq(&quot;track&quot;, &quot;NomeEvento&quot;, dados)</code>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {FB_STANDARD_EVENTS.map((event) => (
                    <div
                      key={event.name}
                      className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2 border border-gray-700/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-blue-300">{event.name}</code>
                          {event.auto && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded text-[10px]">AUTO</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{event.description}</p>
                      </div>
                      <button
                        onClick={() => copyEventCode(event.name)}
                        className="ml-2 px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 rounded transition text-gray-300 whitespace-nowrap"
                      >
                        Copiar código
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-gray-950 rounded-lg border border-gray-700/50">
                  <p className="text-xs text-gray-400 mb-2">Exemplo de uso para Purchase:</p>
                  <pre className="text-xs text-green-300 overflow-x-auto">{`BethelGTM.track("Purchase", {
  custom_data: {
    value: 99.90,
    currency: "BRL",
    content_type: "product",
    contents: [{ id: "SKU123", quantity: 1 }]
  },
  order_id: "ORDER-001"
});`}</pre>
                </div>
              </div>
            )}

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
                {pixel.sites.map((site) => {
                  const snippet = `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/api/gtm.js?site=${site.domain}" async></script>`;
                  return (
                    <div key={site.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
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
                              {copiedToken === site.ingest_token ? 'Copiado!' : 'Copiar Token'}
                            </button>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${site.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {site.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {/* Snippet for this site */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-gray-500">Snippet para instalar:</p>
                          <button
                            onClick={() => copySnippet(snippet, site.id)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {copiedSnippet === site.id ? 'Copiado!' : 'Copiar Snippet'}
                          </button>
                        </div>
                        <code className="text-xs text-green-300 block bg-gray-950 p-3 rounded-lg overflow-x-auto">
                          {snippet}
                        </code>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(!pixel.sites || pixel.sites.length === 0) && (
              <div className="px-6 py-4 text-sm text-gray-500">
                Nenhum site vinculado. Adicione um domínio.
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
