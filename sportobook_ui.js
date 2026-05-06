/**
 * sportobook_ui.js
 * Zepto-style UI enhancements for SpörtoBook
 */

(function () {
  'use strict';

  /* ── 1. Upcoming Booking Banner ─────────────────────────── */
  function updateUpcomingBanner() {
    const banner  = document.getElementById('spb-upcoming-banner');
    const nameEl  = document.getElementById('spb-upcoming-name');
    const addrEl  = document.getElementById('spb-upcoming-addr');
    const timeEl  = document.getElementById('spb-upcoming-time');
    if (!banner) return;

    const user = window.currentUser;
    if (!user || !window.db) return;

    const now = new Date();

    window.db.collection('bookings')
      .where('userId', '==', user.uid)
      .where('bookingStatus', '==', 'confirmed')
      .orderBy('date', 'asc')
      .limit(5)
      .get()
      .then(snap => {
        if (snap.empty) return;

        let upcoming = null;
        snap.forEach(doc => {
          const b = doc.data();
          const bookingDate = new Date(b.date + ' ' + (b.slotTime || '00:00'));
          if (bookingDate >= now && !upcoming) {
            upcoming = { ...b, id: doc.id, bookingDate };
          }
        });

        if (!upcoming) return;

        banner.classList.remove('empty');
        if (nameEl) nameEl.textContent = upcoming.groundName || upcoming.venueName || 'Ground Booking';
        if (addrEl) addrEl.textContent = upcoming.groundAddress || upcoming.venueAddress || upcoming.date || '';

        if (timeEl) {
          timeEl.style.display = 'block';
          timeEl.textContent = upcoming.slotTime || upcoming.date || 'Upcoming';
        }

        banner.style.cursor = 'pointer';
        banner.onclick = () => {
          if (typeof window.showPage === 'function') window.showPage('bookings-page');
        };
      })
      .catch(() => {});
  }

  /* ── 2. QR Scanner always visible ────────────────────────── */
  function ensureQrVisible() {
    const btn = document.getElementById('header-qr-scanner');
    if (btn) {
      btn.style.display = 'flex';
      btn.style.visibility = 'visible';
    }
  }

  /* ── 3. Sport filter ─────────────────────────────────────── */
  window.filterBySport = function (sport) {
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.value = sport;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window.filterGroundsBySport === 'function') window.filterGroundsBySport(sport);
    else if (typeof window.searchVenues === 'function') window.searchVenues(sport);
  };

  /* ── 4. Logo patch ───────────────────────────────────────── */
  function patchLogoText() {
    const logo = document.querySelector('.logo');
    if (logo && logo.innerHTML.includes('BookMy')) {
      logo.innerHTML = 'Spörto<span>Book</span>';
    }
  }

  /* ── 5. Search placeholder ───────────────────────────────── */
  function fixSearchPlaceholder() {
    const inp = document.getElementById('global-search');
    if (inp) inp.placeholder = 'Search grounds, sports, locations...';
  }

  /* ── 6. Boot ─────────────────────────────────────────────── */
  function boot() {
    ensureQrVisible();
    patchLogoText();
    fixSearchPlaceholder();

    if (window.currentUser) {
      updateUpcomingBanner();
    } else {
      const check = setInterval(() => {
        if (window.currentUser) { clearInterval(check); updateUpcomingBanner(); }
      }, 800);
      setTimeout(() => clearInterval(check), 15000);
    }

    window.addEventListener('bmg:pageShown', function (e) {
      if (e.detail?.pageId === 'main-page') {
        setTimeout(ensureQrVisible, 50);
        setTimeout(patchLogoText, 50);
        setTimeout(fixSearchPlaceholder, 50);
        setTimeout(updateUpcomingBanner, 400);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 200);
  }

  console.log('✅ [sportobook_ui.js] Zepto-style UI loaded');
})();