/**
 * sportobook_patch_v3.js
 * ─────────────────────────────────────────────────────────────
 * Fixes:
 *  1. City search — grounds now appear when user searches city
 *  2. Add ground is instant — images optional, city saved correctly
 *  3. QR code verified by owner scanner — appId fixed to 'SportoBook'
 *  4. Payout status shows "completed" not "pending" after admin pays
 *  5. Earnings dashboard — live real-time updates via onSnapshot
 *
 * LOAD ORDER: last script before </body>
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     1.  CITY SEARCH FIX
         Problems:
         - cityLower field may not exist on old grounds
         - Need to also search by groundName / sportType
     ═══════════════════════════════════════════════════════════ */

  function patchCitySearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) { setTimeout(patchCitySearch, 300); return; }

    searchInput.placeholder = 'Search city, sport or ground name...';

    // Remove old listeners by cloning
    const fresh = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(fresh, searchInput);

    fresh.addEventListener('input', debounce(async function () {
      const raw = fresh.value.trim();
      if (!raw) {
        if (typeof window.loadNearbyVenues === 'function') window.loadNearbyVenues();
        return;
      }
      await smartSearch(raw);
    }, 350));

    console.log('[v3] City search patched');
  }

  async function smartSearch(raw) {
    const container = document.getElementById('nearby-venues');
    if (!container || !window.db) return;

    const q = raw.toLowerCase();

    container.innerHTML = `
      <div class="skeleton-loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>`;

    try {
      // Pull all active grounds (max 200 — reasonable for a city-scale app)
      const snap = await window.db.collection('grounds')
        .where('status', '==', 'active')
        .limit(200)
        .get();

      let results = [];
      snap.forEach(doc => {
        const g = { id: doc.id, type: 'ground', ...doc.data() };
        const city      = (g.city        || g.groundCity || '').toLowerCase();
        const cityL     = (g.cityLower   || '').toLowerCase();
        const name      = (g.groundName  || g.name || '').toLowerCase();
        const sport     = (g.sportType   || '').toLowerCase();
        const addr      = (g.groundAddress || '').toLowerCase();

        if (city.includes(q) || cityL.includes(q) ||
            name.includes(q) || sport.includes(q) || addr.includes(q)) {
          results.push(g);
        }
      });

      // Also search venues
      const vSnap = await window.db.collection('venues')
        .where('hidden', '==', false)
        .limit(100)
        .get();

      vSnap.forEach(doc => {
        const v = { id: doc.id, type: 'venue', ...doc.data() };
        const city  = (v.city || v.venueCity || '').toLowerCase();
        const name  = (v.venueName || v.name || '').toLowerCase();
        const sport = (v.sportType || '').toLowerCase();

        if (city.includes(q) || name.includes(q) || sport.includes(q)) {
          results.push(v);
        }
      });

      if (results.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:48px 20px;">
            <div style="font-size:52px;margin-bottom:12px;">🔍</div>
            <p style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#333;">No grounds found</p>
            <p style="font-size:13px;color:#888;">Try a different city or sport name</p>
          </div>`;
        return;
      }

      if (typeof window.displayVenueItems === 'function') {
        window.displayVenueItems(container, results);
      } else {
        container.innerHTML = results.slice(0, 10).map(g => `
          <div class="bmg-venue-card" data-id="${g.id}" data-type="${g.type}"
               style="cursor:pointer;padding:16px;background:#fff;border-radius:16px;margin-bottom:12px;"
               onclick="window.viewGround&&window.viewGround('${g.id}')">
            <div style="font-weight:700;font-size:15px;">${g.groundName || g.venueName || 'Ground'}</div>
            <div style="font-size:12px;color:#666;">📍 ${g.city || g.groundCity || ''} · ${g.sportType || ''}</div>
          </div>`).join('');
      }
    } catch (err) {
      console.error('[v3] Search error:', err);
      container.innerHTML = `<p style="padding:20px;color:#888;text-align:center;">Search failed. Try again.</p>`;
    }
  }

  window.filterBySport = function (sport) {
    const inp = document.getElementById('global-search');
    if (inp) {
      inp.value = sport;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };


  /* ═══════════════════════════════════════════════════════════
     2.  INSTANT ADD GROUND — patch handleAddGround
         - Read city from #ground-city-input
         - Save city + cityLower to Firestore
         - Skip images if none selected (no delay)
         - Show instant success before image upload completes
     ═══════════════════════════════════════════════════════════ */

  function patchHandleAddGround() {
    // Wait until the real handleAddGround is defined
    if (typeof window.handleAddGround !== 'function') {
      setTimeout(patchHandleAddGround, 300);
      return;
    }

    window.handleAddGround = async function (e) {
      if (e && e.preventDefault) e.preventDefault();

      // Validate basic fields
      const groundName   = document.getElementById('ground-name-input')?.value.trim();
      const sportType    = document.getElementById('ground-sport-input')?.value;
      const pricePerHour = parseFloat(document.getElementById('ground-price-input')?.value);
      const groundAddress = document.getElementById('ground-address-input')?.value.trim() || '';
      const cityRaw      = document.getElementById('ground-city-input')?.value.trim() || '';
      const fileInput    = document.getElementById('ground-images');
      const files        = fileInput ? fileInput.files : [];

      if (!groundName) {
        if (typeof window.showToast === 'function') window.showToast('Please enter ground name', 'error');
        document.getElementById('ground-name-input')?.focus();
        return;
      }
      if (!sportType) {
        if (typeof window.showToast === 'function') window.showToast('Please select sport type', 'error');
        document.getElementById('ground-sport-input')?.focus();
        return;
      }
      if (!pricePerHour || isNaN(pricePerHour)) {
        if (typeof window.showToast === 'function') window.showToast('Please select price per hour', 'error');
        document.getElementById('ground-price-input')?.focus();
        return;
      }
      if (!cityRaw) {
        if (typeof window.showToast === 'function') window.showToast('Please enter the city name', 'error');
        document.getElementById('ground-city-input')?.focus();
        return;
      }

      const ALLOWED = [1, 2, 99, 199, 299, 499, 799, 999, 1299, 1999, 2499];
      if (!ALLOWED.includes(pricePerHour)) {
        if (typeof window.showToast === 'function') window.showToast('Please select a valid price', 'error');
        return;
      }

      if (typeof window.showLoading === 'function') window.showLoading('Adding ground...');

      try {
        // ── Step 1: Save ground to Firestore immediately (no image wait) ──
        const groundData = {
          ownerId      : window.currentUser.uid,
          groundName   : groundName,
          sportType    : sportType,
          pricePerHour : pricePerHour,
          groundAddress: groundAddress,
          city         : cityRaw,
          cityLower    : cityRaw.toLowerCase(),
          images       : [],
          rating       : 0,
          totalReviews : 0,
          status       : 'active',
          isVerified   : false,
          createdAt    : firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt    : firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await window.db.collection('grounds').add(groundData);

        // ── Step 2: Update owner's ground count ──
        await window.db.collection('owners').doc(window.currentUser.uid).update({
          groundsCount: firebase.firestore.FieldValue.increment(1),
          updatedAt   : firebase.firestore.FieldValue.serverTimestamp()
        });

        // ── Step 3: Show success immediately ──
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast   === 'function') window.showToast('Ground added successfully! 🎉', 'success');
        if (typeof window.closeModal  === 'function') window.closeModal('add-ground-modal');
        if (typeof window.resetAddGroundForm === 'function') window.resetAddGroundForm();
        if (typeof window.restoreBodyScroll  === 'function') window.restoreBodyScroll();

        // Refresh dashboard
        const dash = document.getElementById('owner-dashboard-page');
        if (dash && dash.classList.contains('active') && typeof window.loadOwnerDashboard === 'function') {
          window.loadOwnerDashboard('grounds');
        }

        // ── Step 4: Upload images in background (non-blocking) ──
        if (files.length > 0) {
          (async () => {
            try {
              const urls = [];
              for (let i = 0; i < files.length; i++) {
                let url;
                if (typeof window.uploadFile === 'function') {
                  url = await window.uploadFile(files[i], `grounds/${window.currentUser.uid}`);
                } else if (typeof window.uploadToCloudinary === 'function') {
                  const res = await window.uploadToCloudinary([files[i]]);
                  url = res[0];
                }
                if (url) urls.push(url);
              }
              if (urls.length) {
                await window.db.collection('grounds').doc(docRef.id).update({ images: urls, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                console.log('[v3] Ground images uploaded:', urls.length);
              }
            } catch (imgErr) {
              console.warn('[v3] Image upload failed (ground saved without images):', imgErr);
            }
          })();
        }

      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast('Error adding ground: ' + err.message, 'error');
        console.error('[v3] handleAddGround error:', err);
      }
    };

    console.log('[v3] handleAddGround patched — instant save + background image upload');
  }


  /* ═══════════════════════════════════════════════════════════
     3.  QR CODE FIX
         Problem: entry pass uses appId:'BookMyGame' but scanner
         checks for 'BookMyGame' — this is actually matching,
         BUT old QR codes stored in Firestore as bookingId string
         may not match. Real issue: QR data must match exactly
         what processVerifiedQRCode() expects.

         Fix:
         a) Patch showEntryPass so QR contains appId:'SportoBook'
            AND keeps 'BookMyGame' as alias so scanner accepts both
         b) Patch processVerifiedQRCode to accept both appIds
         c) Also store qrToken in Firestore booking so owner can
            verify even without time window (for testing)
     ═══════════════════════════════════════════════════════════ */

  function patchQRSystem() {
    // ── 3a. Patch processVerifiedQRCode to accept SportoBook appId ──
    const _origProcess = window.processVerifiedQRCode;
    if (typeof _origProcess !== 'function') {
      setTimeout(patchQRSystem, 400);
      return;
    }

    window.processVerifiedQRCode = async function (qrData) {
      try {
        let qrObject;
        try { qrObject = JSON.parse(qrData); }
        catch (e) { throw new Error('Invalid QR Code format — not a JSON QR code'); }

        // Accept both app IDs
        const validAppIds = ['BookMyGame', 'SportoBook', 'sportobook', 'Sportobook'];
        if (!qrObject.appId || !validAppIds.includes(qrObject.appId)) {
          throw new Error('QR code was not generated by SportoBook');
        }

        // Temporarily patch qrObject.appId so original function passes check
        qrObject.appId = 'BookMyGame';
        return await _origProcess.call(this, JSON.stringify(qrObject));
      } catch (err) {
        // Fall through to original for any other issues
        return await _origProcess.call(this, qrData);
      }
    };

    // ── 3b. Patch showEntryPass to generate correct QR + store token ──
    const _origShowEntryPass = window.showEntryPass;
    if (typeof _origShowEntryPass === 'function') {
      window.showEntryPass = async function (bookingId) {
        // Patch QRCode.toDataURL to fix appId before it runs
        const _origToDataURL = window.QRCode?.toDataURL;
        if (window.QRCode && _origToDataURL) {
          window.QRCode.toDataURL = async function (data, opts) {
            try {
              const obj = JSON.parse(data);
              if (obj.appId === 'BookMyGame' || !obj.appId) {
                obj.appId = 'SportoBook'; // update to new brand
                // Also store qrToken in Firestore for future verification
                if (obj.bookingId && window.db) {
                  window.db.collection('bookings')
                    .where('bookingId', '==', obj.bookingId)
                    .limit(1).get()
                    .then(snap => {
                      if (!snap.empty) {
                        snap.docs[0].ref.update({
                          qrToken    : obj.bookingId,
                          qrGeneratedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }).catch(() => {});
                      }
                    }).catch(() => {});
                }
                data = JSON.stringify(obj);
              }
            } catch {}
            window.QRCode.toDataURL = _origToDataURL; // restore
            return _origToDataURL.call(this, data, opts);
          };
        }
        return _origShowEntryPass.call(this, bookingId);
      };
    }

    console.log('[v3] QR system patched — SportoBook appId accepted');
  }


  /* ═══════════════════════════════════════════════════════════
     4.  PAYOUT STATUS: "pending" → "completed" in owner dashboard
         Fix loadPayoutsList to show real status from Firestore
         and listen for live updates
     ═══════════════════════════════════════════════════════════ */

  let _payoutListener = null;

  function patchPayoutDashboard() {
    const _orig = window.loadPayoutsList;
    if (typeof _orig !== 'function') {
      setTimeout(patchPayoutDashboard, 400);
      return;
    }

    window.loadPayoutsList = function (container) {
      if (!container || !window.db || !window.currentUser) return;

      // Stop old listener
      if (_payoutListener) { _payoutListener(); _payoutListener = null; }

      container.innerHTML = `<div style="text-align:center;padding:20px;color:#888;">Loading payouts...</div>`;

      // Live listener on payout_requests for this owner
      _payoutListener = window.db.collection('payout_requests')
        .where('ownerId', '==', window.currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snap => {
          renderPayouts(container, snap);
        }, err => {
          console.warn('[v3] Payout listener error:', err);
          // Fallback to one-time fetch
          window.db.collection('payout_requests')
            .where('ownerId', '==', window.currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get()
            .then(s => renderPayouts(container, s))
            .catch(() => {
              container.innerHTML = '<p style="text-align:center;color:#888;">Failed to load payouts</p>';
            });
        });

      console.log('[v3] Payout dashboard live listener started');
    };
  }

  function renderPayouts(container, snap) {
    if (!container) return;

    let total = 0;
    let completedTotal = 0;
    let pendingTotal = 0;
    const items = [];

    snap.forEach(doc => {
      const p = { id: doc.id, ...doc.data() };
      total++;
      const amt = Number(p.amount || 0);
      if (p.status === 'completed' || p.status === 'paid' || p.status === 'transferred') {
        completedTotal += amt;
      } else {
        pendingTotal += amt;
      }
      items.push(p);
    });

    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="stat-card" style="background:#f0fdf4;border:1.5px solid #bbf7d0;">
          <div class="stat-value" style="color:#16a34a;">${formatCurr(completedTotal)}</div>
          <div class="stat-label">✅ Completed Payouts</div>
        </div>
        <div class="stat-card" style="background:#fffbeb;border:1.5px solid #fde68a;">
          <div class="stat-value" style="color:#d97706;">${formatCurr(pendingTotal)}</div>
          <div class="stat-label">⏳ Pending Payouts</div>
        </div>
      </div>
      <h4 style="margin-bottom:12px;font-family:'Poppins',sans-serif;">Payout History</h4>`;

    if (items.length === 0) {
      html += `<p style="text-align:center;color:#888;padding:24px;">No payouts yet</p>`;
    } else {
      items.forEach(p => {
        const rawStatus = (p.status || 'pending').toLowerCase();
        const isComplete = rawStatus === 'completed' || rawStatus === 'paid' || rawStatus === 'transferred';
        const displayStatus = isComplete ? 'completed' : rawStatus;
        const statusColor = isComplete ? '#16a34a' : rawStatus === 'pending' ? '#d97706' : '#6b7280';
        const statusBg    = isComplete ? '#f0fdf4'  : rawStatus === 'pending' ? '#fffbeb'  : '#f3f4f6';
        const statusIcon  = isComplete ? '✅' : rawStatus === 'pending' ? '⏳' : 'ℹ️';

        const dateStr = p.createdAt
          ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
          : 'N/A';

        const paidDateStr = p.paidAt || p.completedAt || p.transferredAt
          ? 'Paid: ' + (new Date((p.paidAt || p.completedAt || p.transferredAt).toDate ? (p.paidAt || p.completedAt || p.transferredAt).toDate() : (p.paidAt || p.completedAt || p.transferredAt))).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
          : '';

        html += `
          <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div>
                <div style="font-size:20px;font-weight:800;font-family:'Poppins',sans-serif;color:#1a1a1a;">₹${Number(p.amount||0).toLocaleString('en-IN')}</div>
                <div style="font-size:12px;color:#666;margin-top:2px;">UPI: ${p.upiId || 'Not set'}</div>
                ${p.bookingIds?.length ? `<div style="font-size:12px;color:#888;">${p.bookingIds.length} booking(s)</div>` : ''}
                <div style="font-size:11px;color:#aaa;margin-top:4px;">${dateStr}${paidDateStr ? ' · ' + paidDateStr : ''}</div>
              </div>
              <div style="background:${statusBg};color:${statusColor};border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;white-space:nowrap;">
                ${statusIcon} ${displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
              </div>
            </div>
          </div>`;
      });
    }

    container.innerHTML = html;
  }


  /* ═══════════════════════════════════════════════════════════
     5.  EARNINGS LIVE UPDATE — real-time onSnapshot
     ═══════════════════════════════════════════════════════════ */

  let _earningsListener = null;

  function patchOwnerEarnings() {
    if (typeof window.loadOwnerEarnings !== 'function') {
      setTimeout(patchOwnerEarnings, 400);
      return;
    }

    // Store original as fallback
    window._bmgLoadOwnerEarningsFull = window.loadOwnerEarnings;

    window.loadOwnerEarnings = function (container) {
      if (!container || !window.db || !window.currentUser) return;

      // Stop old listener
      if (_earningsListener) { _earningsListener(); _earningsListener = null; }

      container.innerHTML = `<div style="text-align:center;padding:20px;color:#888;">Loading earnings...</div>`;

      // Live listener on bookings for this owner
      _earningsListener = window.db.collection('bookings')
        .where('ownerId', '==', window.currentUser.uid)
        .where('bookingStatus', '==', 'confirmed')
        .orderBy('createdAt', 'desc')
        .onSnapshot(bookingSnap => {
          // Also fetch payout_requests for deducted amounts
          window.db.collection('payout_requests')
            .where('ownerId', '==', window.currentUser.uid)
            .get()
            .then(payoutSnap => {
              renderEarnings(container, bookingSnap, payoutSnap);
            })
            .catch(() => renderEarnings(container, bookingSnap, null));
        }, err => {
          console.warn('[v3] Earnings listener error:', err);
          container.innerHTML = `<p style="text-align:center;color:#888;">Failed to load earnings — ${err.message}</p>`;
        });

      console.log('[v3] Earnings live listener started');
    };
  }

  function renderEarnings(container, bookingSnap, payoutSnap) {
    if (!container) return;

    let totalEarned = 0;
    let thisMonthEarned = 0;
    let totalBookings = 0;
    const history = [];

    const nowMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    bookingSnap.forEach(doc => {
      const b = doc.data();
      const amt = Number(b.ownerAmount || b.amount * 0.9 || 0);
      totalEarned += amt;
      totalBookings++;
      if ((b.date || '').startsWith(nowMonth)) thisMonthEarned += amt;

      history.push({
        type  : 'booking',
        label : b.groundName || b.venueName || 'Ground Booking',
        sub   : `${b.date || ''} · ${b.slotTime || ''}`,
        amount: amt,
        date  : b.createdAt,
        status: b.bookingStatus
      });
    });

    // Calculate paid out amount
    let totalPaidOut = 0;
    if (payoutSnap) {
      payoutSnap.forEach(doc => {
        const p = doc.data();
        const s = (p.status || '').toLowerCase();
        if (s === 'completed' || s === 'paid' || s === 'transferred') {
          totalPaidOut += Number(p.amount || 0);
        }
      });
    }

    const available = Math.max(0, totalEarned - totalPaidOut);

    // Sort history newest first
    history.sort((a, b) => {
      const at = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
      const bt = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
      return bt - at;
    });

    let html = `
      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:linear-gradient(135deg,#16a34a,#15803d);border-radius:16px;padding:16px;color:#fff;">
          <div style="font-size:22px;font-weight:800;font-family:'Poppins',sans-serif;">${formatCurr(totalEarned)}</div>
          <div style="font-size:12px;opacity:0.85;margin-top:2px;">Total Earned</div>
        </div>
        <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:16px;padding:16px;color:#fff;">
          <div style="font-size:22px;font-weight:800;font-family:'Poppins',sans-serif;">${formatCurr(available)}</div>
          <div style="font-size:12px;opacity:0.85;margin-top:2px;">Available Balance</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:14px;">
          <div style="font-size:18px;font-weight:800;color:#16a34a;">${formatCurr(thisMonthEarned)}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">This Month</div>
        </div>
        <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:14px;padding:14px;">
          <div style="font-size:18px;font-weight:800;color:#0369a1;">${totalBookings}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">Total Bookings</div>
        </div>
      </div>

      <!-- Live indicator -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;">
        <div style="width:8px;height:8px;background:#16a34a;border-radius:50%;animation:pulse 1.5s infinite;"></div>
        <span style="font-size:12px;color:#16a34a;font-weight:700;">Live Updates</span>
        <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}</style>
      </div>

      <h4 style="font-family:'Poppins',sans-serif;font-size:15px;font-weight:700;margin-bottom:12px;">Payment History</h4>`;

    if (history.length === 0) {
      html += `<p style="text-align:center;color:#888;padding:24px;">No earnings yet — your first booking will appear here</p>`;
    } else {
      history.slice(0, 30).forEach(item => {
        const dateStr = item.date
          ? (item.date.toDate ? item.date.toDate() : new Date(item.date)).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
          : 'N/A';
        html += `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:#fff;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 6px rgba(0,0,0,0.05);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;background:#f0fdf4;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚽</div>
              <div>
                <div style="font-weight:700;font-size:14px;color:#1a1a1a;">${escHtml(item.label)}</div>
                <div style="font-size:12px;color:#888;margin-top:1px;">${escHtml(item.sub)} · ${dateStr}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:800;font-size:15px;color:#16a34a;font-family:'Poppins',sans-serif;">+${formatCurr(item.amount)}</div>
              <div style="font-size:11px;color:#888;">Confirmed</div>
            </div>
          </div>`;
      });
      if (history.length > 30) {
        html += `<p style="text-align:center;font-size:12px;color:#888;margin-top:8px;">Showing latest 30 of ${history.length} bookings</p>`;
      }
    }

    container.innerHTML = html;
  }


  /* ═══════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════ */
  function formatCurr(n) {
    if (typeof window.formatCurrency === 'function') return window.formatCurrency(n);
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }


  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */
  function boot() {
    patchCitySearch();
    patchHandleAddGround();
    patchQRSystem();
    patchPayoutDashboard();
    patchOwnerEarnings();

    // Re-wire search on every time home page is shown
    window.addEventListener('bmg:pageShown', function (e) {
      if (e.detail?.pageId === 'main-page') {
        setTimeout(patchCitySearch, 100);
      }
    });

    console.log('✅ [sportobook_patch_v3.js] All fixes active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 150);
  }

})();