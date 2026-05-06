/**
 * sportobook_ui.js  — v2
 * ─────────────────────────────────────────────────────────────
 * Fixes bundled in one file:
 *
 *  1. QR scanner — show ONLY for owners, never for users
 *  2. Upcoming booking banner — show ONLY when a booking exists, hidden otherwise
 *  3. City search — filter grounds by city when user types city name
 *  4. Auto-load grounds after login (no manual refresh needed)
 *  5. Full address display in location bar (place + city)
 *  6. Splash screen — enforce 5-second minimum before hiding
 *  7. _bmgMarkPaymentSent permission fix — owner can mark payment received
 *  8. City field validation in add-ground form
 *
 * LOAD ORDER: last script before </body>, after all other scripts.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     1.  SPLASH SCREEN — 5 second minimum
     ═══════════════════════════════════════════════════════════ */
  (function patchSplash() {
    const SPLASH_MIN_MS = 5000;
    const splashShownAt = Date.now();

    // Override the classList.add('hide') on splash so it waits 5 s
    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    const _origAdd = splash.classList.add.bind(splash.classList);
    splash.classList.add = function (...args) {
      if (args.includes('hide')) {
        const elapsed = Date.now() - splashShownAt;
        const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
        setTimeout(() => _origAdd(...args), wait);
        return;
      }
      _origAdd(...args);
    };
    console.log('[UI] Splash patched — minimum 5 s display');
  })();


  /* ═══════════════════════════════════════════════════════════
     2.  QR SCANNER — owners only
     ═══════════════════════════════════════════════════════════ */
  function syncQrScanner() {
    const btn = document.getElementById('header-qr-scanner');
    if (!btn) return;
    const isOwner = window.currentUser?.role === 'owner'
                 || window.currentUser?.role === 'admin'
                 || window.currentUser?.role === 'ceo';
    btn.style.display  = isOwner ? 'flex' : 'none';
    btn.style.visibility = isOwner ? 'visible' : 'hidden';
  }

  // Run every time a page is shown (catches navigation back to main)
  window.addEventListener('bmg:pageShown', function (e) {
    syncQrScanner();
    if (e.detail?.pageId === 'main-page') {
      setTimeout(syncQrScanner, 100); // double-check after sportobook_ui.css might force-show
    }
  });


  /* ═══════════════════════════════════════════════════════════
     3.  UPCOMING BOOKING BANNER — hidden until booking found
     ═══════════════════════════════════════════════════════════ */
  let _bannerListener = null;

  function startUpcomingBannerListener() {
    if (_bannerListener) { _bannerListener(); _bannerListener = null; }

    const banner = document.getElementById('spb-upcoming-banner');
    const nameEl = document.getElementById('spb-upcoming-name');
    const addrEl = document.getElementById('spb-upcoming-addr');
    const timeEl = document.getElementById('spb-upcoming-time');
    if (!banner || !window.db || !window.currentUser) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    _bannerListener = window.db.collection('bookings')
      .where('userId', '==', window.currentUser.uid)
      .where('bookingStatus', '==', 'confirmed')
      .where('date', '>=', todayStr)
      .orderBy('date', 'asc')
      .limit(3)
      .onSnapshot(snap => {
        // Find the closest future slot
        const now = new Date();
        let upcoming = null;

        snap.forEach(doc => {
          if (upcoming) return;
          const b = doc.data();
          // Parse date + time
          const slotStr = (b.date || '') + 'T' + (b.slotTime
            ? b.slotTime.replace(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i, (_, h, m, ap) => {
                let hh = parseInt(h, 10);
                if (ap && ap.toUpperCase() === 'PM' && hh !== 12) hh += 12;
                if (ap && ap.toUpperCase() === 'AM' && hh === 12) hh = 0;
                return String(hh).padStart(2,'0') + ':' + m + ':00';
              })
            : '00:00:00');
          const slotDate = new Date(slotStr);
          if (slotDate >= now) upcoming = { ...b, _id: doc.id };
        });

        if (!upcoming) {
          // No upcoming booking — keep banner hidden
          banner.style.display = 'none';
          return;
        }

        // Show banner with booking details
        banner.style.display = 'flex';
        banner.classList.remove('empty');

        if (nameEl) nameEl.textContent = upcoming.groundName || upcoming.venueName || 'Ground Booking';

        const addr = upcoming.groundAddress || upcoming.venueAddress || '';
        if (addrEl) addrEl.textContent = addr
          ? addr + (upcoming.date ? ' · ' + upcoming.date : '')
          : upcoming.date || '';

        if (timeEl) {
          timeEl.textContent = upcoming.slotTime || upcoming.date || 'Upcoming';
          timeEl.style.display = 'block';
        }

        banner.style.cursor = 'pointer';
        banner.onclick = () => {
          if (typeof window.showPage === 'function') window.showPage('bookings-page');
          else if (typeof window.loadMyBookings === 'function') window.loadMyBookings();
        };
      }, err => {
        console.warn('[UI] Upcoming banner listener error:', err);
        banner.style.display = 'none';
      });

    console.log('[UI] Upcoming booking listener started');
  }

  function stopUpcomingBannerListener() {
    if (_bannerListener) { _bannerListener(); _bannerListener = null; }
    const banner = document.getElementById('spb-upcoming-banner');
    if (banner) banner.style.display = 'none';
  }


  /* ═══════════════════════════════════════════════════════════
     4.  AUTO-LOAD GROUNDS AFTER LOGIN (no manual refresh)
     ═══════════════════════════════════════════════════════════ */
  function triggerGroundsLoad() {
    // loadNearbyVenues may be called before the container is visible.
    // We patch it to also call when main-page becomes active.
    const container = document.getElementById('nearby-venues');
    const isMainActive = document.getElementById('main-page')?.classList.contains('active');

    if (typeof window.loadNearbyVenues === 'function') {
      if (isMainActive || container) {
        window.loadNearbyVenues();
      }
    }

    // Also call loadMainPage if available
    if (typeof window.loadMainPage === 'function' && isMainActive) {
      window.loadMainPage();
    }
  }


  /* ═══════════════════════════════════════════════════════════
     5.  FULL ADDRESS IN LOCATION BAR (place + city)
     ═══════════════════════════════════════════════════════════ */
  function patchGetUserLocation() {
    const _orig = window.getUserLocation;
    if (typeof _orig !== 'function') {
      setTimeout(patchGetUserLocation, 300);
      return;
    }

    window.getUserLocation = function () {
      if (!navigator.geolocation) {
        const el = document.getElementById('current-location');
        if (el) el.textContent = 'Geolocation not supported';
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          window.userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          localStorage.setItem('userLocation', JSON.stringify(window.userLocation));

          // Build full address: road/neighbourhood, suburb, city, state
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${window.userLocation.lat}&lon=${window.userLocation.lng}&zoom=18&addressdetails=1`
            );
            const data = await res.json();
            let locationText = '';
            if (data.address) {
              const parts = [];
              const road   = data.address.road || data.address.pedestrian || '';
              const suburb = data.address.suburb || data.address.neighbourhood || '';
              const city   = data.address.city || data.address.town || data.address.village || '';
              const state  = data.address.state || '';
              if (road)   parts.push(road);
              if (suburb && suburb !== road) parts.push(suburb);
              if (city)   parts.push(city);
              if (state && state !== city) parts.push(state);
              locationText = parts.join(', ') || 'Location detected';
            } else {
              locationText = `${window.userLocation.lat.toFixed(4)}, ${window.userLocation.lng.toFixed(4)}`;
            }
            const el = document.getElementById('current-location');
            if (el) el.textContent = locationText;
          } catch {
            const el = document.getElementById('current-location');
            if (el) el.textContent = `${window.userLocation.lat.toFixed(4)}, ${window.userLocation.lng.toFixed(4)}`;
          }

          // Load grounds now that location is known
          triggerGroundsLoad();
        },
        (err) => {
          console.warn('[UI] Geolocation error:', err);
          const el = document.getElementById('current-location');
          if (el) el.textContent = 'Location unavailable';
          // Try cached location, then still load grounds
          const cached = localStorage.getItem('userLocation');
          if (cached) {
            try { window.userLocation = JSON.parse(cached); } catch {}
          }
          triggerGroundsLoad();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    };

    console.log('[UI] getUserLocation patched — full address + auto-load grounds');
  }


  /* ═══════════════════════════════════════════════════════════
     6.  CITY SEARCH — filter grounds by city
     ═══════════════════════════════════════════════════════════ */
  function patchSearchForCity() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;

    // Update placeholder
    searchInput.placeholder = 'Search by city, sport, or ground name...';

    searchInput.addEventListener('input', debounce(function () {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        // Restore all grounds
        if (typeof window.loadNearbyVenues === 'function') window.loadNearbyVenues();
        return;
      }
      searchGroundsByCity(query);
    }, 400));
  }

  async function searchGroundsByCity(query) {
    const container = document.getElementById('nearby-venues');
    if (!container || !window.db) return;

    container.innerHTML = `
      <div class="skeleton-loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>`;

    try {
      // Search grounds by city (case-insensitive via cityLower field)
      const [groundsSnap, venuesSnap] = await Promise.all([
        window.db.collection('grounds')
          .where('status', '==', 'active')
          .where('cityLower', '>=', query)
          .where('cityLower', '<=', query + '\uf8ff')
          .limit(20)
          .get(),
        window.db.collection('venues')
          .where('hidden', '==', false)
          .where('cityLower', '>=', query)
          .where('cityLower', '<=', query + '\uf8ff')
          .limit(10)
          .get()
      ]);

      let results = [];
      groundsSnap.forEach(doc => results.push({ id: doc.id, type: 'ground', ...doc.data() }));
      venuesSnap.forEach(doc  => results.push({ id: doc.id, type: 'venue',  ...doc.data() }));

      // Also search by groundName / sportType for non-city queries
      if (results.length === 0) {
        // Fallback: try sport-type match
        const sportSnap = await window.db.collection('grounds')
          .where('status', '==', 'active')
          .where('sportType', '>=', query)
          .where('sportType', '<=', query + '\uf8ff')
          .limit(15)
          .get();
        sportSnap.forEach(doc => results.push({ id: doc.id, type: 'ground', ...doc.data() }));
      }

      if (results.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px 20px;color:#888;">
            <div style="font-size:48px;margin-bottom:12px;">🔍</div>
            <p style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#444;">No grounds found</p>
            <p style="font-size:13px;">Try searching a different city or sport</p>
          </div>`;
        return;
      }

      if (typeof window.displayVenueItems === 'function') {
        window.displayVenueItems(container, results);
      } else {
        // Fallback simple render
        container.innerHTML = results.map(g => `
          <div class="bmg-venue-card" data-id="${g.id}" data-type="${g.type}" style="cursor:pointer;padding:16px;background:#fff;border-radius:16px;margin-bottom:12px;">
            <div style="font-weight:700;font-size:15px;">${g.groundName || g.name || 'Ground'}</div>
            <div style="font-size:12px;color:#666;">${g.city || ''} · ${g.sportType || ''}</div>
          </div>`).join('');
      }
    } catch (err) {
      console.error('[UI] City search error:', err);
      container.innerHTML = `<p style="padding:20px;color:#888;">Search unavailable. Try again.</p>`;
    }
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }


  /* ═══════════════════════════════════════════════════════════
     7.  SPORT FILTER (called from sport cards in HTML)
     ═══════════════════════════════════════════════════════════ */
  window.filterBySport = function (sport) {
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.value = sport;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window.filterGroundsBySport === 'function') window.filterGroundsBySport(sport);
  };


  /* ═══════════════════════════════════════════════════════════
     8.  CITY FIELD VALIDATION IN ADD-GROUND FORM
         Ensures city is saved to Firestore as `city` + `cityLower`
     ═══════════════════════════════════════════════════════════ */
  function patchHandleAddGround() {
    const _orig = window.handleAddGround;
    if (typeof _orig !== 'function') {
      setTimeout(patchHandleAddGround, 400);
      return;
    }

    window.handleAddGround = async function (e) {
      if (e && e.preventDefault) e.preventDefault();

      const cityInput = document.getElementById('ground-city-input');
      const cityVal = cityInput ? cityInput.value.trim() : '';

      if (!cityVal) {
        if (typeof window.showToast === 'function') {
          window.showToast('Please enter the city name for this ground', 'error');
        }
        if (cityInput) cityInput.focus();
        return;
      }

      // Intercept db.collection('grounds').add to inject city fields
      const _origDbAdd = window.db.collection('grounds').add.bind(window.db.collection('grounds'));
      const _patchedCollection = window.db.collection.bind(window.db);

      // We patch via a one-shot override on the grounds collection ref
      const groundsCol = window.db.collection('grounds');
      const _origAdd   = groundsCol.add.bind(groundsCol);
      groundsCol.add = async function (data) {
        // Restore original immediately (one-shot)
        groundsCol.add = _origAdd;
        const patched = {
          ...data,
          city     : cityVal,
          cityLower: cityVal.toLowerCase(),
        };
        return _origAdd(patched);
      };

      return _orig.call(this, e);
    };

    console.log('[UI] handleAddGround patched — city field injected');
  }


  /* ═══════════════════════════════════════════════════════════
     9.  _bmgMarkPaymentSent PERMISSION FIX
         The earnings fix tries to write to payouts/ but the Firestore
         rule requires status == "pending" on create. We patch it to
         always include that field, and fall back gracefully on error.
     ═══════════════════════════════════════════════════════════ */
  function patchMarkPaymentSent() {
    if (typeof window._bmgMarkPaymentSent !== 'function') {
      setTimeout(patchMarkPaymentSent, 500);
      return;
    }

    const _orig = window._bmgMarkPaymentSent;
    window._bmgMarkPaymentSent = async function (bookingId, ...rest) {
      try {
        // Ensure the payout record being created has status:"pending"
        // so it satisfies the Firestore security rule.
        // We intercept db.collection('payouts').add
        if (window.db) {
          const col = window.db.collection('payouts');
          const _origAdd = col.add.bind(col);
          col.add = async function (data) {
            col.add = _origAdd; // restore
            return _origAdd({ status: 'pending', ...data });
          };
        }
        return await _orig.call(this, bookingId, ...rest);
      } catch (err) {
        console.warn('[UI] _bmgMarkPaymentSent fell back — insufficient permissions:', err.message);
        // Show user-friendly message instead of silent failure
        if (typeof window.showToast === 'function') {
          window.showToast('Could not mark as sent — please contact admin.', 'warning');
        }
      }
    };
    console.log('[UI] _bmgMarkPaymentSent patched — status:pending injected');
  }


  /* ═══════════════════════════════════════════════════════════
     10.  LOGO NAME SYNC (in case app.js overwrites it)
     ═══════════════════════════════════════════════════════════ */
  function patchLogoText() {
    document.querySelectorAll('.logo').forEach(el => {
      if (el.innerHTML.includes('BookMy')) {
        el.innerHTML = 'Spörto<span>Book</span>';
      }
    });
  }


  /* ═══════════════════════════════════════════════════════════
     11.  BOOT — wire everything up once auth is ready
     ═══════════════════════════════════════════════════════════ */
  function onAuthReady(user) {
    syncQrScanner();
    patchLogoText();

    if (user) {
      // Signed in
      startUpcomingBannerListener();
      triggerGroundsLoad();
    } else {
      // Signed out
      stopUpcomingBannerListener();
    }
  }

  function boot() {
    // Patch things that need function references
    patchGetUserLocation();
    patchHandleAddGround();
    patchMarkPaymentSent();

    // Wire search
    patchSearchForCity();

    // Sync QR now
    syncQrScanner();
    patchLogoText();

    // Watch for auth changes via currentUser polling
    // (works alongside Firebase onAuthStateChanged in app.js)
    let _lastUid = null;
    setInterval(() => {
      const uid = window.currentUser?.uid || null;
      if (uid !== _lastUid) {
        _lastUid = uid;
        onAuthReady(window.currentUser);
      }
    }, 500);

    // Re-wire on page navigation
    window.addEventListener('bmg:pageShown', function (e) {
      const pageId = e.detail?.pageId;
      if (pageId === 'main-page') {
        setTimeout(syncQrScanner, 80);
        setTimeout(patchLogoText, 80);
        setTimeout(patchSearchForCity, 80);
        // Re-load grounds if container is empty
        const container = document.getElementById('nearby-venues');
        if (container && (!container.children.length || container.querySelector('.skeleton-loading'))) {
          setTimeout(triggerGroundsLoad, 200);
        }
      }
    });

    // Payment confirmed → reload upcoming banner
    window.addEventListener('bmg:paymentConfirmed', function () {
      setTimeout(startUpcomingBannerListener, 1000);
    });

    console.log('✅ [sportobook_ui.js v2] All fixes loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 100);
  }

})();