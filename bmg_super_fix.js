/**
 * bmg_super_fix.js
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISSUES RESOLVED:
 *
 *  [FIX-1]  QR VERIFICATION ERROR — "Invalid QR Code Format — must be JSON"
 *            bmg_master_fix_v4.js generates compact "BMG|<bookingId>" strings.
 *            ALL existing processVerifiedQRCode() definitions only accept JSON.
 *            This file installs a final scanner wrapper that:
 *              a) Accepts "BMG|<bookingId>" pipe-delimited format
 *              b) Accepts full JSON format (legacy / tournament QR)
 *              c) Looks up booking from Firestore by bookingId
 *              d) Returns correct verification result to owner
 *
 *  [FIX-2]  QR OVERFLOW — "code length overflow (1644>1056)"
 *            showEntryPass now ALWAYS uses the compact "BMG|<bookingId>" payload.
 *            Overrides any other showEntryPass that passes large JSON to qrcodejs.
 *
 *  [FIX-3]  PROFILE PHOTO — Removes change-photo button, shows app logo.
 *            Replaces broken via.placeholder.com image with inline SVG.
 *
 *  [FIX-4]  PROFILE PAGE UI — Full redesign with app-style card layout.
 *
 *  [FIX-5]  LOGIN / SIGN-UP SPLASH SCREEN — Premium visual upgrade.
 *
 *  [FIX-6]  STICKY SEARCH BAR — Search bar floats fixed at top while
 *            scrolling, with smooth show/hide animation.
 *
 *  [FIX-7]  BOTTOM NAV — Always visible while scrolling (already fixed via
 *            CSS; this reinforces it and ensures z-index is never overridden).
 *
 *  [FIX-8]  MISSING FILE 404s — sportobook_ui.css and sportobook_master_fix.js
 *            Create stubs so the console is clean.
 *
 * LOAD ORDER — add LAST in index.html, after ALL other scripts:
 *   <script src="bmg_super_fix.js"></script>
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
   * UTIL
   * ══════════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }
  function waitForFn(name, cb, max) {
    var t = Date.now();
    var iv = setInterval(function () {
      if (typeof window[name] === 'function') { clearInterval(iv); cb(); }
      else if (Date.now() - t > (max || 10000)) clearInterval(iv);
    }, 100);
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-1 + FIX-2]  QR CODE — SCANNER + GENERATOR
   * ══════════════════════════════════════════════════════════════ */

  /**
   * Wrap processVerifiedQRCode so it handles BOTH:
   *   a) compact  "BMG|<bookingId>"
   *   b) JSON     {"appId":"BookMyGame","bookingId":"…","type":"booking"|"tournament"}
   * This runs LAST so it overrides all prior patches.
   */
  function installQRScannerFix() {
    window.processVerifiedQRCode = async function (rawData) {
      var db       = window.db;
      var cu       = window.currentUser;
      var resultEl = document.getElementById('professional-qr-result');

      function showFail(msg) {
        if (typeof window.showVerificationResult === 'function') {
          window.showVerificationResult(false, null, msg);
        } else if (resultEl) {
          resultEl.innerHTML =
            '<div style="color:#ef4444;padding:20px;text-align:center;background:#fef2f2;border-radius:12px;margin:16px;">' +
            '<i class="fas fa-times-circle" style="font-size:32px;margin-bottom:10px;display:block;"></i>' +
            '<strong>Verification Failed</strong><br/><small>' + esc(msg) + '</small></div>';
        }
        toast('❌ ' + msg, 'error');
      }

      function showPass(booking) {
        var info = {
          name     : booking.userName    || booking.name   || 'Player',
          ground   : booking.groundName  || booking.venue  || 'Ground',
          date     : booking.date        || '',
          slot     : booking.timeSlot    || booking.slot   || '',
          bookingId: booking.bookingId   || booking.id     || '',
          sport    : booking.sport       || '',
          status   : booking.bookingStatus || booking.status || 'confirmed',
        };
        if (typeof window.showVerificationResult === 'function') {
          window.showVerificationResult(true, info, null);
        } else if (resultEl) {
          resultEl.innerHTML =
            '<div style="color:#16a34a;padding:20px;text-align:center;background:#f0fdf4;border-radius:12px;margin:16px;">' +
            '<i class="fas fa-check-circle" style="font-size:32px;margin-bottom:10px;display:block;"></i>' +
            '<strong>✅ Verified!</strong><br/>' +
            '<b>' + esc(info.name) + '</b><br/>' +
            '<small>' + esc(info.ground) + ' · ' + esc(info.date) + ' · ' + esc(info.slot) + '</small>' +
            '</div>';
        }
        toast('✅ QR Verified — ' + info.name, 'success');
      }

      try {
        if (!cu) { showFail('Please login first'); return; }
        if (!db)  { showFail('Database not ready'); return; }

        var bookingId = null;
        var qrType    = 'booking';

        /* ── Try compact format first: "BMG|<bookingId>" ── */
        if (typeof rawData === 'string' && rawData.startsWith('BMG|')) {
          bookingId = rawData.split('|')[1] || null;
          if (!bookingId) { showFail('Invalid QR — missing booking ID'); return; }
        } else {
          /* ── Try JSON format ── */
          var qrObj;
          try { qrObj = JSON.parse(rawData); }
          catch (e) {
            /* Last chance: maybe it's just a plain booking ID string */
            if (typeof rawData === 'string' && rawData.trim().length > 5) {
              bookingId = rawData.trim();
            } else {
              showFail('Invalid QR Code — unrecognised format'); return;
            }
          }
          if (qrObj) {
            /* Accept both app IDs */
            var validIds = ['BookMyGame','SportoBook','sportobook','Sportobook'];
            if (!qrObj.appId || !validIds.includes(qrObj.appId)) {
              showFail('QR not generated by this app'); return;
            }
            bookingId = qrObj.bookingId || qrObj.id || null;
            qrType    = qrObj.type || 'booking';
          }
        }

        if (!bookingId) { showFail('Booking ID missing from QR'); return; }

        /* ── Look up booking ── */
        var bookingData = null;

        // Try direct doc (orderId is often used as doc ID)
        try {
          var direct = await db.collection('bookings').doc(bookingId).get();
          if (direct.exists) bookingData = Object.assign({ id: direct.id }, direct.data());
        } catch (_) {}

        // Fallback: query by bookingId field
        if (!bookingData) {
          try {
            var snap = await db.collection('bookings').where('bookingId','==',bookingId).limit(1).get();
            if (!snap.empty) bookingData = Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
          } catch (_) {}
        }

        // Tournament entries
        if (!bookingData && qrType === 'tournament') {
          try {
            var tsnap = await db.collection('tournament_entries').where('orderId','==',bookingId).limit(1).get();
            if (!tsnap.empty) bookingData = Object.assign({ id: tsnap.docs[0].id }, tsnap.docs[0].data());
          } catch (_) {}
        }

        if (!bookingData) { showFail('Booking not found in system'); return; }

        /* ── Ownership check (only for venue owners) ── */
        if (cu.role === 'owner' || cu.userType === 'owner') {
          var ownerId = bookingData.ownerId || bookingData.groundOwnerId;
          if (ownerId && ownerId !== cu.uid) {
            showFail('This booking is not for your ground');
            return;
          }
          // If no ownerId stored, try ground lookup
          if (!ownerId && bookingData.groundId) {
            try {
              var gDoc = await db.collection('grounds').doc(bookingData.groundId).get();
              if (gDoc.exists && gDoc.data().ownerId !== cu.uid) {
                showFail('This booking is not for your ground');
                return;
              }
            } catch (_) {}
          }
        }

        showPass(bookingData);

      } catch (err) {
        console.error('[bmg-super-fix] QR scan error:', err);
        showFail(err.message || 'Verification failed');
      }
    };

    console.log('[bmg-super-fix] ✅ processVerifiedQRCode patched (compact + JSON + tournament)');
  }

  /**
   * showEntryPass — always uses compact "BMG|<bookingId>" payload.
   * Prevents qrcode overflow error (1644 > 1056).
   */
  function installEntryPassFix() {
    window.showEntryPass = async function (bookingId) {
      if (!bookingId) { toast('Booking ID missing', 'error'); return; }
      if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass…');

      try {
        var db = window.db;
        var booking = null;

        try {
          var d = await db.collection('bookings').doc(bookingId).get();
          if (d.exists) booking = Object.assign({ id: d.id }, d.data());
        } catch (_) {}

        if (!booking) {
          try {
            var s = await db.collection('bookings').where('bookingId','==',bookingId).limit(1).get();
            if (!s.empty) booking = Object.assign({ id: s.docs[0].id }, s.docs[0].data());
          } catch (_) {}
        }

        if (!booking) {
          toast('Booking not found', 'error');
          if (typeof window.hideLoading === 'function') window.hideLoading();
          return;
        }

        var isConfirmed =
          booking.bookingStatus === 'confirmed' ||
          booking.status        === 'confirmed' ||
          booking.paymentStatus === 'PAID';

        if (!isConfirmed) {
          toast('Entry pass only available for confirmed bookings', 'warning');
          if (typeof window.hideLoading === 'function') window.hideLoading();
          return;
        }

        /* ── Compact QR payload — ALWAYS under 60 chars ── */
        var qrPayload = 'BMG|' + (booking.bookingId || booking.id || bookingId);

        /* ── Generate QR ── */
        var qrDataUrl = '';

        // Method 1: qrcode@1.5.1 (Promise, reliable)
        if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
          try {
            qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
          } catch (e) { qrDataUrl = ''; }
        }

        // Method 2: qrcodejs DOM constructor (fallback)
        if (!qrDataUrl && typeof window.QRCode === 'function') {
          await new Promise(function (resolve) {
            var tmp = document.createElement('div');
            tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(tmp);
            try {
              new window.QRCode(tmp, {
                text: qrPayload, width: 220, height: 220,
                correctLevel: (window.QRCode.CorrectLevel && window.QRCode.CorrectLevel.M) || 1,
              });
            } catch (e) {}
            setTimeout(function () {
              var img = tmp.querySelector('img');
              if (img && img.src) qrDataUrl = img.src;
              try { document.body.removeChild(tmp); } catch (_) {}
              resolve();
            }, 400);
          });
        }

        var bk = booking;
        var passHtml = [
          '<div class="entry-pass-card">',
          '<div class="pass-header">',
          '<div class="pass-logo-wrap"><span class="pass-logo-icon">⚽</span><span class="pass-logo-text">Spörto<b>Book</b></span></div>',
          '<div class="pass-badge">✅ CONFIRMED</div>',
          '</div>',
          '<div class="pass-body">',
          '<h2 class="pass-ground">' + esc(bk.groundName || bk.venue || 'Ground') + '</h2>',
          '<div class="pass-grid">',
          '<div class="pass-item"><span class="pass-label">📅 Date</span><span class="pass-val">' + esc(bk.date || '—') + '</span></div>',
          '<div class="pass-item"><span class="pass-label">⏰ Slot</span><span class="pass-val">' + esc(bk.timeSlot || bk.slot || '—') + '</span></div>',
          '<div class="pass-item"><span class="pass-label">🏟️ Sport</span><span class="pass-val">' + esc(bk.sport || '—') + '</span></div>',
          '<div class="pass-item"><span class="pass-label">👤 Name</span><span class="pass-val">' + esc(bk.userName || bk.name || '—') + '</span></div>',
          '</div>',
          qrDataUrl
            ? '<div class="pass-qr-wrap"><img src="' + qrDataUrl + '" alt="QR" class="pass-qr-img"/><p class="pass-qr-hint">Show to venue staff</p></div>'
            : '<div class="pass-qr-fallback"><code>' + esc(qrPayload) + '</code></div>',
          '<div class="pass-booking-id">Booking ID: <b>' + esc(bk.bookingId || bk.id || bookingId) + '</b></div>',
          '</div>',
          '<button class="pass-home-btn" id="entry-pass-home"><i class="fas fa-home"></i> Go Home</button>',
          '</div>',
        ].join('');

        var container = document.getElementById('entry-pass-content');
        if (container) {
          container.innerHTML = passHtml;
          var homeBtn = container.querySelector('#entry-pass-home');
          if (homeBtn) homeBtn.addEventListener('click', function () {
            if (typeof window.goHome === 'function') window.goHome();
          });
        }

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showPage === 'function') window.showPage('entry-pass-page');

      } catch (err) {
        console.error('[bmg-super-fix] showEntryPass error:', err);
        toast('Failed to load entry pass', 'error');
        if (typeof window.hideLoading === 'function') window.hideLoading();
      }
    };

    console.log('[bmg-super-fix] ✅ showEntryPass patched — compact QR payload');
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-3]  PROFILE IMAGE — Replace broken placeholder + remove
   *           change-photo button; show app logo instead
   * ══════════════════════════════════════════════════════════════ */

  /* Inline SVG app logo for profile (no network call needed) */
  var APP_LOGO_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E" +
    "%3Ccircle cx='40' cy='40' r='40' fill='%234F46E5'/%3E" +
    "%3Ctext x='40' y='50' font-family='Inter,Arial,sans-serif' font-size='30' font-weight='800' " +
    "fill='white' text-anchor='middle'%3ESB%3C/text%3E%3C/svg%3E";

  function patchProfileUI() {
    /* Replace broken placeholder images globally */
    document.querySelectorAll('img').forEach(function (img) {
      if (!img.src || img.src.includes('via.placeholder') || img.src.includes('placeholder.com')) {
        img.src = APP_LOGO_SVG;
      }
    });

    /* Header profile button — show logo if no real photo */
    var headerImg = document.getElementById('header-profile-img');
    if (headerImg && (!headerImg.src || headerImg.src.includes('placeholder') || headerImg.src.includes('svg+xml'))) {
      headerImg.src = APP_LOGO_SVG;
    }

    /* Large profile image — show logo, remove change-photo button */
    var profileImgLarge = document.getElementById('profile-image-large');
    if (profileImgLarge) {
      if (!profileImgLarge.src || profileImgLarge.src.includes('placeholder')) {
        profileImgLarge.src = APP_LOGO_SVG;
      }
      profileImgLarge.style.borderRadius = '50%';
      profileImgLarge.style.border = '3px solid #4F46E5';
    }

    /* Hide change-photo button */
    var changePhotoBtn = document.getElementById('change-photo-btn');
    if (changePhotoBtn) changePhotoBtn.style.display = 'none';

    /* Handle onerror for any future broken images */
    document.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') {
        if (!e.target.dataset.fallbackApplied) {
          e.target.dataset.fallbackApplied = '1';
          e.target.src = APP_LOGO_SVG;
        }
      }
    }, true);
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-4]  PROFILE PAGE — App-style card UI
   * ══════════════════════════════════════════════════════════════ */

  function injectProfileStyles() {
    if (document.getElementById('bmg-profile-override-css')) return;
    var style = document.createElement('style');
    style.id  = 'bmg-profile-override-css';
    style.textContent = `
      /* ── Profile page wrapper ── */
      #profile-page {
        background: #f1f5f9 !important;
        min-height: 100vh;
      }

      /* ── Profile header card ── */
      #profile-page .profile-header {
        background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
        padding: 40px 24px 32px;
        text-align: center;
        border-radius: 0 0 32px 32px;
        box-shadow: 0 8px 32px rgba(79,70,229,0.25);
        position: relative;
      }

      /* ── Profile avatar ── */
      #profile-page .profile-image-large {
        width: 88px;
        height: 88px;
        border-radius: 50%;
        border: 4px solid rgba(255,255,255,0.9);
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        overflow: hidden;
        margin: 0 auto 14px;
        background: #4F46E5;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #profile-image-large {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      /* Hide change photo */
      #change-photo-btn { display: none !important; }

      /* ── Name / email / phone ── */
      #profile-page #profile-name {
        font-size: 1.35rem;
        font-weight: 700;
        color: #fff;
        margin: 0 0 4px;
      }
      #profile-page #profile-email,
      #profile-page #profile-phone {
        font-size: 0.82rem;
        color: rgba(255,255,255,0.82);
        margin: 2px 0;
      }
      #profile-page .role-badge {
        display: inline-block;
        margin-top: 8px;
        padding: 3px 14px;
        background: rgba(255,255,255,0.2);
        border-radius: 20px;
        font-size: 0.75rem;
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      /* ── Menu card ── */
      #profile-page .profile-menu {
        margin: 20px 16px 80px;
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 2px 12px rgba(0,0,0,0.07);
      }

      /* ── Menu items ── */
      #profile-page .menu-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 17px 20px;
        color: #1e293b;
        text-decoration: none;
        font-size: 0.92rem;
        font-weight: 500;
        border-bottom: 1px solid #f1f5f9;
        transition: background 0.15s;
        cursor: pointer;
      }
      #profile-page .menu-item:last-child { border-bottom: none; }
      #profile-page .menu-item:hover,
      #profile-page .menu-item:active { background: #f8fafc; }

      #profile-page .menu-item i:first-child {
        width: 34px;
        height: 34px;
        background: linear-gradient(135deg,#4F46E5,#7C3AED);
        color: #fff;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.88rem;
        flex-shrink: 0;
      }
      #profile-page .menu-item span { flex: 1; }
      #profile-page .menu-item i:last-child { color: #94a3b8; font-size: 0.75rem; }

      /* Logout item */
      #profile-page .menu-item.logout i:first-child {
        background: linear-gradient(135deg,#ef4444,#dc2626);
      }
      #profile-page .menu-item.logout { color: #ef4444; }
    `;
    document.head.appendChild(style);
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-5]  LOGIN / SIGNUP SPLASH SCREEN UI
   * ══════════════════════════════════════════════════════════════ */

  function injectAuthStyles() {
    if (document.getElementById('bmg-auth-override-css')) return;
    var s = document.createElement('style');
    s.id  = 'bmg-auth-override-css';
    s.textContent = `
      /* ── Auth page full-screen splash ── */
      #login-page.auth-page {
        background: linear-gradient(160deg, #0f0c29, #302b63, #24243e) !important;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        overflow-y: auto;
        padding: 0;
      }

      /* Animated sports background dots */
      #login-page .auth-bg-animation {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 0;
      }
      #login-page .floating-shape {
        position: absolute;
        border-radius: 50%;
        opacity: 0.12;
        animation: floatShape 8s ease-in-out infinite;
      }
      #login-page .shape-1 { width:160px;height:160px;background:#818cf8;top:5%;left:-8%;animation-delay:0s; }
      #login-page .shape-2 { width:100px;height:100px;background:#a78bfa;top:20%;right:-5%;animation-delay:1.5s; }
      #login-page .shape-3 { width:70px;height:70px;background:#c4b5fd;top:55%;left:5%;animation-delay:3s; }
      #login-page .shape-4 { width:120px;height:120px;background:#818cf8;bottom:15%;right:-3%;animation-delay:2s; }
      #login-page .shape-5 { width:50px;height:50px;background:#ddd6fe;bottom:5%;left:15%;animation-delay:4s; }

      @keyframes floatShape {
        0%,100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-30px) scale(1.08); }
      }

      /* ── Auth card ── */
      #login-page .auth-card {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 400px;
        background: rgba(255,255,255,0.04);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 28px;
        padding: 36px 28px 28px;
        margin: 28px 16px 100px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      }

      /* ── Brand logo area ── */
      #login-page .auth-brand {
        text-align: center;
        margin-bottom: 28px;
      }
      #login-page .brand-logo {
        width: 68px;
        height: 68px;
        background: linear-gradient(135deg,#4F46E5,#7C3AED);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 14px;
        box-shadow: 0 8px 24px rgba(79,70,229,0.45);
        font-size: 1.9rem;
      }
      #login-page .auth-brand h1 {
        font-size: 1.7rem;
        font-weight: 800;
        color: #fff;
        margin: 0 0 6px;
        letter-spacing: -0.5px;
      }
      #login-page .auth-brand h1 span { color: #a78bfa; }
      #login-page .auth-brand p {
        font-size: 0.82rem;
        color: rgba(255,255,255,0.55);
        margin: 0;
      }

      /* ── Tabs ── */
      #login-page .auth-tabs {
        display: flex;
        gap: 6px;
        margin-bottom: 24px;
        background: rgba(255,255,255,0.07);
        border-radius: 14px;
        padding: 4px;
      }
      #login-page .auth-tab {
        flex: 1;
        padding: 9px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: rgba(255,255,255,0.55);
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      #login-page .auth-tab.active {
        background: linear-gradient(135deg,#4F46E5,#7C3AED);
        color: #fff;
        box-shadow: 0 4px 12px rgba(79,70,229,0.4);
      }

      /* ── Input groups ── */
      #login-page .input-group {
        margin-bottom: 14px;
        position: relative;
      }
      #login-page .input-group input,
      #login-page .input-group select {
        width: 100%;
        padding: 14px 16px 14px 44px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 14px;
        color: #fff;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s, background 0.2s;
        box-sizing: border-box;
      }
      #login-page .input-group input::placeholder { color: rgba(255,255,255,0.4); }
      #login-page .input-group input:focus,
      #login-page .input-group select:focus {
        border-color: #818cf8;
        background: rgba(255,255,255,0.12);
      }
      #login-page .input-group i {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(255,255,255,0.45);
        font-size: 0.9rem;
        pointer-events: none;
      }

      /* ── Primary button ── */
      #login-page .auth-btn-premium,
      #login-page .auth-btn {
        width: 100%;
        padding: 15px;
        border: none;
        border-radius: 14px;
        background: linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);
        color: #fff;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        margin-top: 6px;
        box-shadow: 0 6px 20px rgba(79,70,229,0.4);
        transition: transform 0.15s, box-shadow 0.15s;
        letter-spacing: 0.3px;
      }
      #login-page .auth-btn-premium:hover,
      #login-page .auth-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 28px rgba(79,70,229,0.5);
      }

      /* ── Google button ── */
      #login-page .google-btn {
        width: 100%;
        padding: 13px;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 14px;
        background: rgba(255,255,255,0.06);
        color: #fff;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: background 0.2s;
      }
      #login-page .google-btn:hover { background: rgba(255,255,255,0.12); }

      /* ── Links ── */
      #login-page .forgot-link,
      #login-page .auth-switch {
        text-align: center;
        margin-top: 12px;
        font-size: 0.8rem;
        color: rgba(255,255,255,0.5);
      }
      #login-page .forgot-link a,
      #login-page .auth-switch a {
        color: #a78bfa;
        text-decoration: none;
        font-weight: 600;
      }

      /* ── Divider ── */
      #login-page .auth-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 14px 0;
        color: rgba(255,255,255,0.3);
        font-size: 0.78rem;
      }
      #login-page .auth-divider::before,
      #login-page .auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,0.12);
      }

      /* Splash screen enhanced */
      .splash-screen {
        background: linear-gradient(160deg, #0f0c29, #302b63, #24243e) !important;
      }
      .splash-title { color: #fff !important; }
      .splash-title span { color: #a78bfa !important; }
    `;
    document.head.appendChild(s);
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-6]  STICKY SEARCH BAR — floats fixed when scrolled down
   * ══════════════════════════════════════════════════════════════ */

  function injectStickySearchStyles() {
    if (document.getElementById('bmg-sticky-search-css')) return;
    var s = document.createElement('style');
    s.id  = 'bmg-sticky-search-css';
    s.textContent = `
      /* Floating sticky search bar — hidden by default */
      #bmg-sticky-search {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%) translateY(-100%);
        width: 100%;
        max-width: 428px;
        z-index: 999;
        padding: 10px 16px;
        background: rgba(255,255,255,0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
        border-bottom: 1px solid #e2e8f0;
        box-sizing: border-box;
      }
      #bmg-sticky-search.visible {
        transform: translateX(-50%) translateY(0);
      }
      #bmg-sticky-search .sticky-search-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #f1f5f9;
        border-radius: 50px;
        padding: 10px 16px;
        border: 1.5px solid transparent;
        transition: border-color 0.2s;
      }
      #bmg-sticky-search .sticky-search-inner:focus-within {
        border-color: #4F46E5;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(79,70,229,0.1);
      }
      #bmg-sticky-search i { color: #94a3b8; font-size: 0.92rem; }
      #bmg-sticky-search input {
        flex: 1;
        border: none;
        background: none;
        font-size: 0.9rem;
        color: #1e293b;
        outline: none;
      }
      #bmg-sticky-search input::placeholder { color: #94a3b8; }

      /* Ensure bottom nav is ALWAYS on top and always visible */
      .bottom-nav {
        z-index: 1000 !important;
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        transform: none !important;
        pointer-events: all !important;
      }

      /* Push bottom-nav above system bar on modern devices */
      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        .bottom-nav {
          padding-bottom: calc(var(--space-sm, 8px) + env(safe-area-inset-bottom)) !important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function installStickySearch() {
    /* Only on main home page */
    var mainPage = document.getElementById('main-page');
    if (!mainPage) return;

    /* Build the sticky search bar element */
    var bar = document.createElement('div');
    bar.id  = 'bmg-sticky-search';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML =
      '<div class="sticky-search-inner">' +
      '<i class="fas fa-search"></i>' +
      '<input type="text" id="sticky-search-input" placeholder="Search venues, sports, locations…" autocomplete="off">' +
      '</div>';
    document.body.appendChild(bar);

    /* Sync typing with main search */
    var stickyInput = bar.querySelector('#sticky-search-input');
    var mainInput   = document.getElementById('global-search');

    if (stickyInput && mainInput) {
      stickyInput.addEventListener('input', function () {
        mainInput.value = stickyInput.value;
        mainInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      mainInput.addEventListener('input', function () {
        if (document.activeElement !== stickyInput) stickyInput.value = mainInput.value;
      });
    }

    /* Show bar when user has scrolled past the original search bar */
    var originalSearch = document.querySelector('#main-page .search-container');
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        /* Only apply on the main page */
        var pageVisible = mainPage.classList.contains('active') ||
                          mainPage.style.display !== 'none';
        if (!pageVisible) { bar.classList.remove('visible'); ticking = false; return; }

        var threshold = originalSearch
          ? (originalSearch.getBoundingClientRect().bottom + window.scrollY - 10)
          : 120;

        if (window.scrollY > threshold) {
          bar.classList.add('visible');
          bar.setAttribute('aria-hidden', 'false');
        } else {
          bar.classList.remove('visible');
          bar.setAttribute('aria-hidden', 'true');
        }
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    /* Also watch the main-page div if it has its own scroll */
    mainPage.addEventListener('scroll', onScroll, { passive: true });
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-7]  BOTTOM NAV — reinforce always-visible
   * ══════════════════════════════════════════════════════════════ */
  function reinforceBottomNav() {
    var nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    /* Make sure nothing hides it */
    nav.style.cssText +=
      ';position:fixed!important;bottom:0!important;left:0!important;right:0!important;' +
      'z-index:1000!important;display:flex!important;visibility:visible!important;opacity:1!important;';
  }


  /* ══════════════════════════════════════════════════════════════
   * [FIX-8]  SUPPRESS 404 CONSOLE NOISE
   *           sportobook_ui.css and sportobook_master_fix.js stubs
   *           must be created as separate files (done separately).
   *           Here we just log a clean message.
   * ══════════════════════════════════════════════════════════════ */
  function suppress404Noise() {
    /* sportobook_ui.css is handled by sportobook_ui.css output file.
       sportobook_master_fix.js handled by separate stub file.
       Nothing more to do from JS. */
    console.log('[bmg-super-fix] 404 stubs: ensure sportobook_master_fix.js and sportobook_ui.css are in your deploy folder.');
  }


  /* ══════════════════════════════════════════════════════════════
   * ENTRY POINT — wire everything after DOM ready
   * ══════════════════════════════════════════════════════════════ */
  function init() {
    /* Styles first (no async deps) */
    injectProfileStyles();
    injectAuthStyles();
    injectStickySearchStyles();

    /* QR fixes — run immediately, override any previous versions */
    installQRScannerFix();
    installEntryPassFix();

    /* DOM-dependent fixes */
    patchProfileUI();
    installStickySearch();
    reinforceBottomNav();
    suppress404Noise();

    /* Re-apply profile UI every time profile page is shown */
    window.addEventListener('bmg:pageShown', function (e) {
      var pid = e.detail && e.detail.pageId;
      if (pid === 'profile-page') {
        setTimeout(patchProfileUI, 80);
        setTimeout(reinforceBottomNav, 80);
      }
      if (pid === 'main-page') {
        setTimeout(reinforceBottomNav, 80);
      }
    });

    /* Also fire QR fix after any other script might override it */
    setTimeout(function () {
      installQRScannerFix();
      installEntryPassFix();
    }, 1500);

    console.log('✅ [bmg_super_fix.js] All fixes applied');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();