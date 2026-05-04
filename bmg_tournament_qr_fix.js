/**
 * bmg_tournament_qr_fix.js
 * ─────────────────────────────────────────────────────────────────
 * Adds QR Entry Pass to tournament registration — just like ground
 * bookings. After payment completes:
 *   1. A QR code is generated and embedded in the success modal.
 *   2. A "View Entry Pass" button opens a full-screen pass page.
 *   3. The owner's QR scanner (processVerifiedQRCode) now also
 *      recognises tournament QR codes and marks them as verified
 *      in Firestore.
 *
 * LOAD ORDER — add LAST in index.html, after all other fix scripts:
 *   <script src="bmg_cf_bypass.js"></script>
 *   <script src="bmg_tournament_qr_fix.js"></script>  ← this file
 *
 * REQUIRES: qrcodejs (already on page for ground bookings)
 *   <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
   * HELPERS
   * ══════════════════════════════════════════════════════════════ */
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = v => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');

  /**
   * Build the QR payload for a tournament registration.
   * Mirrors the ground-booking QR schema so the same scanner works.
   */
  function buildTournamentQRData(entry) {
    return JSON.stringify({
      appId          : 'BookMyGame',
      type           : 'tournament',           // distinguishes from booking QR
      registrationId : entry.registrationId || entry.orderId,
      tournamentId   : entry.tournamentId,
      tournamentName : entry.tournamentName || '',
      userId         : entry.userId,
      userName       : entry.userName  || '',
      teamName       : entry.teamName  || '',
      sport          : entry.sport     || '',
      venue          : entry.venue     || '',
      date           : entry.date      || '',
      amount         : entry.amount    || entry.entryFee || 0,
      issuedAt       : new Date().toISOString(),
    });
  }

  /**
   * Render a QR code (uses qrcodejs lib already on the page).
   * Returns a Promise<string> (data-URL) so we can embed it as <img>.
   */
  function renderQR(text) {
    return new Promise((resolve, reject) => {
      // Prefer qrcode.js toDataURL if available (used by ground bookings)
      if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
        window.QRCode.toDataURL(text, { width: 220, margin: 2 })
          .then(resolve).catch(reject);
        return;
      }
      // Fallback: create a hidden div, let qrcodejs render, grab the img
      if (window.QRCode) {
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:absolute;left:-9999px;';
        document.body.appendChild(tmp);
        try {
          new window.QRCode(tmp, {
            text, width: 220, height: 220,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.H,
          });
          setTimeout(() => {
            const img = tmp.querySelector('img, canvas');
            const url = img ? (img.src || img.toDataURL()) : null;
            document.body.removeChild(tmp);
            url ? resolve(url) : reject(new Error('QR render failed'));
          }, 100);
        } catch (e) { document.body.removeChild(tmp); reject(e); }
        return;
      }
      reject(new Error('QRCode library not loaded'));
    });
  }


  /* ══════════════════════════════════════════════════════════════
   * 1. PATCH _showTournamentJoinedSuccess
   *    Replaces the plain success modal with one that also shows
   *    a QR code entry pass inside the same modal, plus a button
   *    to open the full-screen entry pass page.
   * ══════════════════════════════════════════════════════════════ */
  function waitForFn(name, cb, ms) {
    if (typeof window[name] === 'function') { cb(); return; }
    const t = setInterval(() => {
      if (typeof window[name] === 'function') { clearInterval(t); cb(); }
    }, ms || 150);
  }

  // Store last entry data so "View Entry Pass" button can re-open it
  let _lastTournamentEntry = null;

  async function showTournamentJoinedSuccessWithQR({ tournamentName, teamName, registrationId, amount, sport, venue, date, userId, userEmail, userPhone, tournamentId }) {
    const entry = { tournamentName, teamName, registrationId, orderId: registrationId, amount, sport, venue, date, userId, tournamentId };
    _lastTournamentEntry = entry;

    // Build the modal skeleton first (so user sees it instantly)
    let modal = document.getElementById('bmg-tournament-success-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bmg-tournament-success-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);';
      document.body.appendChild(modal);
    }

    const loadingHtml = `
      <div style="text-align:center;padding:32px 20px;max-width:440px;margin:0 auto;">
        <div style="width:80px;height:80px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 12px 32px rgba(16,185,129,.35);">
          <i class="fas fa-trophy" style="color:#fff;font-size:34px;"></i>
        </div>
        <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 8px;">You're In! 🎉</h2>
        <p style="font-size:14px;color:#6b7280;margin:0 0 16px;">Generating your QR Entry Pass…</p>
        <div style="display:flex;justify-content:center;align-items:center;gap:8px;color:#6b7280;font-size:13px;">
          <div style="width:16px;height:16px;border:2px solid #10b981;border-top-color:transparent;border-radius:50%;animation:bmg-spin .8s linear infinite;"></div>
          Please wait
        </div>
      </div>`;

    modal.innerHTML = `<div style="background:#fff;border-radius:24px;max-width:440px;width:100%;overflow:hidden;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.4);">${loadingHtml}</div>`;
    modal.style.display = 'flex';

    // Add spin animation if not already present
    if (!document.getElementById('bmg-spin-style')) {
      const s = document.createElement('style');
      s.id = 'bmg-spin-style';
      s.textContent = '@keyframes bmg-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    // Generate QR
    let qrImgHtml = '<p style="color:#ef4444;font-size:12px;">QR generation failed — use Reg. ID to check in</p>';
    try {
      const qrText  = buildTournamentQRData(entry);
      const qrUrl   = await renderQR(qrText);
      qrImgHtml = `
        <img src="${qrUrl}" alt="Tournament Entry QR" style="width:200px;height:200px;display:block;margin:0 auto;">
        <p style="font-size:11px;color:#6b7280;margin:8px 0 0;text-align:center;">
          Show this QR at the tournament venue for check-in
        </p>`;
    } catch (e) {
      console.warn('[BMG Tournament QR] QR generation error:', e);
    }

    const html = `
      <div style="text-align:center;padding:28px 20px 20px;max-width:440px;margin:0 auto;">
        <div style="width:72px;height:72px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 12px 32px rgba(16,185,129,.35);">
          <i class="fas fa-trophy" style="color:#fff;font-size:30px;"></i>
        </div>
        <h2 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 6px;">You're In! 🎉</h2>
        <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Your team is confirmed. Save or screenshot the QR below.</p>

        <!-- Registration details -->
        <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:16px;padding:16px;margin-bottom:16px;text-align:left;">
          <div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">
            <i class="fas fa-check-circle"></i> Registration Confirmed
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Tournament</span>
              <span style="font-weight:700;color:#111827;max-width:60%;text-align:right;">${esc(tournamentName)}</span>
            </div>
            ${teamName ? `<div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Team</span>
              <span style="font-weight:600;color:#111827;">${esc(teamName)}</span>
            </div>` : ''}
            ${sport ? `<div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Sport</span>
              <span style="font-weight:600;color:#111827;text-transform:capitalize;">${esc(sport)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Entry Fee</span>
              <span style="font-weight:700;color:#10b981;">${fmt(amount)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <span style="color:#6b7280;">Reg. ID</span>
              <span style="font-weight:600;color:#1b2e6c;font-size:10px;word-break:break-all;max-width:58%;text-align:right;">${esc(registrationId)}</span>
            </div>
          </div>
        </div>

        <!-- QR code -->
        <div style="background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:16px;padding:18px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">
            <i class="fas fa-qrcode"></i> Entry QR Code
          </div>
          ${qrImgHtml}
        </div>

        <!-- Actions -->
        <button id="bmg-tourn-view-pass-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#1b2e6c,#2563eb);color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">
          <i class="fas fa-id-card"></i> View Full Entry Pass
        </button>
        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('bmg-tournament-success-modal').style.display='none';if(typeof showPage==='function')showPage('tournaments-page');" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">
            All Tournaments
          </button>
          <button onclick="document.getElementById('bmg-tournament-success-modal').style.display='none';if(typeof showPage==='function')showPage('my-bookings-page');" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">
            My Bookings
          </button>
        </div>
      </div>`;

    modal.innerHTML = `<div style="background:#fff;border-radius:24px;max-width:440px;width:100%;overflow:hidden;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.4);">${html}</div>`;
    modal.style.display = 'flex';

    // Wire the "View Full Entry Pass" button
    const viewPassBtn = document.getElementById('bmg-tourn-view-pass-btn');
    if (viewPassBtn) {
      viewPassBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        showTournamentEntryPass(entry);
      });
    }
  }

  // Overwrite the original function once app.js has defined it
  waitForFn('_autoConfirmTournamentRegistration', function () {
    // Patch the internal helper used by _autoConfirmTournamentRegistration
    // The original is a named inner function — we expose a patched version on window
    // and monkey-patch the outer function to call ours instead.
    const _origAutoConfirm = window._autoConfirmTournamentRegistration;

    window._autoConfirmTournamentRegistration = async function (orderId, paymentResult) {
      // Let the original run — it writes to Firestore correctly
      await _origAutoConfirm(orderId, paymentResult);

      // The original calls _showTournamentJoinedSuccess internally.
      // We can't intercept that easily, BUT we can replace the modal content
      // afterwards by checking if it's open and re-rendering with QR.
      const modal = document.getElementById('bmg-tournament-success-modal');
      if (!modal || modal.style.display === 'none') return;

      // Retrieve registration data from Firestore (most reliable source)
      try {
        const entryDoc = await window.db.collection('tournament_entries').doc(orderId).get();
        if (!entryDoc.exists) return;
        const d = entryDoc.data();
        await showTournamentJoinedSuccessWithQR({
          tournamentName : d.tournamentName || '',
          teamName       : d.teamName       || '',
          registrationId : d.registrationId || orderId,
          amount         : d.amount || d.entryFee || 0,
          sport          : d.sport  || '',
          venue          : d.venue  || '',
          date           : d.date   || '',
          userId         : d.userId || '',
          tournamentId   : d.tournamentId || '',
        });
      } catch (e) {
        console.warn('[BMG Tournament QR] Could not enhance success modal with QR:', e);
      }
    };

    console.log('✅ [BMG Tournament QR] _autoConfirmTournamentRegistration patched');
  });


  /* ══════════════════════════════════════════════════════════════
   * 2. FULL-SCREEN TOURNAMENT ENTRY PASS PAGE
   *    Mirrors the ground booking entry-pass page layout.
   * ══════════════════════════════════════════════════════════════ */
  async function showTournamentEntryPass(entry) {
    if (!entry) entry = _lastTournamentEntry;
    if (!entry) {
      if (typeof window.showToast === 'function')
        window.showToast('Entry pass data not available. Please open from My Bookings.', 'error');
      return;
    }

    if (typeof window.showLoading === 'function') window.showLoading('Generating entry pass…');

    try {
      // If we only have an orderId, try to reload from Firestore
      if (!entry.tournamentId && entry.orderId && window.db) {
        const snap = await window.db.collection('tournament_entries').doc(entry.orderId).get();
        if (snap.exists) Object.assign(entry, snap.data());
      }

      const qrText = buildTournamentQRData(entry);
      const qrUrl  = await renderQR(qrText);

      // Try to reuse the existing entry-pass-page (same structure as ground booking)
      const container = document.getElementById('entry-pass-content');
      if (container) {
        container.innerHTML = `
          <div class="entry-pass-card">
            <div class="entry-pass-header">
              <i class="fas fa-trophy"></i>
              <h2>BookMyGame</h2>
              <p>Tournament Entry Pass</p>
            </div>
            <div class="entry-pass-details">
              <p><span>Reg. ID:</span>     <span>${esc(entry.registrationId || entry.orderId)}</span></p>
              <p><span>Name:</span>        <span>${esc(entry.userName || (window.currentUser?.name) || '')}</span></p>
              <p><span>Tournament:</span>  <span>${esc(entry.tournamentName)}</span></p>
              ${entry.teamName ? `<p><span>Team:</span> <span>${esc(entry.teamName)}</span></p>` : ''}
              ${entry.sport  ? `<p><span>Sport:</span> <span style="text-transform:capitalize;">${esc(entry.sport)}</span></p>` : ''}
              ${entry.venue  ? `<p><span>Venue:</span> <span>${esc(entry.venue)}</span></p>` : ''}
              ${entry.date   ? `<p><span>Date:</span>  <span>${esc(entry.date)}</span></p>` : ''}
              <p><span>Entry Fee:</span>   <span>${fmt(entry.amount || entry.entryFee)}</span></p>
              <p><span>Status:</span>      <span style="color:var(--success,#10b981);font-weight:700;">CONFIRMED ✓</span></p>
            </div>
            <div class="entry-pass-qr">
              <img src="${qrUrl}" alt="Tournament Entry QR Code">
            </div>
            <div class="qr-validity">
              <i class="fas fa-shield-alt"></i> Present this QR at the tournament venue
            </div>
          </div>
          <button class="home-btn" id="tournament-entry-pass-back">← Back</button>`;

        document.getElementById('tournament-entry-pass-back').addEventListener('click', () => {
          if (typeof window.goBack === 'function') window.goBack();
          else if (typeof window.showPage === 'function') window.showPage('tournaments-page');
        });

        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showPage    === 'function') window.showPage('entry-pass-page');
        return;
      }

      // Fallback: show as full-screen modal if entry-pass-page doesn't exist
      if (typeof window.hideLoading === 'function') window.hideLoading();
      _showTournamentPassModal(entry, qrUrl);

    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      console.error('[BMG Tournament QR] Entry pass error:', err);
      if (typeof window.showToast === 'function')
        window.showToast('Could not generate entry pass. Try again.', 'error');
    }
  }

  function _showTournamentPassModal(entry, qrUrl) {
    let modal = document.getElementById('bmg-tourn-pass-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bmg-tourn-pass-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:#fff;border-radius:24px;max-width:380px;width:100%;overflow:hidden;max-height:92vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.5);">
        <div style="background:linear-gradient(135deg,#1b2e6c,#2563eb);padding:20px;text-align:center;color:#fff;">
          <i class="fas fa-trophy" style="font-size:32px;margin-bottom:8px;display:block;"></i>
          <div style="font-size:18px;font-weight:800;">BookMyGame</div>
          <div style="font-size:12px;opacity:.8;margin-top:2px;">Tournament Entry Pass</div>
        </div>
        <div style="padding:20px;">
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;">
              <span style="color:#6b7280;">Reg. ID</span>
              <span style="font-weight:600;color:#1b2e6c;font-size:10px;word-break:break-all;max-width:58%;text-align:right;">${esc(entry.registrationId || entry.orderId)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;">
              <span style="color:#6b7280;">Tournament</span>
              <span style="font-weight:700;color:#111827;max-width:60%;text-align:right;">${esc(entry.tournamentName)}</span>
            </div>
            ${entry.teamName ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;"><span style="color:#6b7280;">Team</span><span style="font-weight:600;color:#111827;">${esc(entry.teamName)}</span></div>` : ''}
            ${entry.sport ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;"><span style="color:#6b7280;">Sport</span><span style="font-weight:600;text-transform:capitalize;">${esc(entry.sport)}</span></div>` : ''}
            ${entry.date ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;"><span style="color:#6b7280;">Date</span><span style="font-weight:600;">${esc(entry.date)}</span></div>` : ''}
            ${entry.venue ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:6px;"><span style="color:#6b7280;">Venue</span><span style="font-weight:600;max-width:60%;text-align:right;">${esc(entry.venue)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Entry Fee</span>
              <span style="font-weight:700;color:#10b981;">${fmt(entry.amount || entry.entryFee)}</span>
            </div>
          </div>
          <div style="background:#f9fafb;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
            <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;"><i class="fas fa-qrcode"></i> Scan to Verify</div>
            <img src="${qrUrl}" alt="QR Code" style="width:180px;height:180px;">
          </div>
          <div style="background:#eff6ff;border-radius:10px;padding:10px 12px;font-size:11px;color:#1d4ed8;margin-bottom:16px;text-align:center;">
            <i class="fas fa-shield-alt"></i> Present at tournament venue for check-in
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="document.getElementById('bmg-tourn-pass-modal').style.display='none';" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">Close</button>
            <button onclick="document.getElementById('bmg-tourn-pass-modal').style.display='none';if(typeof showPage==='function')showPage('my-bookings-page');" style="flex:1;padding:12px;background:linear-gradient(135deg,#1b2e6c,#2563eb);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">My Bookings</button>
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
  }


  /* ══════════════════════════════════════════════════════════════
   * 3. PATCH processVerifiedQRCode (owner scanner)
   *    Teach the existing scanner to also handle tournament QRs.
   * ══════════════════════════════════════════════════════════════ */
  function patchOwnerScanner() {
    if (typeof window.processVerifiedQRCode !== 'function') return;

    const _orig = window.processVerifiedQRCode;

    window.processVerifiedQRCode = async function (qrData) {
      let qrObject;
      try { qrObject = JSON.parse(qrData); } catch (_) {}

      // If it's not a tournament QR, fall through to the original handler
      if (!qrObject || qrObject.type !== 'tournament') {
        return _orig.call(this, qrData);
      }

      // ── Handle tournament QR ─────────────────────────────────
      const resultDiv = document.getElementById('professional-qr-result') ||
                        document.getElementById('owner-qr-result');

      const show = (html) => {
        if (resultDiv) { resultDiv.innerHTML = html; resultDiv.style.display = 'block'; }
      };

      const fail = (msg) => {
        show(`<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;color:#dc2626;font-weight:600;"><i class="fas fa-times-circle"></i> ${esc(msg)}</div>`);
        if (typeof window.showToast === 'function') window.showToast(msg, 'error');
      };

      try {
        const db = window.db;
        if (!db) { fail('Database not available.'); return; }

        const regId = qrObject.registrationId;
        if (!regId) { fail('Invalid tournament QR code.'); return; }

        // Look up in tournament_entries
        const snap = await db.collection('tournament_entries').doc(regId).get();
        if (!snap.exists) {
          // Try tournament_registrations as fallback
          const snap2 = await db.collection('tournament_registrations').doc(regId).get();
          if (!snap2.exists) { fail('Registration not found in database.'); return; }
        }

        const entry = (snap.exists ? snap : await db.collection('tournament_registrations').doc(regId).get()).data();

        // Check status
        if (entry.paymentStatus !== 'paid' && entry.registrationStatus !== 'confirmed') {
          fail(`Registration not confirmed (status: ${entry.registrationStatus || entry.paymentStatus || 'unknown'})`);
          return;
        }

        // Check already checked-in
        if (entry.checkedIn) {
          show(`<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px;">
            <div style="color:#d97706;font-weight:700;font-size:14px;margin-bottom:8px;"><i class="fas fa-exclamation-triangle"></i> Already Checked In</div>
            <div style="font-size:13px;color:#374151;">
              <div><b>Team:</b> ${esc(entry.teamName || '—')}</div>
              <div><b>Player:</b> ${esc(entry.userName || '—')}</div>
              <div><b>Checked in at:</b> ${entry.checkedInAt ? new Date(entry.checkedInAt).toLocaleString('en-IN') : '—'}</div>
            </div>
          </div>`);
          return;
        }

        // Mark checked-in
        const now = new Date().toISOString();
        const updateData = {
          checkedIn  : true,
          checkedInAt: now,
          updatedAt  : firebase.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('tournament_entries').doc(regId).update(updateData).catch(() => {});
        await db.collection('tournament_registrations').doc(regId).update(updateData).catch(() => {});

        show(`<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:16px;">
          <div style="color:#059669;font-weight:800;font-size:15px;margin-bottom:10px;"><i class="fas fa-check-circle"></i> Check-In Successful!</div>
          <div style="display:flex;flex-direction:column;gap:5px;font-size:13px;color:#374151;">
            <div><b>Tournament:</b> ${esc(entry.tournamentName || qrObject.tournamentName || '—')}</div>
            <div><b>Team:</b> ${esc(entry.teamName || qrObject.teamName || '—')}</div>
            <div><b>Player:</b> ${esc(entry.userName || qrObject.userName || '—')}</div>
            ${entry.sport ? `<div><b>Sport:</b> <span style="text-transform:capitalize;">${esc(entry.sport)}</span></div>` : ''}
            <div><b>Reg. ID:</b> <span style="font-size:10px;word-break:break-all;">${esc(regId)}</span></div>
            <div style="margin-top:6px;color:#059669;font-weight:600;"><i class="fas fa-clock"></i> ${new Date().toLocaleTimeString('en-IN')}</div>
          </div>
        </div>`);

        if (typeof window.showToast === 'function')
          window.showToast(`✅ ${entry.teamName || entry.userName || 'Team'} checked in!`, 'success', 4000);

      } catch (err) {
        console.error('[BMG Tournament QR] Scanner error:', err);
        fail('Error verifying tournament QR. Please try again.');
      }
    };

    console.log('✅ [BMG Tournament QR] processVerifiedQRCode patched for tournament QRs');
  }

  // Patch both copies of processVerifiedQRCode (app.js defines it twice)
  waitForFn('processVerifiedQRCode', patchOwnerScanner);


  /* ══════════════════════════════════════════════════════════════
   * 4. ADD "View Entry Pass" to My Tournaments / My Bookings list
   *    When a user views their confirmed tournament registrations,
   *    they should be able to re-open the entry pass QR.
   * ══════════════════════════════════════════════════════════════ */

  /**
   * Call this from your "My Tournaments" list template to show the
   * entry pass for an already-confirmed registration.
   * Usage in HTML: onclick="window.showTournamentEntryPassById('REG_ID')"
   */
  window.showTournamentEntryPassById = async function (registrationId) {
    if (!registrationId) return;
    if (typeof window.showLoading === 'function') window.showLoading('Loading entry pass…');
    try {
      const db = window.db;
      let entry = null;

      // Try tournament_entries first
      const snap = await db.collection('tournament_entries').doc(registrationId).get();
      if (snap.exists) {
        entry = snap.data();
      } else {
        // Try tournament_registrations
        const snap2 = await db.collection('tournament_registrations').doc(registrationId).get();
        if (snap2.exists) entry = snap2.data();
      }

      if (!entry) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast   === 'function') window.showToast('Registration not found.', 'error');
        return;
      }

      if (typeof window.hideLoading === 'function') window.hideLoading();
      await showTournamentEntryPass({
        registrationId: entry.registrationId || registrationId,
        orderId       : entry.orderId || registrationId,
        tournamentName: entry.tournamentName || '',
        teamName      : entry.teamName       || '',
        sport         : entry.sport          || '',
        venue         : entry.venue          || '',
        date          : entry.date           || '',
        amount        : entry.amount || entry.entryFee || 0,
        userId        : entry.userId         || '',
        tournamentId  : entry.tournamentId   || '',
        userName      : entry.userName       || '',
      });
    } catch (err) {
      if (typeof window.hideLoading === 'function') window.hideLoading();
      console.error('[BMG Tournament QR] showTournamentEntryPassById:', err);
      if (typeof window.showToast === 'function') window.showToast('Could not load entry pass.', 'error');
    }
  };

  // Also expose the main pass function
  window.showTournamentEntryPass = showTournamentEntryPass;

  console.log('✅ [bmg_tournament_qr_fix.js] Loaded — tournament QR entry passes active');

})();
