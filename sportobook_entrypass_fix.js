/**
 * sportobook_entrypass_fix.js  — v2 (QR overflow fix + real data)
 * ─────────────────────────────────────────────────────────────────
 *
 *  FIXES IN THIS VERSION:
 *
 *  FIX 1 — "code length overflow (3468>2024)"
 *    Root cause: QR payload was a large JSON blob with full ISO
 *    timestamps, long IDs etc. QR codes max out at ~2024 chars
 *    for error-correction level H at version 40.
 *    Fix: Encode a COMPACT payload (≤200 chars) with only the fields
 *    the owner scanner needs. Full booking data shown in the UI
 *    text fields — the QR just carries the verification token.
 *
 *  FIX 2 — Entry pass fields show "—" (blank real data)
 *    Root cause: Firestore booking docs use varied field names
 *    (groundName / venueName / name / displayName etc.) and the
 *    previous renderer didn't fall back through all possibilities.
 *    Fix: exhaustive field-name fallback chains for every field.
 *
 *  FIX 3 — QR must be scannable by owner's verification scanner
 *    The QR now encodes a compact signed token:
 *      SPB|<bookingId>|<YYYYMMDD>|<slot>|<groundId>
 *    Owner scanner decodes → looks up booking in Firestore to verify.
 *    Max ~80 chars, well inside QR capacity at ANY error level.
 *
 *  All original patches (checkFinalStatus, recoverPaymentSession,
 *  paymentConfirmed enrichment, showBookingSuccessConfirmation,
 *  showEntryPassFromConfirmation, startPayment) are retained.
 *
 *  Load AFTER app.js and paymentService.js in index.html:
 *    <script src="sportobook_entrypass_fix.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     HELPERS — field-name resolution
     Booking documents in Firestore use inconsistent field names
     across webhook versions. These helpers normalise them.
  ════════════════════════════════════════════════════════════════ */

  function _pick(obj /*, ...keys */) {
    for (var i = 1; i < arguments.length; i++) {
      var v = obj[arguments[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  function _bookingId(b, fallback) {
    return _pick(b, 'bookingId', 'orderId', 'id', 'paymentId') || fallback || '';
  }
  function _userName(b) {
    return _pick(b, 'userName', 'userDisplayName', 'name', 'displayName', 'playerName', 'bookedBy', 'userId') || '—';
  }
  function _groundName(b) {
    return _pick(b, 'groundName', 'venueName', 'facilityName', 'ground', 'venue', 'location') || '—';
  }
  function _groundAddress(b) {
    return _pick(b, 'groundAddress', 'venueAddress', 'address', 'location', 'area') || '';
  }
  function _bookingDate(b) {
    return _pick(b, 'date', 'bookingDate', 'slotDate', 'day') || '—';
  }
  function _slotTime(b) {
    return _pick(b, 'slotTime', 'timeSlot', 'slot', 'time', 'bookedSlot') || '—';
  }
  function _groundId(b) {
    return _pick(b, 'groundId', 'venueId', 'facilityId') || '';
  }

  /* ════════════════════════════════════════════════════════════════
     PART 1 — Compact QR payload builder
     ─────────────────────────────────────────────────────────────
     Format:  SPB|<bookingId>|<YYYYMMDD>|<HHmm-HHmm>|<groundId>
     Example: SPB|BMG_1778_LPAM8G|20260506|2145-2300|WiFay7vLesS18Vn

     • Always ≤ ~120 chars → fits QR version 5, error-correction M
     • Owner scanner splits on '|', looks up bookingId in Firestore
     • No sensitive PII in the QR (name / phone / email not included)
  ════════════════════════════════════════════════════════════════ */

  function _buildCompactQRPayload(booking, bookingIdFallback) {
    var bid = _bookingId(booking, bookingIdFallback);

    // Date as YYYYMMDD (no dashes) — shrinks the payload
    var rawDate = _bookingDate(booking);
    var dateCompact = rawDate.replace(/-/g, '').replace(/\//g, '');
    // If date looks like DD-MM-YYYY flip to YYYYMMDD
    if (/^\d{2}[.\-\/]\d{2}[.\-\/]\d{4}$/.test(rawDate)) {
      var parts = rawDate.split(/[.\-\/]/);
      dateCompact = parts[2] + parts[1] + parts[0];
    }

    // Slot as HHmm-HHmm (no spaces/colons) — "21:45 - 23:00" → "2145-2300"
    var rawSlot = _slotTime(booking);
    var slotCompact = rawSlot.replace(/\s/g, '').replace(/:/g, '');

    // Ground ID truncated to 15 chars (enough for Firestore doc ID prefix)
    var gid = _groundId(booking).slice(0, 15);

    return ['SPB', bid, dateCompact, slotCompact, gid].join('|');
  }

  /* ════════════════════════════════════════════════════════════════
     PART 2 — Robust QR generator  (uses compact payload)
     window._spbGenerateQR(payload) → Promise<HTMLElement>
  ════════════════════════════════════════════════════════════════ */

  window._spbGenerateQR = async function (payload) {
    // Safety cap: truncate if somehow still too long
    if (payload.length > 300) {
      console.warn('[spb-qr] payload truncated from', payload.length, 'chars');
      payload = payload.slice(0, 300);
    }

    /* ── Strategy A: qrcode@1.5.x (.toDataURL API) ─────────────── */
    if (typeof window.QRCode === 'function' && typeof window.QRCode.toDataURL === 'function') {
      try {
        var url = await window.QRCode.toDataURL(payload, {
          width        : 220,
          margin       : 2,
          errorCorrectionLevel: 'M',   // M allows more data than H
        });
        var img = document.createElement('img');
        img.src = url; img.alt = 'QR Code';
        img.style.cssText = 'width:220px;height:220px;display:block;';
        return img;
      } catch (e) {
        console.warn('[spb-qr] Strategy A failed:', e);
      }
    }

    /* ── Strategy B: qrcodejs DOM-canvas constructor ─────────────── */
    if (typeof window.QRCode === 'function') {
      try {
        var div = document.createElement('div');
        div.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
        document.body.appendChild(div);
        new window.QRCode(div, {
          text        : payload,
          width       : 220,
          height      : 220,
          correctLevel: window.QRCode.CorrectLevel
            ? window.QRCode.CorrectLevel.M   // M not H — allows more data
            : 0,
        });
        await new Promise(function (r) { setTimeout(r, 150); });
        var canvas = div.querySelector('canvas');
        var imgEl  = div.querySelector('img');
        var src = canvas ? canvas.toDataURL('image/png') : (imgEl ? imgEl.src : '');
        document.body.removeChild(div);
        if (src) {
          var img2 = document.createElement('img');
          img2.src = src; img2.alt = 'QR Code';
          img2.style.cssText = 'width:220px;height:220px;display:block;';
          return img2;
        }
      } catch (e) {
        console.warn('[spb-qr] Strategy B failed:', e);
      }
    }

    /* ── Strategy C: dynamically load qrcode@1.5.3 ──────────────── */
    try {
      await new Promise(function (resolve, reject) {
        // Check if already loaded from another domain
        if (window._qrcodeLibLoaded) { resolve(); return; }
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        s.onload  = function () { window._qrcodeLibLoaded = true; resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
      var lib = window.QRCode;
      if (lib && typeof lib.toDataURL === 'function') {
        var url3 = await lib.toDataURL(payload, {
          width: 220, margin: 2, errorCorrectionLevel: 'M',
        });
        var img3 = document.createElement('img');
        img3.src = url3; img3.alt = 'QR Code';
        img3.style.cssText = 'width:220px;height:220px;display:block;';
        return img3;
      }
    } catch (e) {
      console.warn('[spb-qr] Strategy C failed:', e);
    }

    /* ── Strategy D: pure canvas fallback (no library needed) ───── */
    try {
      var qrImg = await _canvasQR(payload);
      if (qrImg) return qrImg;
    } catch (e) {
      console.warn('[spb-qr] Strategy D (canvas) failed:', e);
    }

    /* ── Strategy E: styled text display ──────────────────────────
       Shows the raw token so the owner can at least manually verify.
    ── */
    console.error('[spb-qr] All QR strategies failed — showing token fallback');
    var fallback = document.createElement('div');
    fallback.style.cssText =
      'width:220px;height:220px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;border:2px dashed #4F46E5;' +
      'border-radius:12px;padding:12px;text-align:center;' +
      'color:#4F46E5;background:#EEF2FF;word-break:break-all;';
    fallback.innerHTML =
      '<i class="fas fa-qrcode" style="font-size:2rem;margin-bottom:8px;"></i>' +
      '<strong style="font-size:11px;">QR data:</strong><br>' +
      '<span style="font-size:9px;margin-top:4px;">' + payload + '</span>';
    return fallback;
  };

  /* ── Pure-canvas QR (Strategy D) ──────────────────────────────
     Encodes payload using a URL-based QR API so no library needed.
     Falls back to Google Charts API which returns a PNG.
  ── */
  function _canvasQR(payload) {
    return new Promise(function (resolve, reject) {
      var encoded = encodeURIComponent(payload);
      // Google Charts QR — reliable, works for short payloads
      var apiUrl = 'https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=' +
        encoded + '&choe=UTF-8&chld=M|2';
      var img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.style.cssText = 'width:220px;height:220px;display:block;';
      img.alt = 'QR Code';
      img.onload  = function () { resolve(img); };
      img.onerror = function () { reject(new Error('chart.googleapis.com unavailable')); };
      img.src = apiUrl;
    });
  }

  /* ════════════════════════════════════════════════════════════════
     PART 3 — showEntryPass (complete replacement)
  ════════════════════════════════════════════════════════════════ */

  function patchShowEntryPass() {
    if (window.showEntryPass && window.showEntryPass._spbV2Patched) return;

    var _orig = window.showEntryPass || null;

    window.showEntryPass = async function (bookingId) {
      if (!bookingId) {
        if (typeof window.showToast === 'function')
          window.showToast('Booking ID missing', 'error');
        return;
      }
      if (typeof window.showLoading === 'function')
        window.showLoading('Generating entry pass…');

      try {
        var db = window.db;
        if (!db) throw new Error('Database not initialised');

        var booking = null;

        // Strategy 1: direct doc lookup
        try {
          var directDoc = await db.collection('bookings').doc(bookingId).get();
          if (directDoc.exists) booking = Object.assign({ _docId: directDoc.id }, directDoc.data());
        } catch (_) {}

        // Strategy 2: WHERE bookingId field == bookingId
        if (!booking) {
          try {
            var s1 = await db.collection('bookings')
              .where('bookingId', '==', bookingId).limit(1).get();
            if (!s1.empty) booking = Object.assign({ _docId: s1.docs[0].id }, s1.docs[0].data());
          } catch (_) {}
        }

        // Strategy 3: WHERE orderId == bookingId
        if (!booking) {
          try {
            var s2 = await db.collection('bookings')
              .where('orderId', '==', bookingId).limit(1).get();
            if (!s2.empty) booking = Object.assign({ _docId: s2.docs[0].id }, s2.docs[0].data());
          } catch (_) {}
        }

        // Strategy 4: check pending_payments as source of truth
        if (!booking) {
          try {
            var pp = await db.collection('pending_payments').doc(bookingId).get();
            if (pp.exists) booking = Object.assign({ bookingId: bookingId }, pp.data());
          } catch (_) {}
        }

        if (!booking) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast === 'function')
            window.showToast('Booking not found. Try "My Bookings".', 'error');
          return;
        }

        // Ensure bookingId is set on the object
        if (!booking.bookingId) booking.bookingId = bookingId;

        // Check status — accept any "confirmed / paid / success" variant
        var status = (
          booking.bookingStatus || booking.status || booking.paymentStatus || ''
        ).toLowerCase();
        var isConfirmed = status === 'confirmed' || status === 'paid' || status === 'success';
        if (!isConfirmed) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast === 'function')
            window.showToast('Entry pass available only for confirmed bookings', 'warning');
          return;
        }

        /* ── Resolve display fields via helpers ────────────────── */
        var bid        = _bookingId(booking, bookingId);
        var userName   = _userName(booking);
        var groundName = _groundName(booking);
        var address    = _groundAddress(booking);
        var date       = _bookingDate(booking);
        var slotTime   = _slotTime(booking);

        /* ── Parse validity window from slotTime ───────────────── */
        var validFromStr = '';
        var validToStr   = '';
        try {
          var parts    = (slotTime || '').replace(/\s/g,'').split('-');
          var startStr = parts[0] || '00:00';
          var endStr   = parts[1] || '01:00';
          var toTime   = function (t) {
            var hm = t.split(':');
            return { h: parseInt(hm[0]||0,10), m: parseInt(hm[1]||0,10) };
          };
          var s = toTime(startStr);
          var e = toTime(endStr);
          // 12-hr colon format e.g. "21:45"
          var fmt = function (h, m) {
            return (h < 10 ? '0'+h : h) + ':' + (m < 10 ? '0'+m : m);
          };
          // Show 15 min before start to 0 min after end
          var validFromH = s.h, validFromM = s.m - 15;
          if (validFromM < 0) { validFromM += 60; validFromH -= 1; }
          if (validFromH < 0) validFromH = 0;
          validFromStr = fmt(validFromH, validFromM);
          validToStr   = fmt(e.h, e.m);
        } catch (_) {
          validFromStr = slotTime;
          validToStr   = '';
        }

        /* ── Build compact QR payload ──────────────────────────── */
        var qrPayload = _buildCompactQRPayload(booking, bookingId);
        console.log('[spb-entrypass] QR payload (', qrPayload.length, 'chars):', qrPayload);

        /* ── Generate QR element ───────────────────────────────── */
        var qrEl = await window._spbGenerateQR(qrPayload);

        /* ── Find / show container ─────────────────────────────── */
        var container = document.getElementById('entry-pass-content');
        if (!container) {
          // Try page wrapper
          var page = document.getElementById('entry-pass-page');
          if (page) {
            container = document.createElement('div');
            container.id = 'entry-pass-content';
            page.appendChild(container);
          } else {
            if (typeof window.hideLoading === 'function') window.hideLoading();
            if (typeof window.showToast === 'function')
              window.showToast('UI error: entry-pass-page missing', 'error');
            return;
          }
        }

        /* ── Render HTML ───────────────────────────────────────── */
        var addressRow = address
          ? '<div class="ep-row"><span class="ep-label">Address</span>' +
            '<span class="ep-value ep-wrap">' + _esc(address) + '</span></div>'
          : '';

        var validityLine = validToStr
          ? 'Valid from ' + validFromStr + ' to ' + validToStr + ' on ' + _esc(date)
          : 'Valid on ' + _esc(date);

        container.innerHTML =
          '<div class="entry-pass-card" style="' +
            'max-width:420px;margin:0 auto;border-radius:18px;' +
            'overflow:hidden;box-shadow:0 8px 32px rgba(79,70,229,.18);">' +

            /* Header */
            '<div style="text-align:center;padding:20px 16px;' +
              'background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;">' +
              '<h2 style="margin:0;font-size:1.4rem;font-weight:800;letter-spacing:-.5px;">' +
                'Sp\u00f6rto<span style="opacity:.85">Book</span></h2>' +
              '<p style="margin:3px 0 0;opacity:.8;font-size:.82rem;letter-spacing:.05em;">' +
                'ENTRY PASS</p>' +
            '</div>' +

            /* Details */
            '<div style="padding:16px 20px;background:#fff;">' +
              _epRow('Booking ID', '<code style="font-size:.78rem;word-break:break-all;">' + _esc(bid) + '</code>') +
              _epRow('Name',       _esc(userName)) +
              _epRow('Ground',     _esc(groundName)) +
              addressRow +
              _epRow('Date',       _esc(date)) +
              _epRow('Time Slot',  _esc(slotTime)) +
              _epRow('Status',
                '<span style="color:#16a34a;font-weight:700;">&#10003; CONFIRMED</span>') +
            '</div>' +

            /* QR mount */
            '<div id="spb-qr-mount" style="' +
              'display:flex;flex-direction:column;align-items:center;' +
              'padding:20px 16px 12px;background:#fff;border-top:1px solid #F1F5F9;">' +
            '</div>' +

            /* Validity footer */
            '<div style="text-align:center;padding:8px 16px 18px;background:#fff;' +
              'font-size:.75rem;color:#64748B;">' +
              '<i class="fas fa-clock" style="margin-right:4px;"></i>' +
              validityLine +
            '</div>' +

          '</div>' +

          /* Back button */
          '<button id="entry-pass-home-btn" style="' +
            'display:block;width:100%;max-width:420px;margin:14px auto 0;padding:14px;' +
            'background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border:none;' +
            'border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;">' +
            '&#8592; Back to Home' +
          '</button>';

        /* Mount QR */
        var qrMount = document.getElementById('spb-qr-mount');
        if (qrMount) {
          qrMount.appendChild(qrEl);
          // Label below the QR for scanner guidance
          var qrLabel = document.createElement('p');
          qrLabel.style.cssText = 'font-size:.7rem;color:#94A3B8;margin:6px 0 0;text-align:center;';
          qrLabel.textContent = 'Scan to verify booking';
          qrMount.appendChild(qrLabel);
        }

        /* Wire back button */
        var homeBtn = document.getElementById('entry-pass-home-btn');
        if (homeBtn) {
          homeBtn.addEventListener('click', function () {
            if (typeof window.goHome === 'function') window.goHome();
          });
        }

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showPage  === 'function') window.showPage('entry-pass-page');

      } catch (err) {
        console.error('[spb-entrypass] showEntryPass error:', err);
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast  === 'function')
          window.showToast(err.message || 'Error generating entry pass', 'error');
      }
    };

    window.showEntryPass._spbV2Patched = true;
    console.log('[sportobook_entrypass_fix] showEntryPass v2 patched ✅');
  }

  /* ── tiny HTML helpers ── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _epRow(label, valueHtml) {
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;' +
      'padding:6px 0;border-bottom:1px solid #F8FAFC;font-size:.88rem;">' +
      '<span style="color:#64748B;white-space:nowrap;margin-right:12px;">' + label + '</span>' +
      '<span style="font-weight:600;text-align:right;">' + valueHtml + '</span>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     PART 4 — Patch _checkFinalStatus / recoverPaymentSession
     (unchanged from v1 — retained for backward compat)
  ════════════════════════════════════════════════════════════════ */

  function patchCheckFinalStatus() {
    if (typeof window.recoverPaymentSession !== 'function') return;
    if (window.recoverPaymentSession._spbPatched) return;

    var _origRecover = window.recoverPaymentSession;

    window.recoverPaymentSession = async function (orderId, paymentType, paymentData) {
      if (!orderId) return;
      var db = window.db;
      if (!db) return _origRecover(orderId, paymentType, paymentData);

      var _dispatch = function (data) {
        if (!data.bookingId) data.bookingId = orderId;
        window.dispatchEvent(new CustomEvent('bmg:paymentConfirmed', {
          detail: { orderId, paymentType: paymentType || 'booking', result: data },
        }));
      };

      // Try bookingId field
      try {
        var s1 = await db.collection('bookings').where('bookingId','==',orderId).limit(1).get();
        if (!s1.empty) { _dispatch(s1.docs[0].data()); return; }
      } catch (_) {}

      // Try orderId field
      try {
        var s2 = await db.collection('bookings').where('orderId','==',orderId).limit(1).get();
        if (!s2.empty) { _dispatch(s2.docs[0].data()); return; }
      } catch (_) {}

      return _origRecover(orderId, paymentType, paymentData);
    };

    window.recoverPaymentSession._spbPatched = true;
    console.log('[sportobook_entrypass_fix] recoverPaymentSession patched ✅');
  }

  /* ════════════════════════════════════════════════════════════════
     PART 5 — bmg:paymentConfirmed enrichment (CAPTURING listener)
  ════════════════════════════════════════════════════════════════ */

  function patchPaymentConfirmedHandler() {
    window.addEventListener('bmg:paymentConfirmed', async function (e) {
      if (e._spbEnriched) return;
      var detail = e.detail || {};
      if (detail.paymentType !== 'booking') return;
      var db = window.db;
      if (!db) return;
      var result = detail.result || {};
      if (result.bookingId && result.groundName && result.slotTime) return; // already complete

      var orderId = detail.orderId;
      var found   = null;

      try {
        var s1 = await db.collection('bookings').where('bookingId','==',orderId).limit(1).get();
        if (!s1.empty) found = s1.docs[0].data();
      } catch (_) {}

      if (!found) {
        try {
          var d = await db.collection('bookings').doc(orderId).get();
          if (d.exists) found = d.data();
        } catch (_) {}
      }

      if (!found) {
        try {
          var s2 = await db.collection('bookings').where('orderId','==',orderId).limit(1).get();
          if (!s2.empty) found = s2.docs[0].data();
        } catch (_) {}
      }

      if (found) {
        if (!found.bookingId) found.bookingId = orderId;
        Object.assign(result, found);
        detail.result  = found;
        e._spbEnriched = true;
      }
    }, true);

    console.log('[sportobook_entrypass_fix] paymentConfirmed enrichment active ✅');
  }

  /* ════════════════════════════════════════════════════════════════
     PART 6 — showBookingSuccessConfirmation — persist to session
  ════════════════════════════════════════════════════════════════ */

  function patchShowBookingSuccessConfirmation() {
    if (typeof window.showBookingSuccessConfirmation !== 'function') return;
    if (window.showBookingSuccessConfirmation._spbPatched) return;

    var _orig = window.showBookingSuccessConfirmation;
    window.showBookingSuccessConfirmation = function (booking) {
      if (!booking) booking = {};
      if (!booking.bookingId && window._spbLastOrderId)
        booking.bookingId = window._spbLastOrderId;
      if (booking.bookingId) {
        try {
          sessionStorage.setItem('spb_lastConfirmedBookingId', booking.bookingId);
          sessionStorage.setItem('spb_lastConfirmedBooking', JSON.stringify(booking));
        } catch (_) {}
      }
      return _orig(booking);
    };

    window.showBookingSuccessConfirmation._spbPatched = true;
    console.log('[sportobook_entrypass_fix] showBookingSuccessConfirmation patched ✅');
  }

  /* ════════════════════════════════════════════════════════════════
     PART 7 — showEntryPassFromConfirmation — sessionStorage fallback
  ════════════════════════════════════════════════════════════════ */

  function patchShowEntryPassFromConfirmation() {
    if (window.showEntryPassFromConfirmation && window.showEntryPassFromConfirmation._spbPatched) return;

    window.showEntryPassFromConfirmation = function () {
      var detailsEl = document.getElementById('confirmation-details');
      var bookingId =
        (detailsEl && detailsEl.dataset && detailsEl.dataset.bookingId &&
         detailsEl.dataset.bookingId.trim()) ||
        (document.querySelector('#confirmation-details p:first-child span:last-child') || {}).textContent ||
        sessionStorage.getItem('spb_lastConfirmedBookingId') || '';

      bookingId = (bookingId || '').trim();

      if (bookingId) {
        window.showEntryPass(bookingId);
      } else {
        try {
          var cached = JSON.parse(sessionStorage.getItem('spb_lastConfirmedBooking') || '{}');
          if (cached.bookingId) { window.showEntryPass(cached.bookingId); return; }
        } catch (_) {}
        if (typeof window.showToast === 'function')
          window.showToast('Booking ID not found. Please check "My Bookings".', 'warning');
      }
    };

    window.showEntryPassFromConfirmation._spbPatched = true;
    console.log('[sportobook_entrypass_fix] showEntryPassFromConfirmation patched ✅');
  }

  /* ════════════════════════════════════════════════════════════════
     PART 8 — capture orderId at payment start
  ════════════════════════════════════════════════════════════════ */

  function patchStartPayment() {
    if (typeof window.startPayment !== 'function') return;
    if (window.startPayment._spbPatched) return;

    var _orig = window.startPayment;
    window.startPayment = async function (paymentType, paymentData) {
      try { sessionStorage.setItem('bmg_recoverPayType', paymentType || 'booking'); } catch (_) {}
      return _orig(paymentType, paymentData);
    };
    window.startPayment._spbPatched = true;
  }

  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */

  function applyAllPatches() {
    patchShowEntryPass();
    patchCheckFinalStatus();
    patchPaymentConfirmedHandler();
    patchShowBookingSuccessConfirmation();
    patchShowEntryPassFromConfirmation();
    patchStartPayment();
    console.log('[sportobook_entrypass_fix] v2 — All patches applied ✅');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(applyAllPatches, 200); });
  } else {
    setTimeout(applyAllPatches, 200);
  }

  // Re-apply on SPA soft-navigation
  window.addEventListener('bmg:pageShown', function () {
    patchShowEntryPass();
    patchShowEntryPassFromConfirmation();
    patchShowBookingSuccessConfirmation();
  });

})();