import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('site');

  if (!domain) {
    return new NextResponse('// Missing ?site= parameter', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  // Lookup site config
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, domain, ingest_token, pixel_uuid, settings, is_active')
    .eq('domain', domain)
    .eq('is_active', true)
    .single();

  if (!site) {
    return new NextResponse('// Site not found or inactive', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  // Get the pixel_id for the Meta Pixel base code
  const { data: pixel } = await supabaseAdmin
    .from('pixels')
    .select('pixel_id')
    .eq('id', site.pixel_uuid)
    .single();

  const ingestUrl = `${req.nextUrl.origin}/api/ingest`;
  const config = {
    siteToken: site.ingest_token,
    ingestUrl,
    pixelId: pixel?.pixel_id || '',
    settings: site.settings || {},
  };

  const sdk = generateSDK(config);

  return new NextResponse(sdk, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

function generateSDK(config: {
  siteToken: string;
  ingestUrl: string;
  pixelId: string;
  settings: Record<string, unknown>;
}): string {
  return `(function(){
  "use strict";

  var CONFIG = {
    token: "${config.siteToken}",
    endpoint: "${config.ingestUrl}",
    pixelId: "${config.pixelId}",
    batchDelay: 2000,
    maxRetries: 3,
    retryKey: "__gtm_retry_queue"
  };

  var queue = [];
  var timer = null;
  var sessionId = null;

  // ─── Cookie helpers ───

  function getCookie(name) {
    try {
      var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
      return match ? match[2] : null;
    } catch(e) { return null; }
  }

  function setCookie(name, value, days) {
    try {
      var d = new Date();
      d.setTime(d.getTime() + days * 86400000);
      var domain = location.hostname.replace(/^www\\./, "");
      document.cookie = name + "=" + value + ";expires=" + d.toUTCString() + ";path=/;domain=." + domain + ";SameSite=Lax";
    } catch(e) {}
  }

  // ─── Generate _fbp cookie (Meta browser ID) ───

  function ensureFbp() {
    var fbp = getCookie("_fbp");
    if (fbp) return fbp;
    var rand = "";
    for (var i = 0; i < 10; i++) rand += Math.floor(Math.random() * 10);
    fbp = "fb.1." + Date.now() + "." + rand;
    setCookie("_fbp", fbp, 730);
    return fbp;
  }

  // ─── Generate _fbc cookie from fbclid URL param ───

  function ensureFbc() {
    var fbc = getCookie("_fbc");
    if (fbc) return fbc;
    try {
      var params = new URLSearchParams(location.search);
      var fbclid = params.get("fbclid");
      if (fbclid) {
        fbc = "fb.1." + Date.now() + "." + fbclid;
        setCookie("_fbc", fbc, 90);
        return fbc;
      }
    } catch(e) {}
    return null;
  }

  // ─── Initialize cookies immediately ───

  var _fbp = ensureFbp();
  var _fbc = ensureFbc();

  // ─── fbq shim (Meta Pixel Helper compatibility) ───

  function setupFbqShim() {
    if (window.fbq && window.fbq._bethel) return;

    var pixelIds = [];
    var fbqQueue = [];

    function fbq() {
      var args = Array.prototype.slice.call(arguments);
      var command = args[0];

      if (command === "init") {
        pixelIds.push(args[1]);
      } else if (command === "track" || command === "trackCustom") {
        var eventName = args[1];
        var params = args[2] || {};
        track(eventName, { custom_data: params });
      }

      fbqQueue.push(args);

      if (typeof window._fbq_callbacks === "object") {
        for (var i = 0; i < window._fbq_callbacks.length; i++) {
          try { window._fbq_callbacks[i].apply(null, args); } catch(e) {}
        }
      }
    }

    fbq.version = "2.9.174";
    fbq.queue = fbqQueue;
    fbq.loaded = true;
    fbq.push = fbq;
    fbq._bethel = true;
    fbq.getState = function() {
      return {
        pixelInstances: pixelIds.map(function(id) {
          return { pixelId: id };
        })
      };
    };

    window.fbq = fbq;
    window._fbq = fbq;

    fbq("init", CONFIG.pixelId);
  }

  setupFbqShim();

  // ─── Session ID ───

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem("__gtm_sid");
      if (!sessionId) {
        sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
        sessionStorage.setItem("__gtm_sid", sessionId);
      }
    } catch(e) {
      sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    return sessionId;
  }

  // ─── Retry queue (localStorage) ───

  function getRetryQueue() {
    try {
      var stored = localStorage.getItem(CONFIG.retryKey);
      return stored ? JSON.parse(stored) : [];
    } catch(e) { return []; }
  }

  function setRetryQueue(q) {
    try { localStorage.setItem(CONFIG.retryKey, JSON.stringify(q)); } catch(e) {}
  }

  // ─── Flush event batch ───

  function flush() {
    if (queue.length === 0) return;
    var batch = queue.splice(0, 50);
    send({ events: batch });
  }

  // ─── Send to ingest endpoint ───

  function send(payload) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", CONFIG.endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-GTM-Token", CONFIG.token);
      xhr.timeout = 5000;
      xhr.onload = function() {
        if (xhr.status < 200 || xhr.status >= 300) {
          addToRetryQueue(payload.events || [payload]);
        }
      };
      xhr.onerror = function() {
        addToRetryQueue(payload.events || [payload]);
      };
      xhr.ontimeout = function() {
        addToRetryQueue(payload.events || [payload]);
      };
      xhr.send(JSON.stringify(payload));
    } catch(e) {
      addToRetryQueue(payload.events || [payload]);
    }
  }

  function addToRetryQueue(events) {
    var q = getRetryQueue();
    events.forEach(function(evt) {
      if (q.length < 100) q.push(evt);
    });
    setRetryQueue(q);
  }

  function flushRetryQueue() {
    var q = getRetryQueue();
    if (q.length === 0) return;
    setRetryQueue([]);
    send({ events: q });
  }

  // ─── Visibility pause ───

  var isPaused = false;
  try {
    document.addEventListener("visibilitychange", function() {
      isPaused = document.hidden;
      if (!isPaused && queue.length > 0) flush();
    });
  } catch(e) {}

  // ─── Main track function ───

  function track(eventName, data) {
    if (isPaused) return;

    _fbp = getCookie("_fbp") || _fbp;
    _fbc = getCookie("_fbc") || _fbc;

    var evt = {
      event_name: eventName,
      event_id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      event_time: Math.floor(Date.now() / 1000),
      source_url: window.location.href,
      user_data: Object.assign({
        fbp: _fbp,
        fbc: _fbc,
        client_user_agent: navigator.userAgent,
        external_id: getSessionId()
      }, (data && data.user_data) || {}),
      custom_data: (data && data.custom_data) || {},
      consent: data && typeof data.consent === "boolean" ? data.consent : true,
      consent_categories: (data && data.consent_categories) || undefined,
      order_id: (data && data.order_id) || undefined
    };

    queue.push(evt);

    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, CONFIG.batchDelay);

    if (eventName === "PageView") {
      flushRetryQueue();
    }
  }

  // ─── Beacon on unload ───

  function onUnload() {
    if (queue.length === 0) return;
    var batch = queue.splice(0, 50);
    var payload = JSON.stringify({ events: batch });
    try {
      navigator.sendBeacon(CONFIG.endpoint, new Blob([payload], { type: "application/json" }));
    } catch(e) {
      addToRetryQueue(batch);
    }
  }

  try {
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
  } catch(e) {}

  // ─── Expose global API ───

  window.BethelGTM = {
    track: track,
    flush: flush,
    config: { pixelId: CONFIG.pixelId }
  };

  // ─── Auto-track PageView (via fbq shim too) ───

  track("PageView");
})();`;
}
