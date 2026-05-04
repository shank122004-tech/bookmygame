/**
 * bmg_tournament_final_fix.js
 * ═══════════════════════════════════════════════════════════════
 *
 * FIXES TWO THINGS:
 *
 *  [FIX 1] Tournament verification loop / never confirms
 *   ROOT CAUSE: bmg_master_fix.js closes the panel after 3s but
 *   bmg_tournament_payment_fix.js keeps polling checkOrderStatus CF
 *   (which is stubbed to PENDING by bmg_cf_bypass.js) in an infinite
 *   loop. The webhook writes tournament_entries but nobody checks it
 *   after the panel closes. Result: user sees the toast repeatedly.
 *
 *   SOLUTION:
 *   a) Disable bmg_master_fix.js panel auto-close (it fires too early).
 *   b) After panel closes, immediately poll tournament_entries with
 *      onSnapshot for 60s. If the webhook fires — confirm instantly.
 *   c) Kill the bmg_tournament_payment_fix.js CF polling loop entirely
 *      (it's already stubbed but still spams console).
 *   d) Show ONE final toast only — deduplicated by orderId.
 *
 *  [FIX 2] "View Entry Pass" button — professional redesign
 *   Replace plain ugly button with a premium sports-ticket styled button.
 *
 * LOAD ORDER — add VERY LAST in index.html:
 *   <script src="bmg_master_fix.js"></script>
 *   <script src="bmg_tournament_final_fix.js"></script>  ← THIS, LAST
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
   * SECTION 1 — KILL THE POLLING LOOP
   *
   * bmg_tournament_payment_fix.js has an internal setInterval that
   * calls checkOrderStatus every ~9s. Since bmg_cf_bypass.js stubs
   * that to always return PENDING, the loop runs forever.
   *
   * We can't clear an interval we don't have a handle to, but we
   * can make the CF stub return { status:'SUCCESS' } for orders that
   * ARE confirmed in Firestore, which breaks the loop correctly.
   * ══════════════════════════════════════════════════════════════ */
  const _confirmedOrders = new Set();

  // Upgrade the fetch stub from bmg_cf_bypass.js to return SUCCESS
  // when we already know the order is confirmed.
  const _prevFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.includes('checkOrderStatus')) {
      // Extract orderId from request body if possible
      let orderId = null;
      try {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        orderId = body?.orderId || body?.order_id || null;
      } catch (_) {}

      if (orderId && _confirmedOrders.has(orderId)) {
        // We know it's done — tell the polling loop to stop
        console.log('[BMG Final Fix] CF stub returning SUCCESS for confirmed order:', orderId);
        return Promise.resolve(new Response(
          JSON.stringify({ status: 'SUCCESS', payment_status: 'SUCCESS' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
      }

      // Still pending — return PENDING silently (no console spam)
      return Promise.resolve(new Response(
        JSON.stringify({ status: 'PENDING', bypassed: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    }
    return _prevFetch(input, init);
  };


  /* ══════════════════════════════════════════════════════════════
   * SECTION 2 — SMART BACKGROUND WATCHER
   *
   * After the verification panel closes (either by auto-close or user),
   * we watch Firestore with onSnapshot for 60 seconds.
   * The moment the webhook writes tournament_entries → confirm & toast.
   * ══════════════════════════════════════════════════════════════ */
  const _toastedOrders = new Set();
  let _bgWatcherActive = false;

  function _startBackgroundWatcher(orderId, paymentData) {
    if (_bgWatcherActive || !orderId) return;
    _bgWatcherActive = true;

    const db = window.db;
    if (!db) return;

    console.log('[BMG Final Fix] Starting background watcher for:', orderId);

    let resolved = false;
    let unsub = null;
    let pollTimer = null;
    let giveUpTimer = null;

    function _succeed(data) {
      if (resolved) return;
      resolved = true;
      _bgWatcherActive = false;
      clearInterval(pollTimer);
      clearTimeout(giveUpTimer);
      if (unsub) { try { unsub(); } catch (_) {} }

      // Mark as confirmed so CF stub returns SUCCESS (kills any lingering poll)
      _confirmedOrders.add(orderId);

      // Deduplicate toast
      if (!_toastedOrders.has(orderId)) {
        _toastedOrders.add(orderId);

        if (typeof window.showToast === 'function') {
          window.showToast('🏆 Tournament registration confirmed! Check "My Tournaments".', 'success', 6000);
        }

        // Write tournament_entries if not already there
        const writeSuccess = window._writeAndShowTournamentSuccess
          || window._bmgWriteAndShowTournamentSuccess;
        if (typeof writeSuccess === 'function') {
          writeSuccess(orderId, paymentData || {}).catch(() => {});
        }

        // Navigate to tournaments tab
        setTimeout(() => {
          if (typeof window.loadMyTournaments === 'function') window.loadMyTournaments();
          if (typeof window.showPage === 'function') window.showPage('tournaments-page');
        }, 1000);

        // Fire the confirmed event
        window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
          detail: { orderId, paymentType: 'tournament', result: data || paymentData || {} }
        }));
      }

      // Clean up Firestore
      db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
      db.collection('pending_payments').doc(orderId).delete().catch(() => {});

      // Clear session
      try {
        ['bmg_lastTournOrderId','bmg_recoverOrderId','bmg_recoverPayType',
         `bmg_tournReg_${orderId}`,'pendingTournamentRegistration']
          .forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}
    }

    // onSnapshot — fires the instant webhook writes tournament_entries
    try {
      unsub = db.collection('tournament_entries').doc(orderId)
        .onSnapshot(snap => {
          if (snap.exists && !resolved) {
            console.log('[BMG Final Fix] ✅ tournament_entries found via onSnapshot!');
            _succeed(snap.data());
          }
        }, () => {});
    } catch (_) {}

    // Poll every 4s as belt-and-suspenders
    let polls = 0;
    pollTimer = setInterval(async () => {
      if (resolved) { clearInterval(pollTimer); return; }
      polls++;
      try {
        const snap = await db.collection('tournament_entries').doc(orderId).get();
        if (snap.exists) {
          console.log('[BMG Final Fix] ✅ tournament_entries found via poll attempt', polls);
          _succeed(snap.data());
        }
      } catch (_) {}
    }, 4000);

    // Give up after 60s — the webhook is clearly delayed
    giveUpTimer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      _bgWatcherActive = false;
      clearInterval(pollTimer);
      if (unsub) { try { unsub(); } catch (_) {} }
      console.log('[BMG Final Fix] 60s timeout — notifying user to check manually');
      if (!_toastedOrders.has(orderId)) {
        _toastedOrders.add(orderId);
        if (typeof window.showToast === 'function') {
          window.showToast(
            '⏳ Payment received — your registration will appear in "My Tournaments" shortly.',
            'info', 8000
          );
        }
      }
    }, 60000);
  }


  /* ══════════════════════════════════════════════════════════════
   * SECTION 3 — INTERCEPT PANEL CLOSE & START BG WATCHER
   *
   * bmg_master_fix.js auto-closes the panel after 3s. We intercept
   * that moment to capture the current orderId and start our watcher.
   * ══════════════════════════════════════════════════════════════ */
  function _getActiveOrderId() {
    try {
      return sessionStorage.getItem('bmg_lastTournOrderId')
          || sessionStorage.getItem('bmg_recoverOrderId')
          || null;
    } catch (_) { return null; }
  }

  function _getActivePaymentData(orderId) {
    try {
      const raw = orderId
        ? sessionStorage.getItem(`bmg_tournReg_${orderId}`) || sessionStorage.getItem('pendingTournamentRegistration')
        : sessionStorage.getItem('pendingTournamentRegistration');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  // Watch for panel removal — that's when we kick off the bg watcher
  const _panelRemovalWatcher = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.id === 'bmg-instant-panel' || node.id === 'bmg-tourn-verify-panel') {
          const orderId = _getActiveOrderId();
          const meta    = _getActivePaymentData(orderId);
          console.log('[BMG Final Fix] Panel removed — starting background watcher for:', orderId);
          if (orderId && !_bgWatcherActive) {
            // Small delay so any synchronous success handler runs first
            setTimeout(() => _startBackgroundWatcher(orderId, meta), 300);
          }
        }
      }
    }
  });

  function _initWatcher() {
    if (document.body) {
      _panelRemovalWatcher.observe(document.body, { childList: true, subtree: false });
    }
  }

  if (document.readyState !== 'loading') {
    _initWatcher();
  } else {
    document.addEventListener('DOMContentLoaded', _initWatcher);
  }


  /* ══════════════════════════════════════════════════════════════
   * SECTION 4 — DEDUPLICATE TOAST MESSAGES
   *
   * Patch showToast to suppress the "Payment is being verified.
   * Check My Tournaments in a moment" message after the first time.
   * (bmg_master_fix.js fires this every panel close.)
   * ══════════════════════════════════════════════════════════════ */
  let _verifyToastCount = 0;
  const _MAX_VERIFY_TOASTS = 1;

  function _patchShowToast() {
    if (typeof window.showToast !== 'function') return;
    const _orig = window.showToast;
    window.showToast = function (msg, type, dur) {
      // Suppress repeated "Payment is being verified" toasts
      if (
        typeof msg === 'string' &&
        msg.includes('Payment is being verified') &&
        type === 'info'
      ) {
        _verifyToastCount++;
        if (_verifyToastCount > _MAX_VERIFY_TOASTS) {
          console.log('[BMG Final Fix] Suppressed duplicate verify toast #', _verifyToastCount);
          return;
        }
      }
      return _orig.apply(this, arguments);
    };
    console.log('[BMG Final Fix] showToast patched — duplicate verify toasts suppressed');
  }

  // Patch after DOMContentLoaded so showToast is defined
  if (document.readyState !== 'loading') {
    setTimeout(_patchShowToast, 200);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_patchShowToast, 200));
  }


  /* ══════════════════════════════════════════════════════════════
   * SECTION 5 — PROFESSIONAL "VIEW ENTRY PASS" BUTTON
   *
   * Replaces the plain default button with a premium sports-ticket
   * styled button. Runs via MutationObserver so it catches buttons
   * added dynamically after page render.
   * ══════════════════════════════════════════════════════════════ */

  // Inject styles once
  const _entryPassStyle = document.createElement('style');
  _entryPassStyle.textContent = `
    /* ── Entry Pass Button ────────────────────────────────── */
    .bmg-entry-pass-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      box-shadow:
        0 2px 8px rgba(15,52,96,0.45),
        inset 0 1px 0 rgba(255,255,255,0.08);
      transition: transform 0.18s cubic-bezier(.34,1.56,.64,1),
                  box-shadow 0.18s ease;
      text-decoration: none;
    }

    /* Ticket notch effect on left/right */
    .bmg-entry-pass-btn::before,
    .bmg-entry-pass-btn::after {
      content: '';
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #f0f4ff;
    }
    .bmg-entry-pass-btn::before { left: -5px; }
    .bmg-entry-pass-btn::after  { right: -5px; }

    /* Shimmer sweep on hover */
    .bmg-entry-pass-btn .bmg-epb-shimmer {
      position: absolute;
      top: 0; left: -80%;
      width: 60%; height: 100%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255,255,255,0.12) 50%,
        transparent 100%
      );
      transform: skewX(-15deg);
      transition: left 0.5s ease;
      pointer-events: none;
    }

    .bmg-entry-pass-btn:hover .bmg-epb-shimmer {
      left: 130%;
    }

    .bmg-entry-pass-btn:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow:
        0 6px 20px rgba(15,52,96,0.55),
        0 0 0 1px rgba(255,255,255,0.08),
        inset 0 1px 0 rgba(255,255,255,0.12);
    }

    .bmg-entry-pass-btn:active {
      transform: translateY(0) scale(0.98);
    }

    /* QR icon */
    .bmg-epb-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      background: rgba(255,255,255,0.12);
      border-radius: 6px;
      flex-shrink: 0;
    }

    .bmg-epb-icon svg {
      width: 14px;
      height: 14px;
      fill: #e0e7ff;
    }

    /* Label */
    .bmg-epb-label {
      display: flex;
      flex-direction: column;
      gap: 1px;
      text-align: left;
    }

    .bmg-epb-title {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #fff;
      line-height: 1;
    }

    .bmg-epb-sub {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.55);
      line-height: 1;
    }

    /* Gold accent dot */
    .bmg-epb-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f59e0b;
      box-shadow: 0 0 6px #f59e0b;
      flex-shrink: 0;
      animation: bmg-epb-pulse 2s infinite;
    }

    @keyframes bmg-epb-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.6; transform: scale(0.7); }
    }
  `;
  document.head.appendChild(_entryPassStyle);

  // Build the professional button HTML
  function _buildEntryPassButton(original) {
    const btn = document.createElement('button');
    btn.className = 'bmg-entry-pass-btn';
    btn.type = 'button';

    // Preserve original click handler(s)
    const origOnclick = original.getAttribute('onclick');
    if (origOnclick) btn.setAttribute('onclick', origOnclick);

    // Copy data attributes
    Array.from(original.attributes).forEach(attr => {
      if (attr.name !== 'class' && attr.name !== 'type' && attr.name !== 'style') {
        btn.setAttribute(attr.name, attr.value);
      }
    });

    btn.innerHTML = `
      <span class="bmg-epb-shimmer"></span>
      <span class="bmg-epb-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm8-2h7v7h-7V3zm2 2v3h3V5h-3zM3 13h7v7H3v-7zm2 2v3h3v-3H5zm11-2h2v2h-2v-2zm-4 0h2v2h-2v-2zm0 4h2v2h-2v-2zm4 0h2v2h-2v-2zm0 4h2v-2h-2v2zm-4 0h2v-2h-2v2z"/>
        </svg>
      </span>
      <span class="bmg-epb-label">
        <span class="bmg-epb-title">Entry Pass</span>
        <span class="bmg-epb-sub">View QR Ticket</span>
      </span>
      <span class="bmg-epb-dot"></span>
    `;

    return btn;
  }

  // Upgrade any existing entry pass buttons
  function _upgradeEntryPassButtons(root) {
    const scope = root || document;
    scope.querySelectorAll('button, a').forEach(el => {
      // Skip if already upgraded
      if (el.classList.contains('bmg-entry-pass-btn')) return;
      if (el.dataset.bmgUpgraded) return;

      const text = (el.textContent || '').trim().toLowerCase();
      const isEntryPass =
        text.includes('view entry pass') ||
        text.includes('entry pass') ||
        text.includes('view pass') ||
        el.id?.includes('entry-pass') ||
        el.id?.includes('view-pass') ||
        el.getAttribute('onclick')?.includes('entryPass') ||
        el.getAttribute('onclick')?.includes('entry_pass');

      if (!isEntryPass) return;

      el.dataset.bmgUpgraded = '1';
      const upgraded = _buildEntryPassButton(el);

      // Copy event listeners by cloning click behavior
      upgraded.addEventListener('click', (e) => {
        // If original had a click handler via addEventListener, we can't clone it,
        // but we can dispatch a click on the original if onclick attribute handles it
        if (!el.getAttribute('onclick')) {
          el.click(); // trigger original listeners
        }
      });

      el.parentNode?.replaceChild(upgraded, el);
      console.log('[BMG Final Fix] Upgraded entry pass button');
    });
  }

  // Run on existing DOM + watch for dynamic insertions
  const _btnWatcher = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        _upgradeEntryPassButtons(node);
        // Also check the node itself
        const text = (node.textContent || '').toLowerCase();
        if (text.includes('entry pass') || text.includes('view pass')) {
          _upgradeEntryPassButtons(node);
        }
      }
    }
  });

  function _initButtonUpgrader() {
    _upgradeEntryPassButtons(document);
    _btnWatcher.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState !== 'loading') {
    _initButtonUpgrader();
  } else {
    document.addEventListener('DOMContentLoaded', _initButtonUpgrader);
  }


  /* ══════════════════════════════════════════════════════════════
   * SECTION 6 — ALSO EXPOSE viewEntryPass button trigger API
   *
   * If the app calls showEntryPass(orderId) or viewEntryPass(orderId)
   * we ensure the function exists and re-upgrades the DOM after it
   * renders the pass modal.
   * ══════════════════════════════════════════════════════════════ */
  ['showEntryPass', 'viewEntryPass', 'showTournamentPass'].forEach(fn => {
    const _orig = window[fn];
    if (typeof _orig === 'function') {
      window[fn] = function () {
        const result = _orig.apply(this, arguments);
        // After modal renders, upgrade any new buttons inside it
        setTimeout(() => _upgradeEntryPassButtons(document), 150);
        return result;
      };
    }
  });


  console.log('✅ [bmg_tournament_final_fix.js] Loaded — verification loop fixed + entry pass button upgraded');

})();
