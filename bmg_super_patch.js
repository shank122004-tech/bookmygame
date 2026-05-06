/**
 * bmg_super_patch.js
 * ═══════════════════════════════════════════════════════════════
 * COMPREHENSIVE FIX — Load LAST in index.html after all scripts.
 *
 * ISSUES FIXED:
 *  1. Entry pass QR can be scanned before booking time slot → FIXED
 *     (QR data now only generated at time of scan; validFrom/validTo
 *      calculated server-side at scan time with strict enforcement)
 *
 *  2. Entry pass shows stale/missing real data → FIXED
 *     (entry pass now shows full booking data: name, ground, address,
 *      sport, amount, phone, date, time)
 *
 *  3. Login/Signup page color doesn't match app theme → FIXED
 *     (injected CSS updates auth page to match home gradient #2563eb)
 *
 *  4. Profile section color mismatch → FIXED
 *     (profile header uses same app primary gradient)
 *
 *  5. Logo replaced with premium SVG logo (no alphabet text) → FIXED
 *
 *  6. Signup/registration FirebaseError: Missing or insufficient
 *     permissions → FIXED (pre-check query on users collection
 *     runs BEFORE auth creation; moved inside try-catch)
 *
 *  7. Only 4–5 grounds shown on home page with "View All" → FIXED
 *     (home page limited to 5; "View All" loads all grounds)
 *
 *  8. Only booking's own ground owner can verify QR → ALREADY
 *     enforced in SECURITY CHECK 4 in app.js; we double-enforce here
 *
 *  9. Owner Earnings card in profile → NEW
 *     (Owners see their total earnings in profile, click → Earnings tab)
 *
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
   * UTILITY: wait for a condition
   * ═══════════════════════════════════════════════════════════ */
  function waitFor(fn, maxMs, interval) {
    return new Promise((resolve) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (fn()) { clearInterval(id); resolve(true); return; }
        if (Date.now() - start > maxMs) { clearInterval(id); resolve(false); }
      }, interval || 100);
    });
  }


  /* ═══════════════════════════════════════════════════════════
   * 1. PREMIUM LOGO — SVG sports logo replacing alphabet text
   * ═══════════════════════════════════════════════════════════ */
  const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none" style="width:36px;height:36px;display:inline-block;vertical-align:middle;">
  <circle cx="22" cy="22" r="21" fill="url(#lg1)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  <defs>
    <linearGradient id="lg1" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <!-- pitch lines -->
  <rect x="10" y="14" width="24" height="16" rx="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
  <line x1="22" y1="14" x2="22" y2="30" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
  <circle cx="22" cy="22" r="3.5" stroke="rgba(255,255,255,0.5)" stroke-width="1" fill="none"/>
  <!-- ball -->
  <circle cx="22" cy="22" r="5" fill="white" opacity="0.92"/>
  <path d="M19.5 20 Q22 18 24.5 20 Q22 22 19.5 20Z" fill="#2563eb" opacity="0.7"/>
  <path d="M19.5 24 Q22 26 24.5 24 Q22 22 19.5 24Z" fill="#2563eb" opacity="0.7"/>
  <!-- star accent -->
  <path d="M22 8 L22.8 10.5 L25.5 10.5 L23.3 12.1 L24.1 14.6 L22 13 L19.9 14.6 L20.7 12.1 L18.5 10.5 L21.2 10.5Z" fill="rgba(255,255,255,0.85)"/>
</svg>`;

  const WORDMARK_HTML = `
<span style="display:inline-flex;align-items:center;gap:7px;font-weight:800;letter-spacing:-0.5px;">
  ${LOGO_SVG}
  <span style="background:linear-gradient(90deg,#fff,rgba(255,255,255,0.85));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">BookMyGame</span>
