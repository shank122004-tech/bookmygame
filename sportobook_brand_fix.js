/**
 * sportobook_brand_fix.js  — FINAL BRAND OVERRIDE
 * ─────────────────────────────────────────────────────────────────
 *  Permanently replaces every "BookMyGame" text with "SpörtoBook"
 *  across the entire app — including dynamic DOM injections from
 *  app.js (toasts, entry pass header, welcome messages, etc.)
 *
 *  Also:
 *  • Removes football icon from splash — text-only branding
 *  • Keeps the existing purple/indigo colour scheme untouched
 *  • Shows ALL grounds on home page (no 4-card limit)
 *
 *  Load LAST in index.html (after sportobook_ui_fix.js):
 *    <script src="sportobook_brand_fix.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── string replacements ── */
  var TEXT_MAP = [
    ['BookMyGame',   'SpörtoBook'],
    ['bookmygame',   'sportobook'],
    ['Book My Game', 'SpörtoBook'],
    ['BOOKMYGAME',   'SPORTOBOOK'],
  ];

  /* ════════════════════════════════════════════════════════════════
     1.  TEXT-NODE WALKER
  ════════════════════════════════════════════════════════════════ */
  function replaceTextNodes(root) {
    var walker = document.createTreeWalker(
      root || document.body, NodeFilter.SHOW_TEXT, null, false
    );
    var node;
    while ((node = walker.nextNode())) {
      var val = node.nodeValue;
      if (!val || !val.includes('Book')) continue;
      var r = val;
      TEXT_MAP.forEach(function (p) { r = r.split(p[0]).join(p[1]); });
      if (r !== val) node.nodeValue = r;
    }
  }

  /* ════════════════════════════════════════════════════════════════
     2.  LOGO / HEADER — keeps colour, swaps text
  ════════════════════════════════════════════════════════════════ */
  function patchLogos() {
    document.querySelectorAll(
      '.main-header .logo, .main-header h1'
    ).forEach(function (el) {
      if (!el.textContent.trim()) return;
      el.innerHTML = 'Sp\u00f6rto<span>Book</span>';
    });
  }

  /* ════════════════════════════════════════════════════════════════
     3.  SPLASH — text-only, no icon, keep existing purple colours
  ════════════════════════════════════════════════════════════════ */
  function patchSplash() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;

    /* Remove any standalone icon/img that appears BEFORE the title text */
    splash.querySelectorAll('img, .splash-icon, .splash-logo-icon, .brand-logo, .splash-logo').forEach(function (el) {
      /* Don't remove icons INSIDE .splash-benefit-card or .splash-sport-visual */
      if (!el.closest('.splash-benefit-card') && !el.closest('.splash-sport-visual')) {
        el.remove();
      }
    });

    /* Remove <i> tags that are direct children of splash-content (stray icons) */
    var content = splash.querySelector('.splash-content');
    if (content) {
      Array.from(content.childNodes).forEach(function (node) {
        if (node.nodeName === 'I') node.remove();
      });
    }

    /* Fix title */
    var title = splash.querySelector('.splash-title, h1');
    if (title) {
      title.querySelectorAll('i, img').forEach(function (el) { el.remove(); });
      if (title.textContent.toLowerCase().includes('book')) {
        title.innerHTML = 'Sp\u00f6rto<span>Book</span>';
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════
     4.  HOME PAGE — show ALL active grounds (no 4-card limit)
  ════════════════════════════════════════════════════════════════ */
  function patchLoadNearbyVenues() {
    if (typeof window.loadNearbyVenues !== 'function') return;
    if (window.loadNearbyVenues._spbPatched) return;

    var _orig = window.loadNearbyVenues;
    window.loadNearbyVenues = async function () {
      var container = document.getElementById('nearby-venues');
      if (!container || !window.db) { return _orig(); }

      container.innerHTML =
        '<div class="skeleton-loading">' +
        '<div class="skeleton-card"></div><div class="skeleton-card"></div>' +
        '<div class="skeleton-card"></div></div>';

      try {
        var C = window.COLLECTIONS || { VENUES: 'venues', GROUNDS: 'grounds', OWNERS: 'owners' };
        var snaps = await Promise.all([
          window.db.collection(C.VENUES  || 'venues' ).where('hidden', '==', false).get(),
          window.db.collection(C.GROUNDS || 'grounds').where('status', '==', 'active').get()
        ]);

        var venues = [], grounds = [];
        snaps[0].forEach(function (d) { venues.push(Object.assign({ id: d.id, type: 'venue'  }, d.data())); });
        snaps[1].forEach(function (d) { grounds.push(Object.assign({ id: d.id, type: 'ground', ownerType: 'plot_owner' }, d.data())); });

        var all = venues.concat(grounds);
        if (!all.length) {
          container.innerHTML =
            '<div class="empty-state"><i class="fas fa-map-marker-alt"></i>' +
            '<h3>No grounds listed yet</h3><p>Check back soon!</p></div>';
          return;
        }

        /* Use app renderer (shows ALL — no slice) */
        if (typeof window.displayVenueItems === 'function') {
          window.displayVenueItems(container, all);
        } else {
          _renderCards(container, all);
        }

        /* Background: fill owner-type badges */
        setTimeout(async function () {
          for (var i = 0; i < grounds.length; i++) {
            var g = grounds[i];
            if (!g.ownerId) continue;
            try {
              var od = await window.db.collection(C.OWNERS || 'owners').doc(g.ownerId).get();
              if (od.exists) g.ownerType = od.data().ownerType || 'venue_owner';
            } catch (_) {}
          }
          if (typeof window.displayVenueItems === 'function') {
            window.displayVenueItems(container, all);
          } else {
            _renderCards(container, all);
          }
        }, 300);

      } catch (err) {
        console.warn('[sportobook_brand_fix] grounds error, fallback:', err);
        _orig();
      }
    };
    window.loadNearbyVenues._spbPatched = true;
    console.log('[sportobook_brand_fix] loadNearbyVenues → ALL grounds ✅');
  }

  function _renderCards(container, items) {
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    container.innerHTML = items.map(function (item) {
      var isG = item.type === 'ground';
      var name  = esc(isG ? item.groundName : item.venueName);
      var sport = esc(item.sportType || 'Multi-sport');
      var img   = item.images && item.images[0];
      var imgHtml = img
        ? '<img src="'+esc(img)+'" alt="'+name+'" class="venue-image" style="width:72px;height:72px;object-fit:cover;border-radius:12px;flex-shrink:0;" onerror="this.style.display=\'none\'">'
        : '<div style="width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">🏟️</div>';
      var price = isG && item.pricePerHour
        ? '<span style="font-size:.72rem;background:#EEF2FF;color:#4F46E5;padding:2px 8px;border-radius:20px;font-weight:600;">₹'+item.pricePerHour+'/hr</span>' : '';
      var da = isG ? 'data-ground-id="'+item.id+'"' : 'data-venue-id="'+item.id+'"';
      return '<div class="venue-card spb-card" '+da+' data-type="'+item.type+'" '+
        'style="display:flex;gap:12px;padding:14px;background:#fff;border-radius:16px;'+
        'margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);cursor:pointer;align-items:center;">'+
        imgHtml+
        '<div style="flex:1;min-width:0;">'+
          '<h3 style="margin:0 0 4px;font-size:.93rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+name+'</h3>'+
          '<div style="font-size:.78rem;color:#64748B;margin-bottom:5px;">'+sport+'</div>'+
          price+
        '</div>'+
        '<button style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border:none;'+
        'border-radius:10px;padding:8px 12px;font-size:.75rem;font-weight:700;cursor:pointer;white-space:nowrap;">'+
        'View &amp; Book</button></div>';
    }).join('');
    container.querySelectorAll('.spb-card[data-ground-id]').forEach(function (c) {
      c.addEventListener('click', function () { window.viewGround && window.viewGround(c.dataset.groundId); });
    });
    container.querySelectorAll('.spb-card[data-venue-id]').forEach(function (c) {
      c.addEventListener('click', function () { window.viewVenue && window.viewVenue(c.dataset.venueId); });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     5.  BOOT + PERSISTENT MUTATION OBSERVER
  ════════════════════════════════════════════════════════════════ */
  function runAll() {
    replaceTextNodes(document.body);
    patchLogos();
    patchSplash();
    patchLoadNearbyVenues();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }

  /* Watch for any dynamic "BookMyGame" injections (toasts, entry pass, etc.) */
  var _timer = null;
  var _observer = new MutationObserver(function (mutations) {
    var needsRun = mutations.some(function (m) {
      return Array.from(m.addedNodes).some(function (n) {
        return n.textContent && n.textContent.includes('Book');
      });
    });
    if (!needsRun) return;
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      replaceTextNodes(document.body);
      patchLogos();
      patchSplash();
      patchLoadNearbyVenues();
    }, 50);
  });

  function startObs() {
    if (document.body) {
      _observer.observe(document.body, { childList: true, subtree: true });
      console.log('[sportobook_brand_fix] Persistent observer active ✅');
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        _observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }
  startObs();

})();