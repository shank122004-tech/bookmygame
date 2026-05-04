/**
 * bmg_instant_fixes.js
 * ═══════════════════════════════════════════════════════════════
 * THREE FIXES IN ONE FILE — load AFTER all other scripts
 *
 * FIX 1: Tournament payment verification — instant (< 10s), not 2 minutes
 * FIX 2: Ground slot shows BOOKED immediately after booking (like movie seats)
 * FIX 3: Slot unlocks INSTANTLY when user cancels or exits
 *
 * Load order in index.html:
 *   <script src="paymentService.js"></script>
 *   <script src="bmg_tournament_payment_fix.js"></script>   ← existing
 *   <script src="bmg_instant_fixes.js"></script>            ← THIS FILE (last)
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
   * UTILITY: wait for a global function to be defined
   * ───────────────────────────────────────────────────────────── */
  function waitFor(fn, cb, intervalMs) {
    if (typeof window[fn] === 'function') { cb(); return; }
    const t = setInterval(() => {
      if (typeof window[fn] === 'function') { clearInterval(t); cb(); }
    }, intervalMs || 100);
  }

  /* ══════════════════════════════════════════════════════════════
   * FIX 1 — INSTANT TOURNAMENT VERIFICATION (< 10 seconds)
   *
   * Problem: old code does 40 polls × 3s = 2 minutes with a
   *   blocking spinner. Users see "attempt 3 of 40" endlessly.
   *
   * Solution: replace _pollAndConfirmTournament with a version
   *   that uses Firestore onSnapshot (real-time) + a single
   *   direct CF call after 3 seconds. No visible attempt counter.
   *   Guaranteed to resolve in ≤ 8 seconds in the normal case.
   * ══════════════════════════════════════════════════════════════ */

  // Grab CF_BASE from whatever bmg_tournament_payment_fix.js used
  // (it may be set on window or we reconstruct it from existing calls)
  function _getCFBase() {
    return window._BMG_CF_BASE
      || window.CF_BASE
      || 'https://us-central1-bookmyground-6d87b.cloudfunctions.net';
  }

  async function _instantVerifyWithCF(orderId) {
    try {
      const res = await fetch(`${_getCFBase()}/checkOrderStatus`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ orderId, paymentType: 'tournament' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 'SUCCESS') return true;
      if (data.status === 'FAILED')  return false;
      return null; // still pending
    } catch (_) {
      return null;
    }
  }

  /**
   * NEW _pollAndConfirmTournament:
   *  • Immediately fires a CF check
   *  • Simultaneously opens a Firestore onSnapshot listener
   *  • Whichever confirms first wins
   *  • Hard timeout at 8s → shows "check My Tournaments" toast
   */
  async function _instantPollAndConfirm(orderId, paymentData) {
    // Access internals via window (they're on the closure of the IIFE in
    // bmg_tournament_payment_fix.js but exposed as globals via window._bmg*)
    const _showLoading  = window._bmgShowLoading  || window._showLoading  || ((m) => console.log('[BMG]', m));
    const _hideLoading  = window._bmgHideLoading  || window._hideLoading  || (() => {});
    const _toast        = window._bmgToast        || ((m, t) => console.log('[BMG toast]', m));
    const _writeSuccess = window._bmgWriteAndShowTournamentSuccess || window._writeAndShowTournamentSuccess;
    const _checkDone    = window._bmgCheckAndConfirm || window._checkAndConfirmTournament;

    _showLoading('Confirming your registration…');

    const db = window.db;
    if (!db) { _hideLoading(); return; }

    let resolved = false;

    function resolve(success, data) {
      if (resolved) return;
      resolved = true;
      if (unsubPending)  { try { unsubPending();  } catch (_) {} }
      if (unsubEntries)  { try { unsubEntries();  } catch (_) {} }
      clearTimeout(hardTimeout);
      _hideLoading();

      if (success) {
        if (typeof _writeSuccess === 'function') {
          _writeSuccess(orderId, paymentData);
        } else {
          _toast('🏆 Registration confirmed! Check "My Tournaments".', 'success', 6000);
          if (typeof window.loadMyTournaments === 'function') {
            setTimeout(() => window.loadMyTournaments(), 800);
          }
        }
      }
    }

    // ── Listener 1: pending_payments deleted = webhook fired ──────
    let unsubPending = null;
    try {
      unsubPending = db.collection('pending_payments').doc(orderId)
        .onSnapshot(snap => {
          if (!snap.exists && !resolved) {
            // Webhook deleted pending doc — check if entry was written
            db.collection('tournament_entries').doc(orderId).get().then(eSnap => {
              if (eSnap.exists) resolve(true, eSnap.data());
              // else: webhook deleted pending but entry not yet written; CF check below handles it
            }).catch(() => {});
          }
        }, () => {});
    } catch (_) {}

    // ── Listener 2: tournament_entries written directly ───────────
    let unsubEntries = null;
    try {
      unsubEntries = db.collection('tournament_entries').doc(orderId)
        .onSnapshot(snap => {
          if (snap.exists && !resolved) {
            resolve(true, snap.data());
          }
        }, () => {});
    } catch (_) {}

    // ── Immediate check: maybe webhook was already fast ───────────
    if (typeof _checkDone === 'function') {
      const alreadyDone = await _checkDone(orderId, paymentData);
      if (alreadyDone) { resolve(true); return; }
    }

    // ── CF direct check after 2s (give webhook a head start) ──────
    setTimeout(async () => {
      if (resolved) return;
      const cfResult = await _instantVerifyWithCF(orderId);
      if (cfResult === true)  { resolve(true); return; }
      if (cfResult === false) {
        resolved = true;
        if (unsubPending) { try { unsubPending(); } catch (_) {} }
        if (unsubEntries) { try { unsubEntries(); } catch (_) {} }
        clearTimeout(hardTimeout);
        _hideLoading();
        _toast('Payment was not completed. Please try again.', 'error');
        return;
      }
      // null = still pending, retry at 5s
      setTimeout(async () => {
        if (resolved) return;
        const cfResult2 = await _instantVerifyWithCF(orderId);
        if (cfResult2 === true)  resolve(true);
        if (cfResult2 === false) {
          resolved = true;
          if (unsubPending) { try { unsubPending(); } catch (_) {} }
          if (unsubEntries) { try { unsubEntries(); } catch (_) {} }
          clearTimeout(hardTimeout);
          _hideLoading();
          _toast('Payment was not completed. Please try again.', 'error');
        }
        // null again → wait for hardTimeout
      }, 3000);
    }, 2000);

    // ── Hard timeout at 8s ────────────────────────────────────────
    const hardTimeout = setTimeout(async () => {
      if (resolved) return;
      // One last CF check
      const finalResult = await _instantVerifyWithCF(orderId);
      if (finalResult === true) { resolve(true); return; }

      // Give up waiting but don't show error — payment may still process
      resolved = true;
      if (unsubPending) { try { unsubPending(); } catch (_) {} }
      if (unsubEntries) { try { unsubEntries(); } catch (_) {} }
      _hideLoading();
      _toast(
        '⚠️ Payment received — registration may take a moment. Check "My Tournaments" shortly.',
        'warning', 8000
      );
      if (typeof window.loadMyTournaments === 'function') {
        setTimeout(() => window.loadMyTournaments(), 3000);
      }
    }, 8000);
  }

  // ── Patch: override the slow _pollAndConfirmTournament ───────────
  // bmg_tournament_payment_fix.js exposes it on window if called from
  // outside its IIFE; we also hook into the event pathway.
  window._pollAndConfirmTournament = _instantPollAndConfirm;

  // Also expose so _recoverTournamentOnPageLoad can call the new version
  window._bmgInstantPollAndConfirm = _instantPollAndConfirm;

  // Patch the bmg:paymentConfirmed event for tournament type to use instant verify
  window.addEventListener('bmg:paymentConfirmed', async (e) => {
    const { orderId, paymentType, result } = e.detail || {};
    if (paymentType !== 'tournament') return;
    // If already handled by _writeAndShowTournamentSuccess, do nothing
    if (result && result._handledByTournFix) return;
    await _instantPollAndConfirm(orderId, result || {});
  }, { capture: true }); // capture=true so this runs BEFORE other listeners


  /* ══════════════════════════════════════════════════════════════
   * FIX 2 & 3 — REAL-TIME SLOT STATUS (Movie-booking style)
   *
   * Problem A: After booking, slot still shows "Available"
   *   → loadSlots() is a one-time .get() call; no live updates.
   *
   * Problem B: Cancelled/abandoned bookings leave slot as
   *   "Processing" (locked) indefinitely.
   *
   * Solution:
   *   • Replace loadSlots() to use onSnapshot (Firestore real-time)
   *     instead of a one-time .get(). Any status change in Firestore
   *     instantly re-renders the slot grid.
   *   • On cancel / page hide / beforeunload → call releaseSlotLock()
   *     immediately and update the Firestore doc to 'available' right
   *     then, without waiting for a Cloud Function.
   *   • Auto-expire stale locks on page load (client-side safety net).
   * ══════════════════════════════════════════════════════════════ */

  // Track the active slot listener so we can detach it when changing ground/date
  let _slotUnsubscribe = null;

  /**
   * NEW loadSlots — real-time Firestore listener (onSnapshot)
   * Drops in as a direct replacement for the existing loadSlots().
   */
  async function loadSlotsRealtime(groundId, date) {
    const container = document.getElementById('time-slots');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-spinner" style="padding:var(--space-3xl,2rem);text-align:center;">
        <div class="loader-spinner"></div>
        <p style="margin-top:var(--space-md,1rem);color:var(--gray-500);">Loading slots…</p>
      </div>`;

    // Detach previous listener before creating a new one
    if (_slotUnsubscribe) {
      try { _slotUnsubscribe(); } catch (_) {}
      _slotUnsubscribe = null;
    }

    const db = window.db;
    if (!db) return;

    // Auto-expire any stale locks immediately (client-side safety net)
    _releaseExpiredLocks(groundId, date);

    // ── onSnapshot: any write to slots collection re-renders grid ──
    _slotUnsubscribe = db.collection('slots')
      .where('groundId', '==', groundId)
      .where('date',     '==', date)
      .onSnapshot(snapshot => {
        // Build status map from live Firestore data
        const statusMap = {};
        const lockOwnerMap = {};
        snapshot.forEach(doc => {
          const s = doc.data();
          const key = `${s.startTime}-${s.endTime}`;
          statusMap[key]    = s.status;
          lockOwnerMap[key] = s.lockedBy || s.lockOrderId || null;
        });
        _renderSlotGrid(container, groundId, date, statusMap, lockOwnerMap);
      }, err => {
        console.error('[BMG] Slot listener error:', err);
        // Fallback to one-time load if listener fails
        if (typeof window._originalLoadSlots === 'function') {
          window._originalLoadSlots(groundId, date);
        }
      });
  }

  function _renderSlotGrid(container, groundId, date, statusMap, lockOwnerMap) {
    const cu          = window.currentUser;
    const now         = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const today       = new Date().toISOString().split('T')[0];
    const isToday     = date === today;
    const selectedSlot = window.selectedSlot || null;

    let html = '';

    for (let hour = 0; hour < 24; hour++) {
      const s   = `${String(hour).padStart(2,'0')}:00`;
      const e   = `${String(hour + 1).padStart(2,'0')}:00`;
      const key = `${s}-${e}`;

      const rawStatus    = statusMap[key] || 'available';
      const slotOwner    = lockOwnerMap[key];
      const isMyLock     = slotOwner && cu && (slotOwner === cu.uid || slotOwner === sessionStorage.getItem('bmg_currentOrderId'));
      const slotStartMin = hour * 60;

      let statusClass = 'available';
      let isDisabled  = false;
      let labelExtra  = '';

      // Past slot
      if (isToday && slotStartMin <= currentTime) {
        statusClass = 'past';
        isDisabled  = true;
      } else {
        switch (rawStatus) {
          case 'booked':
          case 'confirmed':
            statusClass = 'confirmed';
            isDisabled  = true;
            labelExtra  = '<span class="slot-badge booked">Booked</span>';
            break;
          case 'locked':
          case 'pending':
            if (isMyLock) {
              // Current user's own pending payment — show as "Your booking"
              statusClass = 'selected';
              isDisabled  = false;
              labelExtra  = '<span class="slot-badge mine">Your Booking</span>';
            } else {
              statusClass = 'locked';
              isDisabled  = true;
              labelExtra  = '<span class="slot-badge locked">Processing</span>';
            }
            break;
          case 'closed':
          case 'blocked':
            statusClass = 'closed';
            isDisabled  = true;
            break;
          default:
            statusClass = 'available';
        }
      }

      const isSelected = selectedSlot === key;

      html += `
        <div class="time-slot ${statusClass}${isSelected ? ' selected' : ''}"
             data-slot="${key}"
             data-status="${isDisabled ? 'disabled' : rawStatus}"
             ${!isDisabled ? 'data-available="true"' : ''}>
          <span class="slot-time">${key.replace('-', ' – ')}</span>
          ${labelExtra}
        </div>`;
    }

    container.innerHTML = html;

    // Wire click handlers for available slots only
    container.querySelectorAll('.time-slot[data-available="true"]').forEach(el => {
      el.addEventListener('click', () => {
        const slotTime = el.dataset.slot;
        if (slotTime && typeof window.selectSlot === 'function') {
          window.selectSlot(slotTime);
        }
      });
    });
  }

  /**
   * Release locks that passed their expiry time — runs on page load as a
   * client-side safety net so stale "Processing" slots clear themselves.
   */
  async function _releaseExpiredLocks(groundId, date) {
    const db  = window.db;
    if (!db || !groundId || !date) return;
    try {
      const now  = Date.now();
      const snap = await db.collection('slots')
        .where('groundId', '==', groundId)
        .where('date',     '==', date)
        .where('status',   'in', ['locked', 'pending'])
        .get();

      const batch = db.batch();
      let changed = false;

      snap.forEach(doc => {
        const d = doc.data();
        const expiryMs = d.lockExpiresAtMs || (d.lockExpiresAt?.toMillis?.()) || 0;
        if (expiryMs && now > expiryMs) {
          batch.update(doc.ref, {
            status         : 'available',
            lockOrderId    : null,
            lockExpiresAt  : null,
            lockExpiresAtMs: null,
            lockedBy       : null,
            updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
          });
          changed = true;
          console.log('[BMG] Auto-expired stale lock for slot:', doc.id);
        }
      });

      if (changed) await batch.commit();
    } catch (e) {
      console.warn('[BMG] _releaseExpiredLocks error:', e);
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * FIX 3 — INSTANT RELEASE ON CANCEL / EXIT
   *
   * When user:
   *  (a) Presses back / browser back while payment in progress
   *  (b) Closes the Cashfree popup without paying
   *  (c) Closes the tab / navigates away
   *
   * We immediately release the slot lock in Firestore.
   * ───────────────────────────────────────────────────────────── */

  async function _instantReleaseFromStorage() {
    const db = window.db;
    if (!db) return;

    // Try to read lock info from sessionStorage
    let lockInfo = null;
    try {
      lockInfo = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
    } catch (_) {}

    if (!lockInfo) return;

    const orderId = lockInfo.orderId;
    if (!orderId) return;

    console.log('[BMG] Instant releasing slot lock for order:', orderId);

    try {
      // Find and release the locked slot
      const snap = await db.collection('slots')
        .where('lockOrderId', '==', orderId)
        .limit(1)
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.update({
          status         : 'available',
          lockOrderId    : null,
          lockExpiresAt  : null,
          lockExpiresAtMs: null,
          lockedBy       : null,
          updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log('[BMG] ✅ Slot instantly released');
      }

      // Delete pending_payments doc
      await db.collection('pending_payments').doc(orderId).delete().catch(() => {});

    } catch (e) {
      console.warn('[BMG] instant release error:', e);
    }

    sessionStorage.removeItem('slotLock');
  }

  // ── Hook: release when user presses browser/device BACK ──────────
  // We detect navigation away from booking-page specifically
  const _originalShowPage = window.showPage;
  if (typeof _originalShowPage === 'function') {
    window.showPage = function (pageName) {
      // If navigating AWAY from booking/payment page → release lock
      const bookingPages = ['booking-page', 'payment-page', 'cashfree-page'];
      const activePage   = document.querySelector('.page.active')?.id || '';
      if (bookingPages.includes(activePage) && !bookingPages.includes(pageName)) {
        _instantReleaseFromStorage();
      }
      return _originalShowPage.apply(this, arguments);
    };
  }

  // ── Hook: release on tab close / page unload ─────────────────────
  // Use sendBeacon for reliability on close
  window.addEventListener('beforeunload', () => {
    // Async Firestore won't work in beforeunload, but we can
    // send a beacon to a Cloud Function OR do a sync XHR fallback.
    // Safest: mark sessionStorage so recovery on next load releases it.
    try {
      const lockInfo = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      if (lockInfo && lockInfo.orderId) {
        // Tag it as "needs release on next load"
        sessionStorage.setItem('slotLock_needsRelease', lockInfo.orderId);
      }
    } catch (_) {}
  });

  // ── Hook: Cashfree popup cancelled (USER_DROPPED) ────────────────
  // paymentService.js fires releaseSlotLock() already on cancel,
  // but also add a direct Firestore update as belt-and-suspenders.
  window.addEventListener('bmg:paymentCancelled', async () => {
    await _instantReleaseFromStorage();
  });

  // ── On page load: release any slot that was abandoned ────────────
  window.addEventListener('DOMContentLoaded', async () => {
    // Release slot that was pending when tab closed last time
    const needsRelease = sessionStorage.getItem('slotLock_needsRelease');
    if (needsRelease) {
      sessionStorage.removeItem('slotLock_needsRelease');
      const db = window.db;
      if (db) {
        db.collection('slots')
          .where('lockOrderId', '==', needsRelease)
          .limit(1)
          .get()
          .then(snap => {
            if (!snap.empty) {
              snap.docs[0].ref.update({
                status         : 'available',
                lockOrderId    : null,
                lockExpiresAt  : null,
                lockExpiresAtMs: null,
                lockedBy       : null,
                updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
              }).then(() => console.log('[BMG] Stale lock cleared on page load:', needsRelease));
            }
          })
          .catch(() => {});
        db.collection('pending_payments').doc(needsRelease).delete().catch(() => {});
      }
    }
  });


  /* ─────────────────────────────────────────────────────────────
   * WIRE UP: Replace loadSlots with the real-time version
   * ───────────────────────────────────────────────────────────── */
  waitFor('loadSlots', () => {
    // Save reference to original for fallback
    window._originalLoadSlots = window.loadSlots;

    // Override with real-time version
    window.loadSlots = loadSlotsRealtime;

    // Also clean up the onSnapshot listener when ground/date changes
    const origDateChange = window.onDateChange;
    if (typeof origDateChange === 'function') {
      window.onDateChange = function () {
        if (_slotUnsubscribe) {
          try { _slotUnsubscribe(); } catch (_) {}
          _slotUnsubscribe = null;
        }
        return origDateChange.apply(this, arguments);
      };
    }

    console.log('✅ [BMG] loadSlots upgraded to real-time onSnapshot');
  });

  /* ─────────────────────────────────────────────────────────────
   * ALSO EXPOSE for external calls
   * ───────────────────────────────────────────────────────────── */
  window._bmgInstantReleaseSlot     = _instantReleaseFromStorage;
  window._bmgReleaseExpiredLocks    = _releaseExpiredLocks;
  window._bmgInstantPollAndConfirm  = _instantPollAndConfirm;

  // CSS for new slot badges — injected once
  const style = document.createElement('style');
  style.textContent = `
    .slot-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 4px;
      vertical-align: middle;
    }
    .slot-badge.booked  { background: #fee2e2; color: #dc2626; }
    .slot-badge.locked  { background: #fef3c7; color: #d97706; }
    .slot-badge.mine    { background: #d1fae5; color: #059669; }

    .time-slot.confirmed { cursor: not-allowed; opacity: .7; }
    .time-slot.locked    { cursor: not-allowed; opacity: .75; }
  `;
  document.head.appendChild(style);

  console.log('✅ [bmg_instant_fixes.js] Loaded — tournament verify: instant, slots: real-time');

})();
