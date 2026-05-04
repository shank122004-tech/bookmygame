/**
 * ═══════════════════════════════════════════════════════════════════
 *  bmg_tournament_verify_fix.js
 * ═══════════════════════════════════════════════════════════════════
 *
 *  ROOT CAUSE OF BUG:
 *
 *  app.js showLoading() has an 8-second failsafe that auto-calls
 *  hideLoading() to prevent stuck overlays. But the tournament
 *  payment poll loop runs for up to 2 minutes, repeatedly calling
 *  _showLoading() → which resets the 8s timer → which fires
 *  hideLoading() → overlay disappears → nothing visible to user.
 *
 *  The fix:
 *  1. Replace the polling UI with a CUSTOM persistent panel that is
 *     NOT the shared loading overlay — so the 8s failsafe never
 *     touches it.
 *  2. Call hideLoading() IMMEDIATELY at the start of the tournament
 *     poll so the shared overlay is dismissed and the failsafe timer
 *     is cancelled before it fires.
 *  3. The custom panel shows a live countdown + attempt number, a
 *     "Still waiting?" CTA, and auto-closes on success/failure.
 *  4. Patches _pollAndConfirmTournament and _recoverTournamentOnPageLoad
 *     in bmg_tournament_payment_fix.js to use the new UI.
 *
 *  LOAD ORDER — add AFTER bmg_tournament_payment_fix.js:
 *    <script src="bmg_tournament_payment_fix.js"></script>
 *    <script src="bmg_tournament_verify_fix.js"></script>   ← this file
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CF_BASE = 'https://us-central1-bookmygame-2149d.cloudfunctions.net';

  /* ── helpers ─────────────────────────────────────────────────── */
  function _toast(msg, type, dur) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur);
  }
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ══════════════════════════════════════════════════════════════
   *  PERSISTENT VERIFICATION PANEL
   *  A full-screen overlay that is NOT the shared loading-overlay,
   *  so app.js's 8s failsafe cannot dismiss it.
   * ══════════════════════════════════════════════════════════════*/

  const PANEL_ID = 'bmg-tourn-verify-panel';
  let _panelTimer = null;       // countdown interval
  let _panelAbort = false;      // set to true to stop the poll
  let _pollRunning = false;     // guard against concurrent polls

  function _showVerifyPanel(opts) {
    opts = opts || {};
    _destroyVerifyPanel(); // clean up any existing one

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed;inset:0;z-index:99998',
      'background:rgba(15,23,42,.92)',
      'display:flex;align-items:center;justify-content:center',
      'padding:20px;backdrop-filter:blur(10px)',
    ].join(';');

    panel.innerHTML = `
      <div style="
        background:#fff;border-radius:24px;max-width:360px;width:100%;
        padding:32px 24px;text-align:center;
        box-shadow:0 32px 80px rgba(0,0,0,.5);
        animation:bmgVerifyIn .4s cubic-bezier(.34,1.56,.64,1);
      ">
        <!-- Spinner ring -->
        <div style="position:relative;width:72px;height:72px;margin:0 auto 20px;">
          <svg width="72" height="72" viewBox="0 0 72 72" style="position:absolute;inset:0;animation:bmgSpin 1.4s linear infinite;">
            <circle cx="36" cy="36" r="30" fill="none" stroke="#e5e7eb" stroke-width="5"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="#2563eb" stroke-width="5"
              stroke-dasharray="140" stroke-dashoffset="100" stroke-linecap="round"/>
          </svg>
          <div style="
            position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            font-size:22px;
          ">🏆</div>
        </div>

        <h3 style="font-size:18px;font-weight:800;color:#111827;margin:0 0 6px;" id="bmg-vp-title">
          Verifying Payment
        </h3>
        <p style="font-size:13px;color:#6b7280;margin:0 0 20px;" id="bmg-vp-subtitle">
          Please wait — confirming your tournament spot…
        </p>

        <!-- Progress bar -->
        <div style="background:#f1f5f9;border-radius:999px;height:6px;overflow:hidden;margin-bottom:14px;">
          <div id="bmg-vp-bar" style="
            height:100%;width:0%;border-radius:999px;
            background:linear-gradient(90deg,#2563eb,#7c3aed);
            transition:width .5s ease;
          "></div>
        </div>

        <p style="font-size:12px;color:#9ca3af;margin:0 0 20px;" id="bmg-vp-status">
          Attempt 1 of 40 · checking Cashfree…
        </p>

        <!-- Info note -->
        <div style="
          background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;
          padding:12px 14px;font-size:12px;color:#1d4ed8;text-align:left;
          margin-bottom:20px;line-height:1.6;
        ">
          <i class="fas fa-shield-alt"></i>
          Your payment is being verified securely. <strong>Do not close this tab</strong> — this can take up to 2 minutes.
        </div>

        <!-- Fallback CTA (hidden initially) -->
        <div id="bmg-vp-fallback" style="display:none;margin-top:4px;">
          <p style="font-size:12px;color:#6b7280;margin:0 0 10px;">
            Taking longer than expected?
          </p>
          <button id="bmg-vp-check-now" style="
            width:100%;padding:12px;
            background:linear-gradient(135deg,#1b2e6c,#2563eb);
            color:#fff;border:none;border-radius:12px;
            font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;
          ">
            <i class="fas fa-sync-alt"></i> Check Status Now
          </button>
          <button id="bmg-vp-go-tournaments" style="
            width:100%;padding:11px;
            background:#f3f4f6;color:#374151;border:none;
            border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;
          ">
            Check My Tournaments
          </button>
        </div>
      </div>

      <style>
        @keyframes bmgVerifyIn {
          from { opacity:0; transform:scale(.88) translateY(24px); }
          to   { opacity:1; transform:scale(1)  translateY(0); }
        }
        @keyframes bmgSpin { to { transform:rotate(360deg); } }
      </style>`;

    document.body.appendChild(panel);

    // Wire the fallback buttons
    panel.querySelector('#bmg-vp-check-now')?.addEventListener('click', () => {
      if (opts.onCheckNow) opts.onCheckNow();
    });
    panel.querySelector('#bmg-vp-go-tournaments')?.addEventListener('click', () => {
      _destroyVerifyPanel();
      if (typeof window.showPage === 'function') window.showPage('my-bookings-page');
    });

    return panel;
  }

  function _updateVerifyPanel(attempt, maxAttempts, statusText) {
    const bar    = document.getElementById('bmg-vp-bar');
    const status = document.getElementById('bmg-vp-status');
    if (bar) bar.style.width = Math.min(95, (attempt / maxAttempts) * 100) + '%';
    if (status) status.textContent = statusText || `Attempt ${attempt} of ${maxAttempts}…`;

    // Show fallback CTA after 30 seconds (~10 attempts × 3s)
    if (attempt >= 10) {
      const fb = document.getElementById('bmg-vp-fallback');
      if (fb) fb.style.display = 'block';
    }
  }

  function _setVerifyPanelSuccess() {
    const title    = document.getElementById('bmg-vp-title');
    const subtitle = document.getElementById('bmg-vp-subtitle');
    const bar      = document.getElementById('bmg-vp-bar');
    const fb       = document.getElementById('bmg-vp-fallback');
    if (title)    title.textContent    = 'Payment Confirmed! 🎉';
    if (subtitle) subtitle.textContent = 'Your tournament spot is secured!';
    if (bar)      bar.style.width      = '100%';
    if (fb)       fb.style.display     = 'none';
  }

  function _setVerifyPanelFailed(msg) {
    const title    = document.getElementById('bmg-vp-title');
    const subtitle = document.getElementById('bmg-vp-subtitle');
    const bar      = document.getElementById('bmg-vp-bar');
    if (title)    { title.textContent = 'Payment Not Confirmed'; title.style.color = '#ef4444'; }
    if (subtitle) subtitle.textContent = msg || 'Please try again or contact support.';
    if (bar)      { bar.style.background = '#ef4444'; bar.style.width = '100%'; }
  }

  function _destroyVerifyPanel() {
    clearInterval(_panelTimer);
    _panelTimer = null;
    const el = document.getElementById(PANEL_ID);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 300);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   *  PATCHED POLL — replaces _pollAndConfirmTournament
   *  Key differences from the original:
   *  1. Immediately hides the shared loading overlay so the 8s
   *     failsafe timer is cancelled before it fires.
   *  2. Shows the custom persistent verification panel instead.
   *  3. Calls CF directly on attempt 1 (no 5-attempt wait).
   *  4. Guard against concurrent poll instances.
   * ══════════════════════════════════════════════════════════════*/

  async function _patchedPollAndConfirm(orderId, paymentData) {
    // Guard against concurrent calls
    if (_pollRunning) return;
    _pollRunning = true;
    _panelAbort  = false;

    // ── CRITICAL: dismiss shared loading overlay NOW ──────────────
    // This cancels the 8s failsafe timer so it can never interfere.
    if (typeof window.hideLoading === 'function') window.hideLoading();

    // Show our persistent panel
    _showVerifyPanel({
      onCheckNow: async () => {
        // Manual "check now" — call CF immediately
        _updateVerifyPanel(0, 40, 'Checking with payment gateway…');
        const result = await _directCFCheck(orderId);
        if (result === true) {
          _setVerifyPanelSuccess();
          setTimeout(_destroyVerifyPanel, 1500);
          _panelAbort = true;
          await _writeAndFireSuccess(orderId, paymentData);
        } else if (result === false) {
          _setVerifyPanelFailed('Payment was not completed.');
          setTimeout(_destroyVerifyPanel, 3000);
          _panelAbort = true;
          _pollRunning = false;
        }
      },
    });

    // First check: maybe webhook already wrote the doc
    const alreadyDone = await _checkTournamentEntries(orderId, paymentData);
    if (alreadyDone) {
      _setVerifyPanelSuccess();
      setTimeout(_destroyVerifyPanel, 1500);
      _pollRunning = false;
      return;
    }

    // Immediately try CF on attempt 0 (no need to wait)
    const immediate = await _directCFCheck(orderId);
    if (immediate === true) {
      _setVerifyPanelSuccess();
      setTimeout(_destroyVerifyPanel, 1500);
      await _writeAndFireSuccess(orderId, paymentData);
      _pollRunning = false;
      return;
    }
    if (immediate === false) {
      _setVerifyPanelFailed('Your payment was not completed. Please try again.');
      setTimeout(_destroyVerifyPanel, 4000);
      _toast('Payment failed. Please try again.', 'error');
      _cleanupPendingDocs(orderId);
      _pollRunning = false;
      return;
    }

    // CF returned PENDING — start polling loop
    let attempts  = 0;
    const MAX     = 40; // 40 × 3s = 2 minutes

    const poll = async () => {
      if (_panelAbort) { _pollRunning = false; return; }

      attempts++;
      _updateVerifyPanel(attempts, MAX, `Checking… attempt ${attempts} of ${MAX}`);

      // Check Firestore first (webhook may have fired)
      const done = await _checkTournamentEntries(orderId, paymentData);
      if (done) {
        _setVerifyPanelSuccess();
        setTimeout(_destroyVerifyPanel, 1500);
        _pollRunning = false;
        return;
      }

      // Every 3 attempts (~9s) call CF directly
      if (attempts % 3 === 0) {
        const cf = await _directCFCheck(orderId);
        if (cf === true) {
          _setVerifyPanelSuccess();
          setTimeout(_destroyVerifyPanel, 1500);
          await _writeAndFireSuccess(orderId, paymentData);
          _pollRunning = false;
          return;
        }
        if (cf === false) {
          _setVerifyPanelFailed('Payment was not completed. Your spot has not been reserved.');
          setTimeout(_destroyVerifyPanel, 4000);
          _toast('Payment failed. Please try again.', 'error');
          _cleanupPendingDocs(orderId);
          _pollRunning = false;
          return;
        }
      }

      if (attempts < MAX) {
        setTimeout(poll, 3000);
      } else {
        // Final attempt — one last direct CF check
        const finalCF = await _directCFCheck(orderId);
        if (finalCF === true) {
          _setVerifyPanelSuccess();
          setTimeout(_destroyVerifyPanel, 1500);
          await _writeAndFireSuccess(orderId, paymentData);
        } else {
          _setVerifyPanelFailed(null);
          setTimeout(_destroyVerifyPanel, 5000);
          _toast(
            '⚠️ Could not confirm payment automatically. Check "My Tournaments" — if your spot is missing, contact support.',
            'warning', 10000
          );
        }
        _pollRunning = false;
      }
    };

    setTimeout(poll, 3000);
  }

  /* ── Direct Cloud Function check ──────────────────────────────── */
  async function _directCFCheck(orderId) {
    try {
      const res = await fetch(`${CF_BASE}/checkOrderStatus`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ orderId, paymentType: 'tournament' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      console.log('[tournVerify] CF status:', data.status, 'for', orderId);
      if (data.status === 'SUCCESS') return true;
      if (data.status === 'FAILED')  return false;
      return null; // PENDING or unknown
    } catch (e) {
      console.warn('[tournVerify] CF check error:', e);
      return null;
    }
  }

  /* ── Check if tournament_entries already written ─────────────── */
  async function _checkTournamentEntries(orderId, paymentData) {
    const db = window.db;
    if (!db) return false;
    try {
      const snap = await db.collection('tournament_entries').doc(orderId).get();
      if (snap.exists) {
        const d = snap.data();
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

  /* ── Write tournament_entries + fire success event ─────────────── */
  async function _writeAndFireSuccess(orderId, paymentData) {
    const db = window.db;
    const cu = window.currentUser;
    if (!db || !cu) { _fireSuccess(orderId, paymentData || {}); return; }

    // Load the best available meta
    let meta = window._pendingTournamentRegData || {};
    if (!meta.tournamentId) {
      try {
        const raw = sessionStorage.getItem('pendingTournamentRegistration');
        if (raw) meta = JSON.parse(raw);
      } catch (_) {}
    }
    if (!meta.tournamentId) {
      try {
        const snap = await db.collection('payment_recovery').doc(orderId).get();
        if (snap.exists) meta = snap.data();
      } catch (_) {}
    }

    const tournamentId   = meta.tournamentId   || paymentData?.tournamentId   || '';
    const tournamentName = meta.tournamentName || paymentData?.tournamentName || '';
    const teamName       = meta.teamName       || paymentData?.teamName       || '';
    const registrationId = meta.registrationId || orderId;
    const amount         = Number(meta.entryFee || meta.amount || paymentData?.amount || 0);
    const sport          = meta.sport          || paymentData?.sport   || '';
    const startDate      = meta.startDate      || paymentData?.date    || '';

    const platformFee = Math.round(amount * 0.20);
    const ownerAmount = amount - platformFee;
    const now         = firebase.firestore.FieldValue.serverTimestamp();

    const entry = {
      registrationId, orderId, tournamentId, tournamentName,
      userId       : cu.uid,
      userName     : cu.name || cu.displayName || '',
      userEmail    : cu.email || '',
      userPhone    : cu.phone || '',
      teamName, sport,
      date         : startDate,
      amount, platformFee, ownerAmount,
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
      batch.set(db.collection('tournament_entries').doc(orderId), entry, { merge: true });
      if (registrationId !== orderId) {
        batch.set(db.collection('tournament_registrations').doc(registrationId), entry, { merge: true });
      }
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
      batch.delete(db.collection('pending_payments').doc(orderId));
      try { batch.delete(db.collection('payment_recovery').doc(orderId)); } catch (_) {}
      await batch.commit();
      console.log('[tournVerify] ✅ tournament_entries written');
    } catch (err) {
      console.error('[tournVerify] Write error (non-fatal):', err);
    }

    // Clean session state
    try {
      ['pendingTournamentRegistration', 'bmg_recoverOrderId', 'bmg_recoverPayType',
       'bmg_lastTournOrderId', `bmg_tournReg_${orderId}`].forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
    window._pendingTournamentRegData = null;
    window.currentTournamentPayment  = null;

    _fireSuccess(orderId, {
      tournamentName, teamName, registrationId, amount, sport,
      tournamentId, userId: cu.uid, startDate,
    });

    setTimeout(() => {
      if (typeof window.loadMyTournaments === 'function') window.loadMyTournaments();
    }, 2000);
  }

  /* ── Clean up Firestore pending docs on failure ─────────────── */
  async function _cleanupPendingDocs(orderId) {
    const db = window.db;
    if (!db) return;
    try {
      const batch = db.batch();
      batch.delete(db.collection('pending_payments').doc(orderId));
      batch.delete(db.collection('payment_recovery').doc(orderId));
      await batch.commit();
    } catch (_) {}
  }

  /* ── Fire success event + show modal ───────────────────────────── */
  let _lastSuccessOrderId = null;
  function _fireSuccess(orderId, data) {
    if (_lastSuccessOrderId === orderId) return; // deduplicate
    _lastSuccessOrderId = orderId;

    window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
      detail: { orderId, paymentType: 'tournament', result: data },
    }));

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
   *  OVERRIDE the original _pollAndConfirmTournament
   *  This is the function called by bmg_tournament_payment_fix.js
   *  after the Cashfree popup closes / redirects.
   * ══════════════════════════════════════════════════════════════*/

  // Wait for bmg_tournament_payment_fix.js to finish defining its globals,
  // then override the poll function by patching _openCashfreeAndPoll's
  // internal calls. Since _pollAndConfirmTournament is a closure inside
  // the IIFE we can't reassign it directly — instead we patch the
  // exported path: override via the bmg:paymentConfirmed event and
  // by replacing the Cashfree open wrapper that bmg_tournament_payment_fix
  // exposes through the pay-button MutationObserver.
  //
  // The cleanest reliable hook: patch the button click handler to call
  // OUR version of _pollAndConfirmTournament instead.

  function _interceptTournamentPayButton() {
    const observer = new MutationObserver(() => {
      const btn = document.getElementById('cashfree-tournament-pay-btn');
      if (!btn || btn.dataset.bmgVerifyFixed) return;
      btn.dataset.bmgVerifyFixed = '1';

      // Clone to strip ALL existing listeners (including bmg_tournament_payment_fix's)
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.dataset.bmgVerifyFixed = '1';

      fresh.addEventListener('click', async function (e) {
        e.stopImmediatePropagation();
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Opening payment…';

        try {
          const ct = window.currentTournamentPayment;
          const cu = window.currentUser;

          if (!ct || !ct.tournamentId) {
            if (typeof window.showToast === 'function')
              window.showToast('Tournament data missing. Please go back and try again.', 'error');
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-lock"></i> Pay Securely <i class="fas fa-arrow-right"></i>';
            return;
          }

          // Generate orderId we control (so we can pre-save meta)
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

          // Pre-save to sessionStorage + Firestore payment_recovery
          try {
            sessionStorage.setItem('pendingTournamentRegistration', JSON.stringify(regData));
            sessionStorage.setItem('bmg_recoverOrderId', orderId);
            sessionStorage.setItem('bmg_recoverPayType', 'tournament');
            sessionStorage.setItem('bmg_lastTournOrderId', orderId);
            sessionStorage.setItem(`bmg_tournReg_${orderId}`, JSON.stringify({ orderId, ...regData, savedAt: Date.now() }));
          } catch (_) {}

          if (window.db) {
            try {
              await window.db.collection('payment_recovery').doc(orderId).set({
                orderId, paymentType: 'tournament', ...regData,
                userId   : cu?.uid || '',
                status   : 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            } catch (_) {}
          }

          window._pendingTournamentRegData = regData;
          window._bmgTournamentOrderId     = orderId;

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

          // Write pending_payments + call createOrder CF
          await _kickoffPayment(orderId, paymentData, cu);

        } catch (err) {
          console.error('[tournVerify] Pay button error:', err);
          if (typeof window.showToast === 'function')
            window.showToast('Payment error: ' + err.message, 'error');
        }

        // Re-enable button only if still in DOM
        const stillThere = document.getElementById('cashfree-tournament-pay-btn');
        if (stillThere) {
          stillThere.disabled = false;
          stillThere.innerHTML = '<i class="fas fa-lock"></i> Pay Securely <i class="fas fa-arrow-right"></i>';
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function _kickoffPayment(orderId, paymentData, cu) {
    const db = window.db;
    if (typeof window.showLoading === 'function') window.showLoading('Preparing payment…');

    try {
      // Write pending_payments
      await db.collection('pending_payments').doc(orderId).set({
        orderId,
        paymentType    : 'tournament',
        userId         : cu.uid,
        userName       : paymentData.userName  || '',
        userEmail      : paymentData.userEmail || '',
        userPhone      : paymentData.userPhone || '',
        amount         : Number(paymentData.amount) || 0,
        createdAt      : firebase.firestore.FieldValue.serverTimestamp(),
        status         : 'pending',
        tournamentId   : paymentData.tournamentId   || '',
        tournamentName : paymentData.tournamentName || '',
        teamName       : paymentData.teamName       || '',
        sport          : paymentData.sport          || '',
        date           : paymentData.date           || '',
        venue          : paymentData.venue          || '',
      });

      // Call Cloud Function createOrder
      const cfRes = await fetch(`${CF_BASE}/createOrder`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          orderId,
          paymentType: 'tournament',
          customer   : {
            id   : cu.uid,
            name : paymentData.userName  || '',
            email: paymentData.userEmail || '',
            phone: paymentData.userPhone || '',
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

      if (typeof window.hideLoading === 'function') window.hideLoading();

      // Open Cashfree and use our patched poll
      await _openCashfreeOurs(payment_session_id, orderId, 'tournament', paymentData);

    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      throw err;
    }
  }

  async function _openCashfreeOurs(sessionId, orderId, paymentType, paymentData) {
    if (typeof window.Cashfree === 'undefined') {
      throw new Error('Cashfree SDK not loaded. Check your internet connection.');
    }

    const cashfree = await window.Cashfree({ mode: 'production' });

    // Firestore realtime: if webhook fires WHILE popup is open, close popup + show success
    let unsub = null;
    if (window.db) {
      try {
        unsub = window.db.collection('pending_payments').doc(orderId)
          .onSnapshot(snap => {
            if (!snap.exists) {
              _checkTournamentEntries(orderId, paymentData).then(found => {
                if (found && cashfree.close) cashfree.close();
              });
            }
          }, () => {});
      } catch (_) {}
    }

    try {
      const result = await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget  : '_modal',
      });

      if (unsub) { try { unsub(); } catch (_) {} }

      const status = result?.paymentDetails?.paymentStatus;

      if (status === 'SUCCESS' || !status) {
        // SUCCESS or popup closed without status — verify
        await _patchedPollAndConfirm(orderId, paymentData);
      } else if (status === 'FAILED' || status === 'USER_DROPPED') {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function')
          window.showToast('Payment was not completed.', 'warning');
        _cleanupPendingDocs(orderId);
      }

    } catch (popupErr) {
      if (unsub) { try { unsub(); } catch (_) {} }
      console.log('[tournVerify] Cashfree popup closed/redirected:', popupErr.message);
      // Always poll when popup throws — covers UPI redirect case
      await _patchedPollAndConfirm(orderId, paymentData);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   *  PAGE-LOAD RECOVERY — patches the existing function
   *  so it also uses our panel instead of the shared loading overlay
   * ══════════════════════════════════════════════════════════════*/

  async function _patchedRecoverOnLoad() {
    let waited = 0;
    while (!window.currentUser && waited < 8000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    const cu = window.currentUser;
    if (!cu || !window.db) return;
    const db = window.db;

    // Dismiss any lingering shared loading overlay immediately
    if (typeof window.hideLoading === 'function') window.hideLoading();

    let orderId = null;
    let regMeta = null;

    // Check sessionStorage
    try {
      orderId = sessionStorage.getItem('bmg_lastTournOrderId')
        || sessionStorage.getItem('bmg_recoverOrderId');
      const payType = sessionStorage.getItem('bmg_recoverPayType');
      if (payType && payType !== 'tournament') orderId = null;
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
            const d   = doc.data();
            const age = Date.now() - (d.createdAt?.toMillis?.() || 0);
            if (age < 60 * 60 * 1000) { orderId = doc.id; regMeta = d; break; }
          }
        }
      } catch (_) {}
    }

    if (!orderId) return;

    console.log('[tournVerify] Page-load recovery — orderId:', orderId);

    // Restore regMeta into window globals
    if (!regMeta) {
      try {
        const raw = sessionStorage.getItem(`bmg_tournReg_${orderId}`)
          || sessionStorage.getItem('pendingTournamentRegistration');
        if (raw) regMeta = JSON.parse(raw);
      } catch (_) {}
    }
    if (regMeta) window._pendingTournamentRegData = regMeta;

    // Check if already confirmed
    const alreadyDone = await _checkTournamentEntries(orderId, regMeta || {});
    if (alreadyDone) return;

    // Start our patched poll (which shows the persistent panel)
    await _patchedPollAndConfirm(orderId, regMeta || {});
  }


  /* ══════════════════════════════════════════════════════════════
   *  BOOT
   * ══════════════════════════════════════════════════════════════*/

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    // Intercept the tournament pay button before bmg_tournament_payment_fix can wire it
    _interceptTournamentPayButton();

    // Run page-load recovery with our patched version
    _patchedRecoverOnLoad();

    console.log('✅ bmg_tournament_verify_fix.js loaded — persistent verify panel active');
  });

  // Expose for external debugging
  window._bmgTournamentVerifyPanel = {
    show    : _showVerifyPanel,
    destroy : _destroyVerifyPanel,
    poll    : _patchedPollAndConfirm,
  };

})();
