/**
 * Panel de empresa TechGuard — versión estática para GitHub Pages.
 * Misma UI que el panel de refactorii, pero autentica con companyId + companyKey
 * contra /public/portal/* en lugar de Google.
 */
(function () {
  'use strict';

  var API = 'https://www.refactorii.com/p2l-tenant/api/p2l-techguard-whatsapp-bot';
  var TOKEN_PREFIX = 'tg_portal_token_';

  var state = { companyId: '', token: '', company: null, connection: null, busy: false };

  /* ── utilidades ──────────────────────────────────────────────────────── */

  function $(sel) {
    return document.querySelector(sel);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatWhen(d) {
    try {
      return new Date(d).toLocaleString('es-CO');
    } catch (_) {
      return String(d || '');
    }
  }

  function formatTokens(n) {
    return Math.max(0, Number(n) || 0).toLocaleString('es-CO');
  }

  function formatUsd(n) {
    var v = Math.max(0, Number(n) || 0);
    if (v === 0) return '$0.00';
    return v >= 0.01 ? '$' + v.toFixed(2) : '$' + v.toFixed(6);
  }

  /** El id viaja en la ruta (/company/<id>), en ?c= o en el hash. */
  function readCompanyId() {
    var m = location.pathname.match(/\/company\/([a-f\d]{24})/i);
    if (m) return m[1].toLowerCase();
    var q = new URLSearchParams(location.search).get('c') || '';
    if (/^[a-f\d]{24}$/i.test(q)) return q.toLowerCase();
    var h = (location.hash || '').replace(/^#\/?(company\/)?/, '');
    return /^[a-f\d]{24}$/i.test(h) ? h.toLowerCase() : '';
  }

  function tokenKey() {
    return TOKEN_PREFIX + state.companyId;
  }

  function loadToken() {
    try {
      return localStorage.getItem(tokenKey()) || '';
    } catch (_) {
      return '';
    }
  }

  function saveToken(t) {
    try {
      if (t) localStorage.setItem(tokenKey(), t);
      else localStorage.removeItem(tokenKey());
    } catch (_) {}
  }

  /* ── API ─────────────────────────────────────────────────────────────── */

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try {
          data = txt ? JSON.parse(txt) : null;
        } catch (_) {
          data = { message: txt };
        }
        if (!res.ok) {
          var err = new Error((data && (data.message || data.error)) || 'HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* ── pantalla de acceso ──────────────────────────────────────────────── */

  function renderGate(msg) {
    var root = $('#tg-root');
    root.className = 'tg-co';
    root.innerHTML =
      '<div class="tg-gate"><div class="tg-gate__card">' +
      '<p class="tg-gate__brand">Tech<em>Guard</em></p>' +
      '<p class="tg-gate__eyebrow">Panel de empresa · Bot WhatsApp IA</p>' +
      '<p class="tg-gate__lead">Escribe la clave de empresa que te entregó TechGuard. ' +
      'Solo la primera vez: después este enlace abrirá tu panel directamente.</p>' +
      (state.companyId ? '<code class="tg-gate__id">' + esc(state.companyId) + '</code>' : '') +
      (msg ? '<p class="tg-err">' + esc(msg) + '</p>' : '') +
      '<label class="tg-field"><span>Clave de empresa</span>' +
      '<input id="tg-key" type="password" autocomplete="current-password" placeholder="Clave de empresa" /></label>' +
      '<button type="button" class="tg-btn" id="tg-enter">Entrar a mi panel</button>' +
      '<p class="tg-gate__foot">¿Perdiste la clave? Escríbenos y te la regeneramos.</p>' +
      '</div></div>';

    var input = $('#tg-key');
    var btn = $('#tg-enter');
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') btn.click();
    });
    btn.addEventListener('click', function () {
      var key = input.value.trim();
      if (!key) return renderGate('Escribe tu clave de empresa.');
      btn.disabled = true;
      btn.textContent = 'Entrando…';
      api('/public/portal/login', {
        method: 'POST',
        body: { companyId: state.companyId, companyKey: key }
      })
        .then(function (out) {
          state.token = out.token;
          saveToken(out.token);
          state.company = out.company;
          state.connection = out.connection;
          renderPanel();
        })
        .catch(function (e) {
          renderGate(e.message || 'No pudimos validar la clave.');
        });
    });
  }

  /* ── panel ───────────────────────────────────────────────────────────── */

  function aiUsageHtml(u) {
    if (!u) return '';
    if (!u.groqEnabled) {
      return (
        '<section class="tg-panel tg-board__ai">' +
        '<div class="tg-panel__head"><h2>Consumo de IA</h2>' +
        '<span class="tg-chip">' + esc(u.model) + '</span></div>' +
        '<p class="tg-muted">Sin clave de Groq configurada: el bot responde con el mensaje base, sin IA. ' +
        'Pídele a TechGuard que active tu cuenta de Groq.</p></section>'
      );
    }
    var fill =
      u.quotaExhausted || u.percentUsed >= 95
        ? ' tg-ai__fill--danger'
        : u.percentUsed >= 75
          ? ' tg-ai__fill--warn'
          : '';
    var extra = '';
    if (u.fallbacks || u.errors) {
      extra +=
        '<p class="tg-muted tg-ai__line">' + u.fallbacks + ' respuestas sin IA hoy' +
        (u.errors ? ' · ' + u.errors + ' con error' : '') + '</p>';
    }
    if (u.lastCall) {
      extra +=
        '<p class="tg-muted tg-ai__line">Última: ' + esc(formatWhen(u.lastCall.at)) + ' · ' +
        (u.lastCall.source === 'groq' ? 'generada con IA' : 'mensaje base') +
        (u.lastCall.error ? ' · ' + esc(u.lastCall.error) : '') + '</p>';
    }
    return (
      '<section class="tg-panel tg-board__ai">' +
      '<div class="tg-panel__head"><h2>Consumo de IA</h2>' +
      '<span class="tg-chip">' + esc(u.model) + '</span></div>' +
      '<div class="tg-ai__row"><span class="tg-ai__big">' + u.requests +
      '<small> / ' + u.limit + ' respuestas con IA hoy</small></span>' +
      '<span class="tg-ai__cost">' + formatUsd(u.costUsd.total) + '</span></div>' +
      '<div class="tg-ai__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      u.percentUsed + '"><div class="tg-ai__fill' + fill + '" style="width:' + u.percentUsed + '%"></div></div>' +
      '<p class="tg-muted tg-ai__line">' + formatTokens(u.promptTokens) + ' tok entrada · ' +
      formatTokens(u.completionTokens) + ' tok salida · ' + u.tokenPercentUsed +
      '% del cupo diario de tokens' +
      (u.quotaExhausted ? '<strong class="tg-ai__warn"> · cupo agotado</strong>' : '') + '</p>' +
      '<p class="tg-muted tg-ai__line">Mes ' + esc(u.month.key) + ': ' + u.month.requests +
      ' respuestas · ' + formatTokens(u.month.totalTokens) + ' tok · <strong>' +
      formatUsd(u.month.costUsd.total) + '</strong></p>' +
      extra +
      '</section>'
    );
  }

  function waSectionHtml(c, conn) {
    var managed = c.waManagedBy;
    if (managed !== 'customer' && managed !== 'hybrid') {
      return (
        '<section class="tg-panel tg-board__wa"><h2>WhatsApp Cloud API</h2>' +
        '<p class="tg-muted">TechGuard configura Meta por ti. Webhook: <code>' +
        esc((conn && conn.webhookUrl) || '') + '</code></p></section>'
      );
    }
    var HINT_BM = 'impórtalo de tu cuenta de WhatsApp en business.facebook.com';
    var HINT_APP = 'impórtalo de developers.facebook.com › configuración de la app › configuración básica';
    var HINT_TOKEN = 'impórtalo desde business.facebook.com → Usuarios del sistema → Generar token → token permanente';
    var f = function (id, label, hint, ph, val, type) {
      return (
        '<label class="tg-field"><span>' + esc(label) +
        (hint ? ' <em class="tg-hint">' + esc(hint) + '</em>' : '') + '</span>' +
        '<input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) +
        '" value="' + esc(val || '') + '" /></label>'
      );
    };
    conn = conn || {};
    // Campo azul de solo lectura: el backend lo emite, el cliente solo lo copia a Meta.
    var ro = function (id, label, hint, val, btnId, btnTitle) {
      return (
        '<label class="tg-field tg-span-full"><span>' + esc(label) +
        ' <em class="tg-hint">' + esc(hint) + '</em></span>' +
        '<span class="tg-ro-wrap">' +
        '<input id="' + id + '" class="tg-input--ro" readonly tabindex="-1" value="' + esc(val || '') + '" />' +
        '<button type="button" class="tg-copy" id="' + btnId + '" title="' + esc(btnTitle) + '">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="12" height="12" rx="2"></rect>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
        '</svg></button></span></label>'
      );
    };
    return (
      '<section class="tg-panel tg-board__wa">' +
      '<div class="tg-panel__head"><h2>Conexión WhatsApp</h2>' +
      '<button type="button" class="tg-btn sm" id="tg-save-wa">Guardar WA</button></div>' +
      '<p class="tg-muted">Salud: <strong>' + esc(conn.health || 'unknown') + '</strong> · Último webhook: ' +
      (conn.lastWebhookAt ? esc(formatWhen(conn.lastWebhookAt)) : 'aún no llega ninguno') + '</p>' +
      '<div class="tg-grid tg-grid--wa">' +
      f('tg-wa-app', 'Meta App ID', HINT_BM, 'App ID', conn.metaAppId) +
      f('tg-wa-waba', 'WABA ID', HINT_BM, 'WABA ID', conn.wabaId) +
      f('tg-wa-phone', 'Phone Number ID', HINT_BM, 'Phone Number ID', conn.phoneNumberId) +
      f('tg-wa-display', 'Número visible', '', '+57…', conn.displayPhone) +
      ro(
        'tg-wa-webhook',
        'Webhook',
        'este es el webhook del bot en la app de Meta, en developers.facebook.com — ' +
          'Paso 2: Configuración de producción › URL de devolución de llamada',
        conn.webhookUrl,
        'tg-copy-webhook',
        'Copiar webhook'
      ) +
      ro(
        'tg-wa-verify',
        'Verify token',
        'expórtalo al campo «Token de verificación» del Paso 2: Configuración de producción, ' +
          'en developers.facebook.com — lo genera TechGuard, es de solo lectura',
        conn.verifyToken,
        'tg-copy-verify',
        'Copiar verify token'
      ) +
      f('tg-wa-secret', 'App Secret', HINT_APP, conn.hasAppSecret ? '•••• guardado' : 'App Secret', '', 'password') +
      f('tg-wa-token', 'Access Token', HINT_TOKEN, conn.hasAccessToken ? '•••• guardado' : 'Access Token', '', 'password') +
      '</div></section>'
    );
  }

  function renderPanel() {
    var c = state.company;
    var conn = state.connection;
    var b = c.brand || {};
    var root = $('#tg-root');
    root.className = 'tg-co';
    root.innerHTML =
      '<header class="tg-co__header"><div class="tg-co__title">' +
      '<p class="tg-co__eyebrow">TechGuard · Empresa · Bot WhatsApp IA</p>' +
      '<h1>' + esc(c.name || 'Empresa') + '</h1>' +
      '<div class="tg-co__meta"><span class="tg-muted">Plan ' +
      esc((c.planSpec && c.planSpec.name) || c.plan) + ' · WA ' + esc(c.waManagedBy) + ' · ' +
      esc(c.subscriptionStatus) + '</span></div></div>' +
      '<div class="tg-co__nav"><button type="button" class="tg-btn ghost" id="tg-logout">Salir</button></div>' +
      '</header>' +
      '<p class="tg-err tg-hidden" id="tg-err"></p>' +
      '<p class="tg-note tg-hidden" id="tg-note"></p>' +
      '<div class="tg-board">' +
      '<section class="tg-panel tg-board__brand">' +
      '<div class="tg-panel__head"><h2>Marca del bot</h2>' +
      '<button type="button" class="tg-btn sm" id="tg-save-brand">Guardar marca</button></div>' +
      '<div class="tg-grid tg-grid--brand">' +
      '<label class="tg-field"><span>Nombre</span><input id="tg-b-name" value="' + esc(b.botName) + '" placeholder="Nombre del bot" /></label>' +
      '<label class="tg-field"><span>Tono</span><input id="tg-b-tone" value="' + esc(b.tone) + '" placeholder="Tono" /></label>' +
      '<label class="tg-field"><span>Idioma</span><input id="tg-b-lang" value="' + esc(b.language) + '" placeholder="es" /></label>' +
      '<label class="tg-field"><span>Horario</span><input id="tg-b-hours" value="' + esc(b.hours) + '" placeholder="Lun-Vie…" /></label>' +
      '<label class="tg-field tg-field--wide"><span>Disclaimer</span><input id="tg-b-disc" value="' + esc(b.disclaimer) + '" placeholder="Disclaimer" /></label>' +
      '</div></section>' +
      aiUsageHtml(c.aiUsage) +
      '<section class="tg-panel tg-board__skill">' +
      '<div class="tg-panel__head"><h2>Skill negocio</h2><span class="tg-chip">markdown</span></div>' +
      '<textarea id="tg-skill" class="tg-area tg-area--fill"></textarea></section>' +
      /* Más adelante: Flujos / guiones (aún no alimentan al bot)
      '<section class="tg-panel tg-board__flows">' +
      '<div class="tg-panel__head"><h2>Flujos / guiones</h2><span class="tg-chip">JSON</span></div>' +
      '<textarea id="tg-flows" class="tg-area tg-area--fill"></textarea></section>' +
      */
      '<section class="tg-panel tg-board__caps">' +
      '<div class="tg-panel__head"><h2>Capacidades de producto</h2><span class="tg-chip">product-capabilities.json</span></div>' +
      '<textarea id="tg-caps" class="tg-area tg-area--fill" placeholder=\'{"capabilities":[]}\'></textarea></section>' +
      '<section class="tg-panel tg-board__links">' +
      '<div class="tg-panel__head"><h2>MCP · Link de pago</h2>' +
      '<button type="button" class="tg-btn sm" id="tg-save-ctx">Guardar contexto</button></div>' +
      '<div class="tg-grid tg-grid--links">' +
      '<label class="tg-field"><span>MCP URL (opcional)</span><input id="tg-mcp" placeholder="https://…/mcp" /></label>' +
      '<label class="tg-field"><span>Link de pago</span><input id="tg-pay" placeholder="https://checkout…" /></label>' +
      '</div></section>' +
      '<section class="tg-panel tg-board__tutorial tg-tutorial">' +
      '<h2>Tutorial Meta Cloud API</h2>' +
      '<p class="tg-muted tg-tutorial__lead">Tu empresa configura Meta; TechGuard es el <strong>webhook</strong> que recibe y responde.</p>' +
      '<ol class="tg-tutorial__steps">' +
      '<li><strong>App Meta</strong>' +
      '<a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener">My Apps</a> → WhatsApp · ' +
      '<a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/" target="_blank" rel="noopener">Get started</a></li>' +
      '<li><strong>Número</strong>Phone Number ID + WABA · ' +
      '<a href="https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers/" target="_blank" rel="noopener">docs</a></li>' +
      '<li><strong>Token permanente</strong>' +
      '<a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener">System Users</a></li>' +
      '<li><strong>Datos abajo</strong>App ID, Secret, WABA, Phone ID, token, Verify Token</li>' +
      '<li><strong>Webhook</strong>Callback = <code>' + esc((conn && conn.webhookUrl) || '…/wa/webhook') +
      '</code> · suscribe <code>messages</code></li>' +
      '<li><strong>Tarifas Meta</strong>' +
      '<a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener">precios oficiales</a></li>' +
      '</ol>' +
      '</section>' +
      waSectionHtml(c, conn) +
      /* Más adelante: Orquestador · RUNBOOK (OpenCode / Anomaly)
      '<section class="tg-panel tg-board__orch"><h2>RUNBOOK</h2>' +
      '<textarea class="tg-area tg-area--fill" id="tg-runbook" readonly></textarea></section>' +
      */
      '</div>';

    // textareas por valor, no por atributo, para no romper con < y &
    $('#tg-skill').value = (c.skills && c.skills[0] && c.skills[0].content) || '';
    $('#tg-caps').value = JSON.stringify(
      c.productCapabilities && typeof c.productCapabilities === 'object'
        ? c.productCapabilities
        : { capabilities: [] },
      null,
      2
    );
    $('#tg-mcp').value = (c.mcpServers && c.mcpServers[0] && c.mcpServers[0].url) || '';
    $('#tg-pay').value = (c.paymentLinks && c.paymentLinks[0] && c.paymentLinks[0].url) || '';
    // Más adelante: $('#tg-flows') / $('#tg-runbook')

    $('#tg-logout').addEventListener('click', function () {
      saveToken('');
      state.token = '';
      renderGate('');
    });
    $('#tg-save-brand').addEventListener('click', saveBrand);
    $('#tg-save-ctx').addEventListener('click', saveContext);
    var waBtn = $('#tg-save-wa');
    if (waBtn) waBtn.addEventListener('click', saveWa);
    bindCopy('#tg-copy-webhook', '#tg-wa-webhook', 'Webhook copiado. Pégalo en «URL de devolución de llamada» en Meta');
    bindCopy('#tg-copy-verify', '#tg-wa-verify', 'Verify token copiado. Pégalo en el Paso 2 de developers.facebook.com');
  }

  function bindCopy(btnSel, inputSel, msg) {
    var btn = $(btnSel);
    var input = $(inputSel);
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      if (!input.value || !navigator.clipboard) return;
      navigator.clipboard.writeText(input.value).then(function () {
        flash('note', msg);
      });
    });
  }

  function flash(kind, msg) {
    var n = $('#tg-' + kind);
    if (!n) return;
    n.textContent = msg;
    n.classList.remove('tg-hidden');
    if (kind === 'note') setTimeout(function () { n.classList.add('tg-hidden'); }, 4000);
  }

  function afterSave(out) {
    if (out.company) state.company = out.company;
    if (out.connection) state.connection = out.connection;
    renderPanel();
    flash('note', 'Guardado');
  }

  function onError(e) {
    if (e.status === 401) {
      saveToken('');
      state.token = '';
      return renderGate('Tu sesión caducó. Vuelve a entrar con tu clave.');
    }
    flash('err', e.message || 'No se pudo guardar');
  }

  function saveBrand() {
    api('/public/portal/company', {
      method: 'PATCH',
      body: {
        brand: {
          botName: $('#tg-b-name').value.trim(),
          tone: $('#tg-b-tone').value.trim(),
          language: $('#tg-b-lang').value.trim(),
          hours: $('#tg-b-hours').value.trim(),
          disclaimer: $('#tg-b-disc').value.trim()
        }
      }
    }).then(afterSave).catch(onError);
  }

  function saveContext() {
    var productCapabilities;
    // Más adelante: editar flujos en UI. Hoy se preservan desde state.company.
    var flows = Array.isArray(state.company && state.company.flows) ? state.company.flows : [];
    try {
      productCapabilities = JSON.parse($('#tg-caps').value || '{"capabilities":[]}');
      if (!productCapabilities || typeof productCapabilities !== 'object' || Array.isArray(productCapabilities)) {
        throw new Error('debe ser un objeto con capabilities[]');
      }
      if (!Array.isArray(productCapabilities.capabilities)) {
        throw new Error('falta capabilities[]');
      }
    } catch (e) {
      return flash('err', 'Capacidades JSON inválido: ' + e.message);
    }
    var mcp = $('#tg-mcp').value.trim();
    var pay = $('#tg-pay').value.trim();
    api('/public/portal/company', {
      method: 'PATCH',
      body: {
        skills: [{ path: 'negocio.md', content: $('#tg-skill').value }],
        flows: flows,
        productCapabilities: productCapabilities,
        mcpServers: mcp ? [{ name: 'mcp', type: 'sse', url: mcp }] : [],
        paymentLinks: pay ? [{ label: 'Pago', url: pay }] : []
      }
    }).then(afterSave).catch(onError);
  }

  function saveWa() {
    var body = {
      metaAppId: $('#tg-wa-app').value.trim(),
      wabaId: $('#tg-wa-waba').value.trim(),
      phoneNumberId: $('#tg-wa-phone').value.trim(),
      displayPhone: $('#tg-wa-display').value.trim(),
      verifyToken: $('#tg-wa-verify').value.trim()
    };
    var secret = $('#tg-wa-secret').value.trim();
    var token = $('#tg-wa-token').value.trim();
    if (secret) body.appSecret = secret;
    if (token) body.accessToken = token;
    api('/public/portal/connection', { method: 'PUT', body: body })
      .then(afterSave)
      .catch(onError);
  }

  /* ── arranque ────────────────────────────────────────────────────────── */

  function boot() {
    state.companyId = readCompanyId();
    if (!state.companyId) {
      $('#tg-root').className = 'tg-co';
      $('#tg-root').innerHTML =
        '<div class="tg-gate"><div class="tg-gate__card">' +
        '<p class="tg-gate__brand">Tech<em>Guard</em></p>' +
        '<p class="tg-gate__eyebrow">Panel de empresa</p>' +
        '<p class="tg-gate__lead">Este enlace no trae el identificador de tu empresa. ' +
        'Abre el enlace completo que te envió TechGuard.</p></div></div>';
      return;
    }
    state.token = loadToken();
    if (!state.token) return renderGate('');
    $('#tg-root').innerHTML = '<p class="tg-loading">Cargando tu panel…</p>';
    api('/public/portal/session')
      .then(function (out) {
        state.company = out.company;
        state.connection = out.connection;
        renderPanel();
      })
      .catch(function () {
        saveToken('');
        state.token = '';
        renderGate('');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
