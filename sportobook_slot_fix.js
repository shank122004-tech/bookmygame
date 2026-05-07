/**
 * sportobook_slot_fix.js
 * ─────────────────────────────────────────────────────────────────
 *  Fixes TWO slot-display bugs:
 *
 *  BUG 1 — Booked/confirmed slots don't turn RED
 *    Root cause A: CSS for .time-slot.confirmed and .time-slot.booked
 *    uses grey/muted styling instead of a clear red "BOOKED" style.
 *    Root cause B: loadSlots builds the slotStatusMap using
 *    `${slot.startTime}-${slot.endTime}` but the default slot keys
 *    are `HH:MM-HH:MM` — if startTime/endTime fields don't match
 *    exactly the map lookup misses and the slot stays "available".
 *    Fix: normalise key format + inject red CSS.
 *
 *  BUG 2 — Slot grid never updates in real-time
 *    Root cause: loadSlots uses db.collection.get() (one-shot fetch).
 *    After another user books a slot, or after the current user's
 *    own payment is confirmed by the webhook, the slot grid is never
 *    refreshed — slots stay green until the user navigates away.
 *    Fix: replace get() with onSnapshot() so the grid updates live
 *    when Firestore changes (webhook confirms booking → slot turns red
 *    immediately for everyone viewing that date).
 *
 *  Load AFTER app.js in index.html.
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — Inject CSS
     Override ALL existing .time-slot state styles so:
       confirmed / booked  → vivid red, "BOOKED" label, not-allowed
       locked / pending    → amber, "Processing…"
       available           → green, clickable
       past                → grey, strikethrough
     Uses !important to win over all existing stylesheet rules.
  ═══════════════════════════════════════════════════════════════ */
  (function injectCSS() {
    var style = document.createElement('style');
    style.id  = 'spb-slot-styles';
    style.textContent = `
      /* ── Base slot card ── */
      .time-slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 10px 6px !important;
        border-radius: 10px !important;
        border: 2px solid #E2E8F0 !important;
        cursor: pointer !important;
        transition: all 0.18s ease !important;
        font-size: .78rem !important;
        font-weight: 600 !important;
        position: relative;
        background: #fff !important;
        text-align: center;
        user-select: none;
        min-height: 64px;
      }

      /* ── SPB inner elements (injected by this script) ── */
      .time-slot .spb-icon  { font-size: 1rem; line-height: 1; }
      .time-slot .spb-time  { font-size: .72rem; font-weight: 700; line-height: 1.2; }
      .time-slot .spb-label { font-size: .6rem; font-weight: 600; letter-spacing: .03em;
                              text-transform: uppercase; opacity: .85; }

      /* ── AVAILABLE — green ── */
      .time-slot.available {
        border-color: #10B981 !important;
        background: linear-gradient(135deg, #fff 0%, rgba(16,185,129,.06) 100%) !important;
        color: #065F46 !important;
        cursor: pointer !important;
      }
      .time-slot.available:hover {
        background: linear-gradient(135deg, #ECFDF5, #D1FAE5) !important;
        border-color: #059669 !important;
        transform: translateY(-3px) !important;
        box-shadow: 0 6px 16px rgba(16,185,129,.25) !important;
      }
      .time-slot.available .spb-icon  { color: #10B981; }
      .time-slot.available .spb-time  { color: #065F46; }
      .time-slot.available .spb-label { color: #10B981; }

      /* ── CONFIRMED / BOOKED — vivid red ── */
      .time-slot.confirmed,
      .time-slot.booked {
        background: linear-gradient(135deg, #FEF2F2, #FEE2E2) !important;
        border-color: #EF4444 !important;
        color: #991B1B !important;
        cursor: not-allowed !important;
        opacity: 1 !important;
        text-decoration: none !important;
        box-shadow: 0 2px 8px rgba(239,68,68,.18) !important;
      }
      .time-slot.confirmed .spb-icon,
      .time-slot.booked    .spb-icon  { color: #EF4444; }
      .time-slot.confirmed .spb-time,
      .time-slot.booked    .spb-time  { color: #991B1B; text-decoration: line-through; }
      .time-slot.confirmed .spb-label,
      .time-slot.booked    .spb-label { color: #EF4444; }

      /* ── LOCKED / PENDING — amber ── */
      .time-slot.locked,
      .time-slot.pending {
        background: linear-gradient(135deg, #FFFBEB, #FEF3C7) !important;
        border-color: #F59E0B !important;
        color: #92400E !important;
        cursor: not-allowed !important;
        opacity: 1 !important;
        animation: spb-pulse-amber 1.8s ease-in-out infinite;
      }
      .time-slot.locked .spb-icon,
      .time-slot.pending .spb-icon  { color: #F59E0B; }
      .time-slot.locked .spb-time,
      .time-slot.pending .spb-time  { color: #92400E; }
      .time-slot.locked .spb-label,
      .time-slot.pending .spb-label { color: #F59E0B; }

      @keyframes spb-pulse-amber {
        0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        50%      { box-shadow: 0 0 0 5px rgba(245,158,11,.18); }
      }

      /* ── PAST ── */
      .time-slot.past {
        background: #F1F5F9 !important;
        border-color: #CBD5E1 !important;
        color: #94A3B8 !important;
        cursor: not-allowed !important;
        opacity: .65 !important;
      }
      .time-slot.past .spb-time { text-decoration: line-through; }

      /* ── CLOSED ── */
      .time-slot.closed {
        background: #F8FAFC !important;
        border-color: #E2E8F0 !important;
        color: #94A3B8 !important;
        cursor: not-allowed !important;
        opacity: .55 !important;
      }

      /* ── SELECTED ── */
      .time-slot.selected {
        background: linear-gradient(135deg, #4F46E5, #7C3AED) !important;
        border-color: #4F46E5 !important;
        color: #fff !important;
        cursor: pointer !important;
        transform: scale(1.04) !important;
        box-shadow: 0 6px 20px rgba(79,70,229,.35) !important;
      }
      .time-slot.selected .spb-icon,
      .time-slot.selected .spb-time,
      .time-slot.selected .spb-label { color: #fff !important; opacity: 1 !important; }

      /* ── Legend ── */
      .spb-slot-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 10px 4px;
        margin-bottom: 10px;
        font-size: .72rem;
        font-weight: 600;
        color: #475569;
      }
      .spb-slot-legend-item { display: flex; align-items: center; gap: 5px; }
      .spb-slot-legend-dot  {
        width: 10px; height: 10px; border-radius: 50%; border: 2px solid transparent;
      }
      .spb-slot-legend-dot.available { background:#D1FAE5; border-color:#10B981; }
      .spb-slot-legend-dot.booked    { background:#FEE2E2; border-color:#EF4444; }
      .spb-slot-legend-dot.pending   { background:#FEF3C7; border-color:#F59E0B; }
      .spb-slot-legend-dot.past      { background:#E2E8F0; border-color:#94A3B8; }
    `;
    // Remove any previous injection
    var old = document.getElementById('spb-slot-styles');
    if (old) old.remove();
    document.head.appendChild(style);
    console.log('[spb-slots] CSS injected ✅');
  })();


  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 — Slot status helpers
  ═══════════════════════════════════════════════════════════════ */

  var SLOT_ICONS = {
    available : '🟢',
    confirmed : '🔴',
    booked    : '🔴',
    locked    : '🔒',
    pending   : '🔒',
    past      : '⏳',
    closed    : '🚫',
    selected  : '✅',
  };

  var SLOT_LABELS = {
    available : 'Available',
    confirmed : 'Booked',
    booked    : 'Booked',
    locked    : 'Processing…',
    pending   : 'Processing…',
    past      : 'Time Passed',
    closed    : 'Closed',
    selected  : 'Selected',
  };

  /** Normalise a slot time key to HH:MM-HH:MM format */
  function _normaliseKey(k) {
    // Remove spaces around hyphen, ensure colon in each part
    return (k || '').replace(/\s/g, '').replace(/^(\d{1,2})(\d{2})-(\d{1,2})(\d{2})$/, function (_, h1, m1, h2, m2) {
      return h1.padStart(2, '0') + ':' + m1 + '-' + h2.padStart(2, '0') + ':' + m2;
    });
  }

  /** Build the slot key used by loadSlots (HH:00-HH:00) */
  function _slotKey(startTime, endTime) {
    // startTime might be "21:00" or "21:45" etc.
    if (startTime && endTime) return startTime + '-' + endTime;
    return '';
  }

  /** Upgrade a slot element's innerHTML to the rich 3-line layout */
  function _upgradeSlot(el) {
    if (el.dataset.spbUpgraded) return;
    el.dataset.spbUpgraded = '1';

    var slot      = el.dataset.slot || '';
    var timeText  = slot ? slot.replace('-', ' – ') : (el.textContent || '').trim();
    // Strip out any status words that may already be in textContent
    timeText = timeText.replace(
      /Available|Confirmed|Booked|Past|Processing|Locked|Closed|Time Passed|Selected/gi, ''
    ).trim();

    var status = 'available';
    var classes = ['confirmed', 'booked', 'locked', 'pending', 'past', 'closed', 'selected'];
    for (var i = 0; i < classes.length; i++) {
      if (el.classList.contains(classes[i])) { status = classes[i]; break; }
    }

    var icon  = SLOT_ICONS[status]  || '🟢';
    var label = SLOT_LABELS[status] || 'Available';

    el.innerHTML =
      '<span class="spb-icon">'  + icon + '</span>' +
      '<span class="spb-time">'  + (timeText || '—') + '</span>' +
      '<span class="spb-label">' + label + '</span>';
  }

  /** Inject a legend above the slot grid */
  function _injectLegend(container) {
    var parent = container && container.parentNode;
    if (!parent) return;
    // Remove stale legends
    parent.querySelectorAll('.spb-slot-legend, .slot-legend').forEach(function (el) { el.remove(); });

    var leg = document.createElement('div');
    leg.className = 'spb-slot-legend';
    leg.innerHTML =
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot available"></span>Available</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot booked"></span>Booked</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot pending"></span>Processing</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot past"></span>Time Passed</span>';
    parent.insertBefore(leg, container);
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 3 — Patch loadSlots (the core fix)
     Replaces the one-shot .get() with an onSnapshot() real-time
     listener. When Firestore updates (webhook confirms booking),
     the slot grid immediately re-renders without any user action.
  ═══════════════════════════════════════════════════════════════ */

  // Track active listener so we can unsubscribe when date/ground changes
  var _activeSlotListener = null;

  function _unsubscribeSlotListener() {
    if (_activeSlotListener) {
      try { _activeSlotListener(); } catch (_) {}
      _activeSlotListener = null;
    }
  }

  function patchLoadSlots() {
    if (typeof window.loadSlots !== 'function') return;
    if (window.loadSlots._spbPatched) return;

    var _orig = window.loadSlots;

    window.loadSlots = function (groundId, date) {
      var db = window.db;

      // Fall back to original if Firestore not available
      if (!db || !groundId || !date) {
        return _orig(groundId, date);
      }

      // Unsubscribe any previous listener (date or ground changed)
      _unsubscribeSlotListener();

      var container = document.getElementById('time-slots');
      if (!container) return _orig(groundId, date);

      // Show loading state
      container.innerHTML =
        '<div style="grid-column:1/-1;padding:32px;text-align:center;">' +
        '<div class="loader-spinner"></div>' +
        '<p style="margin-top:12px;color:#64748B;font-size:.85rem;">Loading slots…</p></div>';

      // Build the 24-hour default slots list
      var defaultSlots = [];
      for (var h = 0; h < 24; h++) {
        var sh = h.toString().padStart(2, '0');
        var eh = (h + 1).toString().padStart(2, '0');
        defaultSlots.push(sh + ':00-' + eh + ':00');
      }

      /** Render the grid from a slotStatusMap */
      function _render(slotStatusMap) {
        var now         = new Date();
        var currentMins = now.getHours() * 60 + now.getMinutes();
        var today       = now.toISOString().split('T')[0];
        var isToday     = date === today;

        var html = '';

        defaultSlots.forEach(function (slot) {
          // Normalise the key to match what Firestore returns
          var normSlot = _normaliseKey(slot);
          var status   = slotStatusMap[normSlot] ||
                         slotStatusMap[slot]      ||
                         'available';

          var statusClass = status;
          var isDisabled  = false;

          // Past-time override (today only)
          var startMins = parseInt(slot.split(':')[0], 10) * 60 +
                          parseInt((slot.split(':')[1] || '0').split('-')[0], 10);

          if (isToday && startMins <= currentMins) {
            statusClass = 'past';
            isDisabled  = true;
          } else if (status === 'available') {
            isDisabled = false;
          } else {
            // confirmed / booked / locked / pending / closed
            isDisabled = true;
          }

          var displayTime = slot.replace('-', ' – ');
          var icon        = SLOT_ICONS[statusClass]  || '🟢';
          var label       = SLOT_LABELS[statusClass] || 'Available';

          html +=
            '<div class="time-slot ' + statusClass + '"' +
              ' data-slot="' + slot + '"' +
              ' data-status="' + (isDisabled ? 'disabled' : status) + '"' +
              ' data-spb-upgraded="1"' +
              ((!isDisabled && statusClass === 'available') ? ' data-available="true"' : '') + '>' +
              '<span class="spb-icon">'  + icon + '</span>' +
              '<span class="spb-time">'  + displayTime + '</span>' +
              '<span class="spb-label">' + label + '</span>' +
            '</div>';
        });

        container.innerHTML = html;

        // Wire click handlers for available slots
        container.querySelectorAll('.time-slot.available').forEach(function (el) {
          el.addEventListener('click', function () {
            var slotTime = this.dataset.slot;
            if (slotTime && typeof window.selectSlot === 'function') {
              window.selectSlot(slotTime);
            }
          });
        });

        // Restore selected highlight
        var selectedSlot = window.selectedSlot ||
                           sessionStorage.getItem('selectedSlot') || '';
        if (selectedSlot) {
          container.querySelectorAll('.time-slot').forEach(function (el) {
            if (el.dataset.slot === selectedSlot) {
              el.classList.add('selected');
              el.dataset.spbUpgraded = '1';
              // Update icon/label to selected
              var iconEl  = el.querySelector('.spb-icon');
              var labelEl = el.querySelector('.spb-label');
              if (iconEl)  iconEl.textContent  = SLOT_ICONS.selected;
              if (labelEl) labelEl.textContent = SLOT_LABELS.selected;
            }
          });
        }

        // Inject/refresh legend
        _injectLegend(container);
      }

      // ── Start real-time onSnapshot listener ──────────────────────
      var unsubscribe = db.collection('slots')
        .where('groundId', '==', groundId)
        .where('date',     '==', date)
        .onSnapshot(function (snapshot) {
          // Build a normalised status map from Firestore docs
          var statusMap = {};
          snapshot.forEach(function (doc) {
            var data      = doc.data();
            var startTime = data.startTime || '';
            var endTime   = data.endTime   || '';

            // Try multiple key formats the app might use
            var key1 = _normaliseKey(startTime + '-' + endTime);
            var key2 = startTime + ':00-' + endTime + ':00'; // if only HH stored
            var key3 = data.slotTime || '';

            var status = data.status || 'available';

            if (key1) statusMap[key1] = status;
            if (key2 && key2 !== key1) statusMap[key2] = status;
            if (key3 && key3 !== key1) statusMap[_normaliseKey(key3)] = status;

            // Also store under the exact slot-time value from slotTime field
            if (data.slotTime) {
              var normST = _normaliseKey(data.slotTime);
              statusMap[normST] = status;
            }
          });

          _render(statusMap);
          console.log('[spb-slots] Live update — ' + snapshot.size + ' docs, re-rendered ✅');
        }, function (err) {
          console.error('[spb-slots] onSnapshot error:', err);
          // Fallback: one-shot get so user sees something
          _orig(groundId, date);
        });

      _activeSlotListener = unsubscribe;
      console.log('[spb-slots] Real-time slot listener started for', groundId, date);
    };

    window.loadSlots._spbPatched = true;
    console.log('[spb-slots] loadSlots patched with real-time listener ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 4 — Upgrade already-rendered slots
     When paymentService.js patchSlotRenderer or any other script
     has already rendered slots, upgrade them to the new style.
  ═══════════════════════════════════════════════════════════════ */
  function upgradeExistingSlots() {
    document.querySelectorAll('.time-slot:not([data-spb-upgraded])').forEach(_upgradeSlot);
  }

  /* Watch for DOM changes (SPA navigation renders new slot grids) */
  new MutationObserver(function (mutations) {
    var hasSlots = false;
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.classList && n.classList.contains('time-slot')) hasSlots = true;
        if (n.querySelectorAll && n.querySelectorAll('.time-slot').length) hasSlots = true;
      });
    });
    if (hasSlots) {
      setTimeout(upgradeExistingSlots, 30);
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });


  /* ═══════════════════════════════════════════════════════════════
     SECTION 5 — Unsubscribe listener when ground page is left
     Prevents memory leaks and stale listeners.
  ═══════════════════════════════════════════════════════════════ */
  window.addEventListener('bmg:pageShown', function (e) {
    var pageId = e && e.detail && e.detail.pageId;
    // If we navigate away from the ground/slots page, release listener
    if (pageId && pageId !== 'ground-page' && pageId !== 'slots-page') {
      _unsubscribeSlotListener();
    }
  });

  // Also unsubscribe when a new date or ground is selected
  // (loadSlots is called again, which already calls _unsubscribeSlotListener)


  /* ═══════════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════════ */
  function boot() {
    patchLoadSlots();
    upgradeExistingSlots();
    console.log('[sportobook_slot_fix] Slot real-time fix booted ✅');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }

  // Re-apply patch after SPA nav (app.js may re-export loadSlots)
  window.addEventListener('bmg:pageShown', function () {
    patchLoadSlots();
  });

})();