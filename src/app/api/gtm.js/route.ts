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

  // Generate session ID
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

  // Get Facebook cookies
  function getFbCookies() {
    var cookies = {};
    try {
      document.cookie.split(";").forEach(function(c) {
        var parts = c.trim().split("=");
        if (parts[0] === "_fbp") cookies.fbp = parts[1];
        if (parts[0] === "_fbc") cookies.fbc = parts[1];
      });
    } catch(e) {}
    return cookies;
  }

  // Get retry queue from localStorage
  function getRetryQueue() {
    try {
      var stored = localStorage.getItem(CONFIG.retryKey);
      return stored ? JSON.parse(stored) : [];
    } catch(e) { return []; }
  }

  function setRetryQueue(q) {
    try { localStorage.setItem(CONFIG.retryKey, JSON.stringify(q)); } catch(e) {}
  }

  // Flush event batch
  function flush() {
    if (queue.length === 0) return;
    var batch = queue.splice(0, 50);
    send({ events: batch });
  }

  // Send to ingest endpoint
  function send(payload) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", CONFIG.endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-GTM-Token", CONFIG.token);
      xhr.timeout = 5000;
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Success — clear retry queue for these events
        } else {
          // Server error — queue for retry
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
      if (q.length < 100) q.push(evt); // cap at 100
    });
    setRetryQueue(q);
  }

  // Flush retry queue (on PageView)
  function flushRetryQueue() {
    var q = getRetryQueue();
    if (q.length === 0) return;
    setRetryQueue([]);
    send({ events: q });
  }

  // Pause when tab not visible
  var isPaused = false;
  try {
    document.addEventListener("visibilitychange", function() {
      isPaused = document.hidden;
      if (!isPaused && queue.length > 0) flush();
    });
  } catch(e) {}

  // Main track function
  function track(eventName, data) {
    if (isPaused) return;

    var fbCookies = getFbCookies();
    var evt = {
      event_name: eventName,
      event_id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      event_time: Math.floor(Date.now() / 1000),
      source_url: window.location.href,
      user_data: Object.assign({
        fbp: fbCookies.fbp,
        fbc: fbCookies.fbc,
        client_user_agent: navigator.userAgent,
        external_id: getSessionId()
      }, (data && data.user_data) || {}),
      custom_data: (data && data.custom_data) || {},
      consent: data && typeof data.consent === "boolean" ? data.consent : true,
      consent_categories: (data && data.consent_categories) || undefined,
      order_id: (data && data.order_id) || undefined
    };

    queue.push(evt);

    // Batch: flush after delay
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, CONFIG.batchDelay);

    // Flush retry queue on PageView
    if (eventName === "PageView") {
      flushRetryQueue();
    }
  }

  // Send on page unload (beacon)
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

  // Expose global API
  window.BethelGTM = {
    track: track,
    flush: flush,
    config: { pixelId: CONFIG.pixelId }
  };

  // Auto-track PageView
  track("PageView");
})();`;
}
