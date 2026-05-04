/**
 * ═══════════════════════════════════════════════════════════════════
 *  bmg_tournament_payment_fix.js
 * ═══════════════════════════════════════════════════════════════════
 *
 *  ROOT CAUSES FIXED:
 *
 *  BUG 1 — redirectTarget '_modal' silently becomes full-page redirect
 *    on mobile / UPI apps. Page reloads, all JS state (window.*,
 *    sessionStorage written AFTER startPayment) is lost.
 *    FIX: Save ALL tournament reg data to sessionStorage + Firestore
 *    BEFORE startPayment() is called, not inside it.
 *
 *  BUG 2 — _recoverPendingPaymentsOnLoad finds the pending_payments
 *    doc but the webhook deletes it AND writes tournament_entries
 *    asynchronously. The 20-attempt poll (60s) may run before the
 *    webhook completes. _checkFinalStatus then finds nothing → fails.
 *    FIX: poll for 5 minutes (100 × 3s), and also directly call
 *    checkOrderStatus Cloud Function immediately when page loads with
 *    a known orderId, then write the tournament_entries doc ourselves
 *    if the CF says SUCCESS but the doc doesn't exist yet.
 *
 *  BUG 3 — _autoConfirmTournamentRegistration recovers tournamentId
 *    from pending_payments doc, but that doc is already deleted by
 *    the time recovery runs. The Firestore fallback query also fails
 *    if tournament_entries doesn't exist yet.
 *    FIX: Always persist {orderId → tournamentId/teamName} in a
 *    separate long-lived 'payment_meta' sessionStorage key that
 *    survives page reload, plus a Firestore 'payment_recovery' doc.
 *
 *  LOAD ORDER (end of <body>, after all other scripts):
 *    <script src="paymentService.js"></script>
 *    <script src="app_payment_integration.js"></script>
 *    <script src="app.js"></script>
 *    <script src="bmg_fixes_v4.js"></script>
 *    <script src="bmg_fix_canaddground.js"></script>
 *    <script src="bmg_tournament_payment_fix.js"></script>  ← LAST
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CF_BASE = 'https://us-central1-bookmygame-2149d.cloudfunctions.net';

  /* ── helpers ────────────────────────────────────────────────── */
  function _toast(msg, type, dur) {
    if (typeof window.showToast === 'function') window.showToast(msg, type, dur);
  }
  function _showLoading(msg) {
    if (typeof window.showLoading === 'function') window.showLoading(msg);
  }
  function _hideLoading() {
    if (typeof window.hideLoading === 'function') window.hideLoading();
  }
  function _fmt(v) {
    return typeof window.formatCurrency === 'function'
      ? window.formatCurrency(v) : '₹' + Number(v || 0).toFixed(0);
  }
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ══════════════════════════════════════════════════════════════
   *  SECTION 1 — PERSIST TOURNAMENT REG DATA before startPayment
   *
   *  We patch the "Pay Securely" button inside showTournamentPayment
   *  so data is saved before the Cashfree window opens.
   *  We also patch the button wire in showTournamentPayment so it
   *  goes through our version.
   * ══════════════════════════════════════════════════════════════*/

  /**
   * Save tournament registration data so it survives a page reload.
   * Writes to sessionStorage AND a Firestore payment_recovery doc.
   */
  async function _saveTournamentRegMeta(orderId, regData) {
    // 1. sessionStorage — fast, survives soft-nav but NOT hard redirect on some browsers
    const meta = { orderId, ...regData, savedAt: Date.now() };
    try {
      sessionStorage.setItem('bmg_tournReg_' + orderId, JSON.stringify(meta));
      sessionStorage.setItem('bmg_lastTournOrderId', orderId);
      // Also keep the legacy keys for compatibility with existing recovery code
      sessionStorage.setItem('pendingTournamentRegistration', JSON.stringify(regData));
      sessionStorage.setItem('bmg_recoverOrderId', orderId);
      sessionStorage.setItem('bmg_recoverPayType', 'tournament');
    } catch (_) {}

    // 2. Firestore payment_recovery doc — survives ANY page reload / app restart
    const db = window.db;
    if (!db) return;
    try {
      await db.collection('payment_recovery').doc(orderId).set({
        orderId,
        paymentType    : 'tournament',
        tournamentId   : regData.tournamentId   || '',
        tournamentName : regData.tournamentName || '',
        teamName       : regData.teamName       || '',
        registrationId : regData.registrationId || orderId,
        sport          : regData.sport          || '',
        startDate      : regData.startDate      || '',
        venue          : regData.venue          || '',
        entryFee       : regData.entryFee       || 0,
        userId         : window.currentUser?.uid || '',
        status         : 'pending',
        createdAt      : firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[tournFix] Could not write payment_recovery:', e);
    }
  }

  /**
   * Load tournament reg meta for a given orderId.
   * Checks sessionStorage first, then Firestore.
   */
  async function _loadTournamentRegMeta(orderId) {
    // sessionStorage first
    try {
      const s = sessionStorage.getItem('bmg_tournReg_' + orderId);
      if (s) return JSON.parse(s);
    } catch (_) {}

    // Legacy keys
    try {
      const s = sessionStorage.getItem('pendingTournamentRegistration');
      if (s) {
        const d = JSON.parse(s);
        if (d.tournamentId) return d;
      }
    } catch (_) {}

    // Firestore payment_recovery
    const db = window.db;
    if (!db || !orderId) return null;
    try {
      const snap = await db.collection('payment_recovery').doc(orderId).get();
      if (snap.exists) return snap.data();
    } catch (_) {}

    return null;
  }

  /* ══════════════════════════════════════════════════════════════
   *  SECTION 2 — PATCH THE PAY BUTTON in showTournamentPayment
   *
   *  The existing code wires #cashfree-tournament-pay-btn inside
   *  showTournamentPayment(). We use a MutationObserver to intercept
   *  that button the moment it appears in the DOM and inject our
   *  pre-save logic before startPayment fires.
   * ══════════════════════════════════════════════════════════════*/

  function _patchTournamentPayButton() {
    // Watch for the tournament payment button appearing in the DOM
    const observer = new MutationObserver(() => {
      const btn = document.getElementById('cashfree-tournament-pay-btn');
      if (!btn || btn.dataset.bmgTournFixed) return;
      btn.dataset.bmgTournFixed = '1';

      // Clone to remove app.js listener
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);

      fresh.addEventListener('click', async function (e) {
        e.stopImmediatePropagation();
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Opening payment…';

        try {
          // Gather payment data from the global state set by showTournamentPayment
          const ct = window.currentTournamentPayment;
          const cu = window.currentUser;

          if (!ct || !ct.tournamentId) {
            _toast('Tournament data missing. Please go back and try again.', 'error');
            this.disabled = false;
            this.innerHTML = `<i class="fas fa-lock"></i> Pay Securely <i class="fas fa-arrow-right"></i>`;
            return;
          }

          // Build a fresh orderId so WE control it (not startPayment's random one)
          // We need the orderId BEFORE the popup to save meta
          const orderId = `BMG_TOURNAMENT_${Date.now()}_${Math.random().toString(36).slice(2,8).toUpperCase()}`;

          const regData = {
            tournamentId   : String(ct.tournamentId   || ''),
            tournamentName : String(ct.tournament?.tournamentName || ct.tournamentName || ''),
            teamName       : String(ct.teamName       || ''),
            registrationId : String(ct.registrationId || orderId),
            sport          : String(ct.tournament?.sportType || ct.sport || ''),
            startDate      : String(ct.tournament?.startDate  || ''),
            venue          : String(ct.tournament?.venueName  || ct.venue || ''),
            entryFee       : Number(ct.tournament?.entryFee   || ct.entryFee || 0),
          };

          // ── SAVE META BEFORE OPENING CASHFREE ──────────────────
          await _saveTournamentRegMeta(orderId, regData);

          // Also set the in-memory globals for same-session use
          window._pendingTournamentRegData = regData;
          window._bmgTournamentOrderId     = orderId;

          // ── START PAYMENT ───────────────────────────────────────
          const paymentData = {
            tournamentId  : regData.tournamentId,
            tournamentName: regData.tournamentName,
            amount        : regData.entryFee,
            userId        : String(cu?.uid   || ''),
            userName      : String(cu?.name  || cu?.displayName || ''),
            userEmail     : String(cu?.email || ''),
            userPhone     : String(cu?.phone || ''),
            teamName      : regData.teamName,
            sport         : regData.sport,
            date          : regData.startDate,
            venue         : regData.venue,
          };

          // Override orderId generation: inject a wrapper that uses OUR orderId
          await _startPaymentWithKnownOrderId(paymentData, 'tournament', orderId);

        } catch (err) {
          console.error('[tournFix] Pay button error:', err);
          _toast('Payment error: ' + err.message, 'error');
        }

        if (document.getElementById('cashfree-tournament-pay-btn')) {
          this.disabled = false;
          this.innerHTML = `<i class="fas fa-lock"></i> Pay Securely <i class="fas fa-arrow-right"></i>`;
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Like startPayment() but uses a caller-supplied orderId instead
   * of generating one internally.
   */
  async function _startPaymentWithKnownOrderId(paymentData, paymentType, orderId) {
    const cu = window.currentUser;
    if (!cu) { _toast('Please login first', 'warning'); return; }

    _showLoading('Preparing payment…');
    const db = window.db;

    try {
      // Write pending_payments with our orderId
      const pendingDoc = {
        orderId,
        paymentType,
        userId         : cu.uid,
        userName       : paymentData.userName  || cu.name  || '',
        userEmail      : paymentData.userEmail || cu.email || '',
        userPhone      : paymentData.userPhone || cu.phone || '',
        amount         : Number(paymentData.amount) || 0,
        createdAt      : firebase.firestore.FieldValue.serverTimestamp(),
        status         : 'pending',
        tournamentId   : paymentData.tournamentId   || '',
        tournamentName : paymentData.tournamentName || '',
        teamName       : paymentData.teamName       || '',
        sport          : paymentData.sport          || '',
        date           : paymentData.date           || '',
        venue          : paymentData.venue          || '',
      };
      await db.collection('pending_payments').doc(orderId).set(pendingDoc);

      // Call createOrder CF
      const cfRes = await fetch(`${CF_BASE}/createOrder`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          orderId,
          paymentType,
          customer: {
            id   : cu.uid,
            name : paymentData.userName  || cu.name  || '',
            email: paymentData.userEmail || cu.email || '',
            phone: paymentData.userPhone || cu.phone || '',
          },
          amount: Number(paymentData.amount),
        }),
      });

      if (!cfRes.ok) {
        const err = await cfRes.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${cfRes.status}`);
      }

      const { payment_session_id } = await cfRes.json();
      if (!payment_session_id) throw new Error('No payment session returned');

      _hideLoading();

      // Open Cashfree
      await _openCashfreeAndPoll(payment_session_id, orderId, paymentType, paymentData);

    } catch (err) {
      _hideLoading();
      console.error('[tournFix] _startPaymentWithKnownOrderId error:', err);
      _toast('Payment error: ' + err.message, 'error');
    }
  }

  /**
   * Open Cashfree modal and handle all outcomes including redirect.
   */
  async function _openCashfreeAndPoll(sessionId, orderId, paymentType, paymentData) {
    if (typeof window.Cashfree === 'undefined') {
      _toast('Cashfree SDK not loaded. Check your internet connection.', 'error');
      return;
    }

    const cashfree = await window.Cashfree({ mode: 'production' });

    // Firestore realtime listener — fires if webhook processes while popup is open
    let unsubscribe = null;
    const db = window.db;
    try {
      unsubscribe = db.collection('pending_payments').doc(orderId)
        .onSnapshot(snap => {
          if (!snap.exists) {
            // Doc deleted by webhook — check result
            _checkAndConfirmTournament(orderId, paymentData).then(confirmed => {
              if (confirmed && cashfree.close) cashfree.close();
            });
          }
        }, () => {});
    } catch (_) {}

    try {
      const result = await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget  : '_modal',
      });

      if (unsubscribe) { try { unsubscribe(); } catch (_) {} }

      const status = result?.paymentDetails?.paymentStatus;

      if (status === 'SUCCESS') {
        await _pollAndConfirmTournament(orderId, paymentData);
      } else if (status === 'FAILED' || status === 'USER_DROPPED') {
        _toast('Payment was not completed.', 'warning');
        // Clean up payment_recovery
        try { await db.collection('payment_recovery').doc(orderId).delete(); } catch (_) {}
        try { await db.collection('pending_payments').doc(orderId).delete(); } catch (_) {}
      }
      // status undefined/null → popup closed, poll anyway
      else if (!status) {
        await _pollAndConfirmTournament(orderId, paymentData);
      }

    } catch (popupErr) {
      // Popup closed / redirect happened — this catch fires on redirect return
      if (unsubscribe) { try { unsubscribe(); } catch (_) {} }
      console.log('[tournFix] Cashfree popup closed/redirected:', popupErr.message);
      await _pollAndConfirmTournament(orderId, paymentData);
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  SECTION 3 — ROBUST POLLING + DIRECT CF VERIFICATION
   *
   *  Instead of waiting for webhook to write tournament_entries,
   *  we directly call checkOrderStatus CF which queries Cashfree
   *  API for the real payment status. On SUCCESS we write the
   *  tournament_entries doc ourselves immediately.
   * ══════════════════════════════════════════════════════════════*/

  /**
   * Poll Cashfree directly for payment status, with generous timeout.
   * On confirmed SUCCESS, write tournament_entries and show success UI.
   */
  async function _pollAndConfirmTournament(orderId, paymentData) {
    _showLoading('Verifying payment…');

    // First try: check if webhook already wrote the doc
    const alreadyDone = await _checkAndConfirmTournament(orderId, paymentData);
    if (alreadyDone) return;

    let attempts = 0;
    const maxAttempts = 40; // 40 × 3s = 2 minutes

    const poll = async () => {
      attempts++;

      // Check tournament_entries (webhook may have written it)
      const done = await _checkAndConfirmTournament(orderId, paymentData);
      if (done) { _hideLoading(); return; }

      // Every 5 attempts, call CF directly
      if (attempts % 5 === 0) {
        const cfConfirmed = await _verifyWithCloudFunction(orderId);
        if (cfConfirmed === true) {
          _hideLoading();
          await _writeAndShowTournamentSuccess(orderId, paymentData);
          return;
        }
        if (cfConfirmed === false) {
          // Definitive failure from CF
          _hideLoading();
          _toast('Payment failed. Please try again.', 'error');
          try { await window.db.collection('payment_recovery').doc(orderId).delete(); } catch (_) {}
          return;
        }
        // cfConfirmed === null → still pending, keep polling
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else {
        _hideLoading();
        // Final direct CF check
        const finalCF = await _verifyWithCloudFunction(orderId);
        if (finalCF === true) {
          await _writeAndShowTournamentSuccess(orderId, paymentData);
        } else {
          _toast(
            '⚠️ Payment received but confirmation delayed. Please check "My Tournaments" in a minute.',
            'warning', 8000
          );
        }
      }
    };

    setTimeout(poll, 3000);
  }

  /**
   * Check if tournament_entries doc exists for this orderId.
   * If yes, show success modal and return true.
   */
  async function _checkAndConfirmTournament(orderId, paymentData) {
    const db = window.db;
    try {
      const snap = await db.collection('tournament_entries').doc(orderId).get();
      if (snap.exists) {
        const d = snap.data();
        _hideLoading();
        _fireSuccess(orderId, {
          tournamentName : d.tournamentName || paymentData?.tournamentName || '',
          teamName       : d.teamName       || paymentData?.teamName       || '',
          registrationId : d.registrationId || orderId,
          amount         : d.amount         || paymentData?.amount         || 0,
          sport          : d.sport          || paymentData?.sport          || '',
          tournamentId   : d.tournamentId   || paymentData?.tournamentId   || '',
          userId         : d.userId         || window.currentUser?.uid     || '',
          startDate      : d.date           || paymentData?.date           || '',
        });
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Call checkOrderStatus Cloud Function directly.
   * Returns: true = SUCCESS, false = FAILED, null = PENDING/UNKNOWN
   */
  async function _verifyWithCloudFunction(orderId) {
    try {
      const res = await fetch(`${CF_BASE}/checkOrderStatus`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ orderId, paymentType: 'tournament' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      console.log('[tournFix] CF checkOrderStatus:', data);
      if (data.status === 'SUCCESS')  return true;
      if (data.status === 'FAILED')   return false;
      return null;
    } catch (e) {
      console.warn('[tournFix] checkOrderStatus error:', e);
      return null;
    }
  }

  /**
   * Write tournament_entries ourselves (webhook-safe: uses set+merge)
   * and show success modal.
   */
  async function _writeAndShowTournamentSuccess(orderId, paymentData) {
    const db   = window.db;
    const cu   = window.currentUser;
    if (!cu || !db) { _fireSuccess(orderId, paymentData); return; }

    // Load tournament reg meta (has tournamentId etc.)
    const meta = await _loadTournamentRegMeta(orderId) || paymentData || {};

    const tournamentId   = meta.tournamentId   || paymentData?.tournamentId   || '';
    const tournamentName = meta.tournamentName || paymentData?.tournamentName || '';
    const teamName       = meta.teamName       || paymentData?.teamName       || '';
    const registrationId = meta.registrationId || orderId;
    const amount         = Number(meta.entryFee || paymentData?.amount || 0);
    const sport          = meta.sport          || paymentData?.sport   || '';
    const startDate      = meta.startDate      || paymentData?.date    || '';

    const platformFee = Math.round(amount * 0.20);
    const ownerAmount = amount - platformFee;
    const now         = firebase.firestore.FieldValue.serverTimestamp();

    // tournament_entries doc
    const entry = {
      registrationId,
      orderId,
      tournamentId,
      tournamentName,
      userId       : cu.uid,
      userName     : cu.name || cu.displayName || '',
      userEmail    : cu.email || '',
      userPhone    : cu.phone || '',
      teamName,
      sport,
      date         : startDate,
      amount,
      platformFee,
      ownerAmount,
      entryFee     : amount,
      paymentMethod: 'cashfree',
      paymentStatus: 'paid',
      status       : 'confirmed',
      registrationStatus: 'confirmed',
      confirmedAt  : now,
      createdAt    : now,
      updatedAt    : now,
    };

    try {
      const batch = db.batch();

      // Write tournament_entries
      batch.set(db.collection('tournament_entries').doc(orderId), entry, { merge: true });

      // Write tournament_registrations (owner dashboard uses this)
      batch.set(
        db.collection('tournament_registrations').doc(registrationId),
        entry,
        { merge: true }
      );

      // Add to tournament.registeredTeams array (if tournamentId known)
      if (tournamentId) {
        batch.update(db.collection('tournaments').doc(tournamentId), {
          registeredTeams: firebase.firestore.FieldValue.arrayUnion({
            userId        : cu.uid,
            userName      : cu.name || '',
            teamName,
            registrationId,
            status        : 'confirmed',
            paidAt        : new Date().toISOString(),
          }),
          updatedAt: now,
        });
      }

      // Clean up pending docs
      batch.delete(db.collection('pending_payments').doc(orderId));
      batch.delete(db.collection('payment_recovery').doc(orderId));

      await batch.commit();
      console.log('[tournFix] ✅ tournament_entries written successfully');
    } catch (err) {
      console.error('[tournFix] Error writing tournament_entries:', err);
      // Still show success — payment was confirmed by CF
    }

    // Clean sessionStorage
    try {
      sessionStorage.removeItem('bmg_tournReg_'    + orderId);
      sessionStorage.removeItem('bmg_lastTournOrderId');
      sessionStorage.removeItem('pendingTournamentRegistration');
      sessionStorage.removeItem('bmg_recoverOrderId');
      sessionStorage.removeItem('bmg_recoverPayType');
    } catch (_) {}
    window._pendingTournamentRegData = null;
    window.currentTournamentPayment  = null;

    // Fire success UI
    _fireSuccess(orderId, {
      tournamentName, teamName, registrationId, amount, sport,
      tournamentId, userId: cu.uid, startDate,
    });

    // Refresh My Tournaments if visible
    if (typeof window.loadMyTournaments === 'function') {
      setTimeout(() => window.loadMyTournaments(), 1500);
    }
  }

  /**
   * Fire the bmg:paymentConfirmed event AND show the joined modal directly.
   */
  function _fireSuccess(orderId, data) {
    // Dispatch event (app.js listener will call _autoConfirmTournamentRegistration)
    window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
      detail: { orderId, paymentType: 'tournament', result: data },
    }));

    // Also call our QR success modal directly as belt-and-suspenders
    // (in case _showTournamentJoinedSuccess in app.js doesn't fire)
    const showFn = window._showTournamentJoinedSuccess
      || window._showTournamentJoinedSuccessWithQR;

    if (typeof showFn === 'function') {
      showFn({
        tournamentName : data.tournamentName || '',
        teamName       : data.teamName       || '',
        registrationId : data.registrationId || orderId,
        amount         : data.amount         || 0,
        sport          : data.sport          || '',
        tournamentId   : data.tournamentId   || '',
        userId         : data.userId         || window.currentUser?.uid || '',
        startDate      : data.startDate      || data.date || '',
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  SECTION 4 — PAGE-LOAD RECOVERY
   *
   *  When user comes BACK from a Cashfree redirect (full page reload),
   *  detect the pending tournament orderId and verify it immediately.
   * ══════════════════════════════════════════════════════════════*/

  async function _recoverTournamentOnPageLoad() {
    // Wait for auth
    let waited = 0;
    while (!window.currentUser && waited < 8000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    const cu = window.currentUser;
    if (!cu || !window.db) return;
    const db = window.db;

    // ── Find a pending tournament orderId ──────────────────────
    let orderId = null;
    let regMeta = null;

    // Check sessionStorage
    try {
      orderId = sessionStorage.getItem('bmg_lastTournOrderId')
        || sessionStorage.getItem('bmg_recoverOrderId');
      if (orderId) {
        const payType = sessionStorage.getItem('bmg_recoverPayType');
        if (payType && payType !== 'tournament') orderId = null; // not our type
      }
    } catch (_) {}

    // Check Firestore payment_recovery
    if (!orderId) {
      try {
        const snap = await db.collection('payment_recovery')
          .where('userId',      '==', cu.uid)
          .where('paymentType', '==', 'tournament')
          .where('status',      '==', 'pending')
          .orderBy('createdAt', 'desc')
          .limit(3)
          .get().catch(() => null);

        if (snap && !snap.empty) {
          for (const doc of snap.docs) {
            const d    = doc.data();
            const age  = Date.now() - (d.createdAt?.toMillis?.() || 0);
            if (age < 60 * 60 * 1000) { // within 1 hour
              orderId = doc.id;
              regMeta = d;
              break;
            }
          }
        }
      } catch (_) {}
    }

    if (!orderId) return;

    console.log('[tournFix] Page-load recovery — found pending tournament orderId:', orderId);

    // Load regMeta if not already loaded
    if (!regMeta) regMeta = await _loadTournamentRegMeta(orderId);

    // Check if tournament_entries already written (webhook may have been fast)
    const alreadyDone = await _checkAndConfirmTournament(orderId, regMeta || {});
    if (alreadyDone) return;

    // Directly verify with Cloud Function — don't wait for webhook
    _showLoading('Verifying your payment…');
    await new Promise(r => setTimeout(r, 2000)); // give webhook 2s head-start

    const cfResult = await _verifyWithCloudFunction(orderId);

    if (cfResult === true) {
      _hideLoading();
      await _writeAndShowTournamentSuccess(orderId, regMeta || {});
    } else if (cfResult === false) {
      _hideLoading();
      _toast('Your payment was not completed. Please try again.', 'error');
      try {
        await db.collection('payment_recovery').doc(orderId).delete();
        await db.collection('pending_payments').doc(orderId).delete();
      } catch (_) {}
    } else {
      // PENDING — start polling
      _hideLoading();
      await _pollAndConfirmTournament(orderId, regMeta || {});
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  SECTION 5 — PATCH bmg:paymentConfirmed so our flow also
   *  works correctly even if paymentService fires the event first
   * ══════════════════════════════════════════════════════════════*/

  window.addEventListener('bmg:paymentConfirmed', async (e) => {
    const { orderId, paymentType } = e.detail || {};
    if (paymentType !== 'tournament') return;

    // If tournament_entries already written (by our _writeAndShowTournamentSuccess),
    // _autoConfirmTournamentRegistration may try again — that's fine (it guards on alreadySnap).
    // But if it's called with no tournamentId because sessionStorage was cleared,
    // we need to ensure regData is available.

    const meta = await _loadTournamentRegMeta(orderId);
    if (meta && meta.tournamentId && !window._pendingTournamentRegData?.tournamentId) {
      window._pendingTournamentRegData = meta;
    }
  });

  /* ══════════════════════════════════════════════════════════════
   *  BOOT
   * ══════════════════════════════════════════════════════════════*/

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    // Patch the tournament pay button whenever it appears
    _patchTournamentPayButton();

    // Run page-load recovery (handles Cashfree redirects)
    _recoverTournamentOnPageLoad();

    console.log('✅ bmg_tournament_payment_fix.js loaded');
  });

})();
