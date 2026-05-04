/**
 * bmg_instant_fixes.js  v2
 * ═══════════════════════════════════════════════════════════════
 * THREE FIXES — load LAST, after ALL other scripts
 *
 * FIX 1: "Verifying Payment" screen appears on EVERY login/page-load
 *         ROOT CAUSE: stale docs in payment_recovery collection are
 *         found by _patchedRecoverOnLoad() → it launches the verify
 *         panel even for already-confirmed or abandoned payments.
 *         FIX: intercept the recovery, clean stale docs, skip if
 *         already confirmed in tournament_entries.
 *
 * FIX 2: Tournament verification takes up to 2 minutes (40 polls×3s)
 *         FIX: Firestore onSnapshot + instant CF check = done in ≤8s
 *
 * FIX 3: Ground slots don't update in real-time + stuck "Processing"
 *         FIX: replace loadSlots() with onSnapshot listener;
 *              instant slot release on cancel/exit/back
 *
 * Load order in index.html (LAST script):
 *   <script src="bmg_tournament_verify_fix.js"></script>
 *   <script src="bmg_instant_fixes.js"></script>   ← THIS (last)
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  function waitFor(name, cb, ms) {
    if (typeof window[name] === 'function') { cb(); return; }
    const t = setInterval(() => {
      if (typeof window[name] === 'function') { clearInterval(t); cb(); }
    }, ms || 100);
  }

  const CF_BASE = window._BMG_CF_BASE
    || window.CF_BASE
    || 'https://us-central1-bookmyground-6d87b.cloudfunctions.net';

  /* ══════════════════════════════════════════════════════════════
   * FIX 1 & 2 — INSTANT TOURNAMENT VERIFICATION + STALE DOC CLEANUP
   * ══════════════════════════════════════════════════════════════ */

  async function _cfCheck(orderId) {
    try {
      const r = await fetch(`${CF_BASE}/checkOrderStatus`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ orderId, paymentType: 'tournament' }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      if (d.status === 'SUCCESS') return true;
      if (d.status === 'FAILED')  return false;
      return null;
    } catch (_) { return null; }
  }

  function _destroyPanel() {
    if (window._bmgTournamentVerifyPanel?.destroy) {
      try { window._bmgTournamentVerifyPanel.destroy(); } catch (_) {}
    }
    const el = document.getElementById('bmg-tourn-verify-panel');
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s';
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 200);
    }
  }

  function _toast(msg, type, dur) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur || 4000);
  }

  function _clearSessionForOrder(orderId) {
    const keys = [
      'bmg_lastTournOrderId', 'bmg_recoverOrderId', 'bmg_recoverPayType',
      'pendingTournamentRegistration',
    ];
    if (orderId) keys.push(`bmg_tournReg_${orderId}`);
    keys.forEach(k => { try { sessionStorage.removeItem(k); } catch (_) {} });
    window._pendingTournamentRegData = null;
    window.currentTournamentPayment  = null;
  }

  /**
   * Instant verification — resolves in ≤ 8 seconds using:
   *  • Firestore onSnapshot (real-time, fires the moment webhook writes)
   *  • Direct CF check at 2s and 5s
   *  • Hard timeout at 8s
   */
  async function _instantVerify(orderId, paymentData) {
    const db = window.db;
    if (!db) { _destroyPanel(); return; }

    let resolved = false;
    let unsubEntries = null;
    let unsubPending = null;
    let t1, t2, tHard;

    function cleanup() {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(tHard);
      if (unsubEntries) { try { unsubEntries(); } catch (_) {} }
      if (unsubPending) { try { unsubPending(); } catch (_) {} }
    }

    function succeed() {
      if (resolved) return;
      resolved = true;
      cleanup();
      _destroyPanel();
      _clearSessionForOrder(orderId);

      const writeSuccess = window._writeAndShowTournamentSuccess
        || window._bmgWriteAndShowTournamentSuccess;
      if (typeof writeSuccess === 'function') {
        writeSuccess(orderId, paymentData || {});
      } else {
        _toast('🏆 Registration confirmed! Check "My Tournaments".', 'success', 6000);
        if (typeof window.loadMyTournaments === 'function') {
          setTimeout(() => window.loadMyTournaments(), 800);
        }
      }

      window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
        detail: { orderId, paymentType: 'tournament', result: paymentData || {} }
      }));
    }

    function fail(msg) {
      if (resolved) return;
      resolved = true;
      cleanup();
      _destroyPanel();
      _clearSessionForOrder(orderId);
      if (msg) _toast(msg, 'error', 5000);
      if (db) {
        db.collection('pending_payments').doc(orderId).delete().catch(() => {});
        db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
      }
    }

    function timedOut() {
      if (resolved) return;
      resolved = true;
      cleanup();
      _destroyPanel();
      _toast(
        '⚠️ Payment received — registration may take a moment. Check "My Tournaments".',
        'warning', 8000
      );
      if (typeof window.loadMyTournaments === 'function') {
        setTimeout(() => window.loadMyTournaments(), 2000);
      }
    }

    // Real-time: tournament_entries written
    try {
      unsubEntries = db.collection('tournament_entries').doc(orderId)
        .onSnapshot(snap => { if (snap.exists && !resolved) succeed(); }, () => {});
    } catch (_) {}

    // Real-time: pending_payments deleted (webhook fired)
    try {
      unsubPending = db.collection('pending_payments').doc(orderId)
        .onSnapshot(snap => {
          if (!snap.exists && !resolved) {
            db.collection('tournament_entries').doc(orderId).get()
              .then(e => { if (e.exists && !resolved) succeed(); })
              .catch(() => {});
          }
        }, () => {});
    } catch (_) {}

    t1 = setTimeout(async () => {
      if (resolved) return;
      const r = await _cfCheck(orderId);
      if (r === true)  succeed();
      if (r === false) fail('Payment was not completed. Please try again.');
    }, 2000);

    t2 = setTimeout(async () => {
      if (resolved) return;
      const r = await _cfCheck(orderId);
      if (r === true)  succeed();
      if (r === false) fail('Payment was not completed. Please try again.');
    }, 5000);

    tHard = setTimeout(async () => {
      if (resolved) return;
      const r = await _cfCheck(orderId);
      if (r === true) { succeed(); return; }
      timedOut();
    }, 8000);
  }

  /* ─────────────────────────────────────────────────────────────
   * THE ROOT CAUSE FIX: Smart recovery that replaces the naive
   * _patchedRecoverOnLoad from bmg_tournament_verify_fix.js
   *
   * Old behaviour: finds ANY payment_recovery doc < 1 hour old
   * and immediately shows the verify panel, even for paid orders.
   *
   * New behaviour:
   *  1. Skip if already confirmed in tournament_entries ← KEY FIX
   *  2. Delete docs older than 2 hours silently
   *  3. CF instant check before showing ANY panel
   *  4. Only show panel for genuinely PENDING payments
   * ───────────────────────────────────────────────────────────── */
  async function _smartRecovery() {
    // Dismiss any panel that verify_fix may have already shown
    _destroyPanel();
    if (typeof window.hideLoading === 'function') window.hideLoading();

    // Wait for auth (max 6s)
    let waited = 0;
    while (!window.currentUser && waited < 6000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    const cu = window.currentUser;
    if (!cu || !window.db) return;
    const db = window.db;

    // ── Step 1: Check sessionStorage for stale orders ───────────
    let storedId = null;
    try {
      storedId = sessionStorage.getItem('bmg_lastTournOrderId')
        || sessionStorage.getItem('bmg_recoverOrderId');
      const payType = sessionStorage.getItem('bmg_recoverPayType');
      if (payType && payType !== 'tournament') storedId = null;

      if (storedId) {
        const raw = sessionStorage.getItem(`bmg_tournReg_${storedId}`);
        if (raw) {
          const meta = JSON.parse(raw);
          // Clear if older than 2 hours
          if (Date.now() - (meta.savedAt || 0) > 2 * 60 * 60 * 1000) {
            _clearSessionForOrder(storedId);
            storedId = null;
          }
        }
      }
    } catch (_) {}

    // ── Step 2: Scan payment_recovery in Firestore ───────────────
    let orderId = storedId;
    let regMeta = null;

    if (!orderId) {
      try {
        const snap = await db.collection('payment_recovery')
          .where('userId',      '==', cu.uid)
          .where('paymentType', '==', 'tournament')
          .where('status',      '==', 'pending')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get().catch(() => null);

        if (snap && !snap.empty) {
          const now = Date.now();
          for (const doc of snap.docs) {
            const d   = doc.data();
            const age = now - (d.createdAt?.toMillis?.() || 0);

            // Silently delete docs older than 2 hours
            if (age > 2 * 60 * 60 * 1000) {
              doc.ref.delete().catch(() => {});
              continue;
            }

            orderId = doc.id;
            regMeta = d;
            break;
          }
        }
      } catch (_) {}
    }

    // No candidate at all → nothing to recover
    if (!orderId) {
      console.log('[BMG] No pending tournament recovery needed.');
      return;
    }

    console.log('[BMG] Recovery candidate:', orderId);

    // ── Step 3: Already confirmed? Skip the panel entirely ───────
    // THIS IS THE KEY FIX — old code skipped this check
    try {
      const entrySnap = await db.collection('tournament_entries').doc(orderId).get();
      if (entrySnap.exists) {
        console.log('[BMG] Order already confirmed — cleaning stale docs, no panel needed');
        db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
        db.collection('pending_payments').doc(orderId).delete().catch(() => {});
        _clearSessionForOrder(orderId);
        return; // ← EXIT: do NOT show the verify panel
      }
    } catch (_) {}

    // ── Step 4: Load regMeta ─────────────────────────────────────
    if (!regMeta) {
      try {
        const raw = sessionStorage.getItem(`bmg_tournReg_${orderId}`)
          || sessionStorage.getItem('pendingTournamentRegistration');
        if (raw) regMeta = JSON.parse(raw);
      } catch (_) {}
    }
    if (regMeta) window._pendingTournamentRegData = regMeta;

    // ── Step 5: Instant CF check before showing ANY UI ───────────
    const instant = await _cfCheck(orderId);

    if (instant === true) {
      console.log('[BMG] CF confirmed instantly — no panel needed');
      _clearSessionForOrder(orderId);
      db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
      const writeSuccess = window._writeAndShowTournamentSuccess;
      if (typeof writeSuccess === 'function') writeSuccess(orderId, regMeta || {});
      else _toast('🏆 Registration confirmed! Check "My Tournaments".', 'success', 6000);
      return;
    }

    if (instant === false) {
      console.log('[BMG] CF says FAILED — cleaning up without panel');
      _clearSessionForOrder(orderId);
      db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
      db.collection('pending_payments').doc(orderId).delete().catch(() => {});
      _toast('Your previous tournament payment was not completed.', 'warning', 5000);
      return;
    }

    // ── Step 6: Genuinely pending — show panel + instant verify ──
    console.log('[BMG] Genuinely pending — starting ≤8s instant verify');
    if (window._bmgTournamentVerifyPanel?.show) {
      window._bmgTournamentVerifyPanel.show({});
    }
    await _instantVerify(orderId, regMeta || {});
  }

  /* ─────────────────────────────────────────────────────────────
   * BOOT STRATEGY
   *
   * bmg_tournament_verify_fix.js calls _patchedRecoverOnLoad()
   * inside its own onReady() → DOMContentLoaded.
   * Since THIS script loads AFTER it in index.html, its onReady()
   * has already been queued. We use setTimeout(0) to run after
   * all synchronous DOMContentLoaded handlers complete, then
   * destroy any panel they opened.
   * ───────────────────────────────────────────────────────────── */
  function boot() {
    // Slight delay so verify_fix's onReady() finishes first,
    // then we clean up whatever it did.
    setTimeout(_smartRecovery, 80);
  }

  if (document.readyState !== 'loading') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  /* ─────────────────────────────────────────────────────────────
   * MUTATION OBSERVER: catch any panel that appears AFTER our boot
   * (e.g. if verify_fix's async flow runs after _smartRecovery)
   * ───────────────────────────────────────────────────────────── */
  const _panelWatcher = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1 || node.id !== 'bmg-tourn-verify-panel') continue;

        // Panel appeared — check if it's legitimate
        const storedId = sessionStorage.getItem('bmg_lastTournOrderId')
          || sessionStorage.getItem('bmg_recoverOrderId');

        if (!storedId) {
          // No order in session → rogue panel, kill it
          console.log('[BMG] Rogue verify panel — destroying');
          setTimeout(_destroyPanel, 80);
          return;
        }

        // There's an order — but is it already confirmed?
        if (window.db) {
          window.db.collection('tournament_entries').doc(storedId).get()
            .then(snap => {
              if (snap.exists) {
                console.log('[BMG] Order confirmed — destroying stale panel');
                _destroyPanel();
                _clearSessionForOrder(storedId);
              }
            }).catch(() => {});
        }
      }
    }
  });

  // Start watching as early as possible
  const _startWatcher = () => {
    _panelWatcher.observe(document.body || document.documentElement, {
      childList: true, subtree: false
    });
  };
  if (document.body) _startWatcher();
  else document.addEventListener('DOMContentLoaded', _startWatcher);


  /* ══════════════════════════════════════════════════════════════
   * FIX 3 — REAL-TIME SLOT GRID (Movie-booking style)
   * ══════════════════════════════════════════════════════════════ */

  let _slotUnsub = null;

  async function loadSlotsRealtime(groundId, date) {
    const container = document.getElementById('time-slots');
    if (!container) return;

    container.innerHTML = `
      <div style="padding:2rem;text-align:center;">
        <div class="loader-spinner"></div>
        <p style="margin-top:1rem;color:var(--gray-500);">Loading slots…</p>
      </div>`;

    if (_slotUnsub) { try { _slotUnsub(); } catch (_) {} _slotUnsub = null; }

    const db = window.db;
    if (!db) return;

    _releaseExpiredLocks(groundId, date);

    _slotUnsub = db.collection('slots')
      .where('groundId', '==', groundId)
      .where('date',     '==', date)
      .onSnapshot(snapshot => {
        const statusMap = {}, lockOwnerMap = {};
        snapshot.forEach(doc => {
          const s = doc.data();
          const k = `${s.startTime}-${s.endTime}`;
          statusMap[k]    = s.status;
          lockOwnerMap[k] = s.lockedBy || s.lockOrderId || null;
        });
        _renderSlots(container, statusMap, lockOwnerMap, date);
      }, () => {
        if (typeof window._originalLoadSlots === 'function')
          window._originalLoadSlots(groundId, date);
      });
  }

  function _renderSlots(container, statusMap, lockOwnerMap, date) {
    const cu        = window.currentUser;
    const now       = new Date();
    const curMin    = now.getHours() * 60 + now.getMinutes();
    const isToday   = date === new Date().toISOString().split('T')[0];
    const selSlot   = window.selectedSlot || null;
    const myOrderId = sessionStorage.getItem('bmg_currentOrderId') || '';

    let html = '';
    for (let h = 0; h < 24; h++) {
      const s   = `${String(h).padStart(2,'0')}:00`;
      const e   = `${String(h+1).padStart(2,'0')}:00`;
      const key = `${s}-${e}`;
      const raw = statusMap[key] || 'available';
      const owner    = lockOwnerMap[key];
      const isMyLock = owner && cu && (owner === cu.uid || owner === myOrderId);

      let cls = 'available', disabled = false, badge = '';

      if (isToday && h * 60 <= curMin) {
        cls = 'past'; disabled = true;
      } else {
        switch (raw) {
          case 'booked':
          case 'confirmed':
            cls = 'confirmed'; disabled = true;
            badge = '<span class="bmg-sb booked">Booked</span>';
            break;
          case 'locked':
          case 'pending':
            if (isMyLock) {
              cls = 'selected'; disabled = false;
              badge = '<span class="bmg-sb mine">Your Slot</span>';
            } else {
              cls = 'locked'; disabled = true;
              badge = '<span class="bmg-sb locked">Processing</span>';
            }
            break;
          case 'closed':
          case 'blocked':
            cls = 'closed'; disabled = true;
            break;
        }
      }

      html += `<div class="time-slot ${cls}${selSlot===key?' selected':''}"
        data-slot="${key}" data-status="${disabled?'disabled':raw}"
        ${!disabled?'data-available="true"':''}
      ><span>${key.replace('-',' – ')}</span>${badge}</div>`;
    }

    container.innerHTML = html;
    container.querySelectorAll('.time-slot[data-available="true"]').forEach(el => {
      el.addEventListener('click', () => {
        if (typeof window.selectSlot === 'function') window.selectSlot(el.dataset.slot);
      });
    });
  }

  async function _releaseExpiredLocks(groundId, date) {
    const db = window.db;
    if (!db || !groundId || !date) return;
    try {
      const snap = await db.collection('slots')
        .where('groundId','==',groundId).where('date','==',date)
        .where('status','in',['locked','pending']).get();
      const now = Date.now(), batch = db.batch();
      let changed = false;
      snap.forEach(doc => {
        const d = doc.data();
        const exp = d.lockExpiresAtMs || d.lockExpiresAt?.toMillis?.() || 0;
        if (exp && now > exp) {
          batch.update(doc.ref, {
            status:'available', lockOrderId:null, lockExpiresAt:null,
            lockExpiresAtMs:null, lockedBy:null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          changed = true;
        }
      });
      if (changed) await batch.commit();
    } catch (_) {}
  }

  async function _releaseMySlot() {
    const db = window.db;
    if (!db) return;
    let li = null;
    try { li = JSON.parse(sessionStorage.getItem('slotLock') || 'null'); } catch (_) {}
    if (!li?.orderId) return;
    try {
      const snap = await db.collection('slots').where('lockOrderId','==',li.orderId).limit(1).get();
      if (!snap.empty) await snap.docs[0].ref.update({
        status:'available', lockOrderId:null, lockExpiresAt:null,
        lockExpiresAtMs:null, lockedBy:null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('pending_payments').doc(li.orderId).delete().catch(() => {});
    } catch (_) {}
    sessionStorage.removeItem('slotLock');
  }

  // Release slot when navigating away from booking pages
  const _origShowPage = window.showPage;
  if (typeof _origShowPage === 'function') {
    window.showPage = function (to) {
      const cur = document.querySelector('.page.active')?.id || '';
      if (['booking-page','payment-page','cashfree-page'].includes(cur) &&
          !['booking-page','payment-page','cashfree-page'].includes(to)) {
        _releaseMySlot();
      }
      return _origShowPage.apply(this, arguments);
    };
  }

  // Mark for release on tab close (async Firestore won't work in beforeunload)
  window.addEventListener('beforeunload', () => {
    try {
      const li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      if (li?.orderId) sessionStorage.setItem('slotLock_needsRelease', li.orderId);
    } catch (_) {}
  });

  // Release on next page load
  window.addEventListener('DOMContentLoaded', () => {
    const stale = sessionStorage.getItem('slotLock_needsRelease');
    if (stale && window.db) {
      sessionStorage.removeItem('slotLock_needsRelease');
      window.db.collection('slots').where('lockOrderId','==',stale).limit(1).get()
        .then(s => {
          if (!s.empty) s.docs[0].ref.update({
            status:'available', lockOrderId:null, lockExpiresAt:null,
            lockExpiresAtMs:null, lockedBy:null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }).catch(() => {});
      window.db.collection('pending_payments').doc(stale).delete().catch(() => {});
    }
  });

  window.addEventListener('bmg:paymentCancelled', () => _releaseMySlot());

  // Wire real-time slot loader
  waitFor('loadSlots', () => {
    window._originalLoadSlots = window.loadSlots;
    window.loadSlots = loadSlotsRealtime;
    console.log('✅ [BMG] loadSlots → real-time onSnapshot');
  });

  // Slot badge styles
  const style = document.createElement('style');
  style.textContent = `
    .bmg-sb {
      display:inline-block; font-size:9px; font-weight:700;
      letter-spacing:.04em; text-transform:uppercase;
      padding:2px 5px; border-radius:4px; margin-left:4px;
      vertical-align:middle;
    }
    .bmg-sb.booked { background:#fee2e2; color:#dc2626; }
    .bmg-sb.locked { background:#fef3c7; color:#d97706; }
    .bmg-sb.mine   { background:#d1fae5; color:#059669; }
    .time-slot.confirmed, .time-slot.locked { cursor:not-allowed; opacity:.65; }
  `;
  document.head.appendChild(style);

  window._bmgInstantFixes = {
    smartRecovery : _smartRecovery,
    instantVerify : _instantVerify,
    releaseMySlot : _releaseMySlot,
    clearSession  : _clearSessionForOrder,
    destroyPanel  : _destroyPanel,
  };

  console.log('✅ [bmg_instant_fixes.js v2] Loaded');

})();
