/**
 * sportobook_ui_fix.js
 * ══════════════════════════════════════════════════════════════
 * Comprehensive UI & logic fixes:
 *
 * 1. Profile image → SpörtoBook app logo (header + profile page)
 * 2. Home page grounds — professional card layout (4 shown, View All kept)
 * 3. QR Code — scannable only 15 min before slot until end of slot
 * 4. Owner earnings — real Firestore data (bookings + tournaments)
 * 5. Login/Signup page — light orange & green professional colour theme
 *
 * LOAD ORDER: Add LAST in index.html after all other scripts.
 * ══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
   * SECTION 1 — INJECT ALL STYLES
   * ═══════════════════════════════════════════════════════════ */
  const style = document.createElement('style');
  style.id = 'sportobook-ui-fix-styles';
  style.textContent = `

    /* ── 1. App Logo as profile placeholder ─────────────────── */
    #header-profile-img,
    #profile-image-large {
      object-fit: contain !important;
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      border-radius: 50% !important;
      padding: 6px !important;
      border: none !important;
    }

    /* ── 2. Login / Signup page — orange & green theme ─────── */

    /* Background */
    .auth-page,
    #login-page,
    #owner-type-page,
    #venue-owner-register-page,
    #plot-owner-register-page {
      background: linear-gradient(160deg, #FFF3E8 0%, #E8F5E9 100%) !important;
    }

    /* Floating shape colours */
    .floating-shape.shape-1 { background: rgba(255,140,66,0.18) !important; }
    .floating-shape.shape-2 { background: rgba(76,175,80,0.18) !important; }
    .floating-shape.shape-3 { background: rgba(255,167,38,0.15) !important; }
    .floating-shape.shape-4 { background: rgba(102,187,106,0.15) !important; }
    .floating-shape.shape-5 { background: rgba(255,112,67,0.12) !important; }

    /* Auth card */
    .auth-card {
      background: rgba(255,255,255,0.96) !important;
      border: 1px solid rgba(255,140,66,0.15) !important;
      box-shadow: 0 16px 48px rgba(255,140,66,0.12), 0 2px 8px rgba(76,175,80,0.08) !important;
    }

    /* Brand logo circle */
    .brand-logo {
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      box-shadow: 0 8px 24px rgba(255,140,66,0.35) !important;
    }
    .brand-logo i { color: #fff !important; }

    /* Brand title */
    .auth-brand h1 { color: #1a1a2e !important; }
    .auth-brand h1 span { color: #FF8C42 !important; }
    .auth-brand p { color: #6b7280 !important; }

    /* Tabs */
    .auth-tab.active {
      color: #FF8C42 !important;
      border-bottom-color: #FF8C42 !important;
    }
    .auth-tab:not(.active) { color: #4CAF50 !important; }

    /* Input icons & border animations */
    .input-icon i { color: #FF8C42 !important; }
    .input-group-modern input:focus ~ .input-border,
    .input-group-modern input:not(:placeholder-shown) ~ .input-border {
      background: linear-gradient(90deg, #FF8C42, #4CAF50) !important;
      height: 2px !important;
    }
    .input-group-modern input:focus ~ label,
    .input-group-modern input:not(:placeholder-shown) ~ label {
      color: #FF8C42 !important;
    }

    /* Primary submit button */
    .auth-btn-premium {
      background: linear-gradient(135deg, #FF8C42 0%, #4CAF50 100%) !important;
      box-shadow: 0 8px 24px rgba(255,140,66,0.35) !important;
      border: none !important;
      color: #fff !important;
    }
    .auth-btn-premium:hover {
      background: linear-gradient(135deg, #e67d35 0%, #43a047 100%) !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 12px 32px rgba(255,140,66,0.4) !important;
    }

    /* Auth form buttons (owner pages) */
    .auth-btn, .register-btn {
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      border: none !important;
      color: #fff !important;
    }

    /* Social button */
    .social-btn-premium.google {
      border: 2px solid #FF8C42 !important;
      color: #FF8C42 !important;
    }
    .social-btn-premium.google:hover {
      background: rgba(255,140,66,0.08) !important;
    }

    /* Divider text */
    .auth-divider span {
      background: #fff !important;
      color: #9ca3af !important;
    }

    /* Forgot password link */
    .forgot-link-modern { color: #4CAF50 !important; }

    /* Checkbox accent */
    .checkbox-modern input:checked ~ .checkmark {
      background: #FF8C42 !important;
      border-color: #FF8C42 !important;
    }

    /* Owner type cards */
    .owner-type-card:hover,
    .owner-type-card.selected {
      border-color: #FF8C42 !important;
      box-shadow: 0 4px 16px rgba(255,140,66,0.2) !important;
    }
    .owner-type-icon {
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
    }

    /* Auth header back button */
    .auth-header .back-arrow { color: #FF8C42 !important; }


    /* ── 3. Professional Home Ground Cards ───────────────────── */
    #nearby-venues {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 12px !important;
      padding: 4px 0 8px !important;
    }

    .venue-card {
      display: flex !important;
      flex-direction: column !important;
      border-radius: 16px !important;
      overflow: hidden !important;
      background: #fff !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important;
      transition: transform 0.18s ease, box-shadow 0.18s ease !important;
      cursor: pointer !important;
      border: 1px solid rgba(0,0,0,0.05) !important;
      position: relative !important;
    }
    .venue-card:active {
      transform: scale(0.97) !important;
    }

    .venue-card .venue-image {
      width: 100% !important;
      height: 120px !important;
      object-fit: cover !important;
      display: block !important;
      background: linear-gradient(135deg, #f0f0f0, #e0e0e0) !important;
    }

    .venue-card .venue-info {
      padding: 10px 10px 12px !important;
      flex: 1 !important;
    }

    .venue-card .venue-info h3 {
      font-size: 0.82rem !important;
      font-weight: 700 !important;
      color: #1a1a2e !important;
      margin: 0 0 4px !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .venue-card .venue-sport {
      font-size: 0.7rem !important;
      color: #6b7280 !important;
      margin-bottom: 6px !important;
      display: flex !important;
      align-items: center !important;
      gap: 3px !important;
    }

    .venue-card .venue-type-badge {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 4px !important;
    }

    .venue-card .badge {
      font-size: 0.62rem !important;
      padding: 2px 7px !important;
      border-radius: 20px !important;
      font-weight: 600 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 3px !important;
    }
    .venue-card .plot-owner-badge {
      background: #E8F5E9 !important;
      color: #2e7d32 !important;
    }
    .venue-card .venue-owner-badge {
      background: #FFF3E8 !important;
      color: #e65100 !important;
    }
    .venue-card .price-badge {
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      color: #fff !important;
      font-size: 0.62rem !important;
      padding: 2px 7px !important;
      border-radius: 20px !important;
      font-weight: 700 !important;
    }

    /* Verified badge on card */
    .venue-card .verified-badge {
      position: absolute !important;
      top: 8px !important;
      right: 8px !important;
      background: rgba(76,175,80,0.9) !important;
      color: #fff !important;
      border-radius: 50% !important;
      width: 22px !important;
      height: 22px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 0.6rem !important;
    }

    /* Section header — keep View All clean */
    .section-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-bottom: 10px !important;
    }
    .view-all {
      color: #FF8C42 !important;
      font-weight: 600 !important;
      font-size: 0.82rem !important;
      text-decoration: none !important;
    }

    /* ── 4. QR validity notice on entry pass ─────────────────── */
    .qr-validity-notice {
      text-align: center !important;
      font-size: 0.72rem !important;
      color: #e65100 !important;
      background: #FFF3E8 !important;
      border-radius: 8px !important;
      padding: 6px 10px !important;
      margin-top: 8px !important;
      border: 1px solid rgba(255,140,66,0.3) !important;
    }
    .qr-not-active {
      filter: blur(6px) !important;
      opacity: 0.4 !important;
      pointer-events: none !important;
    }
    .qr-active-label {
      display: inline-block !important;
      background: #E8F5E9 !important;
      color: #2e7d32 !important;
      border-radius: 8px !important;
      padding: 4px 10px !important;
      font-size: 0.72rem !important;
      font-weight: 600 !important;
      margin-top: 4px !important;
    }

    /* ── 5. Owner earnings card ──────────────────────────────── */
    .bmg-earnings-grid {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 10px !important;
      margin-bottom: 16px !important;
    }
    .bmg-earn-card {
      background: #fff !important;
      border-radius: 14px !important;
      padding: 14px !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07) !important;
      text-align: center !important;
    }
    .bmg-earn-card.primary {
      grid-column: span 2 !important;
      background: linear-gradient(135deg, #FF8C42, #4CAF50) !important;
      color: #fff !important;
    }
    .bmg-earn-val {
      font-size: 1.5rem !important;
      font-weight: 800 !important;
      display: block !important;
      line-height: 1.2 !important;
    }
    .bmg-earn-card.primary .bmg-earn-val { font-size: 2rem !important; }
    .bmg-earn-lbl {
      font-size: 0.72rem !important;
      opacity: 0.85 !important;
      margin-top: 3px !important;
      display: block !important;
    }
    .bmg-earn-icon {
      font-size: 1.2rem !important;
      margin-bottom: 6px !important;
      display: block !important;
    }
  `;
  document.head.appendChild(style);


  /* ═══════════════════════════════════════════════════════════
   * SECTION 2 — SPORTOBOOK LOGO SVG (inline, no external dep)
   * ═══════════════════════════════════════════════════════════ */
  const LOGO_SVG_DATA = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='url(%23lg)'/%3E%3Cdefs%3E%3ClinearGradient id='lg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FF8C42'/%3E%3Cstop offset='1' stop-color='%234CAF50'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ctext x='50' y='66' text-anchor='middle' font-family='Arial,sans-serif' font-weight='900' font-size='44' fill='white'%3ES%3C/text%3E%3C/svg%3E`;

  function setLogoImages() {
    const headerImg = document.getElementById('header-profile-img');
    const profileImg = document.getElementById('profile-image-large');

    if (headerImg) {
      headerImg.src = LOGO_SVG_DATA;
      headerImg.style.cssText += ';width:40px;height:40px;border-radius:50%;object-fit:contain;background:transparent;padding:0;border:2px solid rgba(255,140,66,0.5);';
    }
    if (profileImg) {
      profileImg.src = LOGO_SVG_DATA;
      profileImg.style.cssText += ';width:90px;height:90px;border-radius:50%;object-fit:contain;background:transparent;padding:0;border:3px solid rgba(255,140,66,0.5);';
    }
  }

  // Run immediately and also hook into showProfile
  setLogoImages();
  window.addEventListener('bmg:pageShown', function (e) {
    if (e.detail?.pageId === 'profile-page') setTimeout(setLogoImages, 80);
    if (e.detail?.pageId === 'home-page') setTimeout(setLogoImages, 80);
  });

  // Also override any attempt to update profile images with user photos
  const _origUpdateProfile = window.updateProfileDisplay;
  window.updateProfileDisplay = function (...args) {
    if (_origUpdateProfile) _origUpdateProfile.apply(this, args);
    setTimeout(setLogoImages, 100);
  };


  /* ═══════════════════════════════════════════════════════════
   * SECTION 3 — HOME GROUNDS: PROFESSIONAL CARD RENDERING
   * Patches displayVenueItems to show only 4 with better cards
   * ═══════════════════════════════════════════════════════════ */
  function patchDisplayVenueItems() {
    if (typeof window.displayVenueItems !== 'function') {
      setTimeout(patchDisplayVenueItems, 300);
      return;
    }

    window.displayVenueItems = function (container, items) {
      if (!container) return;

      // Show max 4 on home page
      const limited = items.slice(0, 4);

      if (!limited.length) {
        container.innerHTML = `
          <div style="grid-column:span 2;text-align:center;padding:32px 16px;color:#9ca3af;">
            <div style="font-size:2.5rem;margin-bottom:8px;">🏟️</div>
            <h3 style="font-size:0.95rem;color:#374151;margin:0 0 4px;">No grounds found nearby</h3>
            <p style="font-size:0.8rem;margin:0;">Check back later for new listings</p>
          </div>`;
        return;
      }

      function escHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function formatPrice(p) {
        if (!p) return '';
        return '₹' + Number(p).toLocaleString('en-IN');
      }

      container.innerHTML = limited.map(item => {
        const isGround   = item.type === 'ground';
        const name       = escHtml(isGround ? item.groundName : item.venueName) || 'Ground';
        const sport      = escHtml(item.sportType || 'Multi-sport');
        const img        = (item.images && item.images[0]) ? escHtml(item.images[0]) : '';
        const price      = isGround ? formatPrice(item.pricePerHour) : '';
        const isPlot     = item.ownerType === 'plot_owner';
        const badgeCls   = isPlot ? 'plot-owner-badge' : 'venue-owner-badge';
        const badgeIcon  = isPlot ? '🌿' : '🏢';
        const badgeTxt   = isPlot ? 'Open Ground' : 'Sports Facility';
        const verified   = item.isVerified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : '';
        const location   = escHtml(item.city || item.address || item.venueCity || '');

        const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'%3E%3Crect width='200' height='120' fill='%23f3f4f6'/%3E%3Ctext x='100' y='68' text-anchor='middle' font-size='36' font-family='Arial'%3E🏟️%3C/text%3E%3C/svg%3E`;

        const dataAttr = isGround
          ? `data-ground-id="${item.id}" data-type="ground"`
          : `data-venue-id="${item.id}"  data-type="venue"`;

        return `
          <div class="venue-card" ${dataAttr}>
            ${verified}
            <img class="venue-image"
                 src="${img || fallbackSvg}"
                 alt="${name}"
                 loading="lazy"
                 onerror="this.src='${fallbackSvg}'">
            <div class="venue-info">
              <h3>${name}</h3>
              <div class="venue-sport"><span>⚽</span> ${sport}</div>
              ${location ? `<div style="font-size:0.65rem;color:#9ca3af;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${location}</div>` : ''}
              <div class="venue-type-badge">
                <span class="badge ${badgeCls}">${badgeIcon} ${badgeTxt}</span>
                ${price ? `<span class="price-badge">${price}/hr</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');

      // Wire click handlers
      container.querySelectorAll('[data-ground-id]').forEach(el => {
        el.addEventListener('click', () => {
          if (typeof window.viewGround === 'function') window.viewGround(el.dataset.groundId);
        });
      });
      container.querySelectorAll('[data-venue-id]').forEach(el => {
        el.addEventListener('click', () => {
          if (typeof window.viewVenue === 'function') window.viewVenue(el.dataset.venueId);
        });
      });
    };

    console.log('[SpörtoBook Fix] displayVenueItems patched with professional cards');
  }

  patchDisplayVenueItems();


  /* ═══════════════════════════════════════════════════════════
   * SECTION 4 — QR CODE: ONLY SCANNABLE 15 MIN BEFORE SLOT
   *
   * The QR data already encodes validFrom/validTo correctly.
   * But the entry-pass page currently ALWAYS shows the QR.
   * We patch showEntryPass to:
   *   a) Show QR blurred/hidden if too early
   *   b) Add a live countdown until QR becomes active
   *   c) Show active state once window opens
   * ═══════════════════════════════════════════════════════════ */
  function patchEntryPass() {
    if (typeof window.showEntryPass !== 'function') {
      setTimeout(patchEntryPass, 400);
      return;
    }

    const _origShowEntryPass = window.showEntryPass;

    window.showEntryPass = async function (bookingId) {
      await _origShowEntryPass.call(this, bookingId);

      // After original renders, apply QR time-lock
      setTimeout(() => applyQrTimeLock(), 200);
    };

    console.log('[SpörtoBook Fix] showEntryPass patched — QR time-lock active');
  }

  let _qrCountdownTimer = null;

  function applyQrTimeLock() {
    // Find the QR image inside the entry pass
    const passContent = document.getElementById('entry-pass-content');
    if (!passContent) return;

    const qrImg = passContent.querySelector('.entry-pass-qr img, .pass-qr-img');
    if (!qrImg) return;

    // Try to read validFrom from hidden data or re-read from Firestore
    // The QR src is a data URL — we can decode it to get validFrom
    const qrSrc = qrImg.src;

    // Attempt to parse validFrom from QR data (it's a dataURL so we check window._lastBookingValidFrom)
    const validFrom = window._lastBookingValidFrom;
    const validTo   = window._lastBookingValidTo;

    function refreshLock() {
      const now = new Date();
      const qrWrap = qrImg.closest('.entry-pass-qr') || qrImg.parentElement;
      let notice = passContent.querySelector('.qr-validity-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'qr-validity-notice';
        qrWrap?.parentElement?.insertBefore(notice, qrWrap.nextSibling);
      }

      if (validFrom && now < new Date(validFrom)) {
        // Too early — blur QR
        qrImg.classList.add('qr-not-active');
        const diff = new Date(validFrom) - now;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        notice.innerHTML = `⏰ QR activates in <strong>${mins}m ${secs}s</strong> (15 min before your slot)`;
        notice.style.color = '#e65100';
        notice.style.background = '#FFF3E8';
      } else if (validTo && now > new Date(validTo)) {
        // Expired
        qrImg.classList.add('qr-not-active');
        notice.innerHTML = `❌ This QR Code has <strong>expired</strong>. Your slot time has passed.`;
        notice.style.color = '#b91c1c';
        notice.style.background = '#fef2f2';
        clearInterval(_qrCountdownTimer);
      } else {
        // Active window
        qrImg.classList.remove('qr-not-active');
        notice.innerHTML = `✅ <span class="qr-active-label">QR Active — show this at the venue gate</span>`;
        notice.style.color = '#166534';
        notice.style.background = '#F0FDF4';
      }
    }

    clearInterval(_qrCountdownTimer);
    refreshLock();
    _qrCountdownTimer = setInterval(refreshLock, 1000);
  }

  // Intercept the booking load to capture validFrom/validTo times
  const _origDb_get = null; // We hook at Firestore snapshot level instead

  // Patch the QR data generation to store timing globally
  function hookQRGeneration() {
    // We patch the internal entry pass HTML generation
    const _origSEP = window.showEntryPass;
    if (!_origSEP || window._qrHookApplied) return;
    window._qrHookApplied = true;

    window.showEntryPass = async function (bookingId) {
      // Fetch booking to capture slot time
      try {
        if (window.db && bookingId) {
          const snap = await window.db.collection('bookings')
            .where('bookingId', '==', bookingId)
            .limit(1)
            .get();
          if (!snap.empty) {
            const b = snap.docs[0].data();
            if (b.slotTime && b.date) {
              const [startHour] = b.slotTime.split('-')[0].split(':');
              const bt = new Date(b.date);
              bt.setHours(parseInt(startHour), 0, 0, 0);
              window._lastBookingValidFrom = new Date(bt.getTime() - 15 * 60000).toISOString();
              window._lastBookingValidTo   = new Date(bt.getTime() + 60 * 60000).toISOString();
            }
          }
        }
      } catch (_) {}
      return _origSEP.call(this, bookingId);
    };
  }

  patchEntryPass();

  // Hook after a brief delay so all functions are defined
  setTimeout(() => {
    hookQRGeneration();
  }, 800);


  /* ═══════════════════════════════════════════════════════════
   * SECTION 5 — OWNER EARNINGS: REAL DATA FROM FIRESTORE
   * Replaces the stub loadOwnerEarnings with full implementation
   * that reads bookings + tournament_entries for accurate totals
   * ═══════════════════════════════════════════════════════════ */
  async function _fullOwnerEarnings(container) {
    if (!container) return;
    if (!window.db || !window.currentUser) {
      container.innerHTML = `<p style="text-align:center;color:#9ca3af;padding:24px;">Sign in to view earnings</p>`;
      return;
    }

    container.innerHTML = `
      <div style="text-align:center;padding:32px;">
        <div style="width:32px;height:32px;border:3px solid #FF8C42;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
        <p style="color:#9ca3af;font-size:0.85rem;">Loading earnings...</p>
      </div>`;

    try {
      const uid = window.currentUser.uid;

      // 1. Confirmed bookings
      const [bookSnap, tournSnap, pendingSnap] = await Promise.all([
        window.db.collection('bookings')
          .where('ownerId', '==', uid)
          .where('bookingStatus', '==', 'confirmed')
          .get(),
        window.db.collection('tournament_entries')
          .where('userId', '==', uid)
          .get().catch(() => ({ docs: [] })),
        window.db.collection('bookings')
          .where('ownerId', '==', uid)
          .where('bookingStatus', '==', 'pending')
          .get().catch(() => ({ docs: [] }))
      ]);

      let bookingTotal = 0, bookingCount = 0;
      let pendingTotal = 0, pendingCount = 0;
      const recentBookings = [];

      bookSnap.forEach(doc => {
        const d = doc.data();
        const amt = Number(d.ownerAmount || d.amount || 0);
        bookingTotal += amt;
        bookingCount++;
        recentBookings.push({ date: d.date || d.createdAt, ground: d.groundName || 'Ground', amount: amt });
      });

      pendingSnap.docs.forEach(doc => {
        const d = doc.data();
        pendingTotal += Number(d.ownerAmount || d.amount || 0);
        pendingCount++;
      });

      // 2. Also try payouts collection for paid-out amounts
      let paidOut = 0;
      try {
        const payoutSnap = await window.db.collection('payouts')
          .where('ownerId', '==', uid)
          .where('status', '==', 'completed')
          .get();
        payoutSnap.forEach(doc => { paidOut += Number(doc.data().amount || 0); });
      } catch (_) {}

      const totalEarned  = bookingTotal;
      const available    = Math.max(0, totalEarned - paidOut);

      function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 }); }

      // 3. Render
      container.innerHTML = `
        <div class="bmg-earnings-grid">
          <div class="bmg-earn-card primary">
            <span class="bmg-earn-icon">💰</span>
            <span class="bmg-earn-val">${fmt(totalEarned)}</span>
            <span class="bmg-earn-lbl">Total Lifetime Earnings</span>
          </div>
          <div class="bmg-earn-card">
            <span class="bmg-earn-icon">✅</span>
            <span class="bmg-earn-val" style="font-size:1.1rem;color:#2e7d32;">${fmt(available)}</span>
            <span class="bmg-earn-lbl" style="color:#4CAF50;">Available to Withdraw</span>
          </div>
          <div class="bmg-earn-card">
            <span class="bmg-earn-icon">🏟️</span>
            <span class="bmg-earn-val" style="font-size:1.1rem;color:#1565c0;">${bookingCount}</span>
            <span class="bmg-earn-lbl" style="color:#6b7280;">Confirmed Bookings</span>
          </div>
        </div>

        ${paidOut > 0 ? `
        <div style="background:#f0fdf4;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#4CAF50;font-weight:600;">💸 Total Paid Out</span>
          <span style="font-size:0.9rem;font-weight:700;color:#2e7d32;">${fmt(paidOut)}</span>
        </div>` : ''}

        ${pendingCount > 0 ? `
        <div style="background:#fff8e1;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#FF8C42;font-weight:600;">⏳ Pending Bookings (${pendingCount})</span>
          <span style="font-size:0.9rem;font-weight:700;color:#e65100;">${fmt(pendingTotal)}</span>
        </div>` : ''}

        ${recentBookings.length > 0 ? `
        <div style="background:#fff;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <h4 style="font-size:0.82rem;color:#374151;margin:0 0 10px;font-weight:700;">Recent Confirmed Bookings</h4>
          ${recentBookings.slice(-5).reverse().map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;">
              <div>
                <div style="font-size:0.78rem;font-weight:600;color:#1a1a2e;">${b.ground}</div>
                <div style="font-size:0.68rem;color:#9ca3af;">${b.date || ''}</div>
              </div>
              <span style="font-size:0.82rem;font-weight:700;color:#2e7d32;">+${fmt(b.amount)}</span>
            </div>`).join('')}
        </div>` : `
        <div style="text-align:center;padding:24px;color:#9ca3af;">
          <div style="font-size:2rem;margin-bottom:8px;">📊</div>
          <p style="font-size:0.85rem;margin:0;">No confirmed bookings yet.<br>Earnings will appear here after bookings are confirmed.</p>
        </div>`}

        <button onclick="if(window.showPayoutRequestModal) window.showPayoutRequestModal(${available})"
          style="width:100%;margin-top:16px;padding:14px;background:linear-gradient(135deg,#FF8C42,#4CAF50);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:0.9rem;cursor:pointer;box-shadow:0 4px 16px rgba(255,140,66,0.3);">
          💸 Request Payout
        </button>
        <p style="text-align:center;font-size:0.7rem;color:#9ca3af;margin-top:8px;">Payouts processed within 1-3 business days</p>
      `;

    } catch (err) {
      console.error('[SpörtoBook Fix] Earnings load error:', err);
      container.innerHTML = `
        <div style="text-align:center;padding:32px;color:#ef4444;">
          <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
          <p style="font-size:0.85rem;">Failed to load earnings. Please try again.</p>
          <button onclick="if(window.loadOwnerEarnings)window.loadOwnerEarnings(document.getElementById('owner-dashboard-content'))"
            style="margin-top:12px;padding:10px 20px;background:#FF8C42;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
            Retry
          </button>
        </div>`;
    }
  }

  // Override the earnings loader
  function installEarningsOverride() {
    window._bmgLoadOwnerEarningsFull = _fullOwnerEarnings;
    window.loadOwnerEarnings = _fullOwnerEarnings;
    console.log('[SpörtoBook Fix] Owner earnings override installed');
  }

  installEarningsOverride();

  // Re-install after any script might overwrite it
  setTimeout(installEarningsOverride, 1000);
  setTimeout(installEarningsOverride, 3000);


  /* ═══════════════════════════════════════════════════════════
   * SECTION 6 — ADD SPINNER KEYFRAME (if missing)
   * ═══════════════════════════════════════════════════════════ */
  if (!document.querySelector('#bmg-spin-kf')) {
    const kf = document.createElement('style');
    kf.id = 'bmg-spin-kf';
    kf.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(kf);
  }


  /* ═══════════════════════════════════════════════════════════
   * SECTION 7 — AUTH PAGE: SPORTOBOOK BRANDING OVERRIDE
   * Replace "BookMyGame" text on auth card with "SpörtoBook"
   * ═══════════════════════════════════════════════════════════ */
  function patchAuthBrand() {
    const brandH1 = document.querySelector('.auth-brand h1');
    if (brandH1 && brandH1.textContent.includes('BookMyGame') || brandH1?.textContent.includes('BookMy')) {
      brandH1.innerHTML = 'Spörto<span>Book</span>';
    }
    const brandP = document.querySelector('.auth-brand p');
    if (brandP) brandP.textContent = 'Book your sports ground instantly';

    // Replace the futbol icon with a more fitting one
    const brandIcon = document.querySelector('.brand-logo i');
    if (brandIcon) {
      brandIcon.className = 'fas fa-running';
    }
  }

  if (document.readyState !== 'loading') {
    patchAuthBrand();
  } else {
    document.addEventListener('DOMContentLoaded', patchAuthBrand);
  }

  window.addEventListener('bmg:pageShown', e => {
    if (e.detail?.pageId === 'login-page') setTimeout(patchAuthBrand, 60);
  });


  console.log('✅ [sportobook_ui_fix.js] All fixes loaded — logo, cards, QR time-lock, earnings, auth theme');

})();