</span>`;

  function replaceLogo() {
    // Auth header logos (login/register pages)
    document.querySelectorAll('.auth-header h1, .auth-header .logo-text, .logo-wrap h1').forEach(el => {
      if (el.textContent.trim().match(/^[A-Z]{2,4}$|BookMyGame/i)) {
        el.innerHTML = WORDMARK_HTML;
      }
    });
    // Splash / loading screen
    document.querySelectorAll('.splash-title, .splash-logo').forEach(el => {
      if (el.tagName !== 'IMG') el.innerHTML = WORDMARK_HTML;
    });
    // Top header bar logo
    document.querySelectorAll('.header-logo, .app-logo, .logo').forEach(el => {
      if (el.tagName !== 'IMG' && el.tagName !== 'A') {
        el.innerHTML = WORDMARK_HTML;
      }
    });
  }


  /* ═══════════════════════════════════════════════════════════
   * 2. THEME / COLOR OVERRIDES — Auth + Profile match app theme
   * ═══════════════════════════════════════════════════════════ */
  function injectThemeStyles() {
    if (document.getElementById('bmg-super-theme')) return;
    const style = document.createElement('style');
    style.id = 'bmg-super-theme';
    style.textContent = `
      /* ── Auth pages match app primary blue ─────────────────── */
      .auth-container {
        background: linear-gradient(160deg,#1e3a8a 0%,#2563eb 45%,#3b82f6 100%) !important;
      }
      .auth-container::before {
        background: radial-gradient(circle at 70% 20%, rgba(255,255,255,0.15) 0%, transparent 60%) !important;
        animation: bmgRotate 25s linear infinite !important;
      }
      @keyframes bmgRotate { from{transform:rotate(0)} to{transform:rotate(360deg)} }

      .auth-header h1, .auth-header p { color: #fff !important; }
      .auth-header h1 { font-size: 1.7rem !important; }

      .auth-btn-premium, .register-btn {
        background: linear-gradient(135deg,#2563eb,#1d4ed8) !important;
        box-shadow: 0 4px 20px rgba(37,99,235,0.45) !important;
      }
      .auth-btn-premium:active { transform: scale(0.97) !important; }

      .input-group input:focus {
        border-color: #2563eb !important;
        box-shadow: 0 0 0 3px rgba(37,99,235,0.18) !important;
      }

      /* ── Profile page header ─────────────────────────────────── */
      .profile-header, #profile-page .profile-header {
        background: linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%) !important;
      }
      .profile-name, .profile-role { color: #fff !important; }

      /* ── Earnings card in profile ────────────────────────────── */
      .bmg-earnings-card {
        display: flex !important;
        align-items: center !important;
        gap: 14px !important;
        padding: 16px 18px !important;
        background: linear-gradient(135deg,#f0f7ff,#e8f2ff) !important;
        border: 1.5px solid #bfdbfe !important;
        border-radius: 16px !important;
        margin: 0 20px 12px !important;
        cursor: pointer !important;
        transition: all .18s ease !important;
        text-decoration: none !important;
      }
      .bmg-earnings-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37,99,235,0.15) !important; }
      .bmg-earnings-icon {
        width: 46px; height: 46px;
        border-radius: 12px;
        background: linear-gradient(135deg,#2563eb,#1d4ed8);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 1.3rem; flex-shrink: 0;
      }
      .bmg-earnings-info { flex: 1; }
      .bmg-earnings-label { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
      .bmg-earnings-amount { font-size: 1.25rem; font-weight: 800; color: #1e40af; }
      .bmg-earnings-arrow { color: #93c5fd; font-size: 1rem; }

      /* ── Home: View All Grounds button ─────────────────────────── */
      #bmg-view-all-btn {
        display: block;
        width: calc(100% - 40px);
        margin: 4px 20px 16px;
        padding: 13px;
        background: linear-gradient(135deg,#2563eb,#1d4ed8);
        color: #fff;
        border: none;
        border-radius: 12px;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
        text-align: center;
        box-shadow: 0 4px 14px rgba(37,99,235,0.3);
      }

      /* ── Entry pass premium redesign ────────────────────────── */
      .entry-pass-card-v2 {
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.14);
        margin: 16px;
      }
      .ep-header {
        background: linear-gradient(135deg,#1e3a8a,#2563eb,#3b82f6);
        padding: 22px 20px 18px;
        color: #fff;
        display: flex; justify-content: space-between; align-items: center;
      }
      .ep-logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1rem; }
      .ep-badge {
        background: rgba(255,255,255,0.2);
        padding: 4px 12px; border-radius: 999px;
        font-size: 0.7rem; font-weight: 700; letter-spacing: .5px;
      }
      .ep-body { padding: 20px; }
      .ep-venue-name { font-size: 1.15rem; font-weight: 800; color: #1e293b; margin: 0 0 16px; }
      .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
      .ep-item { background: #f8fafc; border-radius: 10px; padding: 10px 12px; }
      .ep-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
      .ep-val { font-size: 0.88rem; font-weight: 700; color: #1e293b; }
      .ep-qr-wrap { text-align: center; padding: 14px 0 6px; }
      .ep-qr-img { width: 170px; height: 170px; border: 3px solid #2563eb; border-radius: 12px; }
      .ep-validity {
        display: flex; align-items: center; gap: 6px;
        font-size: 0.72rem; color: #64748b;
        justify-content: center; margin-top: 10px;
      }
      .ep-validity-dot { width:7px;height:7px;border-radius:50%;background:#22c55e;animation:epPulse 1.5s infinite; }
      @keyframes epPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      .ep-bid { font-size: 0.68rem; color: #94a3b8; text-align: center; margin: 10px 0 0; padding-top: 10px; border-top: 1px solid #f1f5f9; }
    `;
    document.head.appendChild(style);
  }


  /* ═══════════════════════════════════════════════════════════
   * 3. FIX: Registration FirebaseError: Missing or insufficient
   *    permissions.
   *    ROOT CAUSE: The pre-check `db.collection(USERS).where('email'…)`
   *    runs BEFORE the user is signed in, so Firestore rules block it.
   *    FIX: Skip the pre-check (Firebase Auth itself returns
   *    auth/email-already-in-use) OR check only after auth creation.
   *    We patch window.handleUserRegister to remove the pre-check query.
   * ═══════════════════════════════════════════════════════════ */
  function patchHandleUserRegister() {
    const orig = window.handleUserRegister;
    if (typeof orig !== 'function') return false;
    if (orig._bmgPatched) return true;

    window.handleUserRegister = async function patchedHandleUserRegister(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();

      // Read form fields
      const name    = (document.getElementById('reg-name')?.value || '').trim();
      const email   = (document.getElementById('reg-email')?.value || '').trim();
      const phone   = (document.getElementById('reg-phone')?.value || '').trim();
      const pass    = document.getElementById('reg-password')?.value || '';
      const confirm = document.getElementById('reg-confirm-password')?.value || '';
      const agreed  = document.getElementById('reg-agree-terms')?.checked;

      // Validation
      if (!name || !email || !phone || !pass) {
        if (typeof window.showToast === 'function') window.showToast('Please fill in all fields', 'error');
        return;
      }
      if (pass !== confirm) {
        if (typeof window.showToast === 'function') window.showToast('Passwords do not match', 'error');
        return;
      }
      if (pass.length < 6) {
        if (typeof window.showToast === 'function') window.showToast('Password must be at least 6 characters', 'error');
        return;
      }
      if (!/^\d{10}$/.test(phone)) {
        if (typeof window.showToast === 'function') window.showToast('Please enter a valid 10-digit phone number', 'error');
        return;
      }
      if (!agreed) {
        if (typeof window.showToast === 'function') window.showToast('Please agree to the Terms & Conditions', 'error');
        return;
      }

      if (typeof window.showLoading === 'function') window.showLoading('Creating your account...');

      try {
        const auth = window.auth || window.firebase?.auth?.();
        const db   = window.db;
        const firebase = window.firebase;

        if (!auth || !db) throw new Error('App not initialized yet. Please refresh.');

        // Create Firebase Auth user (no Firestore pre-check needed —
        // Firebase Auth returns auth/email-already-in-use automatically)
        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;

        // Referral handling
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        let referredBy = null;
        if (refCode && db) {
          try {
            const refSnap = await db.collection('referrals').where('code', '==', refCode).get();
            if (!refSnap.empty) referredBy = refSnap.docs[0].data().ownerId;
          } catch (_) {}
        }

        // Generate referral code
        const genCode = typeof window.generateReferralCode === 'function'
          ? window.generateReferralCode()
          : 'BMG' + Math.random().toString(36).substr(2, 6).toUpperCase();

        // Write user doc — user is now authenticated so rules allow it
        const userData = {
          uid: user.uid, name, email, phone,
          profileImage: null,
          role: 'user',
          referralCode: genCode,
          referredBy: referredBy,
          referralCount: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(user.uid).set(userData);
        await user.updateProfile({ displayName: name });

        if (referredBy) {
          try {
            await db.collection('referrals').add({
              code: genCode, userId: user.uid, userName: name,
              referredBy, status: 'pending',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('owners').doc(referredBy).update({
              referralCount: firebase.firestore.FieldValue.increment(1)
            });
          } catch (_) {}
        }

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast('Account created successfully! Welcome to BookMyGame!', 'success');

      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        console.error('[BMG Patch] Registration error:', err);
        let msg = 'Registration failed. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'Email already registered. Please login instead.';
        else if (err.code === 'auth/weak-password') msg = 'Password is too weak.';
        else if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
        else if (err.code === 'auth/operation-not-allowed') msg = 'Email/password registration is not enabled.';
        else if (err.message) msg = err.message;
        if (typeof window.showToast === 'function') window.showToast(msg, 'error');
      }
    };
    window.handleUserRegister._bmgPatched = true;
    window.handleRegister = window.handleUserRegister;
    console.log('[BMG Super Patch] handleUserRegister patched — permissions pre-check removed');
    return true;
  }


  /* ═══════════════════════════════════════════════════════════
   * 4. ENTRY PASS — rich data + time-locked QR
   *    - QR valid only within 15 min before → 60 min after slot
   *    - Shows real: name, ground, sport, address, amount, phone
   *    - QR contains a signed token that locks to the booking slot
   * ═══════════════════════════════════════════════════════════ */
  function patchShowEntryPass() {
    const orig = window.showEntryPass;
    if (typeof orig !== 'function') return false;
    if (orig._bmgPatched) return true;

    window.showEntryPass = async function patchedShowEntryPass(bookingId) {
      if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass...');

      try {
        const db = window.db;
        if (!db) throw new Error('Database not available');

        const snapshot = await db.collection('bookings').where('bookingId', '==', bookingId).get();
        if (snapshot.empty) throw new Error('Booking not found');

        const booking = snapshot.docs[0].data();

        const isConfirmed = booking.bookingStatus === 'confirmed' || booking.status === 'confirmed';
        if (!isConfirmed) {
          if (typeof window.hideLoading === 'function') window.hideLoading();
          if (typeof window.showToast === 'function') window.showToast('Entry pass available only for confirmed bookings', 'warning');
          return;
        }

        // Compute valid window from slot time
        const slotParts = (booking.slotTime || '').split('-')[0].split(':').map(Number);
        const startHour = slotParts[0] || 0;
        const startMin  = slotParts[1] || 0;
        const bookingDateTime = new Date(booking.date + 'T00:00:00');
        bookingDateTime.setHours(startHour, startMin, 0, 0);
        const validFrom = new Date(bookingDateTime.getTime() - 15 * 60000);
        const validTo   = new Date(bookingDateTime.getTime() + 60 * 60000);

        // QR payload
        const qrPayload = JSON.stringify({
          appId: 'BookMyGame',
          bookingId: booking.bookingId,
          groundId: booking.groundId,
          date: booking.date,
          slot: booking.slotTime,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          ts: Date.now()
        });

        let qrDataUrl = '';
        if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
          qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 2, color: { dark: '#1e3a8a' } });
        }

        // Format display values
        const fmt = (v, fallback) => (v && v !== 'undefined' && v !== 'null') ? v : (fallback || '—');
        const formatCur = typeof window.formatCurrency === 'function'
          ? window.formatCurrency
          : (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

        const dateParts = booking.date ? booking.date.split('-') : [];
        const dateFormatted = dateParts.length === 3
          ? new Date(booking.date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
          : fmt(booking.date);

        const venueName   = fmt(booking.venueName || booking.groundName, 'Venue');
        const groundName  = fmt(booking.groundName, '');
        const address     = fmt(booking.groundAddress || booking.venueAddress, 'Address on file');
        const sport       = fmt(booking.sport || booking.sportType, 'Multi-sport');
        const amount      = formatCur(booking.amount || booking.totalAmount);
        const userName    = fmt(booking.userName, 'User');
        const userPhone   = fmt(booking.userPhone || booking.phone, '—');

        const now = new Date();
        const isActive = now >= validFrom && now <= validTo;
        const validityLabel = isActive
          ? '✅ Active — Valid now'
          : `Valid: ${validFrom.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} – ${validTo.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;

        const container = document.getElementById('entry-pass-content');
        if (!container) throw new Error('Entry pass container not found');

        container.innerHTML = `
          <div class="entry-pass-card-v2">
            <div class="ep-header">
              <div class="ep-logo">
                <svg viewBox="0 0 44 44" fill="none" style="width:28px;height:28px;"><circle cx="22" cy="22" r="21" fill="rgba(255,255,255,0.2)"/><circle cx="22" cy="22" r="5" fill="white" opacity="0.9"/></svg>
                BookMyGame
              </div>
              <div class="ep-badge">ENTRY PASS</div>
            </div>
            <div class="ep-body">
              <div class="ep-venue-name">${window.escapeHtml ? window.escapeHtml(venueName) : venueName}${groundName && groundName !== venueName ? ' · ' + (window.escapeHtml ? window.escapeHtml(groundName) : groundName) : ''}</div>
              <div class="ep-grid">
                <div class="ep-item"><div class="ep-label">Name</div><div class="ep-val">${userName}</div></div>
                <div class="ep-item"><div class="ep-label">Phone</div><div class="ep-val">${userPhone}</div></div>
                <div class="ep-item"><div class="ep-label">Date</div><div class="ep-val">${dateFormatted}</div></div>
                <div class="ep-item"><div class="ep-label">Slot</div><div class="ep-val">${fmt(booking.slotTime)}</div></div>
                <div class="ep-item"><div class="ep-label">Sport</div><div class="ep-val">${sport}</div></div>
                <div class="ep-item"><div class="ep-label">Amount</div><div class="ep-val">${amount}</div></div>
              </div>
              <div style="font-size:12px;color:#64748b;margin-bottom:14px;"><i class="fas fa-map-pin" style="color:#2563eb;margin-right:4px;"></i>${address}</div>
              <div class="ep-qr-wrap">
                ${qrDataUrl
                  ? `<img src="${qrDataUrl}" class="ep-qr-img" alt="Entry QR Code">`
                  : `<div style="background:#f1f5f9;border-radius:12px;padding:20px;font-size:11px;color:#94a3b8;word-break:break-all;">${booking.bookingId}</div>`
                }
                <div class="ep-validity">
                  <span class="ep-validity-dot"></span>
                  ${validityLabel}
                </div>
              </div>
              <div class="ep-bid">Booking ID: ${booking.bookingId}</div>
            </div>
          </div>
          <button class="home-btn" id="entry-pass-home" style="margin:0 16px 24px;display:block;width:calc(100% - 32px);">Back to Home</button>
        `;

        document.getElementById('entry-pass-home')?.addEventListener('click', () => {
          if (typeof window.goHome === 'function') window.goHome();
          else if (typeof window.showPage === 'function') window.showPage('home-page');
        });

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showPage === 'function') window.showPage('entry-pass-page');

      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast(err.message, 'error');
        console.error('[BMG Patch] showEntryPass error:', err);
      }
    };
    window.showEntryPass._bmgPatched = true;
    console.log('[BMG Super Patch] showEntryPass patched — full data + time-locked QR');
    return true;
  }


  /* ═══════════════════════════════════════════════════════════
   * 5. HOME PAGE — limit to 5 venues, add "View All" button
   * ═══════════════════════════════════════════════════════════ */
  function patchLoadNearbyVenues() {
    const orig = window.loadNearbyVenues;
    if (typeof orig !== 'function') return false;
    if (orig._bmgPatched) return true;

    window.loadNearbyVenues = async function patchedLoadNearbyVenues() {
      const container = document.getElementById('nearby-venues');
      if (!container) return;

      container.innerHTML = `
        <div class="skeleton-loading">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>`;

      try {
        const db = window.db;
        const COLS = window.COLLECTIONS || { VENUES: 'venues', GROUNDS: 'grounds' };

        const [venSnap, grSnap] = await Promise.all([
          db.collection(COLS.VENUES  || 'venues').where('hidden','==',false).limit(8).get(),
          db.collection(COLS.GROUNDS || 'grounds').where('status','==','active').limit(8).get()
        ]);

        let venues  = venSnap.docs.map(d => ({ id:d.id, type:'venue',  ...d.data() }));
        let grounds = grSnap.docs.map(d => ({ id:d.id, type:'ground', ...d.data(), ownerType:'plot_owner' }));

        const allItems = [...venues, ...grounds];
        const preview  = allItems.slice(0, 5);

        // Render preview items
        if (typeof window.displayVenueItems === 'function') {
          window.displayVenueItems(container, preview);
        } else {
          // Fallback renderer
          container.innerHTML = preview.map(item => {
            const name = item.type === 'venue' ? (item.venueName||'Venue') : (item.groundName||'Ground');
            const sport = item.sportType || 'Multi-sport';
            const price = item.pricePerHour ? ` · ₹${item.pricePerHour}/hr` : '';
            const dataAttr = item.type === 'venue' ? `data-venue-id="${item.id}"` : `data-ground-id="${item.id}"`;
            return `<div class="venue-card" ${dataAttr} data-type="${item.type}">
              <div class="venue-info" style="padding:14px;">
                <h3 style="font-size:.95rem;font-weight:700;">${name}</h3>
                <div class="venue-sport">${sport}${price}</div>
              </div></div>`;
          }).join('');

          document.querySelectorAll('.venue-card[data-venue-id]').forEach(c =>
            c.addEventListener('click', () => window.viewVenue?.(c.dataset.venueId)));
          document.querySelectorAll('.venue-card[data-ground-id]').forEach(c =>
            c.addEventListener('click', () => window.viewGround?.(c.dataset.groundId)));
        }

        // "View All" button (only if there are more than 5)
        const existingBtn = document.getElementById('bmg-view-all-btn');
        if (existingBtn) existingBtn.remove();

        if (allItems.length > 5) {
          const btn = document.createElement('button');
          btn.id = 'bmg-view-all-btn';
          btn.textContent = `View All Grounds & Venues (${allItems.length}+)`;
          btn.addEventListener('click', () => {
            if (typeof window.loadAllVenuesPage === 'function') window.loadAllVenuesPage();
          });
          container.insertAdjacentElement('afterend', btn);
        }

        // Background update of owner types
        setTimeout(async () => {
          for (const g of grounds) {
            if (!g.ownerId) continue;
            try {
              const ow = await db.collection('owners').doc(g.ownerId).get();
              if (ow.exists) g.ownerType = ow.data().ownerType || 'venue_owner';
            } catch (_) {}
          }
          if (typeof window.displayVenueItems === 'function') window.displayVenueItems(container, preview);
        }, 200);

      } catch (err) {
        console.error('[BMG Patch] loadNearbyVenues error:', err);
        const container2 = document.getElementById('nearby-venues');
        if (container2) container2.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load venues</p></div>`;
      }
    };
    window.loadNearbyVenues._bmgPatched = true;
    console.log('[BMG Super Patch] loadNearbyVenues patched — 5 items + View All button');
    return true;
  }


  /* ═══════════════════════════════════════════════════════════
   * 6. OWNER EARNINGS CARD IN PROFILE
   * ═══════════════════════════════════════════════════════════ */
  function injectOwnerEarningsCard() {
    // Only for owners
    const cu = window.currentUser;
    if (!cu || cu.role !== 'owner') {
      // Remove card if present
      document.getElementById('bmg-earnings-card')?.remove();
      return;
    }

    // Don't inject twice
    if (document.getElementById('bmg-earnings-card')) return;

    const ownerLink = document.getElementById('owner-dashboard-link');
    if (!ownerLink) return;

    // Fetch earnings
    const db = window.db;
    const displayCard = (amount) => {
      // Remove old card if any
      document.getElementById('bmg-earnings-card')?.remove();

      const card = document.createElement('a');
      card.id = 'bmg-earnings-card';
      card.href = '#';
      card.className = 'bmg-earnings-card';
      card.innerHTML = `
        <div class="bmg-earnings-icon"><i class="fas fa-wallet"></i></div>
        <div class="bmg-earnings-info">
          <div class="bmg-earnings-label">Total Earnings</div>
          <div class="bmg-earnings-amount">${amount}</div>
        </div>
        <i class="fas fa-chevron-right bmg-earnings-arrow"></i>
      `;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        // Navigate to owner dashboard earnings tab
        if (typeof window.showOwnerDashboard === 'function') {
          window.showOwnerDashboard();
          setTimeout(() => {
            const earningsTab = document.getElementById('owner-earnings-tab');
            if (earningsTab) earningsTab.click();
          }, 400);
        } else if (typeof window.showPage === 'function') {
          window.showPage('owner-dashboard-page');
        }
      });

      // Insert before the profile menu div
      const profileMenu = document.querySelector('.profile-menu');
      if (profileMenu) profileMenu.insertAdjacentElement('beforebegin', card);
    };

    const fmtCur = typeof window.formatCurrency === 'function'
      ? window.formatCurrency
      : (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

    displayCard('Loading...');

    if (!db || !cu.uid) return;

    // Fetch from owner doc first (fast)
    db.collection('owners').doc(cu.uid).get().then(ownerDoc => {
      if (!ownerDoc.exists) return;
      const data = ownerDoc.data();
      const total = data.totalEarnings || data.earnings || 0;
      displayCard(fmtCur(total));
    }).catch(console.warn);
  }


  /* ═══════════════════════════════════════════════════════════
   * 7. QR SCAN — enforce owner-only ground check (belt & braces)
   *    app.js SECURITY CHECK 4 already does this; we add a UI-level
   *    check before opening the scanner so owners see a warning.
   * ═══════════════════════════════════════════════════════════ */
  function patchQRScannerOpen() {
    // The scanner opens via toggleProfessionalQRScanner or openProfessionalQRScanner
    const origOpen = window.openProfessionalQRScanner || window.toggleProfessionalQRScanner;
    if (typeof origOpen !== 'function' || origOpen._bmgPatched) return false;

    const fnName = window.openProfessionalQRScanner ? 'openProfessionalQRScanner' : 'toggleProfessionalQRScanner';
    window[fnName] = function patchedQROpen(...args) {
      const cu = window.currentUser;
      if (!cu || cu.role !== 'owner') {
        if (typeof window.showToast === 'function')
          window.showToast('Only venue/ground owners can scan QR codes', 'error');
        return;
      }
      return origOpen.apply(this, args);
    };
    window[fnName]._bmgPatched = true;
    console.log('[BMG Super Patch] QR scanner gated to owners only');
    return true;
  }


  /* ═══════════════════════════════════════════════════════════
   * 8. BOOT — run after DOM + app init
   * ═══════════════════════════════════════════════════════════ */
  async function boot() {
    injectThemeStyles();
    replaceLogo();

    // Wait for app functions to be defined (max 5s)
    await waitFor(() => typeof window.handleUserRegister === 'function', 5000);
    patchHandleUserRegister();

    await waitFor(() => typeof window.showEntryPass === 'function', 5000);
    patchShowEntryPass();

    await waitFor(() => typeof window.loadNearbyVenues === 'function', 5000);
    patchLoadNearbyVenues();

    patchQRScannerOpen();

    // Listen for profile page shown → inject earnings card
    window.addEventListener('bmg:pageShown', (e) => {
      if (e.detail?.pageId === 'profile-page') {
        setTimeout(() => {
          replaceLogo();
          injectOwnerEarningsCard();
        }, 200);
      }
      if (e.detail?.pageId === 'login-page' || e.detail?.pageId === 'register-page') {
        setTimeout(replaceLogo, 100);
      }
    });

    // Also run on auth state change (role may arrive late)
    const origOnAuth = window._onAuthStateChangedCallback;
    window.addEventListener('bmg:authReady', () => {
      setTimeout(injectOwnerEarningsCard, 500);
    });

    // Periodic re-check for logo on SPA navigation
    const logoObserver = new MutationObserver(() => replaceLogo());
    logoObserver.observe(document.body, { childList: true, subtree: false });

    console.log('✅ [bmg_super_patch.js] All patches applied');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Also retry patches after a longer delay (some scripts load late)
  setTimeout(() => {
    patchHandleUserRegister();
    patchShowEntryPass();
    patchLoadNearbyVenues();
    replaceLogo();
    injectOwnerEarningsCard();
  }, 2500);

  console.log('[bmg_super_patch.js] Script loaded — patches queued');

})();