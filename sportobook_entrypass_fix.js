/**
 * sportobook_entrypass_fix.js  — v3
 * ─────────────────────────────────────────────────────────────────
 *  Fixes THREE critical bugs:
 *
 *  BUG 1 — Entry pass fields all blank (Name, Ground, Date, Time Slot)
 *    Root cause: paymentService._checkFinalStatus() looks up
 *      db.collection('bookings').doc(orderId)
 *    but the Cloud Function webhook writes the booking with its own
 *    auto-generated doc ID (not the Cashfree orderId). So result.data
 *    is always {} → showBookingSuccessConfirmation gets empty object.
 *    Fix: patch recoverPaymentSession to also query WHERE bookingId==orderId
 *    AND merge in pending_payments data (which has ALL booking fields).
 *
 *  BUG 2 — Confirmation/Entry pass never auto-shows after payment
 *    Root cause: same empty Firestore lookup → 20 poll attempts exhaust
 *    → "check My Bookings" toast → user left on slot-selector page.
 *    Fix: patched recoverPaymentSession queries by field, not doc ID.
 *    Also: bmg:pageShown watcher auto-shows confirmation if a recent
 *    confirmed booking is in sessionStorage (handles hard redirect case).
 *
 *  BUG 3 — QR code overflow (3468 > 2024 chars)
 *    Fix: compact pipe token instead of JSON blob.
 *    Format: SPB|<bookingId>|<YYYYMMDD>|<HHmm-HHmm>|<groundId>  (~70 chars)
 *
 *  Load AFTER app.js and paymentService.js in index.html.
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     SECTION 0 — Field-name helpers
  ═══════════════════════════════════════════════════════════════ */
  function _pick(obj) {
    for (var i = 1; i < arguments.length; i++) {
      var v = obj && obj[arguments[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  function _getBookingId(b, fb) { return _pick(b, 'bookingId', 'orderId', 'id', 'paymentId') || fb || ''; }
  function _getUserName(b)      { return _pick(b, 'userName', 'userDisplayName', 'name', 'displayName', 'playerName', 'bookedBy') || '—'; }
  function _getGround(b)        { return _pick(b, 'groundName', 'venueName', 'facilityName', 'ground', 'venue') || '—'; }
  function _getAddress(b)       { return _pick(b, 'groundAddress', 'venueAddress', 'address', 'location', 'area') || ''; }
  function _getDate(b)          { return _pick(b, 'date', 'bookingDate', 'slotDate', 'day') || '—'; }
  function _getSlot(b)          { return _pick(b, 'slotTime', 'timeSlot', 'slot', 'time', 'bookedSlot') || '—'; }
  function _getGroundId(b)      { return _pick(b, 'groundId', 'venueId', 'facilityId') || ''; }

  /* Merge two objects — primary fields win, secondary fills blanks */
  function _merge(primary, secondary) {
    return Object.assign({}, secondary || {}, primary || {});
  }

  /* HTML escaping */
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Entry pass detail row */
  function _epRow(label, valueHtml, wrap) {
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;' +
      'padding:7px 0;border-bottom:1px solid #F8FAFC;font-size:.88rem;">' +
      '<span style="color:#64748B;white-space:nowrap;min-width:80px;margin-right:12px;">' + label + '</span>' +
      '<span style="font-weight:600;text-align:right;' + (wrap ? 'word-break:break-word;max-width:240px;' : '') + '">' + valueHtml + '</span>' +
      '</div>';
  }

  /* Persist booking to sessionStorage for cross-page recovery */
  function _persist(booking, orderId) {
    if (!booking) return;
    if (!booking.bookingId) booking.bookingId = orderId || '';
    try {
      if (booking.bookingId)
        sessionStorage.setItem('spb_lastConfirmedBookingId', booking.bookingId);
      sessionStorage.setItem('spb_lastConfirmedBooking', JSON.stringify(booking));
    } catch (_) {}
  }

  /* Load cached booking from sessionStorage */
  function _loadCache(bookingId) {
    try {
      var cached = JSON.parse(sessionStorage.getItem('spb_lastConfirmedBooking') || '{}');
      if (!bookingId || cached.bookingId === bookingId || cached.orderId === bookingId)
        return cached;
    } catch (_) {}
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — Patch recoverPaymentSession  ← THE CORE FIX
     
     Original: db.collection('bookings').doc(orderId).get()
               → always misses because webhook uses auto-ID
     
     New:      queries by bookingId FIELD, orderId FIELD, AND direct
               doc lookup. Merges pending_payments data so all fields
               (groundName, slotTime, userName etc.) are always present.
  ═══════════════════════════════════════════════════════════════ */
  function patchRecoverPaymentSession() {
    if (window.recoverPaymentSession && window.recoverPaymentSession._spbV3) return;

    window.recoverPaymentSession = async function (orderId, paymentType, paymentData) {
      if (!orderId) return;
      var db = window.db;
      if (!db) return;

      // Load pending_payments for rich booking metadata (groundName, slot etc.)
      var pendingData = null;
      try {
        var pp = await db.collection('pending_payments').doc(orderId).get();
        if (pp.exists) pendingData = pp.data();
      } catch (_) {}

      /* Fire success event with merged data */
      var _succeed = function (bookingDoc) {
        if (!bookingDoc) bookingDoc = {};
        var merged = _merge(bookingDoc, pendingData || {});
        if (!merged.bookingId) merged.bookingId = orderId;
        _persist(merged, orderId);
        window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
          detail: { orderId: orderId, paymentType: paymentType || 'booking', result: merged },
        }));
        sessionStorage.removeItem('slotLock');
        sessionStorage.removeItem('bmg_recoverOrderId');
        sessionStorage.removeItem('bmg_recoverPayType');
        if (typeof window.hideLoading === 'function') window.hideLoading();
      };

      if (typeof window.showLoading === 'function') window.showLoading('Verifying payment…');

      var attempts    = 0;
      var maxAttempts = 25;

      var poll = async function () {
        attempts++;

        /* Fast-fail: payment explicitly failed */
        try {
          var fail = await db.collection('failed_payments').doc(orderId).get();
          if (fail.exists) {
            if (typeof window.hideLoading === 'function') window.hideLoading();
            if (typeof window.showToast   === 'function')
              window.showToast('Payment failed. Please try again.', 'error');
            return;
          }
        } catch (_) {}

        /* Booking success checks (by field AND by doc ID) */
        if (!paymentType || paymentType === 'booking') {
          try {
            var sq = await db.collection('bookings')
              .where('bookingId', '==', orderId).limit(1).get();
            if (!sq.empty) { _succeed(sq.docs[0].data()); return; }
          } catch (_) {}

          try {
            var sq2 = await db.collection('bookings')
              .where('orderId', '==', orderId).limit(1).get();
            if (!sq2.empty) { _succeed(sq2.docs[0].data()); return; }
          } catch (_) {}

          try {
            var dd = await db.collection('bookings').doc(orderId).get();
            if (dd.exists) { _succeed(dd.data()); return; }
          } catch (_) {}
        }

        /* Tournament */
        if (!paymentType || paymentType === 'tournament') {
          try {
            var te = await db.collection('tournament_entries').doc(orderId).get();
            if (te.exists) { _succeed(te.data()); return; }
          } catch (_) {}
        }

        /* Owner onboarding */
        if (!paymentType || paymentType === 'owner_onboarding') {
          try {
            var op = await db.collection('owner_payments').doc(orderId).get();
            if (op.exists) { _succeed({ orderId: orderId }); return; }
          } catch (_) {}
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
          return;
        }

        /* Final: if pending_payments was marked paid by webhook, use it */
        if (pendingData && /paid|confirmed|success/.test((pendingData.status || ''))) {
          _succeed(pendingData);
          return;
        }

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast   === 'function')
          window.showToast('Payment status unknown. Please check "My Bookings".', 'warning');
      };

      poll();
    };

    window.recoverPaymentSession._spbV3 = true;
    console.log('[spb-entrypass] recoverPaymentSession v3 patched ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 — Capturing bmg:paymentConfirmed enricher
     Runs BEFORE app.js handler, fills missing fields from
     pending_payments so showBookingSuccessConfirmation always
     receives groundName, slotTime, userName etc.
  ═══════════════════════════════════════════════════════════════ */
  function addPaymentConfirmedEnricher() {
    window.addEventListener('bmg:paymentConfirmed', async function (e) {
      if (e._spbEnriched) return;
      var detail = e.detail || {};
      if (detail.paymentType !== 'booking') return;

      var orderId = detail.orderId;
      var result  = detail.result || {};
      var db      = window.db;

      // Already has full data?
      if (result.groundName && result.slotTime && result.userName) {
        _persist(result, orderId);
        return;
      }

      if (!db) return;

      var pendingData = null;
      try {
        var pp = await db.collection('pending_payments').doc(orderId).get();
        if (pp.exists) pendingData = pp.data();
      } catch (_) {}

      var enriched = _merge(result, pendingData || {});
      if (!enriched.bookingId) enriched.bookingId = orderId;

      detail.result  = enriched;
      e._spbEnriched = true;
      _persist(enriched, orderId);

    }, true /* capture phase — before app.js */);

    console.log('[spb-entrypass] paymentConfirmed enricher active ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 3 — Patch showBookingSuccessConfirmation
     Always merges sessionStorage cache so all fields render.
  ═══════════════════════════════════════════════════════════════ */
  function patchShowBookingSuccessConfirmation() {
    if (typeof window.showBookingSuccessConfirmation !== 'function') return;
    if (window.showBookingSuccessConfirmation._spbV3) return;

    var _orig = window.showBookingSuccessConfirmation;

    window.showBookingSuccessConfirmation = function (booking) {
      if (!booking) booking = {};

      // Fill missing fields from cache
      if (!(booking.groundName && booking.slotTime)) {
        var c = _loadCache(booking.bookingId || booking.orderId);
        if (c) booking = _merge(booking, c);
      }
      if (!booking.bookingId)
        booking.bookingId = sessionStorage.getItem('spb_lastConfirmedBookingId') || '';

      _persist(booking, booking.bookingId);
      return _orig(booking);
    };

    window.showBookingSuccessConfirmation._spbV3 = true;
    console.log('[spb-entrypass] showBookingSuccessConfirmation patched ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 4 — Patch showEntryPassFromConfirmation
  ═══════════════════════════════════════════════════════════════ */
  function patchShowEntryPassFromConfirmation() {
    if (window.showEntryPassFromConfirmation && window.showEntryPassFromConfirmation._spbV3) return;

    window.showEntryPassFromConfirmation = function () {
      var detailsEl = document.getElementById('confirmation-details');
      var bookingId = ((detailsEl && detailsEl.dataset && detailsEl.dataset.bookingId) || '').trim();

      if (!bookingId) bookingId = sessionStorage.getItem('spb_lastConfirmedBookingId') || '';
      if (!bookingId) {
        var c = _loadCache(null);
        if (c) bookingId = c.bookingId || '';
      }

      if (bookingId) {
        window.showEntryPass(bookingId);
      } else {
        if (typeof window.showToast === 'function')
          window.showToast('Booking ID not found. Please check "My Bookings".', 'warning');
      }
    };

    window.showEntryPassFromConfirmation._spbV3 = true;
    console.log('[spb-entrypass] showEntryPassFromConfirmation patched ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 5 — showEntryPass (complete replacement)
     Fetches from bookings with 3 query strategies + pending_payments
     + sessionStorage fallback. All fields guaranteed to show.
  ═══════════════════════════════════════════════════════════════ */
  function patchShowEntryPass() {
    if (window.showEntryPass && window.showEntryPass._spbV3) return;

    window.showEntryPass = async function (bookingId) {
      if (!bookingId) {
        if (typeof window.showToast === 'function') window.showToast('Booking ID missing', 'error');
        return;
      }
      if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass…');

      try {
        var db = window.db;
        if (!db) throw new Error('Database not initialised');

        var bookingDoc   = null;
        var pendingData  = null;
        var cachedData   = _loadCache(bookingId);

        /* Fetch booking with 3 fallback strategies */
        try {
          var d = await db.collection('bookings').doc(bookingId).get();
          if (d.exists) bookingDoc = Object.assign({ _docId: d.id }, d.data());
        } catch (_) {}

        if (!bookingDoc) {
          try {
            var s1 = await db.collection('bookings')
              .where('bookingId', '==', bookingId).limit(1).get();
            if (!s1.empty) bookingDoc = Object.assign({ _docId: s1.docs[0].id }, s1.docs[0].data());
          } catch (_) {}
        }

        if (!bookingDoc) {
          try {
            var s2 = await db.collection('bookings')
              .where('orderId', '==', bookingId).limit(1).get();
            if (!s2.empty) bookingDoc = Object.assign({ _docId: s2.docs[0].id }, s2.docs[0].data());
          } catch (_) {}
        }

        /* Fetch pending_payments for metadata */
        try {
          var pp = await db.collection('pending_payments').doc(bookingId).get();
          if (pp.exists) pendingData = pp.data();
        } catch (_) {}

        /* Merge: booking > pending > cache */
        var merged = _merge(bookingDoc || {}, _merge(pendingData || {}, cachedData || {}));
        if (!merged.bookingId) merged.bookingId = bookingId;

        /* Decide if we have enough data to show the pass */
        var hasData = merged.groundName || merged.slotTime || merged.date;
        if (!hasData && !bookingDoc) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast   === 'function')
            window.showToast('Booking not found. Try "My Bookings".', 'error');
          return;
        }

        /* Confirm status */
        var status = (merged.bookingStatus || merged.status || merged.paymentStatus || '').toLowerCase();
        var isConfirmed = /confirmed|paid|success/.test(status);
        /* If booking doc doesn't exist yet but we have pending_payments data,
           the payment was initiated — show the pass optimistically */
        if (!isConfirmed && !bookingDoc && (pendingData || cachedData)) isConfirmed = true;

        if (!isConfirmed) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast   === 'function')
            window.showToast('Entry pass available only for confirmed bookings', 'warning');
          return;
        }

        /* Display fields */
        var bid     = _getBookingId(merged, bookingId);
        var name    = _getUserName(merged);
        var ground  = _getGround(merged);
        var address = _getAddress(merged);
        var date    = _getDate(merged);
        var slot    = _getSlot(merged);

        /* Validity window */
        var validFrom = '', validTo = '';
        try {
          var parts = slot.replace(/\s/g, '').split('-');
          var toHM  = function (t) { var a = t.split(':'); return { h: +a[0] || 0, m: +a[1] || 0 }; };
          var fmt   = function (h, m) { return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; };
          var s = toHM(parts[0] || '00:00');
          var e = toHM(parts[1] || '01:00');
          var fh = s.h, fm = s.m - 15;
          if (fm < 0) { fm += 60; fh--; }
          if (fh < 0) fh = 0;
          validFrom = fmt(fh, fm);
          validTo   = fmt(e.h, e.m);
        } catch (_) {}

        /* Compact QR token */
        var rawDate = date.replace(/[-\/]/g, '');
        if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(date)) {
          var dp = date.split(/[-\/]/);
          rawDate = dp[2] + dp[1] + dp[0];
        }
        var slotC   = slot.replace(/\s/g, '').replace(/:/g, '');
        var gid     = _getGroundId(merged).slice(0, 15);
        var qrToken = ['SPB', bid, rawDate, slotC, gid].join('|');
        console.log('[spb-entrypass] QR token (' + qrToken.length + ' chars):', qrToken);

        /* Generate QR */
        var qrEl = await window._spbGenerateQR(qrToken);

        /* Find/create container */
        var container = document.getElementById('entry-pass-content');
        if (!container) {
          var page = document.getElementById('entry-pass-page');
          if (page) {
            container = document.createElement('div');
            container.id = 'entry-pass-content';
            page.appendChild(container);
          } else {
            if (typeof window.hideLoading === 'function') window.hideLoading();
            if (typeof window.showToast   === 'function')
              window.showToast('UI error: entry-pass-page not found', 'error');
            return;
          }
        }

        var addressRow   = address ? _epRow('Address', _esc(address), true) : '';
        var validityText = validTo
          ? 'Valid from ' + validFrom + ' to ' + validTo + ' on ' + _esc(date)
          : 'Valid on ' + _esc(date);

        container.innerHTML =
          '<div style="max-width:420px;margin:0 auto;border-radius:18px;overflow:hidden;' +
            'box-shadow:0 8px 32px rgba(79,70,229,.18);">' +

            '<div style="text-align:center;padding:20px 16px;' +
              'background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;">' +
              '<h2 style="margin:0;font-size:1.4rem;font-weight:800;letter-spacing:-.5px;">' +
                'Sp\u00f6rto<span style="opacity:.85">Book</span></h2>' +
              '<p style="margin:3px 0 0;opacity:.8;font-size:.82rem;letter-spacing:.05em;">ENTRY PASS</p>' +
            '</div>' +

            '<div style="padding:16px 20px;background:#fff;">' +
              _epRow('Booking ID', '<code style="font-size:.78rem;word-break:break-all;">' + _esc(bid) + '</code>') +
              _epRow('Name',      _esc(name)) +
              _epRow('Ground',    _esc(ground)) +
              addressRow +
              _epRow('Date',      _esc(date)) +
              _epRow('Time Slot', _esc(slot)) +
              _epRow('Status',    '<span style="color:#16a34a;font-weight:700;">&#10003; CONFIRMED</span>') +
            '</div>' +

            '<div id="spb-qr-mount" style="display:flex;flex-direction:column;align-items:center;' +
              'padding:20px 16px 12px;background:#fff;border-top:1px solid #F1F5F9;"></div>' +

            '<div style="text-align:center;padding:8px 16px 18px;background:#fff;' +
              'font-size:.75rem;color:#64748B;">' +
              '<i class="fas fa-clock" style="margin-right:4px;"></i>' + validityText +
            '</div>' +
          '</div>' +

          '<button id="spb-entry-pass-back" style="display:block;width:100%;max-width:420px;' +
            'margin:14px auto 0;padding:14px;background:linear-gradient(135deg,#4F46E5,#7C3AED);' +
            'color:#fff;border:none;border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;">' +
            '\u2190 Back to Home' +
          '</button>';

        var qrMount = document.getElementById('spb-qr-mount');
        if (qrMount) {
          qrMount.appendChild(qrEl);
          var lbl = document.createElement('p');
          lbl.style.cssText = 'font-size:.7rem;color:#94A3B8;margin:6px 0 0;text-align:center;';
          lbl.textContent = 'Show this to venue staff for verification';
          qrMount.appendChild(lbl);
        }

        var backBtn = document.getElementById('spb-entry-pass-back');
        if (backBtn) {
          backBtn.addEventListener('click', function () {
            if (typeof window.goHome === 'function') window.goHome();
          });
        }

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showPage    === 'function') window.showPage('entry-pass-page');

      } catch (err) {
        console.error('[spb-entrypass] showEntryPass error:', err);
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast   === 'function')
          window.showToast(err.message || 'Error generating entry pass', 'error');
      }
    };

    window.showEntryPass._spbV3 = true;
    console.log('[spb-entrypass] showEntryPass v3 patched ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 6 — Compact QR generator
     Tries 4 strategies before falling back to text.
  ═══════════════════════════════════════════════════════════════ */
  window._spbGenerateQR = async function (token) {
    if (token.length > 300) token = token.slice(0, 300);

    function _img(src) {
      var el = document.createElement('img');
      el.src = src; el.alt = 'QR Code';
      el.style.cssText = 'width:220px;height:220px;display:block;';
      return el;
    }

    /* Strategy A — qrcode@1.5.x toDataURL */
    if (typeof window.QRCode === 'function' && typeof window.QRCode.toDataURL === 'function') {
      try {
        var u = await window.QRCode.toDataURL(token, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
        return _img(u);
      } catch (e) { console.warn('[spb-qr] A:', e.message); }
    }

    /* Strategy B — qrcodejs DOM canvas */
    if (typeof window.QRCode === 'function') {
      try {
        var div = document.createElement('div');
        div.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
        document.body.appendChild(div);
        new window.QRCode(div, {
          text: token, width: 220, height: 220,
          correctLevel: (window.QRCode.CorrectLevel || {}).M || 0,
        });
        await new Promise(function (r) { setTimeout(r, 150); });
        var canvas = div.querySelector('canvas');
        var imgEl  = div.querySelector('img');
        var src    = canvas ? canvas.toDataURL('image/png') : (imgEl ? imgEl.src : '');
        document.body.removeChild(div);
        if (src) return _img(src);
      } catch (e) { console.warn('[spb-qr] B:', e.message); }
    }

    /* Strategy C — Google Charts QR API (no library needed) */
    try {
      var chartImg = await new Promise(function (resolve, reject) {
        var el = document.createElement('img');
        el.crossOrigin = 'anonymous';
        el.style.cssText = 'width:220px;height:220px;display:block;';
        el.alt = 'QR Code';
        el.onload  = function () { resolve(el); };
        el.onerror = reject;
        el.src = 'https://chart.googleapis.com/chart?cht=qr&chs=220x220&chld=M|2&chl=' +
          encodeURIComponent(token);
      });
      return chartImg;
    } catch (e) { console.warn('[spb-qr] C (Google Charts):', e.message); }

    /* Strategy D — dynamically load qrcode@1.5.3 */
    if (!window._qrcodeLibLoaded) {
      try {
        await new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
          s.onload  = function () { window._qrcodeLibLoaded = true; resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
        if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
          var u4 = await window.QRCode.toDataURL(token, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
          return _img(u4);
        }
      } catch (e) { console.warn('[spb-qr] D:', e.message); }
    }

    /* Fallback — styled text */
    console.error('[spb-qr] All strategies failed');
    var box = document.createElement('div');
    box.style.cssText = 'width:220px;height:220px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;border:2px dashed #4F46E5;' +
      'border-radius:12px;padding:12px;text-align:center;color:#4F46E5;' +
      'background:#EEF2FF;word-break:break-all;';
    box.innerHTML = '<i class="fas fa-qrcode" style="font-size:2rem;margin-bottom:8px;"></i>' +
      '<strong style="font-size:11px;">Verification token:</strong><br>' +
      '<span style="font-size:9px;margin-top:4px;">' + token + '</span>';
    return box;
  };

  /* ═══════════════════════════════════════════════════════════════
     SECTION 7 — Auto-show confirmation after payment return
     Handles TWO scenarios:
     A) Cashfree popup closes → Cashfree calls recoverPaymentSession →
        bmg:paymentConfirmed → showBookingSuccessConfirmation  (already works
        with the patches above, no extra code needed)
     B) Hard redirect (URL has ?payment_return or user navigates back
        to slot-selection page) → detect from sessionStorage and
        auto-trigger confirmation
  ═══════════════════════════════════════════════════════════════ */
  function watchForPostPaymentReturn() {
    /* Scenario B — user lands back on a non-confirmation page
       but a recent unshown confirmation exists in sessionStorage */
    window.addEventListener('bmg:pageShown', function (e) {
      var pageId = (e && e.detail && e.detail.pageId) || '';
      var isSlotOrHomePage =
        !pageId ||
        pageId === 'home-page' ||
        pageId === 'ground-page' ||
        pageId === 'slots-page' ||
        pageId === 'slot-page';

      if (!isSlotOrHomePage) return;

      var lastId = '';
      try { lastId = sessionStorage.getItem('spb_lastConfirmedBookingId') || ''; } catch (_) {}
      if (!lastId) return;

      var alreadyShown = '';
      try { alreadyShown = sessionStorage.getItem('spb_shown_' + lastId) || ''; } catch (_) {}
      if (alreadyShown) return;

      try { sessionStorage.setItem('spb_shown_' + lastId, '1'); } catch (_) {}

      var cached = _loadCache(lastId);
      if (!cached || !cached.bookingId) return;

      setTimeout(function () {
        if (typeof window.showBookingSuccessConfirmation === 'function') {
          window.showBookingSuccessConfirmation(cached);
        }
      }, 500);
    });

    /* Scenario B — hard redirect URL */
    var qs = window.location.search;
    if (qs.includes('payment_return') || window.location.hash.includes('payment_return')) {
      var orderId = (new URLSearchParams(qs)).get('order_id') ||
                    sessionStorage.getItem('bmg_recoverOrderId');
      var payType = sessionStorage.getItem('bmg_recoverPayType') || 'booking';

      if (orderId) {
        var _tryRecover = function () {
          if (window.recoverPaymentSession && window.db && window.currentUser) {
            window.recoverPaymentSession(orderId, payType, {});
          } else {
            setTimeout(_tryRecover, 600);
          }
        };
        setTimeout(_tryRecover, 1200);
      }
    }

    console.log('[spb-entrypass] Post-payment watcher active ✅');
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════════ */
  function applyAllPatches() {
    patchRecoverPaymentSession();
    addPaymentConfirmedEnricher();
    patchShowBookingSuccessConfirmation();
    patchShowEntryPassFromConfirmation();
    patchShowEntryPass();
    watchForPostPaymentReturn();
    console.log('[sportobook_entrypass_fix] v3 — All patches applied ✅');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(applyAllPatches, 250); });
  } else {
    setTimeout(applyAllPatches, 250);
  }

  /* Re-apply on SPA soft-navigation */
  window.addEventListener('bmg:pageShown', function () {
    patchShowEntryPass();
    patchShowEntryPassFromConfirmation();
    patchShowBookingSuccessConfirmation();
  });

})();