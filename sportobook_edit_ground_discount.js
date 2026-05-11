/**
 * sportobook_edit_ground_discount.js
 * ─────────────────────────────────────────────────────────────────
 *  Enhances the "Edit Price" modal in Owner Dashboard with:
 *
 *  [1] DISCOUNT / OFFER % field in Edit Ground modal
 *      • Input for 0-90% discount alongside price selection
 *      • Live preview: original ₹price → ₹discounted (X% off)
 *      • Saves discountPercent + discountedPrice + originalPrice to Firestore
 *      • Pre-fills existing discount when re-opening modal
 *
 *  [2] OFFER BADGE on ground card in owner dashboard
 *      • Shows "X% OFF" green badge when discount is active
 *      • Shows strikethrough original + discounted price
 *
 *  [3] EARNINGS DASHBOARD — real discount-aware data
 *      • Booking rows now show:
 *          "Customer paid ₹X (Y% off from ₹Z) → Your share: ₹A"
 *      • ownerAmount is always 90% of what the customer actually paid
 *        (the discounted price), so earnings are accurate
 *
 *  [4] BOOKING PRICE — uses discounted price when booking
 *      • Patches the booking flow so the amount charged to the user
 *        is the discountedPrice (not originalPrice) if discount is set
 *
 *  LOAD LAST after sportobook_all_fixes.js and sportobook_swipe_cards.js
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     §1  CSS
  ═══════════════════════════════════════════════════════════════ */
  (function injectCSS() {
    var s = document.createElement('style');
    s.id = 'spb-edit-discount-styles';
    s.textContent = `

      /* ── Discount field in edit modal ───────────────────────── */
      #spb-edit-discount-group {
        margin-top: 16px;
      }
      #spb-edit-discount-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: .85rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
      }
      #edit-ground-discount {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #E5E7EB;
        border-radius: 12px;
        font-size: .9rem;
        outline: none;
        transition: border-color .2s;
        box-sizing: border-box;
        background: #fff;
      }
      #edit-ground-discount:focus { border-color: #4F46E5; }

      #spb-edit-discount-preview {
        margin-top: 10px;
        background: linear-gradient(135deg, #ECFDF5, #D1FAE5);
        border: 1.5px solid #6EE7B7;
        border-radius: 12px;
        padding: 12px 16px;
        font-size: .82rem;
        color: #065F46;
        display: none;
        animation: spb-fadein .2s ease;
      }
      @keyframes spb-fadein { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      #spb-edit-discount-preview .edp-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        font-size: .8rem;
      }
      #spb-edit-discount-preview .edp-final {
        font-weight: 800;
        font-size: .88rem;
        color: #047857;
        border-top: 1px solid #A7F3D0;
        margin-top: 6px;
        padding-top: 6px;
      }
      #spb-edit-discount-preview .edp-owner {
        font-weight: 700;
        font-size: .8rem;
        color: #1D4ED8;
        margin-top: 2px;
      }

      /* ── Discount badge on ground cards in owner dashboard ── */
      .spb-owner-card-discount {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: linear-gradient(135deg, #10B981, #059669);
        color: #fff;
        font-size: .65rem;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 20px;
        letter-spacing: .03em;
        margin-left: 6px;
        vertical-align: middle;
      }
      .spb-owner-card-strike {
        text-decoration: line-through;
        color: #94A3B8;
        font-size: .78rem;
        margin-left: 4px;
      }

      /* ── Earnings row discount info ─────────────────────────── */
      .spb-earn-discount-note {
        font-size: .68rem;
        color: #059669;
        font-weight: 600;
        margin-top: 1px;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  })();


  /* ═══════════════════════════════════════════════════════════════
     §2  PATCH showEditGroundModal — inject discount field
  ═══════════════════════════════════════════════════════════════ */
  function patchShowEditGroundModal() {
    var _orig = window.showEditGroundModal;
    if (!_orig || _orig._spbDiscountPatch) return;

    window.showEditGroundModal = async function (groundId, groundName, currentPrice) {
      /* Call original to build/show the modal */
      _orig.call(this, groundId, groundName, currentPrice);

      /* Wait a tick for modal DOM to be ready */
      await new Promise(function(r){ setTimeout(r, 80); });

      /* Fetch existing discount from Firestore */
      var existingDiscount = 0;
      try {
        var db = window.db;
        if (db && groundId) {
          var doc = await db.collection('grounds').doc(groundId).get();
          if (doc.exists) {
            existingDiscount = doc.data().discountPercent || 0;
          }
        }
      } catch (_) {}

      /* Inject discount field if not already there */
      _injectDiscountFieldInEditModal(existingDiscount);
    };
    window.showEditGroundModal._spbDiscountPatch = true;
    console.log('[edit-discount] showEditGroundModal patched ✅');
  }

  function _injectDiscountFieldInEditModal(existingDiscount) {
    if (document.getElementById('spb-edit-discount-group')) {
      /* Already injected — just update value */
      var di = document.getElementById('edit-ground-discount');
      if (di) { di.value = existingDiscount || 0; _updateEditDiscountPreview(); }
      return;
    }

    /* Find the earning-preview inside the edit modal */
    var earningPreview = document.querySelector('#edit-earning-preview') ||
                         document.querySelector('#edit-ground-form .earning-preview');
    if (!earningPreview) return;

    var group = document.createElement('div');
    group.id  = 'spb-edit-discount-group';
    group.style.cssText = 'margin-bottom:16px;';
    group.innerHTML =
      '<label id="spb-edit-discount-label" class="form-label" for="edit-ground-discount">'+
        '<i class="fas fa-percent" style="color:#10B981;"></i>'+
        '&nbsp;Offer / Discount %'+
        '<span style="font-size:.68rem;color:#6B7280;font-weight:400;margin-left:4px;">(0 = no offer)</span>'+
      '</label>'+
      '<input type="number" id="edit-ground-discount" class="form-input-modern"'+
        ' placeholder="e.g. 20 for 20% off" min="0" max="90" step="1" value="'+(existingDiscount||0)+'">'+
      '<div class="form-hint" style="margin-top:4px;">Customers see strikethrough original + discounted price</div>'+
      '<div id="spb-edit-discount-preview"></div>';

    earningPreview.parentNode.insertBefore(group, earningPreview);

    /* Wire live preview */
    var discInput  = document.getElementById('edit-ground-discount');
    var priceInput = document.getElementById('edit-ground-price');
    discInput.addEventListener('input',   _updateEditDiscountPreview);
    if (priceInput) priceInput.addEventListener('change', _updateEditDiscountPreview);

    _updateEditDiscountPreview();
    console.log('[edit-discount] Discount field injected in edit modal ✅');
  }

  function _updateEditDiscountPreview() {
    var priceInput = document.getElementById('edit-ground-price');
    var discInput  = document.getElementById('edit-ground-discount');
    var preview    = document.getElementById('spb-edit-discount-preview');
    if (!priceInput || !discInput || !preview) return;

    var price = parseFloat(priceInput.value) || 0;
    var pct   = Math.max(0, Math.min(90, parseFloat(discInput.value) || 0));

    if (!price || !pct) { preview.style.display = 'none'; return; }

    var discounted  = Math.round(price * (1 - pct / 100));
    var ownerShare  = Math.round(discounted * 0.9);
    var platformFee = discounted - ownerShare;

    preview.style.display = 'block';
    preview.innerHTML =
      '<div class="edp-row"><span>Original Price:</span><span><s>₹'+price+'/hr</s></span></div>'+
      '<div class="edp-row"><span>Discount:</span><span style="color:#10B981;font-weight:700;">-'+Math.round(pct)+'%  (₹'+(price-discounted)+' off)</span></div>'+
      '<div class="edp-row edp-final"><span>Customer Pays:</span><span>₹'+discounted+'/hr</span></div>'+
      '<div class="edp-row edp-owner"><span>Platform fee (10%):</span><span>₹'+platformFee+'</span></div>'+
      '<div class="edp-row edp-owner"><span>Your Earnings/hr:</span><span style="color:#047857;">₹'+ownerShare+'</span></div>';
  }


  /* ═══════════════════════════════════════════════════════════════
     §3  PATCH handleEditGround — save discount to Firestore
  ═══════════════════════════════════════════════════════════════ */
  function patchHandleEditGround() {
    var _orig = window.handleEditGround;
    if (!_orig || _orig._spbDiscountPatch) return;

    window.handleEditGround = async function (e) {
      if (e && e.preventDefault) e.preventDefault();

      var groundId     = (document.getElementById('edit-ground-id')   || {}).value;
      var pricePerHour = parseFloat((document.getElementById('edit-ground-price') || {}).value) || 0;
      var discPct      = Math.max(0, Math.min(90,
        parseFloat((document.getElementById('edit-ground-discount') || {}).value) || 0));
      var discountedPr = discPct > 0 ? Math.round(pricePerHour * (1 - discPct / 100)) : pricePerHour;

      /* Run original handler first (it validates and saves pricePerHour) */
      await _orig.call(this, e);

      /* Then patch the discount fields on top */
      if (groundId) {
        try {
          var db = window.db;
          if (db) {
            await db.collection('grounds').doc(groundId).update({
              discountPercent  : discPct,
              discountedPrice  : discountedPr,
              originalPrice    : pricePerHour,
              hasDiscount      : discPct > 0,
              updatedAt        : firebase.firestore.FieldValue.serverTimestamp(),
            });
            console.log('[edit-discount] Discount saved:', discPct + '%', '→ ₹'+discountedPr);

            if (discPct > 0) {
              if (typeof window.showToast === 'function') {
                window.showToast(
                  discPct + '% offer applied! Customers now see ₹' + discountedPr + '/hr',
                  'success'
                );
              }
            }
          }
        } catch (err) {
          console.warn('[edit-discount] Could not save discount:', err);
        }
      }
    };
    window.handleEditGround._spbDiscountPatch = true;
    console.log('[edit-discount] handleEditGround patched ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §4  PATCH BOOKING PRICE — use discountedPrice when booking
         The booking flow reads currentGround.pricePerHour.
         We override that to use discountedPrice when a discount exists.
  ═══════════════════════════════════════════════════════════════ */
  function patchBookingPrice() {
    /* Intercept viewGround to patch currentGround price after load */
    var _origViewGround = window.viewGround;
    if (!_origViewGround || _origViewGround._spbDiscountPatch) return;

    window.viewGround = async function (groundId) {
      await _origViewGround.call(this, groundId);

      /* After viewGround sets window.currentGround, apply discount */
      setTimeout(function () {
        var g = window.currentGround;
        if (!g) return;

        /* Store original for display purposes */
        if (!g._originalPricePerHour) {
          g._originalPricePerHour = g.pricePerHour;
        }

        if (g.discountPercent > 0 && g.discountedPrice > 0) {
          /* Override the price so booking calculates from discounted value */
          g.pricePerHour = g.discountedPrice;

          /* Update price display on ground page */
          var priceEl = document.getElementById('ground-price');
          if (priceEl) {
            priceEl.innerHTML =
              '<span style="font-weight:800;color:#1a1a1a;">₹'+g.discountedPrice+'</span>/hour '+
              '<s style="color:#94A3B8;font-size:.85em;">₹'+g._originalPricePerHour+'</s> '+
              '<span style="background:linear-gradient(135deg,#10B981,#059669);color:#fff;'+
              'font-size:.68rem;font-weight:800;padding:2px 8px;border-radius:12px;margin-left:4px;">'+
              Math.round(g.discountPercent)+'% OFF</span>';
          }
          console.log('[edit-discount] Booking price overridden to ₹'+g.discountedPrice+' ('+g.discountPercent+'% off)');
        }
      }, 300);
    };
    window.viewGround._spbDiscountPatch = true;
    console.log('[edit-discount] viewGround patched for booking price ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §5  PATCH OWNER DASHBOARD GROUNDS — show discount badge
         Adds a "X% OFF" badge and strikethrough on owner's ground cards
  ═══════════════════════════════════════════════════════════════ */
  function enhanceOwnerGroundCards() {
    /* Find all price tags in owner ground cards and add discount info */
    document.querySelectorAll('.ground-card-modern, .ground-card').forEach(function(card) {
      var groundId = card.dataset.groundId;
      if (!groundId || card.dataset.spbDiscountDone) return;
      card.dataset.spbDiscountDone = '1';

      var db = window.db;
      if (!db) return;

      db.collection('grounds').doc(groundId).get().then(function(doc) {
        if (!doc.exists) return;
        var data = doc.data();
        var discPct = data.discountPercent || 0;
        var origPrice = data.originalPrice || data.pricePerHour || 0;
        var discPrice = data.discountedPrice || origPrice;

        if (!discPct || !origPrice) return;

        /* Find the price tag element in this card */
        var priceTag = card.querySelector('.price-tag, .ground-price, .price-badge, [class*="price"]');
        if (!priceTag) return;

        priceTag.innerHTML =
          '₹'+discPrice+'/hr'+
          '<span class="spb-owner-card-discount">'+Math.round(discPct)+'% OFF</span>'+
          '<span class="spb-owner-card-strike">₹'+origPrice+'</span>';

      }).catch(function(){});
    });
  }


  /* ═══════════════════════════════════════════════════════════════
     §6  PATCH EARNINGS DISPLAY — show discount info per booking row
         Enhances the paymentService earnings renderer to show
         what the customer actually paid vs original price
  ═══════════════════════════════════════════════════════════════ */
  function patchEarningsDisplay() {
    var _origFn = window._bmgLoadOwnerEarningsFull || window.loadOwnerEarnings;
    if (!_origFn || _origFn._spbEditDiscountPatch) return;

    var _patched = async function (container) {
      /* Run original */
      await _origFn.call(this, container);

      /* After render, enhance booking rows that have discount data */
      setTimeout(function () {
        if (!container) return;
        /* Fetch bookings with discount data and update UI */
        var db = window.db;
        var cu = window.currentUser;
        if (!db || !cu) return;

        db.collection('bookings')
          .where('ownerId', '==', cu.uid)
          .where('bookingStatus', '==', 'confirmed')
          .orderBy('date', 'desc')
          .limit(30)
          .get()
          .then(function(snap) {
            snap.forEach(function(doc) {
              var b = doc.data();
              if (!b.discountPercent || b.discountPercent <= 0) return;

              /* Find the row for this booking in the DOM */
              var rows = container.querySelectorAll('[data-booking-id="'+b.bookingId+'"], [data-id="'+doc.id+'"]');
              rows.forEach(function(row) {
                if (row.querySelector('.spb-earn-discount-note')) return;
                var note = document.createElement('div');
                note.className = 'spb-earn-discount-note';
                note.textContent =
                  Math.round(b.discountPercent)+'% offer — paid ₹'+
                  (b.discountedPrice || b.amount || 0)+
                  ' (orig ₹'+(b.originalPrice || b.pricePerHour || 0)+')';
                var leftDiv = row.querySelector('div:first-child');
                if (leftDiv) leftDiv.appendChild(note);
              });
            });
          }).catch(function(){});

        /* Also inject a summary discount card at the top if any discount bookings exist */
        _injectDiscountSummary(container, db, cu);
      }, 800);
    };

    _patched._spbEditDiscountPatch = true;
    window._bmgLoadOwnerEarningsFull = _patched;
    window.loadOwnerEarnings         = _patched;
    console.log('[edit-discount] Earnings display patched ✅');
  }

  async function _injectDiscountSummary(container, db, cu) {
    try {
      var snap = await db.collection('bookings')
        .where('ownerId', '==', cu.uid)
        .where('bookingStatus', '==', 'confirmed')
        .where('hasDiscount', '==', true)
        .get();

      if (snap.empty) return;

      var totalSavedByCustomers = 0;
      snap.forEach(function(doc) {
        var b = doc.data();
        var orig = b.originalPrice || 0;
        var paid = b.discountedPrice || b.amount || 0;
        totalSavedByCustomers += Math.max(0, orig - paid);
      });

      if (totalSavedByCustomers <= 0) return;

      var existing = container.querySelector('#spb-discount-summary-card');
      if (existing) return;

      var card = document.createElement('div');
      card.id = 'spb-discount-summary-card';
      card.style.cssText =
        'background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border:1.5px solid #6EE7B7;'+
        'border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;'+
        'align-items:center;gap:12px;';
      card.innerHTML =
        '<span style="font-size:1.6rem;">🏷️</span>'+
        '<div>'+
          '<div style="font-weight:700;color:#065F46;font-size:.88rem;">Discount Offers Active</div>'+
          '<div style="font-size:.75rem;color:#047857;">'+
            snap.size+' bookings via offers — customers saved ₹'+totalSavedByCustomers+' total'+
          '</div>'+
          '<div style="font-size:.72rem;color:#6B7280;margin-top:2px;">'+
            'Your earnings are based on the discounted amount paid'+
          '</div>'+
        '</div>';

      container.insertBefore(card, container.firstChild);
    } catch (_) {}
  }


  /* ═══════════════════════════════════════════════════════════════
     §7  PATCH addBooking / createBooking — store discount fields
         When a booking is created, persist discount info so earnings
         dashboard can display it accurately
  ═══════════════════════════════════════════════════════════════ */
  function patchBookingCreation() {
    /* createPendingBookingWithSlotLock is the main entry in paymentService */
    var _origCreate = window.createPendingBookingWithSlotLock;
    if (!_origCreate || _origCreate._spbDiscountPatch) return;

    window.createPendingBookingWithSlotLock = async function() {
      /* Capture discount info from currentGround before the call */
      var g = window.currentGround || {};
      var discPct   = g.discountPercent   || 0;
      var discPrice = g.discountedPrice   || 0;
      var origPrice = g._originalPricePerHour || g.pricePerHour || 0;

      var result = await _origCreate.apply(this, arguments);

      /* After booking doc is created, update it with discount fields */
      if (discPct > 0 && result && result.bookingId) {
        try {
          var db = window.db;
          if (db) {
            /* Find by bookingId field */
            var snap = await db.collection('bookings')
              .where('bookingId', '==', result.bookingId)
              .limit(1)
              .get();
            if (!snap.empty) {
              await snap.docs[0].ref.update({
                discountPercent : discPct,
                discountedPrice : discPrice,
                originalPrice   : origPrice,
                hasDiscount     : true,
              });
              console.log('[edit-discount] Booking discount fields saved ✅');
            }
          }
        } catch (err) {
          console.warn('[edit-discount] Could not update booking with discount:', err);
        }
      }

      return result;
    };
    window.createPendingBookingWithSlotLock._spbDiscountPatch = true;
    console.log('[edit-discount] createPendingBookingWithSlotLock patched ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §8  BOOT
  ═══════════════════════════════════════════════════════════════ */
  function boot() {
    patchShowEditGroundModal();
    patchHandleEditGround();
    patchBookingPrice();
    patchEarningsDisplay();
    patchBookingCreation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }

  /* Re-apply after SPA navigations */
  window.addEventListener('bmg:pageShown', function (e) {
    var pid = e && e.detail && e.detail.pageId;
    if (!pid) return;

    if (/owner|dashboard/.test(pid)) {
      setTimeout(function () {
        patchShowEditGroundModal();
        patchHandleEditGround();
        patchEarningsDisplay();
        patchBookingCreation();
        enhanceOwnerGroundCards();
      }, 500);
    }
    if (/ground/.test(pid)) {
      setTimeout(patchBookingPrice, 200);
    }
  });

  /* Watch for edit modal being injected dynamically */
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.id === 'edit-ground-modal' || (node.querySelector && node.querySelector('#edit-ground-modal'))) {
          setTimeout(_updateEditDiscountPreview, 100);
        }
        /* Also enhance newly rendered owner ground cards */
        if (node.querySelector && node.querySelector('.ground-card-modern, .ground-card')) {
          setTimeout(enhanceOwnerGroundCards, 300);
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  console.log('[sportobook_edit_ground_discount] Loaded ✅');

})();