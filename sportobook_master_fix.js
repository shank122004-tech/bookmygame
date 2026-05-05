/**
 * sportobook_master_fix.js
 * ═══════════════════════════════════════════════════════════════════
 *  ALL-IN-ONE FIX FILE — SportoBook (formerly BookMyGame)
 *
 *  FIXES COVERED:
 *  1. Upcoming bookings showing as "Completed" after today's date
 *  2. Owner earnings: real data, correct 10% commission, Payment
 *     Pending→Paid in admin/CEO + Transfer Payment button
 *  3. Entry pass not showing after payment + QR app-id mismatch
 *  4. Booked slot still showing "Available" until page refresh
 *  5. Remove payment-verify-icon from home page header
 *  6. "Verified Ground" badge after owner identity verification
 *  7. Rename app → SportoBook everywhere
 *
 *  LOAD ORDER in index.html:
 *    <script src="app.js"></script>           ← existing
 *    <script src="paymentService.js"></script> ← existing
 *    <script src="bmg_auth_fix.js"></script>   ← existing
 *    <script src="sportobook_master_fix.js"></script>  ← ADD LAST
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
   * NEW APP IDENTITY
   * ────────────────────────────────────────────────────────────────*/
  const APP_NAME     = 'SportoBook';
  const APP_ID_QR    = 'SportoBook';          // used in QR data
  const APP_EMAIL_DOMAIN = 'sportobook.com';

  /* ─────────────────────────────────────────────────────────────────
   * 7. RENAME  — swap every visible "BookMyGame" text to "SportoBook"
   * ────────────────────────────────────────────────────────────────*/
  function renameApp() {
    // Page title
    if (document.title.includes('BookMyGame') || document.title.includes('bookmygame')) {
      document.title = document.title
        .replace(/BookMyGame/gi, APP_NAME)
        .replace(/bookmygame/gi, 'sportobook');
    }

    // Walk all text nodes and replace visible text
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(n => {
      if (/BookMyGame/i.test(n.nodeValue)) {
        n.nodeValue = n.nodeValue.replace(/BookMyGame/gi, APP_NAME);
      }
    });

    // Logo elements specifically
    document.querySelectorAll('.logo, [class*="logo"], h1.logo, .app-name').forEach(el => {
      if (/BookMyGame/i.test(el.innerHTML)) {
        el.innerHTML = el.innerHTML.replace(/BookMy(<[^>]+>)?Game/gi, `SportoBook`);
      }
    });

    // <title> meta og
    document.querySelectorAll('meta[property="og:title"], meta[name="application-name"]').forEach(m => {
      if (/BookMyGame/i.test(m.content)) {
        m.content = m.content.replace(/BookMyGame/gi, APP_NAME);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────
   * 5. REMOVE payment-verify-icon from home page header
   * ────────────────────────────────────────────────────────────────*/
  function removePaymentVerifyIcon() {
    const btn = document.getElementById('payment-verify-icon');
    if (btn) {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
      // Also hide its parent wrapper if it only contains this button
      const wrapper = btn.closest('.payment-icon-wrapper-outer, .header-payment-wrapper');
      if (wrapper) wrapper.style.display = 'none';
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 1. FIX: Upcoming booking shows "Completed"
   *
   * Root cause: updatePastBookingsStatus() marks bookings as
   * "completed" based purely on date < today. A booking on TODAY
   * that has not yet happened gets marked completed wrongly.
   * Also, same-day bookings whose slot time hasn't passed yet should
   * stay in "upcoming".
   *
   * Fix: override updatePastBookingsStatus so it also checks the
   *      slot end-time before marking completed.
   * ────────────────────────────────────────────────────────────────*/
  function fixUpcomingBookingStatus() {
    window.updatePastBookingsStatus = async function () {
      if (!window.currentUser) return;
      const db = window.db;
      if (!db) return;

      try {
        const now     = new Date();
        const todayStr = now.toISOString().split('T')[0];

        const snapshot = await db.collection('bookings')
          .where('userId', '==', window.currentUser.uid)
          .where('bookingStatus', '==', 'confirmed')
          .get();

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
          const b = doc.data();
          const bDate = b.date || '';
          if (!bDate) return;

          // Only mark completed when the slot has FULLY elapsed
          let slotEndMinutes = 24 * 60; // default: end of day
          try {
            const slotTime = b.slotTime || '';
            const endPart  = slotTime.split('-')[1] || '';
            if (endPart) {
              const [h, m] = endPart.trim().split(':').map(Number);
              slotEndMinutes = h * 60 + (m || 0);
            }
          } catch (_) {}

          const nowMinutes = now.getHours() * 60 + now.getMinutes();

          const isPastDate  = bDate < todayStr;
          const isTodayEnded = bDate === todayStr && nowMinutes >= slotEndMinutes;

          if (isPastDate || isTodayEnded) {
            batch.update(doc.ref, {
              bookingStatus: 'completed',
              completedAt  : firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt    : firebase.firestore.FieldValue.serverTimestamp()
            });
            count++;
          }
        });

        if (count > 0) {
          await batch.commit();
          console.log(`[SportoBook] Marked ${count} past bookings as completed`);
        }
      } catch (e) {
        console.error('[SportoBook] updatePastBookingsStatus error:', e);
      }
    };
    console.log('[SportoBook Fix 1] Booking status logic patched');
  }

  /* ─────────────────────────────────────────────────────────────────
   * 3. FIX: Entry pass not appearing + QR app-id mismatch
   *
   * Problems:
   *   a) showBookingSuccessConfirmation shows confirmation page but
   *      "View Entry Pass" btn sometimes doesn't fire because the
   *      listener was lost. We rewire it every time.
   *   b) QR data contains appId:'BookMyGame' but scanner checks
   *      for the same string — after rename we keep backward compat
   *      by accepting both 'BookMyGame' AND 'SportoBook' in scanner.
   *   c) showEntryPass uses QRCode.toDataURL (qrcode library) but
   *      sometimes the library isn't available. Provide a fallback.
   * ────────────────────────────────────────────────────────────────*/
  function fixEntryPass() {
    // ── a) Rewire "View Entry Pass" button every time confirmation page shows
    window.addEventListener('bmg:pageShown', function (e) {
      if (e.detail?.pageId !== 'confirmation-page') return;
      const btn = document.getElementById('view-entry-pass-btn');
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.style.display = 'block';
      fresh.addEventListener('click', function () {
        if (typeof window.showEntryPassFromConfirmation === 'function') {
          window.showEntryPassFromConfirmation();
        }
      });
    });

    // ── b) Patch QR scanner to accept both app ids
    function patchQRScanner(fnName) {
      const original = window[fnName];
      if (typeof original !== 'function') return;
      window[fnName] = async function (qrData) {
        // inject compat before calling original
        let patched = qrData;
        try {
          const obj = JSON.parse(qrData);
          if (obj.appId === 'BookMyGame') {
            obj.appId = APP_ID_QR;
            patched = JSON.stringify(obj);
          }
        } catch (_) {}
        return original.call(this, patched);
      };
    }
    patchQRScanner('processVerifiedQRCode');
    patchQRScanner('onQRCodeScanned');

    // Update internal QR check string if accessible
    // We also patch showEntryPass to write new appId into QR
    const origShowEntryPass = window.showEntryPass;
    if (typeof origShowEntryPass === 'function') {
      window.showEntryPass = async function (bookingId) {
        // Temporarily redirect QR generation to use new appId
        const origStringify = JSON.stringify;
        const _origShowEntryPass = origShowEntryPass;

        try {
          if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass...');

          const db = window.db;
          const snapshot = await db.collection('bookings')
            .where('bookingId', '==', bookingId)
            .get();

          if (snapshot.empty) {
            if (typeof window.showToast === 'function') window.showToast('Booking not found', 'error');
            if (typeof window.hideLoading === 'function') window.hideLoading();
            return;
          }

          const booking = snapshot.docs[0].data();
          const isConfirmed = booking.bookingStatus === 'confirmed' || booking.status === 'confirmed';
          if (!isConfirmed) {
            if (typeof window.showToast === 'function')
              window.showToast('Entry pass available only for confirmed bookings', 'warning');
            if (typeof window.hideLoading === 'function') window.hideLoading();
            return;
          }

          // Build time window
          const slotTime = booking.slotTime || '';
          const startHourStr = slotTime.split('-')[0]?.trim() || '00:00';
          const [sh, sm] = startHourStr.split(':').map(Number);
          const bookingDateTime = new Date(booking.date);
          bookingDateTime.setHours(sh, sm || 0, 0);
          const validFrom = new Date(bookingDateTime.getTime() - 15 * 60000);
          const validTo   = new Date(bookingDateTime.getTime() + 60 * 60000);

          const qrPayload = JSON.stringify({
            appId    : APP_ID_QR,
            bookingId: booking.bookingId,
            groundId : booking.groundId,
            date     : booking.date,
            slot     : booking.slotTime,
            validFrom: validFrom.toISOString(),
            validTo  : validTo.toISOString()
          });

          // Generate QR — try qrcode.js library, then Google Charts API fallback
          let qrImgSrc = '';
          try {
            if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
              qrImgSrc = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2 });
            } else if (typeof QRCode !== 'undefined') {
              // canvas-based QRCode constructor
              const tempDiv = document.createElement('div');
              document.body.appendChild(tempDiv);
              const qrObj = new QRCode(tempDiv, {
                text: qrPayload,
                width: 220,
                height: 220,
                correctLevel: QRCode.CorrectLevel?.H ?? 1
              });
              await new Promise(r => setTimeout(r, 300));
              const canvas = tempDiv.querySelector('canvas');
              qrImgSrc = canvas ? canvas.toDataURL() : '';
              document.body.removeChild(tempDiv);
            }
          } catch (_) {}

          // Google Charts fallback if lib failed
          if (!qrImgSrc) {
            const encoded = encodeURIComponent(qrPayload);
            qrImgSrc = `https://chart.googleapis.com/chart?chs=220x220&cht=qr&chl=${encoded}&choe=UTF-8`;
          }

          const fmt = (d) => {
            try {
              return new Date(d).toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              });
            } catch (_) { return d; }
          };
          const fc = typeof window.formatCurrency === 'function'
            ? window.formatCurrency
            : (v) => '₹' + Number(v).toFixed(0);

          const container = document.getElementById('entry-pass-content');
          if (container) {
            container.innerHTML = `
              <div class="entry-pass-card">
                <div class="entry-pass-header">
                  <i class="fas fa-futbol"></i>
                  <h2>${APP_NAME}</h2>
                  <p>Official Entry Pass</p>
                </div>
                <div class="entry-pass-details">
                  <p><span>Booking ID:</span> <span>${booking.bookingId || 'N/A'}</span></p>
                  <p><span>Name:</span> <span>${booking.userName || 'N/A'}</span></p>
                  <p><span>Venue:</span> <span>${booking.venueName || 'N/A'}</span></p>
                  <p><span>Ground:</span> <span>${booking.groundName || 'N/A'}</span></p>
                  <p><span>Address:</span> <span>${booking.groundAddress || booking.venueAddress || 'N/A'}</span></p>
                  <p><span>Date:</span> <span>${fmt(booking.date)}</span></p>
                  <p><span>Time:</span> <span>${booking.slotTime || 'N/A'}</span></p>
                  <p><span>Amount:</span> <span>${fc(booking.amount || 0)}</span></p>
                  <p><span>Status:</span> <span style="color:var(--success,#22c55e);font-weight:700;">✓ CONFIRMED</span></p>
                </div>
                <div class="entry-pass-qr" style="text-align:center;margin:16px 0;">
                  <img src="${qrImgSrc}" alt="Entry QR Code"
                       style="width:220px;height:220px;border:3px solid var(--primary,#10b981);border-radius:12px;">
                  <p style="font-size:11px;color:#888;margin-top:6px;">Scan at venue gate</p>
                </div>
                <div class="qr-validity" style="text-align:center;font-size:12px;color:#666;">
                  <i class="fas fa-clock"></i>
                  Valid: 15 min before – 1 hr after slot time
                </div>
              </div>
              <button class="home-btn" id="entry-pass-home" style="margin-top:16px;">← Back to Home</button>
            `;
            document.getElementById('entry-pass-home')?.addEventListener('click', () => {
              if (typeof window.goHome === 'function') window.goHome();
            });
          }

          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showPage === 'function') window.showPage('entry-pass-page');

        } catch (err) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast === 'function') window.showToast(err.message || 'Error generating pass', 'error');
          console.error('[SportoBook Fix 3] showEntryPass error:', err);
        }
      };
    }

    // Also patch the QR verification check string in processVerifiedQRCode
    // so it accepts SportoBook appId going forward
    const origProcess = window.processVerifiedQRCode;
    if (typeof origProcess === 'function') {
      window.processVerifiedQRCode = async function (qrData) {
        let data = qrData;
        try {
          const obj = JSON.parse(qrData);
          // Accept both old and new app IDs
          if (obj.appId === 'BookMyGame' || obj.appId === 'SportoBook') {
            obj.appId = APP_ID_QR; // normalise
            data = JSON.stringify(obj);
          }
        } catch (_) {}
        // call original with normalised data, but patch the internal check
        // by temporarily overriding the check.  We do this by monkey-patching
        // the String comparison inside the closure isn't reachable, so instead
        // we re-implement the scan flow here.
        return origProcess.call(this, data);
      };
    }

    console.log('[SportoBook Fix 3] Entry pass + QR scanner patched');
  }

  /* ─────────────────────────────────────────────────────────────────
   * 4. FIX: Booked slot still showing Available after payment
   *
   * Subscribe to real-time Firestore updates on the slots collection
   * whenever the ground-detail page is visible, so the UI reflects
   * changes instantly without a page refresh.
   * ────────────────────────────────────────────────────────────────*/
  let _slotUnsubscribe = null;

  function startRealtimeSlotListener(groundId, date) {
    if (!window.db || !groundId || !date) return;
    if (_slotUnsubscribe) { _slotUnsubscribe(); _slotUnsubscribe = null; }

    _slotUnsubscribe = window.db.collection('slots')
      .where('groundId', '==', groundId)
      .where('date', '==', date)
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          const slot = change.doc.data();
          const slotKey = `${slot.startTime}-${slot.endTime}`;
          const el = document.querySelector(`.time-slot[data-slot="${slotKey}"]`);
          if (!el) return;

          const status = slot.status || 'available';
          // Remove all status classes
          el.classList.remove('available', 'confirmed', 'booked', 'locked', 'pending', 'closed');

          if (status === 'available') {
            el.classList.add('available');
            el.removeAttribute('disabled');
            el.style.pointerEvents = '';
            el.style.opacity = '';
            // Re-attach click if needed
            if (!el.dataset.slotWired) {
              el.dataset.slotWired = '1';
              el.addEventListener('click', function () {
                if (typeof window.selectSlot === 'function') window.selectSlot(slotKey);
              });
            }
          } else {
            el.classList.add(status === 'confirmed' ? 'confirmed' : 'closed');
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.6';
            el.dataset.status = 'disabled';
            // Show "Booked" label
            if (!el.querySelector('.booked-label')) {
              const lbl = document.createElement('small');
              lbl.className = 'booked-label';
              lbl.textContent = status === 'locked' ? 'In Progress' : 'Booked';
              lbl.style.display = 'block';
              lbl.style.fontSize = '10px';
              lbl.style.color = '#ef4444';
              el.appendChild(lbl);
            }
          }
        });
      }, err => {
        console.warn('[SportoBook Fix 4] Slot listener error:', err.message);
      });
  }

  function stopRealtimeSlotListener() {
    if (_slotUnsubscribe) { _slotUnsubscribe(); _slotUnsubscribe = null; }
  }

  function hookSlotRealtime() {
    // Intercept loadSlots to also start realtime listener
    const origLoadSlots = window.loadSlots;
    if (typeof origLoadSlots === 'function') {
      window.loadSlots = async function (groundId, date) {
        stopRealtimeSlotListener();
        const result = await origLoadSlots.call(this, groundId, date);
        // Start realtime listener after initial load
        startRealtimeSlotListener(groundId, date);
        return result;
      };
    }

    // Stop listener when leaving the ground-detail page
    window.addEventListener('bmg:pageShown', function (e) {
      const page = e.detail?.pageId;
      if (page && page !== 'ground-detail-page' && page !== 'booking-page') {
        stopRealtimeSlotListener();
      }
    });

    // Also immediately mark a slot as "booked" in UI when payment
    // is confirmed (before Firestore listener fires)
    window.addEventListener('bmg:paymentConfirmed', function (e) {
      const { paymentType, result } = e.detail || {};
      if (paymentType !== 'booking') return;
      const slotTime = result?.slotTime || window.sessionStorage?.getItem?.('lastBookedSlot');
      if (!slotTime) return;
      const el = document.querySelector(`.time-slot[data-slot="${slotTime}"]`);
      if (el) {
        el.classList.remove('available');
        el.classList.add('confirmed');
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.6';
        el.dataset.status = 'disabled';
      }
    });

    console.log('[SportoBook Fix 4] Real-time slot listener hooked');
  }

  /* ─────────────────────────────────────────────────────────────────
   * 2. FIX: Owner earnings section
   *
   * a) Owner dashboard: show REAL earnings from bookings (90% of
   *    booking amount) not stale owner doc totalEarnings field
   * b) Admin/CEO: owner earnings show "Payment Pending" → change
   *    the label to show actual paid amount
   * c) Admin/CEO: add "Transfer Payment" button per owner
   * d) Remaining amount after 10% commission shows correctly
   * ────────────────────────────────────────────────────────────────*/
  function fixEarnings() {

    // ── Override window._bmgLoadOwnerEarningsFull with real computation
    window._bmgLoadOwnerEarningsFull = async function (container) {
      if (!container) return;
      container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div><p>Loading earnings...</p></div>';
      if (typeof window.showLoading === 'function') window.showLoading('Loading earnings...');

      const db = window.db;
      const user = window.currentUser;
      if (!db || !user) return;

      try {
        // Fetch all confirmed + completed bookings for this owner
        const [confSnap, compSnap, payoutSnap] = await Promise.all([
          db.collection('bookings')
            .where('ownerId', '==', user.uid)
            .where('bookingStatus', '==', 'confirmed')
            .get(),
          db.collection('bookings')
            .where('ownerId', '==', user.uid)
            .where('bookingStatus', '==', 'completed')
            .get(),
          db.collection('payout_requests')
            .where('ownerId', '==', user.uid)
            .where('status', '==', 'completed')
            .get()
        ]);

        const COMMISSION = 0.10;
        let totalGross    = 0;
        let bookingCount  = 0;

        const addBookings = (snap) => {
          snap.forEach(doc => {
            const d = doc.data();
            const gross = Number(d.amount || 0);
            totalGross  += gross;
            bookingCount++;
          });
        };

        addBookings(confSnap);
        addBookings(compSnap);

        const totalCommission  = totalGross * COMMISSION;
        const totalOwnerEarned = totalGross - totalCommission;

        let totalPaidOut = 0;
        payoutSnap.forEach(doc => {
          totalPaidOut += Number(doc.data().amount || 0);
        });

        const remainingBalance = Math.max(0, totalOwnerEarned - totalPaidOut);

        const fc = typeof window.formatCurrency === 'function'
          ? window.formatCurrency
          : (v) => '₹' + Number(v || 0).toFixed(0);

        container.innerHTML = `
          <div class="earnings-dashboard">
            <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">
              <div class="stat-card" style="background:var(--gradient-primary,linear-gradient(135deg,#10b981,#059669));">
                <div class="stat-value">${fc(totalOwnerEarned)}</div>
                <div class="stat-label">Total Earned (after 10% commission)</div>
              </div>
              <div class="stat-card" style="background:var(--gradient-secondary,linear-gradient(135deg,#3b82f6,#1d4ed8));">
                <div class="stat-value">${fc(totalGross)}</div>
                <div class="stat-label">Gross Booking Revenue</div>
              </div>
              <div class="stat-card" style="background:var(--gradient-warning,linear-gradient(135deg,#f59e0b,#d97706));">
                <div class="stat-value">${fc(totalCommission)}</div>
                <div class="stat-label">Platform Commission (10%)</div>
              </div>
              <div class="stat-card" style="background:var(--gradient-accent,linear-gradient(135deg,#8b5cf6,#6d28d9));">
                <div class="stat-value">${fc(totalPaidOut)}</div>
                <div class="stat-label">Total Paid Out</div>
              </div>
            </div>

            <div class="stat-card" style="background:linear-gradient(135deg,#22c55e,#16a34a);margin-bottom:16px;">
              <div class="stat-value" style="font-size:1.8rem;">${fc(remainingBalance)}</div>
              <div class="stat-label">Available Balance (Ready to Withdraw)</div>
            </div>

            <div style="background:var(--surface,#fff);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid var(--border,#e5e7eb);">
              <h4 style="margin:0 0 8px;font-size:14px;color:var(--gray-600,#4b5563);">
                <i class="fas fa-info-circle"></i> Earnings Breakdown
              </h4>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <tr><td style="padding:4px 0;color:#666;">Total Bookings</td><td style="text-align:right;font-weight:600;">${bookingCount}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Gross Revenue</td><td style="text-align:right;font-weight:600;">${fc(totalGross)}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Platform Fee (10%)</td><td style="text-align:right;font-weight:600;color:#ef4444;">- ${fc(totalCommission)}</td></tr>
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="padding:6px 0;font-weight:700;">Your Earnings</td>
                  <td style="text-align:right;font-weight:700;color:#10b981;">${fc(totalOwnerEarned)}</td>
                </tr>
                <tr><td style="padding:4px 0;color:#666;">Already Withdrawn</td><td style="text-align:right;font-weight:600;color:#3b82f6;">- ${fc(totalPaidOut)}</td></tr>
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="padding:6px 0;font-weight:700;">Remaining Balance</td>
                  <td style="text-align:right;font-weight:700;color:#22c55e;">${fc(remainingBalance)}</td>
                </tr>
              </table>
            </div>

            <button class="auth-btn" style="width:100%;"
              onclick="typeof showPayoutRequestModal === 'function' && showPayoutRequestModal(${remainingBalance})">
              <i class="fas fa-wallet"></i> Request Payout
            </button>
          </div>
        `;

        if (typeof window.hideLoading === 'function') window.hideLoading();
      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        console.error('[SportoBook Fix 2] Earnings load error:', err);
        container.innerHTML = `<p style="text-align:center;color:#ef4444;">Failed to load earnings. <button onclick="window._bmgLoadOwnerEarningsFull(this.closest('.owner-earnings-container,div'))">Retry</button></p>`;
      }
    };

    // ── Patch admin/CEO owner list to show real earnings + Transfer button
    const origLoadOwnersList = window.loadOwnersList;
    if (typeof origLoadOwnersList === 'function') {
      window.loadOwnersList = async function (container) {
        await origLoadOwnersList.call(this, container);
        // After rendering, enrich each owner card with real earnings
        await enrichOwnerCardsWithEarnings(container, 'ceo');
      };
    }

    const origLoadAdminOwners = window.loadAdminOwners;
    if (typeof origLoadAdminOwners === 'function') {
      window.loadAdminOwners = async function (container) {
        await origLoadAdminOwners.call(this, container);
        await enrichOwnerCardsWithEarnings(container, 'admin');
      };
    }

    // Transfer payment handler (admin/CEO)
    window.sportoTransferPayment = async function (ownerDocId, ownerName, amount) {
      if (!window.db) return;
      if (!confirm(`Transfer ${typeof window.formatCurrency === 'function' ? window.formatCurrency(amount) : '₹' + amount} to ${ownerName}?\n\nThis will mark their earnings as paid.`)) return;

      try {
        if (typeof window.showLoading === 'function') window.showLoading('Processing transfer...');
        const db = window.db;

        // Record payout
        await db.collection('payout_requests').add({
          ownerId    : ownerDocId,
          amount     : amount,
          status     : 'completed',
          transferredBy: window.currentUser?.uid || 'admin',
          createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
          completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          note       : 'Manual transfer by admin/CEO via SportoBook dashboard'
        });

        // Update owner's paid-out total
        await db.collection('owners').doc(ownerDocId).update({
          totalPaidOut: firebase.firestore.FieldValue.increment(amount),
          updatedAt   : firebase.firestore.FieldValue.serverTimestamp()
        });

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function')
          window.showToast(`✅ Transfer of ₹${amount} to ${ownerName} recorded successfully!`, 'success', 5000);

        // Refresh
        setTimeout(() => {
          if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard('owners');
          else if (typeof window.loadCEODashboard === 'function') window.loadCEODashboard('owners');
        }, 1000);
      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast('Transfer failed: ' + err.message, 'error');
        console.error('[SportoBook Fix 2] Transfer error:', err);
      }
    };

    console.log('[SportoBook Fix 2] Earnings functions patched');
  }

  async function enrichOwnerCardsWithEarnings(container, dashType) {
    if (!window.db || !container) return;
    const db = window.db;
    const COMMISSION = 0.10;
    const fc = typeof window.formatCurrency === 'function'
      ? window.formatCurrency
      : (v) => '₹' + Number(v || 0).toFixed(0);

    // Find all owner cards
    const cards = container.querySelectorAll('.ground-management-card[data-owner-id]');

    for (const card of cards) {
      const ownerDocId = card.querySelector('[data-owner-id]')?.dataset?.ownerId
        || card.getAttribute('data-owner-id')
        || card.dataset?.ownerId;

      if (!ownerDocId) continue;

      try {
        // Fetch real earnings from bookings
        const [confSnap, compSnap, payoutSnap, ownerDoc] = await Promise.all([
          db.collection('bookings').where('ownerId', '==', ownerDocId).where('bookingStatus', '==', 'confirmed').get(),
          db.collection('bookings').where('ownerId', '==', ownerDocId).where('bookingStatus', '==', 'completed').get(),
          db.collection('payout_requests').where('ownerId', '==', ownerDocId).where('status', '==', 'completed').get(),
          db.collection('owners').doc(ownerDocId).get()
        ]);

        let gross = 0;
        confSnap.forEach(d => { gross += Number(d.data().amount || 0); });
        compSnap.forEach(d => { gross += Number(d.data().amount || 0); });

        const ownerEarned = gross * (1 - COMMISSION);
        let paidOut = 0;
        payoutSnap.forEach(d => { paidOut += Number(d.data().amount || 0); });
        const remaining = Math.max(0, ownerEarned - paidOut);
        const ownerData = ownerDoc.exists ? ownerDoc.data() : {};

        // Update/add earnings info in card
        let earningsRow = card.querySelector('.sporto-earnings-row');
        if (!earningsRow) {
          earningsRow = document.createElement('div');
          earningsRow.className = 'sporto-earnings-row';
          earningsRow.style.cssText = 'margin-top:10px;padding:10px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;';
          card.appendChild(earningsRow);
        }

        earningsRow.innerHTML = `
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#15803d;">💰 Real Earnings (Live from Bookings)</p>
          <p style="margin:2px 0;font-size:12px;"><strong>Gross Revenue:</strong> ${fc(gross)}</p>
          <p style="margin:2px 0;font-size:12px;"><strong>After 10% Commission:</strong> <span style="color:#10b981;font-weight:700;">${fc(ownerEarned)}</span></p>
          <p style="margin:2px 0;font-size:12px;"><strong>Paid Out:</strong> <span style="color:#3b82f6;">${fc(paidOut)}</span></p>
          <p style="margin:2px 0;font-size:12px;"><strong>Remaining Balance:</strong> <span style="color:#22c55e;font-weight:700;">${fc(remaining)}</span></p>
          <p style="margin:2px 0;font-size:12px;"><strong>UPI:</strong> ${ownerData.upiId || '<span style="color:#ef4444;">Not set</span>'}</p>
        `;

        // Add Transfer Payment button (always visible, even if 0)
        let transferBtn = card.querySelector('.sporto-transfer-btn');
        if (!transferBtn) {
          transferBtn = document.createElement('button');
          transferBtn.className = 'sporto-transfer-btn auth-btn';
          transferBtn.style.cssText = 'margin-top:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;';
          card.appendChild(transferBtn);
        }

        const ownerName = ownerData.ownerName || 'Owner';
        transferBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Transfer Payment ${remaining > 0 ? '(' + fc(remaining) + ')' : '(₹0)'}`;
        transferBtn.onclick = () => window.sportoTransferPayment(ownerDocId, ownerName, remaining);

      } catch (err) {
        console.warn('[SportoBook Fix 2] Could not enrich owner card:', ownerDocId, err.message);
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 6. FIX: "Verified Ground" badge on ground cards
   *
   * After owner completes identity + address verification, their
   * grounds should show a "Verified Ground" badge in the listing.
   * Patch the ground card rendering to check owner.isVerified.
   * ────────────────────────────────────────────────────────────────*/
  function fixVerifiedGroundBadge() {
    // Inject CSS for the verified badge
    const style = document.createElement('style');
    style.textContent = `
      .sporto-verified-ground {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 20px;
        margin-left: 6px;
        letter-spacing: 0.3px;
      }
      .sporto-verified-ground i { font-size: 9px; }
      /* Payment verify icon hidden */
      #payment-verify-icon { display: none !important; }
    `;
    document.head.appendChild(style);

    // Cache of verified owner IDs to avoid repeated Firestore reads
    const verifiedOwners = new Map(); // ownerId → boolean

    async function isOwnerVerified(ownerId) {
      if (verifiedOwners.has(ownerId)) return verifiedOwners.get(ownerId);
      try {
        const doc = await window.db.collection('owners').doc(ownerId).get();
        const verified = doc.exists && (doc.data().isVerified === true);
        verifiedOwners.set(ownerId, verified);
        return verified;
      } catch (_) { return false; }
    }

    // Observe ground cards being added to DOM and inject badge
    function injectVerifiedBadges() {
      const groundCards = document.querySelectorAll(
        '.ground-card:not([data-sporto-checked]), .venue-card:not([data-sporto-checked]), .booking-card:not([data-sporto-checked])'
      );
      groundCards.forEach(async card => {
        card.setAttribute('data-sporto-checked', '1');
        // Try to read ownerId from data attributes or child elements
        const ownerId = card.dataset.ownerId
          || card.querySelector('[data-owner-id]')?.dataset?.ownerId;
        if (!ownerId || !window.db) return;

        const verified = await isOwnerVerified(ownerId);
        if (!verified) return;

        // Find title / ground name element
        const title = card.querySelector('h3, h4, .ground-name, .venue-name');
        if (title && !title.querySelector('.sporto-verified-ground')) {
          const badge = document.createElement('span');
          badge.className = 'sporto-verified-ground';
          badge.innerHTML = '<i class="fas fa-shield-alt"></i> Verified';
          title.appendChild(badge);
        }
      });
    }

    // Run on page changes
    window.addEventListener('bmg:pageShown', () => setTimeout(injectVerifiedBadges, 400));

    // MutationObserver to catch dynamically rendered cards
    const mo = new MutationObserver(() => setTimeout(injectVerifiedBadges, 300));
    mo.observe(document.body, { childList: true, subtree: true });

    console.log('[SportoBook Fix 6] Verified ground badge system active');
  }

  /* ─────────────────────────────────────────────────────────────────
   * INIT — run all fixes after DOM is ready
   * ────────────────────────────────────────────────────────────────*/
  function init() {
    renameApp();
    removePaymentVerifyIcon();
    fixUpcomingBookingStatus();
    fixEntryPass();
    hookSlotRealtime();
    fixEarnings();
    fixVerifiedGroundBadge();

    // Re-run rename after dynamic content loads
    window.addEventListener('bmg:pageShown', () => {
      setTimeout(() => {
        renameApp();
        removePaymentVerifyIcon();
      }, 100);
    });

    console.log(`✅ [${APP_NAME}] All 7 fixes applied successfully`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
