/**
 * bmg_tournament_verify_fix.js  v3 — FIRESTORE-ONLY REWRITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHAT CHANGED FROM v2:
 *   Every call to checkOrderStatus Cloud Function (which returns 500)
 *   has been removed. Verification is now 100% Firestore-based:
 *
 *   • onSnapshot on tournament_entries/{orderId} — fires the INSTANT
 *     the webhook writes the doc (typically < 3 seconds after payment).
 *   • onSnapshot on pending_payments/{orderId} — fires when webhook
 *     deletes the doc (also instant).
 *   • Fallback poll every 3 s for up to 30 s, then giveUp().
 *   • No HTTP calls to Cloud Functions at all.
 *
 * LOAD ORDER (no change):
 *   <script src="bmg_tournament_payment_fix.js"></script>
 *   <script src="bmg_tournament_verify_fix.js"></script>   ← this file
 *   <script src="bmg_instant_fixes.js"></script>
 *   <script src="bmg_comprehensive_fix.js"></script>
 *   <script src="bmg_cf_bypass.js"></script>
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CF_BASE = 'https://us-central1-bookmygame-2149d.cloudfunctions.net';

  function _toast(msg, type, dur) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur);
  }
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ══════════════════════════════════════════════════════════════
   *  PERSISTENT VERIFICATION PANEL (UI — unchanged from v2)
   * ══════════════════════════════════════════════════════════════ */
  const PANEL_ID   = 'bmg-tourn-verify-panel';
  let _panelAbort  = false;
  let _pollRunning = false;

  function _showVerifyPanel(opts) {
    opts = opts || {};
    _destroyVerifyPanel();

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
        <div style="position:relative;width:72px;height:72px;margin:0 auto 20px;">
          <svg width="72" height="72" viewBox="0 0 72 72"
               style="position:absolute;inset:0;animation:bmgSpin 1.4s linear infinite;">
            <circle cx="36" cy="36" r="30" fill="none" stroke="#e5e7eb" stroke-width="5"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="#2563eb" stroke-width="5"
              stroke-dasharray="140" stroke-dashoffset="100" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;
                      justify-content:center;font-size:22px;">🏆</div>
        </div>

        <h3 style="font-size:18px;font-weight:800;color:#111827;margin:0 0 6px;"
            id="bmg-vp-title">Verifying Payment</h3>
        <p style="font-size:13px;color:#6b7280;margin:0 0 20px;"
           id="bmg-vp-subtitle">Confirming your tournament spot…</p>

        <div style="background:#f1f5f9;border-radius:999px;height:6px;
                    overflow:hidden;margin-bottom:14px;">
          <div id="bmg-vp-bar" style="
            height:100%;width:15%;border-radius:999px;
            background:linear-gradient(90deg,#2563eb,#7c3aed);
            transition:width .5s ease;"></div>
        </div>

        <p style="font-size:12px;color:#9ca3af;margin:0 0 20px;"
           id="bmg-vp-status">Waiting for payment confirmation…</p>

        <div style="
          background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;
          padding:12px 14px;font-size:12px;color:#1d4ed8;text-align:left;
          margin-bottom:20px;line-height:1.6;">
          <i class="fas fa-shield-alt"></i>
          Your payment is being verified. <strong>Do not close this tab.</strong>
        </div>

        <div id="bmg-vp-fallback" style="display:none;margin-top:4px;">
          <p style="font-size:12px;color:#6b7280;margin:0 0 10px;">
            Taking longer than expected?
          </p>
          <button id="bmg-vp-go-tournaments" style="
            width:100%;padding:11px;
            background:#f3f4f6;color:#374151;border:none;
            border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">
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

    panel.querySelector('#bmg-vp-go-tournaments')?.addEventListener('click', () => {
      _destroyVerifyPanel();
      if (typeof window.showPage === 'function') window.showPage('my-bookings-page');
    });

    return panel;
  }

  function _updateVerifyPanel(attempt, max) {
    const bar    = document.getElementById('bmg-vp-bar');
    const status = document.getElementById('bmg-vp-status');
    const fb     = document.getElementById('bmg-vp-fallback');
    if (bar)    bar.style.width = Math.min(90, 15 + (attempt / max) * 75) + '%';
    if (status) status.textContent = attempt <= 3
      ? 'Waiting for payment confirmation…'
      : 'Still checking — almost there…';
    if (fb && attempt >= 6) fb.style.display = 'block';
  }

  function _setVerifyPanelSuccess() {
    const title    = document.getElementById('bmg-vp-title');
    const subtitle = document.getElementById('bmg-vp-subtitle');
    const bar      = document.getElementById('bmg-vp-bar');
    const fb       = document.getElementById('bmg-vp-fallback');
    if (title)    title.textContent    = '🎉 Payment Confirmed!';
    if (subtitle) subtitle.textContent = 'Your tournament spot is secured!';
    if (bar)      { bar.style.width = '100%'; bar.style.background = '#10b981'; }
    if (fb)       fb.style.display = 'none';
  }

  function _setVerifyPanelFailed(msg) {
    const title    = document.getElementById('bmg-vp-title');
    const subtitle = document.getElementById('bmg-vp-subtitle');
    const bar      = document.getElementById('bmg-vp-bar');
    if (title)    { title.textContent = 'Not Confirmed'; title.style.color = '#ef4444'; }
    if (subtitle) subtitle.textContent = msg || 'Please check My Tournaments.';
    if (bar)      { bar.style.background = '#ef4444'; bar.style.width = '100%'; }
  }

  function _destroyVerifyPanel() {
    const el = document.getElementById(PANEL_ID);
    if (el) {
      el.style.opacity    = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 300);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   *  CORE: FIRESTORE-ONLY VERIFY
   *
   *  Uses two onSnapshots (instant) + a 3 s poll fallback.
   *  Hard timeout at 30 s → giveUp (webhook may still fire later).
   *  NO Cloud Function calls.
   * ══════════════════════════════════════════════════════════════ */
  async function _firestoreVerify(orderId, paymentData) {
    if (_pollRunning) return;
    _pollRunning = true;
    _panelAbort  = false;

    // Dismiss shared loading overlay immediately
    if (typeof window.hideLoading === 'function') window.hideLoading();

    const db = window.db;
    if (!db) { _pollRunning = false; return; }

    // Show the persistent panel
    _showVerifyPanel();

    let resolved      = false;
    let unsubEntries  = null;
    let unsubPending  = null;
    let pollInterval  = null;
    let hardTimeout   = null;

    function cleanup() {
      clearInterval(pollInterval);
      clearTimeout(hardTimeout);
      if (unsubEntries) { try { unsubEntries(); } catch (_) {} }
      if (unsubPending) { try { unsubPending(); } catch (_) {} }
      _pollRunning = false;
    }

    function succeed(data) {
      if (resolved) return;
      resolved = true;
      cleanup();
      _setVerifyPanelSuccess();
      setTimeout(_destroyVerifyPanel, 1800);
      // Clean session
      ['bmg_lastTournOrderId','bmg_recoverOrderId','bmg_recoverPayType',
       'pendingTournamentRegistration','bmg_tournReg_'+orderId]
        .forEach(k => { try { sessionStorage.removeItem(k); } catch(_){} });
      window._pendingTournamentRegData = null;
      window.currentTournamentPayment  = null;
      // Write entry + fire event
      _writeAndFireSuccess(orderId, paymentData, data);
    }

    function giveUp() {
      if (resolved) return;
      resolved = true;
      cleanup();
      _setVerifyPanelFailed('Check "My Tournaments" — your spot may still be confirmed.');
      setTimeout(_destroyVerifyPanel, 4000);
      _toast('⏳ Still verifying — check "My Tournaments" in a minute.', 'info', 6000);
      if (typeof window.loadMyTournaments === 'function') {
        setTimeout(() => window.loadMyTournaments(), 3500);
      }
    }

    // ── Check 1: already confirmed? ─────────────────────────────
    try {
      const existing = await db.collection('tournament_entries').doc(orderId).get();
      if (existing.exists) { succeed(existing.data()); return; }
    } catch (_) {}

    // ── onSnapshot 1: tournament_entries (fires when webhook writes) ─
    try {
      unsubEntries = db.collection('tournament_entries').doc(orderId)
        .onSnapshot(snap => {
          if (snap.exists && !resolved) succeed(snap.data());
        }, () => {});
    } catch (_) {}

    // ── onSnapshot 2: pending_payments deleted by webhook → check entries ─
    try {
      unsubPending = db.collection('pending_payments').doc(orderId)
        .onSnapshot(snap => {
          if (!snap.exists && !resolved) {
            db.collection('tournament_entries').doc(orderId).get()
              .then(e => { if (e.exists && !resolved) succeed(e.data()); })
              .catch(() => {});
          }
        }, () => {});
    } catch (_) {}

    // ── Poll fallback every 3 s ──────────────────────────────────
    let pollCount = 0;
    const MAX_POLL = 10; // 10 × 3s = 30s hard limit
    pollInterval = setInterval(async () => {
      if (resolved) { clearInterval(pollInterval); return; }
      pollCount++;
      _updateVerifyPanel(pollCount, MAX_POLL);
      try {
        const snap = await db.collection('tournament_entries').doc(orderId).get();
        if (snap.exists) succeed(snap.data());
      } catch (_) {}
    }, 3000);

    // ── Hard timeout at 30 s ────────────────────────────────────
    hardTimeout = setTimeout(giveUp, 30000);
  }


  /* ══════════════════════════════════════════════════════════════
   *  WRITE tournament_entries + FIRE SUCCESS EVENT
   * ══════════════════════════════════════════════════════════════ */
  async function _writeAndFireSuccess(orderId, paymentData, firestoreData) {
    const db = window.db;
    const cu = window.currentUser;

    // Load best available meta
    let meta = window._pendingTournamentRegData || {};
    if (!meta.tournamentId) {
      try {
        const raw = sessionStorage.getItem('pendingTournamentRegistration')
                 || sessionStorage.getItem('bmg_tournReg_' + orderId);
        if (raw) meta = JSON.parse(raw);
      } catch (_) {}
    }
    if (!meta.tournamentId && db) {
      try {
        const snap = await db.collection('payment_recovery').doc(orderId).get();
        if (snap.exists) meta = snap.data();
      } catch (_) {}
    }

    // Merge all sources — firestoreData (from webhook) wins
    const tournamentId   = firestoreData?.tournamentId   || meta.tournamentId   || paymentData?.tournamentId   || '';
    const tournamentName = firestoreData?.tournamentName || meta.tournamentName || paymentData?.tournamentName || '';
    const teamName       = firestoreData?.teamName       || meta.teamName       || paymentData?.teamName       || '';
    const registrationId = firestoreData?.registrationId || meta.registrationId || orderId;
    const amount         = Number(firestoreData?.amount  || meta.entryFee || meta.amount || paymentData?.amount || 0);
    const sport          = firestoreData?.sport          || meta.sport          || paymentData?.sport          || '';
    const startDate      = firestoreData?.date           || meta.startDate      || paymentData?.date           || '';
    const venue          = firestoreData?.venue          || meta.venue          || paymentData?.venue          || '';

    // Write tournament_entries if webhook hasn't already
    if (db && cu) {
      try {
        const existing = await db.collection('tournament_entries').doc(orderId).get();
        if (!existing.exists) {
          const now = firebase.firestore.FieldValue.serverTimestamp();
          const entry = {
            registrationId, orderId, tournamentId, tournamentName,
            userId        : cu.uid,
            userName      : cu.name || cu.displayName || '',
            userEmail     : cu.email || '',
            userPhone     : cu.phone || '',
            teamName, sport, venue,
            date          : startDate,
            amount,
            platformFee   : Math.round(amount * 0.20),
            ownerAmount   : amount - Math.round(amount * 0.20),
            entryFee      : amount,
            paymentMethod : 'cashfree',
            paymentStatus : 'paid',
            status        : 'confirmed',
            registrationStatus: 'confirmed',
            confirmedAt   : now, createdAt: now, updatedAt: now,
          };
          const batch = db.batch();
          batch.set(db.collection('tournament_entries').doc(orderId), entry, { merge: true });
          batch.set(db.collection('tournament_registrations').doc(registrationId), entry, { merge: true });
          if (tournamentId) {
            batch.update(db.collection('tournaments').doc(tournamentId), {
              registeredTeams: firebase.firestore.FieldValue.increment(1),
              updatedAt: now,
            });
          }
          batch.delete(db.collection('pending_payments').doc(orderId));
          try { batch.delete(db.collection('payment_recovery').doc(orderId)); } catch(_) {}
          await batch.commit();
          console.log('[tournVerify v3] ✅ tournament_entries written');
        } else {
          // Webhook already wrote it — just clean up
          db.collection('pending_payments').doc(orderId).delete().catch(() => {});
          db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
        }
      } catch (err) {
        console.warn('[tournVerify v3] Write error (non-fatal):', err);
      }
    }

    _fireSuccess(orderId, {
      tournamentName, teamName, registrationId, amount, sport,
      tournamentId, userId: cu?.uid || '', startDate,
    });

    if (typeof window.loadMyTournaments === 'function') {
      setTimeout(() => window.loadMyTournaments(), 1500);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   *  FIRE SUCCESS EVENT + SHOW MODAL
   * ══════════════════════════════════════════════════════════════ */
  let _lastSuccessId = null;
  function _fireSuccess(orderId, data) {
    if (_lastSuccessId === orderId) return;
    _lastSuccessId = orderId;

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
        startDate      : data.startDate      || '',
      });
    }
  }

  function _cleanupPendingDocs(orderId) {
    const db = window.db;
    if (!db) return;
    try {
      const batch = db.batch();
      batch.delete(db.collection('pending_payments').doc(orderId));
      batch.delete(db.collection('payment_recovery').doc(orderId));
      batch.commit().catch(() => {});
    } catch (_) {}
  }


  /* ══════════════════════════════════════════════════════════════
   *  PAY BUTTON INTERCEPTOR
   *  Intercepts #cashfree-tournament-pay-btn, kicks off payment,
   *  then uses _firestoreVerify (no CF calls).
   * ══════════════════════════════════════════════════════════════ */
  function _interceptTournamentPayButton() {
    const observer = new MutationObserver(() => {
      const btn = document.getElementById('cashfree-tournament-pay-btn');
      if (!btn || btn.dataset.bmgVerifyFixed) return;
      btn.dataset.bmgVerifyFixed = '1';

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
            _toast('Tournament data missing. Please go back and try again.', 'error');
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-lock"></i> Pay Securely <i class="fas fa-arrow-right"></i>';
            return;
          }

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

          // Persist meta before payment opens
          try {
            const meta = { orderId, ...regData, savedAt: Date.now() };
            sessionStorage.setItem('pendingTournamentRegistration', JSON.stringify(regData));
            sessionStorage.setItem('bmg_recoverOrderId', orderId);
            sessionStorage.setItem('bmg_recoverPayType', 'tournament');
            sessionStorage.setItem('bmg_lastTournOrderId', orderId);
            sessionStorage.setItem('bmg_tournReg_' + orderId, JSON.stringify(meta));
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

          await _kickoffPayment(orderId, paymentData, cu);

        } catch (err) {
          console.error('[tournVerify v3] Pay button error:', err);
          _toast('Payment error: ' + err.message, 'error');
        }

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

      await _openCashfreeAndVerify(payment_session_id, orderId, paymentData);

    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      throw err;
    }
  }

  async function _openCashfreeAndVerify(sessionId, orderId, paymentData) {
    if (typeof window.Cashfree === 'undefined') {
      throw new Error('Cashfree SDK not loaded.');
    }

    const cashfree = await window.Cashfree({ mode: 'production' });

    try {
      const result = await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget  : '_modal',
      });

      const status = result?.paymentDetails?.paymentStatus;

      if (status === 'FAILED' || status === 'USER_DROPPED') {
        _toast('Payment was not completed.', 'warning');
        _cleanupPendingDocs(orderId);
        return;
      }

      // SUCCESS or unknown (modal closed without status) → Firestore verify
      await _firestoreVerify(orderId, paymentData);

    } catch (popupErr) {
      // Modal closed / UPI redirect — always verify via Firestore
      console.log('[tournVerify v3] Cashfree modal closed:', popupErr?.message);
      await _firestoreVerify(orderId, paymentData);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   *  PAGE-LOAD RECOVERY — Firestore-only, no CF calls
   * ══════════════════════════════════════════════════════════════ */
  async function _patchedRecoverOnLoad() {
    let waited = 0;
    while (!window.currentUser && waited < 8000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    const cu = window.currentUser;
    if (!cu || !window.db) return;
    const db = window.db;

    if (typeof window.hideLoading === 'function') window.hideLoading();

    let orderId = null;
    let regMeta = null;

    // From sessionStorage
    try {
      const sid = sessionStorage.getItem('bmg_lastTournOrderId')
               || sessionStorage.getItem('bmg_recoverOrderId');
      const pt  = sessionStorage.getItem('bmg_recoverPayType');
      if (sid && (!pt || pt === 'tournament')) {
        // Age check — skip if > 5 min old
        const raw = sessionStorage.getItem('bmg_tournReg_' + sid);
        if (raw) {
          const m = JSON.parse(raw);
          const age = Date.now() - (m.savedAt || 0);
          if (age < 5 * 60 * 1000) { orderId = sid; regMeta = m; }
          else {
            console.log('[tournVerify v3] Skipping stale session order:', sid);
            try { sessionStorage.removeItem('bmg_lastTournOrderId'); } catch(_) {}
          }
        } else {
          orderId = sid;
        }
      }
    } catch (_) {}

    // From Firestore payment_recovery
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
            if (age < 5 * 60 * 1000) { orderId = doc.id; regMeta = d; break; }
            else {
              // Old doc — clean up silently
              doc.ref.delete().catch(() => {});
              db.collection('pending_payments').doc(doc.id).delete().catch(() => {});
            }
          }
        }
      } catch (_) {}
    }

    if (!orderId) return;

    console.log('[tournVerify v3] Page-load recovery — orderId:', orderId);
    if (regMeta) window._pendingTournamentRegData = regMeta;

    // Already confirmed?
    try {
      const entry = await db.collection('tournament_entries').doc(orderId).get();
      if (entry.exists) {
        console.log('[tournVerify v3] Already confirmed — cleaning up');
        db.collection('payment_recovery').doc(orderId).delete().catch(() => {});
        db.collection('pending_payments').doc(orderId).delete().catch(() => {});
        ['bmg_lastTournOrderId','bmg_recoverOrderId','bmg_recoverPayType',
         'pendingTournamentRegistration','bmg_tournReg_'+orderId]
          .forEach(k => { try { sessionStorage.removeItem(k); } catch(_){} });
        return; // silent — no panel needed
      }
    } catch (_) {}

    // Not yet confirmed — run Firestore verify
    await _firestoreVerify(orderId, regMeta || {});
  }


  /* ══════════════════════════════════════════════════════════════
   *  BOOT
   * ══════════════════════════════════════════════════════════════ */
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    _interceptTournamentPayButton();
    _patchedRecoverOnLoad();
    console.log('✅ bmg_tournament_verify_fix.js v3 — Firestore-only, instant confirmation');
  });

  // Expose for debugging + bmg_instant_fixes.js compatibility
  window._bmgTournamentVerifyPanel = {
    show   : _showVerifyPanel,
    destroy: _destroyVerifyPanel,
    poll   : _firestoreVerify,   // now points to Firestore-only fn
  };

  // Expose write fn so bmg_instant_fixes.js succeed() can call it
  window._writeAndShowTournamentSuccess    = _writeAndFireSuccess;
  window._bmgWriteAndShowTournamentSuccess = _writeAndFireSuccess;

})();
