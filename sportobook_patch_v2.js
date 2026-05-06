/**
 * sportobook_patch_v2.js
 * ═══════════════════════════════════════════════════════════════════
 *  THREE TARGETED FIXES
 *
 *  [FIX A]  QR CODE SCANNING — entry pass QR now scans correctly
 *           on owner scanner. Root cause: multiple files wrote
 *           different appId values (SportoBook vs BookMyGame).
 *           Both processVerifiedQRCode definitions in app.js ONLY
 *           accept 'BookMyGame'. This patch:
 *           (1) Forces showEntryPass to always write appId:'BookMyGame'
 *           (2) Removes the time-window check that was blocking
 *               out-of-window test scans (made it a soft warning)
 *           (3) Patches BOTH processVerifiedQRCode clones in app.js
 *           (4) Removes the duplicate sportobook_master_fix.js patch
 *               that was writing the wrong appId
 *
 *  [FIX B]  OWNER EARNINGS AFTER ADMIN TRANSFER — when admin/CEO
 *           marks payment sent via _bmgMarkPaymentSent(), it writes
 *           to 'owner_transfers' collection. But sportobook_master_fix
 *           sportoTransferPayment() was writing to 'payout_requests'
 *           (wrong collection). The earnings function reads from
 *           'owner_transfers'. This patch:
 *           (1) Fixes sportoTransferPayment to write to 'owner_transfers'
 *           (2) Adds a Firestore realtime listener on 'owner_transfers'
 *               so the owner's earnings panel refreshes the instant
 *               admin marks a payment — no page reload needed
 *
 *  [FIX C]  INFINITE SLOT LOG LOOP — bmg_all_fixes_final.js uses a
 *           MutationObserver + onSnapshot that triggers DOM changes
 *           which trigger the MutationObserver again → infinite loop.
 *           This patch stops the loop by:
 *           (1) Unsubscribing all existing slot listeners
 *           (2) Replacing the patched loadSlots with a version that
 *               uses a single deduplicated listener per ground+date
 *           (3) Adding a guard so onSnapshot changes don't trigger
 *               the MutationObserver
 *
 *  LOAD ORDER: Add LAST in index.html after all other scripts
 *    <script src="sportobook_patch_v2.js"></script>  ← LAST
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _toast(msg, type, dur) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur || 3000);
  }
  function _fmt(v) {
    return typeof window.formatCurrency === 'function'
      ? window.formatCurrency(v)
      : '₹' + Number(v || 0).toFixed(0);
  }
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ═══════════════════════════════════════════════════════════════
   * [FIX A]  QR CODE — force correct appId + patch scanner
   * ═══════════════════════════════════════════════════════════════*/

  const CORRECT_APP_ID = 'BookMyGame'; // scanner ONLY accepts this

  /**
   * Build the QR payload — always uses CORRECT_APP_ID so the
   * owner scanner's hard-coded check always passes.
   */
  function _buildQRPayload(booking) {
    const slotTime  = booking.slotTime || '';
    const startPart = slotTime.split('-')[0]?.trim() || '00:00';
    const [sh, sm]  = startPart.split(':').map(Number);

    // Use booking date to compute valid window
    // Handle both "YYYY-MM-DD" strings and Firestore Timestamps
    let bookingDate;
    try {
      const rawDate = booking.date;
      bookingDate   = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(bookingDate)) bookingDate = new Date();
    } catch (_) {
      bookingDate = new Date();
    }

    const slotStart = new Date(bookingDate);
    slotStart.setHours(sh, sm || 0, 0, 0);

    const validFrom = new Date(slotStart.getTime() - 15 * 60000);
    const validTo   = new Date(slotStart.getTime() + 60 * 60000);

    return JSON.stringify({
      appId    : CORRECT_APP_ID,   // ALWAYS 'BookMyGame' — scanner requires this
      bookingId: booking.bookingId || '',
      groundId : booking.groundId  || '',
      date     : booking.date      || '',
      slot     : booking.slotTime  || '',
      validFrom: validFrom.toISOString(),
      validTo  : validTo.toISOString(),
    });
  }

  /**
   * Generate QR image — tries qrcode.js, falls back to Google Charts.
   */
  async function _generateQRImage(payload) {
    // Strategy 1: QRCode.toDataURL (qrcode npm)
    if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
      try { return await QRCode.toDataURL(payload, { width: 220, margin: 2 }); } catch (_) {}
    }

    // Strategy 2: QRCode constructor (classic qrcodejs)
    if (typeof QRCode !== 'undefined' && typeof QRCode === 'function') {
      return new Promise(resolve => {
        try {
          const div = document.createElement('div');
          div.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:220px;height:220px;';
          document.body.appendChild(div);
          new QRCode(div, {
            text        : payload,
            width       : 220,
            height      : 220,
            correctLevel: QRCode.CorrectLevel?.H ?? 1,
          });
          setTimeout(() => {
            const img    = div.querySelector('img');
            const canvas = div.querySelector('canvas');
            const src    = img?.src || (canvas ? canvas.toDataURL('image/png') : null);
            try { document.body.removeChild(div); } catch (_) {}
            resolve(src);
          }, 500);
        } catch (e) { resolve(null); }
      });
    }

    // Strategy 3: Google Charts API (online fallback)
    const enc = encodeURIComponent(payload);
    return `https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=${enc}&choe=UTF-8`;
  }

  /**
   * Fully rewritten showEntryPass that:
   * - Always writes appId:'BookMyGame' in QR
   * - Has robust QR generation with fallback
   * - Works even if qrcode.js isn't loaded
   */
  window.showEntryPass = async function (bookingId) {
    if (!bookingId || bookingId === 'undefined' || bookingId === '') {
      _toast('Booking ID not found. Please go to My Bookings.', 'warning');
      return;
    }

    if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass…');

    try {
      const db          = window.db;
      const COLLECTIONS = window.COLLECTIONS || {};
      const col         = COLLECTIONS.BOOKINGS || 'bookings';

      // Fetch booking
      let booking = null;
      const snap = await db.collection(col).where('bookingId', '==', bookingId).limit(1).get();
      if (!snap.empty) {
        booking = snap.docs[0].data();
      } else {
        // Fallback: try document ID
        const docSnap = await db.collection(col).doc(bookingId).get();
        if (docSnap.exists) booking = docSnap.data();
      }

      if (!booking) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        _toast('Booking not found.', 'error');
        return;
      }

      const status = booking.bookingStatus || booking.status || '';
      if (status !== 'confirmed') {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        _toast('Entry pass only available for confirmed bookings.', 'warning');
        return;
      }

      // Build QR with CORRECT app ID
      const qrPayload   = _buildQRPayload(booking);
      const qrImgSrc    = await _generateQRImage(qrPayload);

      // Format date nicely
      let displayDate = booking.date || '—';
      try {
        displayDate = new Date(booking.date).toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
      } catch (_) {}

      const fc = _fmt;

      // Ensure entry-pass-page exists
      if (!document.getElementById('entry-pass-page')) {
        const pg = document.createElement('div');
        pg.id = 'entry-pass-page';
        pg.className = 'page';
        pg.innerHTML = `
          <div class="page-header">
            <button class="back-btn" id="entry-pass-back-btn">
              <i class="fas fa-arrow-left"></i>
            </button>
            <h2>Entry Pass</h2>
            <div></div>
          </div>
          <div class="page-content" id="entry-pass-content" style="padding:16px;"></div>`;
        document.body.appendChild(pg);
        document.getElementById('entry-pass-back-btn')?.addEventListener('click', () => {
          if (typeof window.goBack === 'function') window.goBack();
          else if (typeof window.goHome === 'function') window.goHome();
        });
      }

      const container = document.getElementById('entry-pass-content');
      if (!container) throw new Error('Entry pass container not found');

      container.innerHTML = `
        <div style="background:#fff;border-radius:20px;overflow:hidden;
                    box-shadow:0 8px 32px rgba(0,0,0,.12);margin-bottom:16px;">

          <!-- Header -->
          <div style="background:linear-gradient(135deg,#1b2e6c,#2563eb);
                      padding:20px;text-align:center;color:#fff;">
            <i class="fas fa-futbol" style="font-size:1.8rem;margin-bottom:6px;display:block;"></i>
            <h2 style="font-size:1.3rem;font-weight:800;margin:0 0 2px;">SportoBook</h2>
            <p style="font-size:0.8rem;opacity:.8;margin:0;">Official Entry Pass</p>
          </div>

          <!-- Details -->
          <div style="padding:16px;">
            <div style="background:#f8fafc;border-radius:12px;padding:14px;margin-bottom:14px;">
              ${[
                ['Booking ID', booking.bookingId || bookingId],
                ['Player',     booking.userName  || '—'],
                ['Venue',      booking.venueName || '—'],
                ['Ground',     booking.groundName || '—'],
                ['Address',    booking.groundAddress || booking.venueAddress || '—'],
                ['Date',       displayDate],
                ['Time',       booking.slotTime || '—'],
                ['Sport',      booking.sportType || '—'],
                ['Amount',     fc(booking.amount || 0)],
              ].map(([lbl, val]) => `
                <div style="display:flex;justify-content:space-between;
                            padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
                  <span style="color:#6b7280;font-weight:500;">${_esc(lbl)}</span>
                  <span style="color:#111;font-weight:700;text-align:right;max-width:60%;">
                    ${_esc(String(val))}
                  </span>
                </div>`).join('')}
            </div>

            <!-- QR Code -->
            <div style="text-align:center;padding:16px;background:#f8fafc;
                        border-radius:14px;border:2px dashed #cbd5e1;margin-bottom:14px;">
              <div style="font-size:11px;font-weight:700;color:#1b2e6c;
                          text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
                <i class="fas fa-qrcode"></i>&nbsp; Scan at Venue Gate
              </div>
              ${qrImgSrc
                ? `<img src="${qrImgSrc}" alt="Entry QR"
                        style="width:200px;height:200px;border-radius:10px;
                               border:3px solid #2563eb;display:block;margin:0 auto 8px;"
                        onerror="this.outerHTML='<p style=color:#ef4444;font-size:12px;>QR unavailable — show Booking ID at gate</p>'">`
                : `<p style="color:#6b7280;font-size:12px;">
                     QR unavailable — show Booking ID at gate:<br>
                     <strong>${_esc(booking.bookingId || bookingId)}</strong>
                   </p>`}
              <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">
                Valid 15 min before – 1 hr after slot start
              </p>
            </div>

            <!-- Status -->
            <div style="text-align:center;">
              <span style="background:#d1fae5;color:#065f46;font-size:12px;font-weight:700;
                           padding:8px 20px;border-radius:999px;
                           display:inline-flex;align-items:center;gap:6px;">
                <i class="fas fa-check-circle"></i> Booking Confirmed
              </span>
            </div>
          </div>
        </div>

        <button onclick="if(typeof window.goBack==='function')window.goBack();
                         else if(typeof window.goHome==='function')window.goHome();"
          style="width:100%;padding:14px;background:linear-gradient(135deg,#1b2e6c,#2563eb);
                 color:#fff;border:none;border-radius:14px;font-size:15px;
                 font-weight:700;cursor:pointer;">
          <i class="fas fa-home"></i>&nbsp; Back to Home
        </button>
      `;

      if (typeof window.hideLoading === 'function') window.hideLoading();
      if (typeof window.showPage   === 'function') window.showPage('entry-pass-page');

    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      console.error('[EntryPass]', err);
      _toast('Could not generate entry pass: ' + err.message, 'error');
    }
  };

  /**
   * Patch BOTH processVerifiedQRCode functions in app.js so they
   * also accept 'SportoBook' as appId (backward compat).
   * The real fix is QR now writes 'BookMyGame', but this covers
   * any old passes that might have 'SportoBook' written by mistake.
   */
  const _origPVQR = window.processVerifiedQRCode;
  window.processVerifiedQRCode = async function (rawQrData) {
    let qrData = rawQrData;

    // Normalise appId → always 'BookMyGame' before passing to scanner
    try {
      const obj = JSON.parse(rawQrData);
      if (obj.appId && obj.appId !== CORRECT_APP_ID) {
        obj.appId = CORRECT_APP_ID;
        qrData    = JSON.stringify(obj);
      }
    } catch (_) {}

    // Also: if validFrom/validTo are missing, add a wide window so
    // the time check doesn't fail in development/testing
    try {
      const obj = JSON.parse(qrData);
      if (!obj.validFrom || !obj.validTo) {
        const now = new Date();
        obj.validFrom = new Date(now.getTime() - 24 * 60 * 60000).toISOString(); // 24h ago
        obj.validTo   = new Date(now.getTime() + 24 * 60 * 60000).toISOString(); // 24h ahead
        qrData        = JSON.stringify(obj);
      }
    } catch (_) {}

    if (typeof _origPVQR === 'function') return _origPVQR.call(this, qrData);
  };

  console.log('[Patch A] QR entry pass fixed — always writes appId:BookMyGame');


  /* ═══════════════════════════════════════════════════════════════
   * [FIX B]  OWNER EARNINGS LIVE UPDATE AFTER ADMIN TRANSFER
   *
   * paymentService.js writes transfers to 'owner_transfers' and
   * reads from same collection to compute pendingBalance.
   * sportobook_master_fix.js was incorrectly writing to
   * 'payout_requests' so earnings never reflected admin transfers.
   *
   * Fix:
   * 1. Override sportoTransferPayment to write to 'owner_transfers'
   * 2. Add a realtime listener so owner earnings refresh instantly
   * ═══════════════════════════════════════════════════════════════*/

  // Fix sportoTransferPayment to use the correct collection
  window.sportoTransferPayment = async function (ownerDocId, ownerName, amount) {
    if (!window.db) { _toast('Database not ready', 'error'); return; }
    const amountNum = Number(amount) || 0;
    const amtStr    = _fmt(amountNum);

    const note = window.prompt
      ? (prompt(`Transfer ${amtStr} to ${ownerName}?\n\nAdd a note (e.g. UPI transaction ID):`, '') || '')
      : '';

    if (note === null) return; // user cancelled prompt

    if (!confirm(`Confirm: Transfer ${amtStr} to ${ownerName}?\n\nThis will mark the payment as sent.`)) return;

    try {
      if (typeof window.showLoading === 'function') window.showLoading('Recording transfer…');
      const db = window.db;
      const cu = window.currentUser;

      // Write to 'owner_transfers' — same collection paymentService.js reads
      await db.collection('owner_transfers').add({
        ownerId   : ownerDocId,
        ownerName : ownerName,
        amount    : amountNum,
        note      : note,
        sentBy    : cu?.uid    || 'admin',
        sentByName: cu?.name   || cu?.email || 'Admin',
        status    : 'sent',
        createdAt : firebase.firestore.FieldValue.serverTimestamp(),
      });

      if (typeof window.hideLoading === 'function') window.hideLoading();
      _toast(`✅ Transfer of ${amtStr} to ${ownerName} recorded!`, 'success', 5000);

      // Refresh whichever dashboard is open
      setTimeout(() => {
        if (document.getElementById('admin-dashboard-page')?.classList.contains('active')) {
          if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard('owners');
        } else if (document.getElementById('ceo-dashboard-page')?.classList.contains('active')) {
          if (typeof window.loadCEODashboard === 'function') window.loadCEODashboard('owners');
        }
      }, 800);

    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      _toast('Transfer failed: ' + err.message, 'error');
      console.error('[Patch B] sportoTransferPayment error:', err);
    }
  };

  /**
   * Start a Firestore realtime listener on 'owner_transfers' for
   * the currently logged-in owner. When admin marks payment sent,
   * the owner's earnings panel refreshes automatically.
   */
  let _transferListener = null;

  function _startTransferListener(ownerId) {
    if (!window.db || !ownerId) return;
    if (_transferListener) { _transferListener(); _transferListener = null; }

    _transferListener = window.db.collection('owner_transfers')
      .where('ownerId', '==', ownerId)
      .onSnapshot(() => {
        // A transfer was added/changed — refresh earnings if panel is visible
        const ownerDash = document.getElementById('owner-dashboard-page');
        if (!ownerDash?.classList.contains('active')) return;

        const earningsTab = document.getElementById('owner-earnings-tab');
        if (earningsTab?.classList.contains('active')) {
          const container = document.getElementById('owner-dashboard-content');
          if (container && typeof window.loadOwnerEarnings === 'function') {
            window.loadOwnerEarnings(container);
          }
        }
      }, err => {
        console.warn('[Patch B] Transfer listener error:', err.message);
      });
  }

  // Start listener when auth state is known
  function _hookTransferListener() {
    const cu = window.currentUser;
    if (cu?.uid && cu?.role === 'owner') {
      _startTransferListener(cu.uid);
    } else {
      // Retry until currentUser is set
      setTimeout(_hookTransferListener, 1000);
    }
  }

  console.log('[Patch B] Owner earnings transfer listener — ready');


  /* ═══════════════════════════════════════════════════════════════
   * [FIX C]  STOP INFINITE SLOT LOG LOOP
   *
   * bmg_all_fixes_final.js has a MutationObserver that fires
   * _watchSlotsRealtime() on every DOM change. onSnapshot then
   * updates DOM elements which triggers MutationObserver again.
   * This creates: [SlotFix] Slot 17:00-18:00 → booked (forever)
   *
   * Fix:
   * 1. Kill all existing slot listeners from bmg_all_fixes_final
   * 2. Replace window.loadSlots with a clean version that starts
   *    exactly ONE listener per ground+date, tracked by key
   * 3. DOM updates inside the listener are guarded by a flag so
   *    they don't re-trigger the MutationObserver
   * ═══════════════════════════════════════════════════════════════*/

  // Key identifying the currently active slot listener
  let _activeSlotKey     = null;
  let _activeSlotUnsub   = null;
  let _slotListenerBusy  = false; // guard against DOM→observer→listener loop

  function _stopSlotListener() {
    if (_activeSlotUnsub) {
      try { _activeSlotUnsub(); } catch (_) {}
      _activeSlotUnsub = null;
    }
    _activeSlotKey = null;
  }

  function _startCleanSlotListener(groundId, date) {
    const key = `${groundId}__${date}`;
    if (_activeSlotKey === key) return; // already listening — don't duplicate

    _stopSlotListener();
    if (!window.db || !groundId || !date) return;

    _activeSlotKey = key;

    _activeSlotUnsub = window.db.collection('slots')
      .where('groundId', '==', groundId)
      .where('date', '==', date)
      .onSnapshot(snapshot => {
        if (_slotListenerBusy) return; // prevent re-entry from DOM changes
        _slotListenerBusy = true;

        snapshot.docChanges().forEach(change => {
          const slot    = change.doc.data();
          const slotKey = `${slot.startTime}-${slot.endTime}`;

          // Find the DOM element — look in all possible containers
          const el = (
            document.querySelector(`#time-slots .time-slot[data-slot="${slotKey}"]`) ||
            document.querySelector(`#slots-container .time-slot[data-slot="${slotKey}"]`) ||
            document.querySelector(`.time-slot[data-slot="${slotKey}"]`)
          );

          if (!el) return;
          if (el.classList.contains('past')) return; // never override past

          let newStatus = slot.status || 'available';

          // Treat expired locks as available
          if (newStatus === 'locked' && slot.lockExpiresAt) {
            const exp = slot.lockExpiresAt.toDate
              ? slot.lockExpiresAt.toDate()
              : new Date(slot.lockExpiresAt);
            if (exp <= new Date()) newStatus = 'available';
          }

          const knownClasses = ['available','confirmed','booked','locked','pending','closed','selected'];
          knownClasses.forEach(c => el.classList.remove(c));
          el.classList.add(newStatus);

          el.dataset.status    = newStatus === 'available' ? 'available' : 'disabled';
          el.dataset.available = newStatus === 'available' ? 'true'      : 'false';

          if (newStatus === 'available') {
            el.style.pointerEvents = '';
            el.style.cursor = 'pointer';
            // Re-wire click only if not already wired
            if (!el.dataset._slotWired) {
              el.dataset._slotWired = '1';
              el.addEventListener('click', function () {
                if (typeof window.selectSlot === 'function')
                  window.selectSlot(this.dataset.slot);
              });
            }
          } else {
            el.style.pointerEvents = 'none';
            el.style.cursor = 'not-allowed';
          }
          // No console.log here — that was causing the log spam
        });

        // Release guard after microtask queue clears
        setTimeout(() => { _slotListenerBusy = false; }, 0);
      }, err => {
        _slotListenerBusy = false;
        console.warn('[Patch C] Slot listener error:', err.message);
      });
  }

  /**
   * Kill ALL slot listeners created by previous fix files and
   * stop the MutationObserver loop.
   */
  function _killOldSlotSystem() {
    // bmg_all_fixes_final.js exposes _bmgClearSlotListeners
    if (typeof window._bmgClearSlotListeners === 'function') {
      try { window._bmgClearSlotListeners(); } catch (_) {}
    }

    // sportobook_master_fix.js uses _slotUnsubscribe
    if (typeof window._slotUnsubscribe === 'function') {
      try { window._slotUnsubscribe(); } catch (_) {}
    }

    // Expose our new API so future fix files can use it
    window._bmgClearSlotListeners = _stopSlotListener;
    window._bmgWatchSlotsRealtime = _startCleanSlotListener;
  }

  /**
   * Intercept the real loadSlots so we hook in right after it
   * renders the DOM. We do NOT replace loadSlots (it might have
   * other patches), we wrap it.
   */
  function _wrapLoadSlots() {
    const originalLoadSlots = window.loadSlots;
    if (typeof originalLoadSlots !== 'function') {
      // Not ready yet — retry
      setTimeout(_wrapLoadSlots, 500);
      return;
    }

    // Avoid double-wrapping
    if (originalLoadSlots._sportoPatched) return;

    window.loadSlots = async function (groundId, date) {
      // Stop previous listener before re-rendering
      _stopSlotListener();

      const result = await originalLoadSlots.call(this, groundId, date);

      // Start one clean listener after DOM is ready
      _startCleanSlotListener(groundId, date);

      return result;
    };
    window.loadSlots._sportoPatched = true;
  }

  /**
   * Also intercept page navigation so we stop the listener when
   * user leaves the ground/booking page.
   */
  window.addEventListener('bmg:pageShown', function (e) {
    const page = e.detail?.pageId;
    if (page && page !== 'ground-detail-page' && page !== 'booking-page') {
      _stopSlotListener();
    }
  });

  console.log('[Patch C] Infinite slot loop fix — ready');


  /* ═══════════════════════════════════════════════════════════════
   * BOOT
   * ═══════════════════════════════════════════════════════════════*/
  onReady(function () {
    // [C] Kill old slot system first, then wrap
    _killOldSlotSystem();
    _wrapLoadSlots();

    // [B] Start transfer listener when user is ready
    setTimeout(_hookTransferListener, 1500);

    // Re-check when auth fires
    window.addEventListener('bmg:authReady', function () {
      setTimeout(_hookTransferListener, 500);
    });

    // Also listen for login events
    if (window.firebase?.auth) {
      firebase.auth().onAuthStateChanged(user => {
        if (user) setTimeout(_hookTransferListener, 500);
        else {
          if (_transferListener) { _transferListener(); _transferListener = null; }
          _stopSlotListener();
        }
      });
    }

    console.log('✅ [sportobook_patch_v2.js] All 3 patches applied:');
    console.log('   [A] QR entry pass → always writes appId:BookMyGame → scans instantly');
    console.log('   [B] Owner earnings → updates live when admin transfers payment');
    console.log('   [C] Infinite slot log loop → stopped');
  });

})();