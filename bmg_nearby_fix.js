/**
 * bmg_nearby_fix.js
 * Fixes "View & Book" button not working on home page nearby ground cards.
 *
 * Add to index.html AFTER bmg_master_patch_v3.js:
 *   <script src="bmg_nearby_fix.js"></script>
 */

(function () {
  'use strict';

  // ── correct function names from app.js ──
  function _openItem(id, type) {
    if (type === 'venue') {
      if (typeof window.viewVenue === 'function') return window.viewVenue(id);
    }
    if (typeof window.viewGround === 'function') return window.viewGround(id);
  }

  // ── patch loadNearbyVenues to use correct names + fix button bubbling ──
  function _patchNearby() {
    const _origLoad = window.loadNearbyVenues;
    if (typeof _origLoad !== 'function') {
      setTimeout(_patchNearby, 300);
      return;
    }

    window.loadNearbyVenues = async function () {
      await _origLoad();          // run the existing patched version

      // Re-wire ALL cards in #nearby-venues using event delegation
      // so both the card click AND the button click work correctly
      const container = document.getElementById('nearby-venues');
      if (!container) return;

      // Remove old listeners by replacing with a clone
      const fresh = container.cloneNode(true);
      container.parentNode.replaceChild(fresh, container);

      fresh.addEventListener('click', function (e) {
        // Walk up from click target to find the card
        const card = e.target.closest('.bmg-venue-card[data-id]');
        if (!card) return;
        e.stopPropagation();
        _openItem(card.dataset.id, card.dataset.type);
      });
    };

    console.log('[bmg_nearby_fix] loadNearbyVenues re-wired with correct function names ✅');
  }

  // ── also fix any cards already rendered on the page ──
  function _fixExistingCards() {
    const container = document.getElementById('nearby-venues');
    if (!container) return;

    // Remove stale listeners via clone
    const fresh = container.cloneNode(true);
    container.parentNode.replaceChild(fresh, container);

    fresh.addEventListener('click', function (e) {
      const card = e.target.closest('.bmg-venue-card[data-id]');
      if (!card) return;
      e.stopPropagation();
      _openItem(card.dataset.id, card.dataset.type);
    });

    // Also fix old-style cards from original displayVenueItems
    // which use data-ground-id / data-venue-id attributes
    fresh.querySelectorAll('.venue-card[data-ground-id]').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => window.viewGround?.(card.dataset.groundId));
    });
    fresh.querySelectorAll('.venue-card[data-venue-id]').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => window.viewVenue?.(card.dataset.venueId));
    });
  }

  function _boot() {
    _patchNearby();
    _fixExistingCards();

    // Re-fix after every time loadNearbyVenues is called
    // by observing the container for DOM changes
    const target = document.getElementById('nearby-venues');
    if (target) {
      new MutationObserver(() => {
        // Small delay so the new cards are fully in the DOM
        setTimeout(_fixExistingCards, 100);
      }).observe(target, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    setTimeout(_boot, 200);
  }

})();