/**
 * sportobook_swipe_cards.js
 * ─────────────────────────────────────────────────────────────────
 *  [1] SWIPEABLE GROUND CARDS on home page
 *      • Horizontal swipe carousel (not vertical scroll)
 *      • Card style matching the Blinkit/Zepto product card design
 *      • Discount % badge (top-left, blob shape)
 *      • Strikethrough original price + discounted price
 *      • BOOK button (replaces ADD)
 *      • Touch + mouse drag support
 *
 *  [2] DISCOUNT FIELD in Add Ground form
 *      • "Offer %" input (0-90%) in the Pricing step
 *      • Live preview: original price → discounted price
 *      • Saves discountPercent + discountedPrice to Firestore ground doc
 *
 *  [3] OWNER EARNINGS — shows discounted price paid (not original)
 *      • Patches the earnings display to show:
 *        "Customer paid ₹X (after Y% off)"
 *      • ownerAmount is always based on the actual amount received
 *
 *  LOAD LAST in index.html:
 *    <script src="sportobook_swipe_cards.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     §1  INJECT CSS
  ═══════════════════════════════════════════════════════════════ */
  (function injectCSS() {
    function _inject() {
      var old = document.getElementById('spb-swipe-styles');
      if (old) old.remove(); /* always remove and re-inject to win cascade */
      var s = document.createElement('style');
      s.id = 'spb-swipe-styles';
    s.textContent = `

      /* ── Swipe container ───────────────────────────────────── */
      #nearby-venues {
        display: flex !important;
        flex-direction: row !important;
        gap: 14px !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scroll-snap-type: x mandatory !important;
        -webkit-overflow-scrolling: touch !important;
        padding: 8px 4px 16px !important;
        grid-template-columns: unset !important;
        /* Hide scrollbar */
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      #nearby-venues::-webkit-scrollbar { display: none !important; }

      /* ── Individual ground card ─────────────────────────────── */
      #nearby-venues .spb-gcard {
        flex: 0 0 175px !important;
        width: 175px !important;
        min-width: 175px !important;
        scroll-snap-align: start !important;
        background: #fff !important;
        border-radius: 18px !important;
        overflow: visible !important;
        box-shadow: 0 2px 12px rgba(0,0,0,.09) !important;
        cursor: pointer !important;
        display: flex !important;
        flex-direction: column !important;
        position: relative !important;
        transition: transform .15s !important;
        margin: 0 !important;
        border: 1px solid #f0f0f0 !important;
      }
      #nearby-venues .spb-gcard:active { transform: scale(.97) !important; }

      /* ── Discount badge (blob shape) ────────────────────────── */
      .spb-discount-blob {
        position: absolute !important;
        top: -4px !important;
        left: -4px !important;
        z-index: 10 !important;
        background: linear-gradient(135deg, #4CAF50, #2E7D32) !important;
        color: #fff !important;
        font-size: .68rem !important;
        font-weight: 800 !important;
        line-height: 1.2 !important;
        text-align: center !important;
        padding: 7px 8px 8px !important;
        min-width: 52px !important;
        border-radius: 50% 50% 50% 12px !important;
        box-shadow: 0 3px 10px rgba(76,175,80,.4) !important;
        pointer-events: none !important;
      }

      /* ── Image area ─────────────────────────────────────────── */
      .spb-gcard-img-wrap {
        width: 100% !important;
        height: 140px !important;
        overflow: hidden !important;
        border-radius: 16px 16px 0 0 !important;
        flex-shrink: 0 !important;
        background: linear-gradient(135deg,#667eea,#764ba2) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .spb-gcard-img-wrap img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
      }
      .spb-gcard-img-placeholder {
        font-size: 3rem !important;
      }

      /* ── Card body ──────────────────────────────────────────── */
      .spb-gcard-body {
        padding: 10px 10px 8px !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
      }
      .spb-gcard-name {
        font-size: .82rem !important;
        font-weight: 700 !important;
        color: #1a1a1a !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        margin: 0 !important;
        line-height: 1.3 !important;
      }
      .spb-gcard-sport {
        font-size: .68rem !important;
        color: #777 !important;
        margin: 0 !important;
      }
      .spb-gcard-price-row {
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
        margin-top: 4px !important;
        flex-wrap: wrap !important;
      }
      .spb-gcard-price {
        font-size: .88rem !important;
        font-weight: 800 !important;
        color: #1a1a1a !important;
      }
      .spb-gcard-original {
        font-size: .72rem !important;
        color: #999 !important;
        text-decoration: line-through !important;
      }

      /* ── BOOK button ────────────────────────────────────────── */
      .spb-gcard-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 0 10px 10px !important;
        gap: 6px !important;
      }
      .spb-book-btn {
        background: #fff !important;
        color: #4F46E5 !important;
        border: 2px solid #4F46E5 !important;
        border-radius: 10px !important;
        padding: 7px 18px !important;
        font-size: .78rem !important;
        font-weight: 800 !important;
        cursor: pointer !important;
        letter-spacing: .02em !important;
        transition: background .15s, color .15s !important;
        white-space: nowrap !important;
      }
      .spb-book-btn:hover {
        background: #4F46E5 !important;
        color: #fff !important;
      }

      /* ── Empty / loading states ─────────────────────────────── */
      #nearby-venues .spb-empty-state {
        flex: 0 0 100% !important;
        width: 100% !important;
        text-align: center !important;
        padding: 40px 20px !important;
        color: #94A3B8 !important;
      }
      #nearby-venues .skeleton-loading {
        display: flex !important;
        flex-direction: row !important;
        gap: 14px !important;
      }
      #nearby-venues .skeleton-card {
        flex: 0 0 175px !important;
        height: 240px !important;
        border-radius: 18px !important;
      }

      /* ── Discount input in add-ground form ──────────────────── */
      #spb-discount-group {
        margin-top: 16px;
      }
      #spb-discount-group .form-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: .85rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
      }
      #ground-discount-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #E5E7EB;
        border-radius: 12px;
        font-size: .9rem;
        outline: none;
        transition: border-color .2s;
        box-sizing: border-box;
      }
      #ground-discount-input:focus { border-color: #4F46E5; }

      #spb-discount-preview {
        margin-top: 10px;
        background: linear-gradient(135deg,#EEF2FF,#E0E7FF);
        border: 1px solid #C7D2FE;
        border-radius: 12px;
        padding: 12px 16px;
        font-size: .82rem;
        color: #3730A3;
        display: none;
      }
      #spb-discount-preview .dp-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
      }
      #spb-discount-preview .dp-final {
        font-weight: 800;
        font-size: .9rem;
        color: #1D4ED8;
        border-top: 1px solid #C7D2FE;
        margin-top: 6px;
        padding-top: 6px;
      }
    `;
      (document.head || document.documentElement).appendChild(s);
    }
    _inject();
    /* Re-inject after 500ms to beat any late-loading stylesheets */
    setTimeout(_inject, 500);
    setTimeout(_inject, 1500);
  })();


  /* ═══════════════════════════════════════════════════════════════
     §2  SPORT EMOJI MAP
  ═══════════════════════════════════════════════════════════════ */
  var SPORT_EMOJI = {
    cricket:'🏏', football:'⚽', badminton:'🏸', tennis:'🎾',
    basketball:'🏀', volleyball:'🏐', swimming:'🏊', multi:'🎯',
    default:'🏟️'
  };
  function sportEmoji(s) {
    if (!s) return SPORT_EMOJI.default;
    var k = (s+'').toLowerCase();
    return SPORT_EMOJI[k] || SPORT_EMOJI.default;
  }


  /* ═══════════════════════════════════════════════════════════════
     §3  RENDER SWIPEABLE GROUND CARDS
  ═══════════════════════════════════════════════════════════════ */
  function _esc(str) {
    return String(str || '').replace(/[<>&"']/g, function(c) {
      return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function renderSwipeCards(container, items) {
    if (!items || !items.length) {
      container.innerHTML =
        '<div class="spb-empty-state">'+
        '<div style="font-size:2.5rem;margin-bottom:8px;">🏟️</div>'+
        '<p style="font-size:.85rem;">No grounds listed yet</p>'+
        '</div>';
      return;
    }

    container.innerHTML = items.map(function(item) {
      var isGround = item.type === 'ground';
      var name     = _esc(isGround ? (item.groundName || item.name) : (item.venueName || item.name));
      var sport    = _esc(item.sportType || 'Multi-sport');
      var emoji    = sportEmoji(item.sportType);
      var img      = item.images && item.images[0];

      /* Price + discount logic */
      var origPrice      = item.pricePerHour || 0;
      var discountPct    = item.discountPercent || 0;
      var discountedPrice = item.discountedPrice ||
        (discountPct > 0 ? Math.round(origPrice * (1 - discountPct / 100)) : origPrice);

      var imgHtml = img
        ? '<img src="'+_esc(img)+'" alt="'+name+'" loading="lazy" onerror="this.parentNode.innerHTML=\'<span class=spb-gcard-img-placeholder>'+emoji+'</span>\'">'
        : '<span class="spb-gcard-img-placeholder">'+emoji+'</span>';

      var discountBadge = discountPct > 0
        ? '<div class="spb-discount-blob">'+Math.round(discountPct)+'%<br>OFF</div>'
        : '';

      var priceRow = '';
      if (origPrice > 0) {
        if (discountPct > 0) {
          priceRow =
            '<div class="spb-gcard-price-row">'+
            '<span class="spb-gcard-price">₹'+discountedPrice+'/hr</span>'+
            '<span class="spb-gcard-original">₹'+origPrice+'</span>'+
            '</div>';
        } else {
          priceRow =
            '<div class="spb-gcard-price-row">'+
            '<span class="spb-gcard-price">₹'+origPrice+'/hr</span>'+
            '</div>';
        }
      }

      var da = isGround
        ? 'data-ground-id="'+_esc(item.id)+'"'
        : 'data-venue-id="'+_esc(item.id)+'"';

      return (
        '<div class="spb-gcard" '+da+' data-type="'+(isGround?'ground':'venue')+'">'+
          discountBadge+
          '<div class="spb-gcard-img-wrap">'+imgHtml+'</div>'+
          '<div class="spb-gcard-body">'+
            '<p class="spb-gcard-name">'+name+'</p>'+
            '<p class="spb-gcard-sport">'+emoji+' '+sport+'</p>'+
            priceRow+
          '</div>'+
          '<div class="spb-gcard-footer">'+
            priceRow+  /* repeated smaller below name on mobile is odd — keep only here */
            '<button class="spb-book-btn">BOOK</button>'+
          '</div>'+
        '</div>'
      );
    }).join('');

    /* Remove the duplicate price row from body since footer has it */
    container.querySelectorAll('.spb-gcard-body .spb-gcard-price-row').forEach(function(el){
      el.remove();
    });

    /* Click handlers */
    container.querySelectorAll('.spb-gcard[data-ground-id]').forEach(function(card) {
      card.addEventListener('click', function() {
        if (typeof window.viewGround === 'function') window.viewGround(card.dataset.groundId);
      });
    });
    container.querySelectorAll('.spb-gcard[data-venue-id]').forEach(function(card) {
      card.addEventListener('click', function() {
        if (typeof window.viewVenue === 'function') window.viewVenue(card.dataset.venueId);
      });
    });
    /* BOOK button — stop propagation so card click doesn't also fire */
    container.querySelectorAll('.spb-book-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = btn.closest('[data-ground-id],[data-venue-id]');
        if (!card) return;
        if (card.dataset.groundId && typeof window.viewGround === 'function') {
          window.viewGround(card.dataset.groundId);
        } else if (card.dataset.venueId && typeof window.viewVenue === 'function') {
          window.viewVenue(card.dataset.venueId);
        }
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════════
     §4  PATCH loadNearbyVenues + displayVenueItems
  ═══════════════════════════════════════════════════════════════ */
  function patchVenueFunctions() {
    /* Patch displayVenueItems — used by app.js after city-filter etc. */
    var _origDisplay = window.displayVenueItems;
    window.displayVenueItems = function(container, items) {
      var target = container || document.getElementById('nearby-venues');
      if (!target) return _origDisplay && _origDisplay(container, items);
      if (target.id === 'nearby-venues' || target.id === 'filtered-venues') {
        renderSwipeCards(target, items);
      } else {
        _origDisplay && _origDisplay(container, items);
      }
    };
    window.displayVenueItems._spbSwipe = true;

    /* Patch loadNearbyVenues — fetches and renders all grounds */
    var _origLoad = window.loadNearbyVenues;
    if (_origLoad && !_origLoad._spbSwipePatch) {
      window.loadNearbyVenues = async function() {
        var container = document.getElementById('nearby-venues');
        var db = window.db;
        if (!db || !container) return _origLoad && _origLoad();

        /* Skeleton */
        container.innerHTML =
          '<div class="skeleton-loading">'+
          '<div class="skeleton-card"></div>'+
          '<div class="skeleton-card"></div>'+
          '<div class="skeleton-card"></div>'+
          '</div>';

        try {
          var snaps = await Promise.all([
            db.collection('venues').where('hidden','==',false).get().catch(function(){return {forEach:function(){},docs:[]};}),
            db.collection('grounds').where('status','==','active').get().catch(function(){return {forEach:function(){},docs:[]};})
          ]);

          var all = [];
          snaps[0].forEach(function(d){ all.push(Object.assign({id:d.id,type:'venue'},d.data())); });
          snaps[1].forEach(function(d){ all.push(Object.assign({id:d.id,type:'ground'},d.data())); });

          renderSwipeCards(container, all);
        } catch(err) {
          console.warn('[spb-swipe] loadNearbyVenues error, fallback:', err);
          _origLoad && _origLoad();
        }
      };
      window.loadNearbyVenues._spbSwipePatch = true;
    }

    console.log('[spb-swipe] Venue functions patched ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §5  DRAG-TO-SCROLL (mouse + touch)
  ═══════════════════════════════════════════════════════════════ */
  function initDragScroll(el) {
    if (!el || el._spbDrag) return;
    el._spbDrag = true;
    var isDown = false, startX = 0, scrollLeft = 0;

    el.addEventListener('mousedown', function(e) {
      isDown = true;
      el.style.cursor = 'grabbing';
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      e.preventDefault();
    });
    el.addEventListener('mouseleave', function() { isDown = false; el.style.cursor = ''; });
    el.addEventListener('mouseup',    function() { isDown = false; el.style.cursor = ''; });
    el.addEventListener('mousemove',  function(e) {
      if (!isDown) return;
      var x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft - (x - startX);
    });
  }

  function initCarouselDrag() {
    var container = document.getElementById('nearby-venues');
    if (container) initDragScroll(container);
  }


  /* ═══════════════════════════════════════════════════════════════
     §6  ADD DISCOUNT FIELD TO "ADD GROUND" FORM
  ═══════════════════════════════════════════════════════════════ */
  function injectDiscountField() {
    /* Already injected */
    if (document.getElementById('spb-discount-group')) return;

    /* Find the pricing step — it contains #ground-price-input */
    var priceSelect = document.getElementById('ground-price-input');
    if (!priceSelect) return;

    /* Find the earning-preview div — insert our block before it */
    var earningPreview = priceSelect.closest('.form-card') &&
      priceSelect.closest('.form-card').querySelector('.earning-preview');
    var insertAfter = earningPreview || priceSelect.closest('.form-group-modern');
    if (!insertAfter) return;

    var discountGroup = document.createElement('div');
    discountGroup.id  = 'spb-discount-group';
    discountGroup.className = 'form-group-modern';
    discountGroup.innerHTML =
      '<label class="form-label" for="ground-discount-input">'+
        '<i class="fas fa-percent" style="color:#10B981;"></i>'+
        ' Offer / Discount % <span style="font-size:.72rem;color:#6B7280;font-weight:400;">(optional — 0 means no offer)</span>'+
      '</label>'+
      '<input type="number" id="ground-discount-input" class="form-input-modern"'+
        ' placeholder="e.g. 20 for 20% off" min="0" max="90" step="1" value="0">'+
      '<div class="form-hint">Customers will see strikethrough original price and the discounted price</div>'+
      '<div id="spb-discount-preview"></div>';

    insertAfter.parentNode.insertBefore(discountGroup, insertAfter.nextSibling);

    /* Live preview */
    var discountInput = document.getElementById('ground-discount-input');
    var preview       = document.getElementById('spb-discount-preview');

    function updatePreview() {
      var pct   = Math.max(0, Math.min(90, parseFloat(discountInput.value) || 0));
      var price = parseFloat(priceSelect.value) || 0;
      if (!price || !pct) { preview.style.display = 'none'; return; }
      var discounted = Math.round(price * (1 - pct / 100));
      preview.style.display = 'block';
      preview.innerHTML =
        '<div class="dp-row"><span>Original Price:</span><span><s>₹'+price+'/hr</s></span></div>'+
        '<div class="dp-row"><span>Discount:</span><span style="color:#10B981;">-'+Math.round(pct)+'%</span></div>'+
        '<div class="dp-row dp-final"><span>Customer Pays:</span><span>₹'+discounted+'/hr</span></div>';
    }

    priceSelect.addEventListener('change', updatePreview);
    discountInput.addEventListener('input', updatePreview);
    console.log('[spb-swipe] Discount field injected ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §7  PATCH handleAddGround — save discountPercent to Firestore
  ═══════════════════════════════════════════════════════════════ */
  function patchHandleAddGround() {
    var _orig = window.handleAddGround;
    if (!_orig || _orig._spbDiscountPatch) return;

    window.handleAddGround = async function(e) {
      /* Grab discount before original handler clears the form */
      var discountInput = document.getElementById('ground-discount-input');
      var discPct       = discountInput ? Math.max(0, Math.min(90, parseFloat(discountInput.value) || 0)) : 0;
      var priceEl       = document.getElementById('ground-price-input');
      var origPrice     = priceEl ? (parseFloat(priceEl.value) || 0) : 0;
      var discountedPr  = discPct > 0 ? Math.round(origPrice * (1 - discPct / 100)) : origPrice;

      /* Run original handler */
      var result = await _orig.call(this, e);

      /* After ground is created, patch the latest ground doc with discount fields */
      if (discPct > 0) {
        try {
          var db   = window.db;
          var uid  = window.currentUser && window.currentUser.uid;
          if (db && uid) {
            /* Find the most recently created ground by this owner */
            var snap = await db.collection('grounds')
              .where('ownerId', '==', uid)
              .orderBy('createdAt', 'desc')
              .limit(1)
              .get();
            if (!snap.empty) {
              await snap.docs[0].ref.update({
                discountPercent  : discPct,
                discountedPrice  : discountedPr,
                originalPrice    : origPrice,
              });
              console.log('[spb-swipe] Discount saved to ground:', discPct + '%');
            }
          }
        } catch(err) {
          console.warn('[spb-swipe] Could not save discount:', err);
        }
      }

      return result;
    };
    window.handleAddGround._spbDiscountPatch = true;
    console.log('[spb-swipe] handleAddGround patched for discount ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §8  PATCH EARNINGS DISPLAY — show discounted price paid
  ═══════════════════════════════════════════════════════════════ */
  function patchEarningsDisplay() {
    /* When bookings are rendered in owner dashboard earnings tab,
       show the actual amount the customer paid (after discount),
       not the original price. The ownerAmount field in Firestore
       is already set to 90% of the actual payment so this is
       informational only. We add a note when discountPercent > 0. */

    var _origLoadEarnings = window._bmgLoadOwnerEarningsFull || window.loadOwnerEarnings;
    if (!_origLoadEarnings || _origLoadEarnings._spbDiscountPatch) return;

    var _patched = async function(container) {
      await _origLoadEarnings.call(this, container);

      /* After original renders, find booking rows and enhance them */
      setTimeout(function() {
        container && container.querySelectorAll('[data-booking-id], .booking-row, .earnings-row').forEach(function(row) {
          var discPct = parseFloat(row.dataset.discountPercent || '0');
          if (!discPct) return;
          var origPrice = parseFloat(row.dataset.originalPrice || '0');
          if (!origPrice) return;
          var paid = Math.round(origPrice * (1 - discPct / 100));

          /* Add a small badge showing discount info */
          if (!row.querySelector('.spb-discount-note')) {
            var note = document.createElement('span');
            note.className = 'spb-discount-note';
            note.style.cssText = 'font-size:.65rem;background:#ECFDF5;color:#065F46;'+
              'border-radius:6px;padding:2px 6px;margin-left:6px;font-weight:700;';
            note.textContent = discPct + '% off applied — customer paid ₹' + paid;
            row.appendChild(note);
          }
        });
      }, 500);
    };
    _patched._spbDiscountPatch = true;
    window._bmgLoadOwnerEarningsFull = _patched;
    window.loadOwnerEarnings         = _patched;
    console.log('[spb-swipe] Earnings display patched for discount ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §9  BOOT
  ═══════════════════════════════════════════════════════════════ */
  function boot() {
    patchVenueFunctions();
    initCarouselDrag();
    injectDiscountField();
    patchHandleAddGround();
    patchEarningsDisplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }

  /* Re-apply when SPA navigates to home or add-ground */
  window.addEventListener('bmg:pageShown', function(e) {
    var pid = e && e.detail && e.detail.pageId;
    if (!pid) return;
    if (/main|home/.test(pid)) {
      setTimeout(function(){
        initCarouselDrag();
        patchVenueFunctions();
      }, 200);
    }
    if (/ground|owner|dashboard/.test(pid)) {
      setTimeout(function(){
        injectDiscountField();
        patchHandleAddGround();
        patchEarningsDisplay();
      }, 400);
    }
  });

  /* Watch for discount field getting removed by SPA re-render */
  new MutationObserver(function() {
    if (!document.getElementById('spb-discount-group')) {
      injectDiscountField();
    }
  }).observe(document.body, { childList: true, subtree: true });

  console.log('[sportobook_swipe_cards] Loaded ✅');

})();