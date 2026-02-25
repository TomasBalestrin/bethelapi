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
    retryKey: "__btl_retry",
    viewContentScrollThreshold: 50,
    viewContentTimeThreshold: 15
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
      var domain = location.hostname.replace(/^www\\\\./, "");
      document.cookie = name + "=" + value + ";expires=" + d.toUTCString() + ";path=/;domain=." + domain + ";SameSite=Lax";
    } catch(e) {}
  }

  function ensureFbp() {
    var fbp = getCookie("_fbp");
    if (fbp) return fbp;
    var rand = "";
    for (var i = 0; i < 10; i++) rand += Math.floor(Math.random() * 10);
    fbp = "fb.1." + Date.now() + "." + rand;
    setCookie("_fbp", fbp, 730);
    return fbp;
  }

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

  var _fbp = ensureFbp();
  var _fbc = ensureFbc();

  // ─── Load real Facebook Pixel (fbevents.js) for Pixel Helper ───

  function loadRealFbPixel() {
    if (window.fbq) return;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,"script",
    "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", CONFIG.pixelId);
  }

  loadRealFbPixel();

  // ─── Session ID ───

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem("__btl_sid");
      if (!sessionId) {
        sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
        sessionStorage.setItem("__btl_sid", sessionId);
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

    var eventId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);

    var evt = {
      event_name: eventName,
      event_id: eventId,
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

    // Fire real fbq with same event_id for deduplication
    if (window.fbq) {
      try {
        var fbqParams = Object.assign({}, (data && data.custom_data) || {});
        fbq("track", eventName, fbqParams, { eventID: eventId });
      } catch(e) {}
    }

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

  // ═══════════════════════════════════════════════
  //  AUTO-TRACKING: PageView, ViewContent, ClickCTA
  // ═══════════════════════════════════════════════

  // ─── 1. PageView (immediate) ───
  track("PageView");

  // ─── 2. ViewContent (scroll >= 50% AND time >= 15s) ───

  var viewContentFired = false;
  var scrollReached = false;
  var timeReached = false;
  var pageLoadTime = Date.now();

  function tryFireViewContent() {
    if (viewContentFired) return;
    if (scrollReached && timeReached) {
      viewContentFired = true;
      track("ViewContent", {
        custom_data: {
          content_name: document.title,
          content_url: location.href
        }
      });
    }
  }

  // Scroll depth tracker
  function getScrollPercent() {
    var h = document.documentElement;
    var b = document.body;
    var st = h.scrollTop || b.scrollTop;
    var sh = h.scrollHeight || b.scrollHeight;
    var ch = h.clientHeight || b.clientHeight;
    if (sh <= ch) return 100;
    return Math.round((st / (sh - ch)) * 100);
  }

  function onScroll() {
    if (scrollReached) return;
    if (getScrollPercent() >= CONFIG.viewContentScrollThreshold) {
      scrollReached = true;
      tryFireViewContent();
    }
  }

  try {
    window.addEventListener("scroll", onScroll, { passive: true });
    // Check on load if page is short (already scrolled past 50%)
    setTimeout(onScroll, 500);
  } catch(e) {}

  // Time threshold timer
  setTimeout(function() {
    timeReached = true;
    tryFireViewContent();
  }, CONFIG.viewContentTimeThreshold * 1000);

  // ─── 3. ClickCTA (clicks on buttons, links, [role=button]) ───

  function getCtaText(el) {
    var text = (el.innerText || el.textContent || "").trim();
    if (text.length > 100) text = text.substring(0, 100);
    return text;
  }

  function findCtaElement(el) {
    // Walk up from click target to find nearest CTA element (max 5 levels)
    for (var i = 0; i < 5 && el; i++) {
      if (!el.tagName) { el = el.parentElement; continue; }
      var tag = el.tagName.toLowerCase();
      if (tag === "button" || tag === "a") return el;
      if (el.getAttribute && el.getAttribute("role") === "button") return el;
      if (el.getAttribute && el.getAttribute("data-cta") !== null) return el;
      el = el.parentElement;
    }
    return null;
  }

  try {
    document.addEventListener("click", function(e) {
      var cta = findCtaElement(e.target);
      if (!cta) return;

      var tag = cta.tagName.toLowerCase();
      var text = getCtaText(cta);
      var href = cta.getAttribute("href") || "";
      var ctaId = cta.getAttribute("id") || "";
      var ctaClasses = (cta.className && typeof cta.className === "string") ? cta.className : "";

      track("ClickCTA", {
        custom_data: {
          cta_text: text,
          cta_tag: tag,
          cta_href: href,
          cta_id: ctaId,
          cta_classes: ctaClasses,
          page_url: location.href
        }
      });
    }, true);
  } catch(e) {}

  // ─── Expose global API ───

  window.BethelGTM = {
    track: track,
    flush: flush,
    config: { pixelId: CONFIG.pixelId }
  };

})();`;
}
