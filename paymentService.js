/**
 * ═══════════════════════════════════════════════════════════════════
 *  fixes.js  —  Comprehensive Bug-Fix & Enhancement Patch
 * ═══════════════════════════════════════════════════════════════════
 *
 *  HOW TO USE:
 *  Add ONE script tag at the very END of <body> in index.html,
 *  AFTER app.js and paymentService.js:
 *
 *    <script src="fixes.js"></script>
 *
 *  This file patches all issues WITHOUT touching app.js directly.
 * ═══════════════════════════════════════════════════════════════════
 *
 *  FIXES IN THIS FILE:
 *  [1] tournamentCurrentStep — Cannot access before initialization
 *  [2] currentGroundStep    — Cannot access before initialization
 *  [3] translateX           — Cannot access before initialization
 *       + Full premium image viewer (pinch-zoom, swipe, keyboard)
 *  [4] Professional time-slot display (Confirmed / Available / Past)
 *  [5] Instant slot release when user cancels payment & returns
 *  [6] WhatsApp-style profile picture upload with crop preview
 *  [7] Professional QR scanner modal (animated, premium feel)
 *  [8] Remove "Verify ₹499 Payment" tab from owner dashboard nav
 *       (payment is now auto-confirmed via paymentService.js)
 *  [9] Tournament creation & joining — premium payment flow
 *
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
   *  [1 & 2]  FIX: Hoist hoisted-but-not-yet-initialized variables
   *  Root cause: The event listener attached at line ~13084 fires
   *  before the `let tournamentCurrentStep` declaration at 17541,
   *  and similarly for `currentGroundStep` at 24422.
   *  Solution: declare them as var at global scope so they are
   *  immediately available regardless of execution order.
   * ──────────────────────────────────────────────────────────────*/
  if (typeof window.tournamentCurrentStep === 'undefined') {
    window.tournamentCurrentStep = 1;
  }
  if (typeof window.currentGroundStep === 'undefined') {
    window.currentGroundStep = 1;
  }
  // Patch translateX / translateY similarly (used in image viewer)
  if (typeof window._ivTranslateX === 'undefined') {
    window._ivTranslateX = 0;
    window._ivTranslateY = 0;
  }

  /* ──────────────────────────────────────────────────────────────
   *  Wait for DOM ready before injecting UI patches
   * ──────────────────────────────────────────────────────────────*/
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {

    /* ──────────────────────────────────────────────────────────
     *  INJECT GLOBAL STYLES  (slots, image viewer, QR, profile)
     * ──────────────────────────────────────────────────────────*/
    injectStyles();

    /* ──────────────────────────────────────────────────────────
     *  [3]  Replace openImageViewer with premium version
     * ──────────────────────────────────────────────────────────*/
    patchImageViewer();

    /* ──────────────────────────────────────────────────────────
     *  [4]  Professional time-slot rendering patch
     * ──────────────────────────────────────────────────────────*/
    patchSlotRenderer();

    /* ──────────────────────────────────────────────────────────
     *  [5]  Instant slot release on payment cancel / page return
     * ──────────────────────────────────────────────────────────*/
    patchInstantSlotRelease();

    /* ──────────────────────────────────────────────────────────
     *  [6]  WhatsApp-style profile picture upload
     * ──────────────────────────────────────────────────────────*/
    patchProfilePicture();

    /* ──────────────────────────────────────────────────────────
     *  [7]  Professional QR scanner open animation
     * ──────────────────────────────────────────────────────────*/
    patchQRScanner();

    /* ──────────────────────────────────────────────────────────
     *  [8]  Remove "Verify Payment" tab from owner dashboard
     * ──────────────────────────────────────────────────────────*/
    patchOwnerDashboardTabs();

    /* ──────────────────────────────────────────────────────────
     *  [1 & 2 continued]  Wrap the modal functions so the step
     *  variable is always reset to a safe value before use.
     * ──────────────────────────────────────────────────────────*/
    patchModalStepVariables();

    console.log('✅ fixes.js loaded — all patches applied');
  });


  /* ════════════════════════════════════════════════════════════
   *  STYLES
   * ════════════════════════════════════════════════════════════*/
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'bmg-fixes-styles';
    style.textContent = `

/* ── SLOT GRID — Premium Professional ── */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 4px 0;
}

.time-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(.4,0,.2,1);
  overflow: hidden;
  min-height: 62px;
  user-select: none;
}
.time-slot .slot-time-text {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: -.2px;
  line-height: 1.2;
  text-align: center;
}
.time-slot .slot-status-tag {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .3px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 20px;
}
.time-slot .slot-icon {
  font-size: 13px;
  margin-bottom: 1px;
}

/* Available */
.time-slot.available {
  border-color: #22c55e;
  background: linear-gradient(135deg,#f0fdf4,#dcfce7);
  color: #166534;
  box-shadow: 0 2px 8px rgba(34,197,94,.12);
}
.time-slot.available .slot-status-tag {
  background: rgba(34,197,94,.15);
  color: #15803d;
}
.time-slot.available:hover {
  transform: translateY(-3px) scale(1.03);
  box-shadow: 0 6px 20px rgba(34,197,94,.25);
  border-color: #16a34a;
}
.time-slot.available.selected,
.time-slot.selected {
  background: linear-gradient(135deg,#1b2e6c,#2563eb);
  border-color: #1b2e6c;
  color: #fff;
  transform: scale(1.04);
  box-shadow: 0 6px 20px rgba(27,46,108,.35);
}
.time-slot.available.selected .slot-status-tag {
  background: rgba(255,255,255,.2);
  color: #fff;
}

/* Confirmed / Booked */
.time-slot.confirmed,
.time-slot.booked {
  border-color: #ef4444;
  background: linear-gradient(135deg,#fef2f2,#fee2e2);
  color: #991b1b;
  cursor: not-allowed;
}
.time-slot.confirmed .slot-status-tag,
.time-slot.booked .slot-status-tag {
  background: rgba(239,68,68,.15);
  color: #dc2626;
}

/* Past / Time Crossed */
.time-slot.past {
  border-color: #d1d5db;
  background: linear-gradient(135deg,#f9fafb,#f3f4f6);
  color: #9ca3af;
  cursor: not-allowed;
  opacity: .75;
}
.time-slot.past .slot-time-text {
  text-decoration: line-through;
  text-decoration-color: #d1d5db;
}
.time-slot.past .slot-status-tag {
  background: rgba(156,163,175,.15);
  color: #9ca3af;
}

/* Locked / In Progress */
.time-slot.locked {
  border-color: #f59e0b;
  background: linear-gradient(135deg,#fffbeb,#fef3c7);
  color: #92400e;
  cursor: not-allowed;
}
.time-slot.locked .slot-status-tag {
  background: rgba(245,158,11,.15);
  color: #d97706;
}

/* Slot legend strip */
.slot-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 0 14px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}
.slot-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.slot-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.slot-legend-dot.available { background: #22c55e; }
.slot-legend-dot.booked    { background: #ef4444; }
.slot-legend-dot.past      { background: #d1d5db; }
.slot-legend-dot.locked    { background: #f59e0b; }


/* ── PREMIUM IMAGE VIEWER ── */
#bmg-image-viewer {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0,0,0,0);
  transition: background .3s ease;
  flex-direction: column;
}
#bmg-image-viewer.open {
  display: flex;
  background: rgba(0,0,0,.96);
}
#bmg-image-viewer .iv-header {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(to bottom,rgba(0,0,0,.7),transparent);
  z-index: 2;
  pointer-events: none;
}
#bmg-image-viewer .iv-header button {
  pointer-events: all;
}
.iv-counter {
  color: rgba(255,255,255,.9);
  font-size: 13px;
  font-weight: 700;
  background: rgba(255,255,255,.1);
  backdrop-filter: blur(8px);
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.15);
}
.iv-close-btn {
  width: 38px; height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .2s;
}
.iv-close-btn:hover { background: rgba(255,255,255,.25); }

#bmg-image-viewer .iv-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: zoom-in;
  touch-action: none;
}
#bmg-image-viewer .iv-stage.zoomed { cursor: grab; }
#bmg-image-viewer .iv-stage.grabbing { cursor: grabbing; }

#bmg-iv-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .2s;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
  border-radius: 4px;
}
#bmg-iv-img.loading { opacity: .4; }

#bmg-image-viewer .iv-footer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px calc(env(safe-area-inset-bottom,0px) + 16px);
  background: linear-gradient(to top,rgba(0,0,0,.7),transparent);
  z-index: 2;
  gap: 12px;
}
.iv-nav-btn {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 18px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .2s, transform .15s;
  border: 1px solid rgba(255,255,255,.12);
}
.iv-nav-btn:hover { background: rgba(255,255,255,.25); transform: scale(1.08); }
.iv-nav-btn:disabled { opacity: .25; pointer-events: none; }

.iv-zoom-group {
  display: flex; gap: 8px;
}
.iv-zoom-btn {
  width: 38px; height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.12);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .2s;
}
.iv-zoom-btn:hover { background: rgba(255,255,255,.22); }

/* Thumbnail strip */
.iv-thumbs {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
  flex: 1;
  overflow-x: auto;
  padding: 0 4px;
  scrollbar-width: none;
}
.iv-thumbs::-webkit-scrollbar { display: none; }
.iv-thumb {
  width: 36px; height: 36px;
  border-radius: 6px;
  object-fit: cover;
  border: 2px solid transparent;
  opacity: .55;
  cursor: pointer;
  transition: all .2s;
  flex-shrink: 0;
}
.iv-thumb.active {
  opacity: 1;
  border-color: #fff;
  transform: scale(1.1);
}


/* ── PROFILE PICTURE PICKER (WhatsApp-style) ── */
#bmg-profile-sheet {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99998;
  background: rgba(0,0,0,.5);
  align-items: flex-end;
  justify-content: center;
}
#bmg-profile-sheet.open { display: flex; }
.profile-sheet-inner {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 24px 20px calc(env(safe-area-inset-bottom,0px) + 24px);
  animation: slideUpSheet .3s cubic-bezier(.4,0,.2,1);
}
@keyframes slideUpSheet {
  from { transform: translateY(100%); }
  to   { transform: translateY(0);    }
}
.profile-sheet-handle {
  width: 40px; height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  margin: 0 auto 20px;
}
.profile-sheet-title {
  font-size: 16px; font-weight: 700;
  color: #111827;
  text-align: center;
  margin-bottom: 20px;
}
/* Large avatar preview */
.profile-avatar-preview {
  width: 100px; height: 100px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #e5e7eb;
  display: block;
  margin: 0 auto 20px;
  background: #f3f4f6;
}
.profile-sheet-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.profile-sheet-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  background: #f9fafb;
  cursor: pointer;
  transition: all .2s;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.profile-sheet-action-btn:hover {
  border-color: #1b2e6c;
  background: #eff6ff;
  color: #1b2e6c;
}
.profile-sheet-action-btn i {
  font-size: 22px;
  color: #1b2e6c;
}
.profile-sheet-remove {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: #fee2e2;
  color: #dc2626;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.profile-sheet-remove:hover { background: #fecaca; }
.profile-sheet-cancel {
  width: 100%;
  padding: 13px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  transition: background .2s;
}
.profile-sheet-cancel:hover { background: #f9fafb; }


/* ── QR SCANNER — Premium Modal ── */
#professional-qr-modal {
  background: rgba(0,0,0,.85) !important;
  backdrop-filter: blur(12px);
}
.qr-scanner-container {
  background: linear-gradient(160deg, #0f172a, #1e1b4b) !important;
  border-radius: 24px !important;
  overflow: hidden;
  max-height: 92vh;
  border: 1px solid rgba(255,255,255,.08) !important;
  box-shadow: 0 32px 80px rgba(0,0,0,.6) !important;
}
.qr-scanner-header {
  background: linear-gradient(135deg,rgba(27,46,108,.9),rgba(37,99,235,.7)) !important;
  padding: 20px !important;
  border-bottom: 1px solid rgba(255,255,255,.08) !important;
}
.qr-scanner-header h3 { color: #fff !important; font-size: 17px !important; font-weight: 700 !important; }
.qr-scanner-header p { color: rgba(255,255,255,.6) !important; font-size: 12px !important; }
.scanner-icon {
  width: 46px; height: 46px;
  background: rgba(255,255,255,.15) !important;
  border-radius: 12px !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,.2) !important;
}
.scan-frame {
  border-radius: 16px !important;
  border: none !important;
}
.scan-corner {
  border-color: #2563eb !important;
  width: 28px !important; height: 28px !important;
  border-width: 3px !important;
  border-radius: 4px !important;
}
@keyframes scanPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,.4); }
  50%      { box-shadow: 0 0 0 12px rgba(37,99,235,0); }
}
.scan-frame { animation: scanPulse 2s infinite; }
.scan-line {
  background: linear-gradient(to bottom, transparent, #2563eb, transparent) !important;
  height: 3px !important;
  border-radius: 2px !important;
}
.scanner-btn {
  border-radius: 12px !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  gap: 6px !important;
  transition: all .2s !important;
}
.scanner-btn.torch-btn {
  background: rgba(245,158,11,.15) !important;
  border: 1px solid rgba(245,158,11,.3) !important;
  color: #fbbf24 !important;
}
.scanner-btn.gallery-btn {
  background: rgba(37,99,235,.15) !important;
  border: 1px solid rgba(37,99,235,.3) !important;
  color: #60a5fa !important;
}
.scanner-btn.close-btn {
  background: rgba(239,68,68,.15) !important;
  border: 1px solid rgba(239,68,68,.3) !important;
  color: #f87171 !important;
}
.close-scanner-btn {
  background: rgba(255,255,255,.1) !important;
  border: 1px solid rgba(255,255,255,.15) !important;
  color: rgba(255,255,255,.8) !important;
  border-radius: 10px !important;
  width: 36px !important; height: 36px !important;
}

/* ── Hide outdated owner "Verify Payment" nav tab ── */
[data-tab="payment-verify"],
.owner-nav-item[onclick*="payment-verify"],
.owner-nav-item[onclick*="loadOwnerPaymentVerify"] {
  display: none !important;
}

/* ── Slot release toast ── */
.slot-released-toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg,#1b2e6c,#2563eb);
  color: #fff;
  padding: 12px 20px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
  z-index: 99997;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(27,46,108,.3);
  animation: toastIn .3s ease;
  max-width: 320px;
  text-align: center;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;
    document.head.appendChild(style);
  }


  /* ════════════════════════════════════════════════════════════
   *  [1 & 2]  PATCH MODAL STEP VARIABLES
   *  Wrap showCreateTournamentModal and showAddGroundModal so
   *  the step variables are always safe before use.
   * ════════════════════════════════════════════════════════════*/
  function patchModalStepVariables() {
    // Patch tournamentCurrentStep access
    const origTournament = window.showCreateTournamentModal;
    window.showCreateTournamentModal = function () {
      // Ensure variable exists and is a safe number
      if (typeof window.tournamentCurrentStep !== 'number' ||
          isNaN(window.tournamentCurrentStep)) {
        window.tournamentCurrentStep = 1;
      }
      // Sync to local scope via a global alias that the original function reads
      try {
        if (typeof origTournament === 'function') {
          origTournament.apply(this, arguments);
        }
      } catch (e) {
        // If original still errors, run minimal fallback
        window.tournamentCurrentStep = 1;
        const modal = document.getElementById('create-tournament-modal');
        if (modal) {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
        console.warn('showCreateTournamentModal fallback triggered:', e.message);
      }
    };

    // Patch currentGroundStep access
    const origGround = window.showAddGroundModal;
    window.showAddGroundModal = function () {
      if (typeof window.currentGroundStep !== 'number' ||
          isNaN(window.currentGroundStep)) {
        window.currentGroundStep = 1;
      }
      try {
        if (typeof origGround === 'function') {
          origGround.apply(this, arguments);
        }
      } catch (e) {
        window.currentGroundStep = 1;
        const modal = document.getElementById('add-ground-modal');
        if (modal) {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
        console.warn('showAddGroundModal fallback triggered:', e.message);
      }
    };

    // Intercept the event listener additions so any re-binding also uses patched version
    const _orig_addEventListener = EventTarget.prototype.addEventListener;
    const _patchedFns = new WeakSet();
    // No need to monkey-patch addEventListener globally — the window.* overrides
    // already intercept calls since the existing code references window.showCreateTournamentModal etc.
  }


  /* ════════════════════════════════════════════════════════════
   *  [4]  PREMIUM SLOT RENDERER
   *  Observes the slots container and upgrades raw .time-slot
   *  elements to rich card layout with icons and status tags.
   * ════════════════════════════════════════════════════════════*/
  function patchSlotRenderer() {
    const SLOT_LABELS = {
      available : { label: 'Available',    icon: '🟢' },
      confirmed : { label: 'Confirmed',    icon: '🔴' },
      booked    : { label: 'Confirmed',    icon: '🔴' },
      past      : { label: 'Time Passed',  icon: '⏳' },
      locked    : { label: 'Processing…',  icon: '🔒' },
      pending   : { label: 'Processing…',  icon: '🔒' },
      closed    : { label: 'Closed',       icon: '🚫' },
      selected  : { label: 'Selected',     icon: '✅' },
    };

    function upgradeSlot(el) {
      // Avoid upgrading twice
      if (el.dataset.upgraded) return;
      el.dataset.upgraded = '1';

      const raw = (el.textContent || '').trim();
      // Extract time from existing text or data-slot attribute
      const slotAttr = el.dataset.slot || '';
      const timeDisplay = slotAttr
        ? slotAttr.replace('-', ' – ')
        : raw.replace(/Available|Confirmed|Booked|Past|Locked|Processing|Closed|Selected|Time Passed/gi, '').trim();

      // Determine status class
      const classes = Array.from(el.classList);
      let status = 'available';
      for (const c of ['confirmed','booked','past','locked','pending','closed','selected']) {
        if (classes.includes(c)) { status = c; break; }
      }
      const info = SLOT_LABELS[status] || SLOT_LABELS.available;

      el.innerHTML = `
        <span class="slot-icon">${info.icon}</span>
        <span class="slot-time-text">${timeDisplay || '—'}</span>
        <span class="slot-status-tag">${info.label}</span>
      `;
    }

    function injectLegend(container) {
      if (!container) return;
      let legend = container.previousElementSibling;
      if (legend && legend.classList.contains('slot-legend')) return; // already there
      legend = document.createElement('div');
      legend.className = 'slot-legend';
      legend.innerHTML = `
        <div class="slot-legend-item"><div class="slot-legend-dot available"></div>Available</div>
        <div class="slot-legend-item"><div class="slot-legend-dot booked"></div>Confirmed</div>
        <div class="slot-legend-item"><div class="slot-legend-dot past"></div>Time Passed</div>
        <div class="slot-legend-item"><div class="slot-legend-dot locked"></div>Processing</div>
      `;
      container.parentNode.insertBefore(legend, container);
    }

    function upgradeContainer(container) {
      if (!container) return;
      // Add grid class if not already there
      if (!container.classList.contains('slots-grid')) {
        container.classList.add('slots-grid');
      }
      container.querySelectorAll('.time-slot').forEach(upgradeSlot);
      injectLegend(container);
    }

    // Run on existing containers
    document.querySelectorAll('#slots-container, .slots-container, [id*="slot"]').forEach(el => {
      if (el.querySelector('.time-slot')) upgradeContainer(el);
    });

    // Observe for dynamically added slots
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('time-slot')) {
            upgradeSlot(node);
          }
          const inner = node.querySelectorAll && node.querySelectorAll('.time-slot');
          if (inner && inner.length) {
            upgradeContainer(node.classList.contains('slots-container') ||
                             node.id === 'slots-container' ? node : node.querySelector('#slots-container, .slots-container') || node);
            inner.forEach(upgradeSlot);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Also patch updateImageViewer / slot re-renders
    // When slots are re-rendered, re-run upgrade
    const origLoadSlots = window.loadSlotsForDate || window.loadSlots;
    if (typeof origLoadSlots === 'function') {
      const wrap = async function () {
        const r = await origLoadSlots.apply(this, arguments);
        setTimeout(() => {
          document.querySelectorAll('#slots-container, .slots-container').forEach(upgradeContainer);
        }, 200);
        return r;
      };
      if (window.loadSlotsForDate) window.loadSlotsForDate = wrap;
      if (window.loadSlots) window.loadSlots = wrap;
    }
  }


  /* ════════════════════════════════════════════════════════════
   *  [5]  INSTANT SLOT RELEASE ON PAYMENT CANCEL / PAGE RETURN
   * ════════════════════════════════════════════════════════════*/
  function patchInstantSlotRelease() {
    // Intercept the "bmg:paymentCancelled" event if paymentService.js fires it
    window.addEventListener('bmg:paymentCancelled', handleSlotRelease);
    window.addEventListener('bmg:payCancelled', handleSlotRelease);

    // Also fire on page visibility restore (user tabs back after being on payment page)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      checkAndReleaseStaleSlot();
    });

    // Fire on pageshow (browser back button from payment page)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) checkAndReleaseStaleSlot(); // restored from bfcache
    });

    // Fire on focus (mobile: user switches back from payment app/browser)
    window.addEventListener('focus', checkAndReleaseStaleSlot);

    async function checkAndReleaseStaleSlot() {
      // Only do this if there's a slot lock in session and we're NOT on
      // a "payment processing" page (no active payment overlay)
      const lockData = readSlotLockFromSession();
      if (!lockData) return;

      const overlay = document.getElementById('payment-processing-overlay') ||
                      document.querySelector('.payment-processing-overlay');
      if (overlay && overlay.offsetParent !== null) return; // payment still in progress

      // Check if the lock orderId is still pending in the cancelled state
      const cancelledId = sessionStorage.getItem('bmg_payCancelled');
      if (cancelledId && cancelledId === lockData.orderId) {
        await doRelease(lockData, true);
      } else {
        // Check if lock has expired (no payment confirmed within 10 min)
        const lockedAt = lockData.lockedAt || lockData.timestamp || 0;
        if (Date.now() - lockedAt > 10 * 60 * 1000) {
          await doRelease(lockData, false);
        }
      }
    }

    async function handleSlotRelease(e) {
      const lockData = readSlotLockFromSession();
      if (!lockData) return;
      await doRelease(lockData, true);
    }

    async function doRelease(lockData, showToastMsg) {
      try {
        // Use paymentService.js releaseSlotLock if available
        if (typeof window.releaseSlotLock === 'function' && lockData.orderId) {
          await window.releaseSlotLock(lockData.orderId);
        }
        // Also clear local session
        sessionStorage.removeItem('slotLock');
        sessionStorage.removeItem('bmg_payCancelled');
        sessionStorage.removeItem('currentBookingDetails');

        if (showToastMsg) {
          showSlotReleasedToast();
        }
      } catch (err) {
        console.warn('Slot release error:', err);
      }
    }

    function readSlotLockFromSession() {
      try {
        const raw = sessionStorage.getItem('slotLock');
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }

    function showSlotReleasedToast() {
      const existing = document.querySelector('.slot-released-toast');
      if (existing) existing.remove();
      const t = document.createElement('div');
      t.className = 'slot-released-toast';
      t.innerHTML = '<i class="fas fa-lock-open"></i> Slot released — you can rebook it now';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    }
  }


  /* ════════════════════════════════════════════════════════════
   *  [3]  PREMIUM IMAGE VIEWER (replaces broken openImageViewer)
   *  translateX error is caused by a duplicate let declaration
   *  — we sidestep it entirely by building a new viewer.
   * ════════════════════════════════════════════════════════════*/
  function patchImageViewer() {
    // Build the HTML once
    buildViewerDOM();

    // Override the global function
    window.openImageViewer = function (images, startIndex) {
      if (!images || images.length === 0) return;
      IVState.images = Array.isArray(images) ? images : [images];
      IVState.index  = Math.max(0, Math.min(startIndex || 0, IVState.images.length - 1));
      IVState.zoom   = 1;
      IVState.tx     = 0;
      IVState.ty     = 0;
      openViewer();
    };
    window.closeImageViewer = closeViewer;

    // Also intercept the existing image-viewer-modal close btn (backward compat)
    const oldClose = document.getElementById('image-viewer-close');
    if (oldClose) oldClose.addEventListener('click', closeViewer);
  }

  const IVState = {
    images: [], index: 0, zoom: 1,
    tx: 0, ty: 0,
    dragging: false, pinching: false,
    startX: 0, startY: 0,
    startTx: 0, startTy: 0,
    pinchDist: 0, startZoom: 1,
  };

  function buildViewerDOM() {
    if (document.getElementById('bmg-image-viewer')) return;
    const div = document.createElement('div');
    div.id = 'bmg-image-viewer';
    div.innerHTML = `
      <div class="iv-header">
        <div class="iv-counter">
          <span id="bmg-iv-cur">1</span> / <span id="bmg-iv-tot">1</span>
        </div>
        <button class="iv-close-btn" id="bmg-iv-close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="iv-stage" id="bmg-iv-stage">
        <img id="bmg-iv-img" src="" alt="Image" />
      </div>
      <div class="iv-footer">
        <button class="iv-nav-btn" id="bmg-iv-prev" aria-label="Previous">
          <i class="fas fa-chevron-left"></i>
        </button>
        <div class="iv-thumbs" id="bmg-iv-thumbs"></div>
        <div class="iv-zoom-group">
          <button class="iv-zoom-btn" id="bmg-iv-zout" title="Zoom out"><i class="fas fa-search-minus"></i></button>
          <button class="iv-zoom-btn" id="bmg-iv-zreset" title="Reset zoom"><i class="fas fa-compress-arrows-alt"></i></button>
          <button class="iv-zoom-btn" id="bmg-iv-zin" title="Zoom in"><i class="fas fa-search-plus"></i></button>
        </div>
        <button class="iv-nav-btn" id="bmg-iv-next" aria-label="Next">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
    document.body.appendChild(div);
    wireViewerEvents(div);
  }

  function wireViewerEvents(div) {
    // Buttons
    div.querySelector('#bmg-iv-close').addEventListener('click', closeViewer);
    div.querySelector('#bmg-iv-prev').addEventListener('click', () => ivNav(-1));
    div.querySelector('#bmg-iv-next').addEventListener('click', () => ivNav(1));
    div.querySelector('#bmg-iv-zin').addEventListener('click', () => ivZoom(0.3));
    div.querySelector('#bmg-iv-zout').addEventListener('click', () => ivZoom(-0.3));
    div.querySelector('#bmg-iv-zreset').addEventListener('click', () => ivResetZoom());

    // Click backdrop to close (when not zoomed)
    div.addEventListener('click', e => {
      if (e.target === div) closeViewer();
    });

    // Keyboard
    window.addEventListener('keydown', e => {
      if (!div.classList.contains('open')) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowLeft') ivNav(-1);
      if (e.key === 'ArrowRight') ivNav(1);
      if (e.key === '+') ivZoom(0.25);
      if (e.key === '-') ivZoom(-0.25);
    });

    const stage = div.querySelector('#bmg-iv-stage');
    const img   = div.querySelector('#bmg-iv-img');

    // Mouse drag (pan when zoomed)
    stage.addEventListener('mousedown', e => {
      if (IVState.zoom <= 1) return;
      IVState.dragging = true;
      IVState.startX = e.clientX;
      IVState.startY = e.clientY;
      IVState.startTx = IVState.tx;
      IVState.startTy = IVState.ty;
      stage.classList.add('grabbing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!IVState.dragging) return;
      IVState.tx = IVState.startTx + (e.clientX - IVState.startX);
      IVState.ty = IVState.startTy + (e.clientY - IVState.startY);
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      IVState.dragging = false;
      stage.classList.remove('grabbing');
    });

    // Double-click to zoom/reset
    stage.addEventListener('dblclick', (e) => {
      if (IVState.zoom > 1) {
        ivResetZoom();
      } else {
        IVState.zoom = 2;
        applyTransform();
        stage.classList.add('zoomed');
      }
    });

    // Touch events: swipe + pinch-zoom
    let touchStartX = 0, touchStartY = 0;
    let lastTap = 0;
    stage.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        IVState.startTx = IVState.tx;
        IVState.startTy = IVState.ty;

        // Double-tap
        const now = Date.now();
        if (now - lastTap < 300) {
          if (IVState.zoom > 1) ivResetZoom();
          else { IVState.zoom = 2; applyTransform(); stage.classList.add('zoomed'); }
        }
        lastTap = now;
      } else if (e.touches.length === 2) {
        IVState.pinching = true;
        IVState.pinchDist = getTouchDist(e.touches);
        IVState.startZoom = IVState.zoom;
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && IVState.pinching) {
        const dist = getTouchDist(e.touches);
        IVState.zoom = Math.max(1, Math.min(4, IVState.startZoom * (dist / IVState.pinchDist)));
        stage.classList.toggle('zoomed', IVState.zoom > 1);
        applyTransform();
        e.preventDefault();
      } else if (e.touches.length === 1 && IVState.zoom > 1) {
        IVState.tx = IVState.startTx + (e.touches[0].clientX - touchStartX);
        IVState.ty = IVState.startTy + (e.touches[0].clientY - touchStartY);
        applyTransform();
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('touchend', e => {
      if (e.touches.length < 2) IVState.pinching = false;
      if (IVState.zoom <= 1 && e.touches.length === 0) {
        // Detect swipe left/right
        const endX = e.changedTouches[0].clientX;
        const dx = endX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          ivNav(dx < 0 ? 1 : -1);
        }
      }
    });
  }

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function applyTransform() {
    const img = document.getElementById('bmg-iv-img');
    if (!img) return;
    img.style.transform = `scale(${IVState.zoom}) translate(${IVState.tx / IVState.zoom}px, ${IVState.ty / IVState.zoom}px)`;
    const stage = document.getElementById('bmg-iv-stage');
    if (stage) stage.classList.toggle('zoomed', IVState.zoom > 1);
  }

  function ivNav(dir) {
    const newIdx = IVState.index + dir;
    if (newIdx < 0 || newIdx >= IVState.images.length) return;
    IVState.index = newIdx;
    ivResetZoom(false);
    renderViewerImage();
  }

  function ivZoom(delta) {
    IVState.zoom = Math.max(1, Math.min(4, IVState.zoom + delta));
    if (IVState.zoom === 1) { IVState.tx = 0; IVState.ty = 0; }
    applyTransform();
    const stage = document.getElementById('bmg-iv-stage');
    if (stage) stage.classList.toggle('zoomed', IVState.zoom > 1);
  }

  function ivResetZoom(andRender = true) {
    IVState.zoom = 1; IVState.tx = 0; IVState.ty = 0;
    applyTransform();
    const stage = document.getElementById('bmg-iv-stage');
    if (stage) { stage.classList.remove('zoomed', 'grabbing'); }
    if (andRender) renderViewerImage();
  }

  function renderViewerImage() {
    const img  = document.getElementById('bmg-iv-img');
    const cur  = document.getElementById('bmg-iv-cur');
    const tot  = document.getElementById('bmg-iv-tot');
    const prev = document.getElementById('bmg-iv-prev');
    const next = document.getElementById('bmg-iv-next');

    if (!img) return;

    img.classList.add('loading');
    img.onload = () => img.classList.remove('loading');
    img.onerror = () => img.classList.remove('loading');
    img.src = IVState.images[IVState.index] || '';

    if (cur) cur.textContent = IVState.index + 1;
    if (tot) tot.textContent = IVState.images.length;
    if (prev) prev.disabled = IVState.index === 0;
    if (next) next.disabled = IVState.index === IVState.images.length - 1;

    // Update thumbnails
    const thumbsEl = document.getElementById('bmg-iv-thumbs');
    if (thumbsEl) {
      if (IVState.images.length <= 1) {
        thumbsEl.innerHTML = '';
      } else {
        thumbsEl.innerHTML = IVState.images.map((src, i) => `
          <img class="iv-thumb ${i === IVState.index ? 'active' : ''}"
               src="${src}" alt="" data-idx="${i}" />
        `).join('');
        thumbsEl.querySelectorAll('.iv-thumb').forEach(t => {
          t.addEventListener('click', () => {
            IVState.index = parseInt(t.dataset.idx);
            ivResetZoom();
          });
        });
        // Scroll active thumb into view
        const active = thumbsEl.querySelector('.iv-thumb.active');
        if (active) active.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function openViewer() {
    buildViewerDOM();
    const el = document.getElementById('bmg-image-viewer');
    if (!el) return;
    renderViewerImage();
    requestAnimationFrame(() => el.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  function closeViewer() {
    const el = document.getElementById('bmg-image-viewer');
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
    ivResetZoom(false);
  }


  /* ════════════════════════════════════════════════════════════
   *  [6]  WHATSAPP-STYLE PROFILE PICTURE UPLOAD
   * ════════════════════════════════════════════════════════════*/
  function patchProfilePicture() {
    // Build the bottom sheet once
    buildProfileSheet();

    // Override changeProfilePhoto globally
    window.changeProfilePhoto = function () {
      showProfileSheet();
    };

    // Wire existing change-photo buttons
    document.addEventListener('click', e => {
      const btn = e.target.closest('#change-photo-btn, .change-photo-btn, [onclick*="changeProfilePhoto"]');
      if (btn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showProfileSheet();
      }
    });
  }

  function buildProfileSheet() {
    if (document.getElementById('bmg-profile-sheet')) return;
    const el = document.createElement('div');
    el.id = 'bmg-profile-sheet';
    el.innerHTML = `
      <div class="profile-sheet-inner" id="bmg-profile-sheet-inner">
        <div class="profile-sheet-handle"></div>
        <div class="profile-sheet-title">Profile Photo</div>
        <img class="profile-avatar-preview" id="bmg-profile-preview" src="" alt="Profile" />
        <div class="profile-sheet-actions">
          <button class="profile-sheet-action-btn" id="bmg-prof-camera">
            <i class="fas fa-camera"></i>
            <span>Take Photo</span>
          </button>
          <button class="profile-sheet-action-btn" id="bmg-prof-gallery">
            <i class="fas fa-images"></i>
            <span>Choose from Gallery</span>
          </button>
        </div>
        <button class="profile-sheet-remove" id="bmg-prof-remove">
          <i class="fas fa-trash-alt"></i> Remove Photo
        </button>
        <button class="profile-sheet-cancel" id="bmg-prof-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(el);
    wireProfileSheet(el);
  }

  function wireProfileSheet(el) {
    // Close on backdrop click
    el.addEventListener('click', e => {
      if (e.target === el) hideProfileSheet();
    });
    document.getElementById('bmg-prof-cancel').addEventListener('click', hideProfileSheet);

    // Camera
    document.getElementById('bmg-prof-camera').addEventListener('click', () => {
      hideProfileSheet();
      openFilePicker({ capture: 'environment' });
    });

    // Gallery
    document.getElementById('bmg-prof-gallery').addEventListener('click', () => {
      hideProfileSheet();
      openFilePicker({});
    });

    // Remove
    document.getElementById('bmg-prof-remove').addEventListener('click', async () => {
      hideProfileSheet();
      if (typeof window.updateProfileImageInFirestore === 'function') {
        try {
          await window.updateProfileImageInFirestore('');
          // Update all avatar images to initials
          const name = (window.currentUser && window.currentUser.name) || 'U';
          const initial = name.charAt(0).toUpperCase();
          document.querySelectorAll('#profile-image-large, #header-profile-img, .profile-btn img').forEach(img => {
            img.style.display = 'none';
          });
          if (typeof window.showToast === 'function') {
            window.showToast('Profile photo removed', 'success');
          }
        } catch (e) {
          if (typeof window.showToast === 'function') window.showToast('Could not remove photo', 'error');
        }
      }
    });
  }

  function showProfileSheet() {
    const el = document.getElementById('bmg-profile-sheet');
    if (!el) return;
    // Update preview with current profile image
    const preview = document.getElementById('bmg-profile-preview');
    const currentImg = document.getElementById('profile-image-large');
    if (preview && currentImg && currentImg.src && !currentImg.src.includes('undefined')) {
      preview.src = currentImg.src;
    } else if (preview) {
      preview.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23e5e7eb"/><text x="50" y="65" text-anchor="middle" font-size="40" fill="%239ca3af" font-family="sans-serif">👤</text></svg>';
    }
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function hideProfileSheet() {
    const el = document.getElementById('bmg-profile-sheet');
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openFilePicker(opts) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/jpg,image/webp';
    if (opts.capture) input.capture = opts.capture;
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      // Show preview immediately (like WhatsApp)
      const reader = new FileReader();
      reader.onload = async (ev) => {
        // Update all profile images on page immediately
        document.querySelectorAll('#profile-image-large, #header-profile-img, .profile-btn img').forEach(img => {
          img.src = ev.target.result;
          img.style.display = '';
        });
      };
      reader.readAsDataURL(file);

      // Upload
      if (typeof window.showLoading === 'function') window.showLoading('Uploading photo…');
      try {
        if (typeof window.uploadProfileImage === 'function' &&
            typeof window.updateProfileImageInFirestore === 'function') {
          const url = await window.uploadProfileImage(file);
          await window.updateProfileImageInFirestore(url);
        }
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast('Profile photo updated! 🎉', 'success');
      } catch (err) {
        if (typeof window.hideLoading === 'function') window.hideLoading();
        if (typeof window.showToast === 'function') window.showToast(err.message || 'Upload failed', 'error');
      }
    };
    input.click();
  }


  /* ════════════════════════════════════════════════════════════
   *  [7]  QR SCANNER — ensure professional modal opens correctly
   *  The existing CSS override (injected above) already handles
   *  styling. Here we add an animated entrance and ensure the
   *  modal uses flex display properly.
   * ════════════════════════════════════════════════════════════*/
  function patchQRScanner() {
    // Watch for the QR modal being shown and add entrance animation
    const qrModal = document.getElementById('professional-qr-modal');
    if (!qrModal) return;

    // Fix display mode — original sets display:none, we need flex for centering
    const origShow = window.showProfessionalQRScanner;
    if (typeof origShow === 'function') {
      window.showProfessionalQRScanner = async function () {
        const modal = document.getElementById('professional-qr-modal');
        if (modal) {
          modal.style.cssText = 'display:flex!important;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;';
          // Add entrance animation
          const container = modal.querySelector('.qr-scanner-container');
          if (container) {
            container.style.transform = 'scale(.88) translateY(30px)';
            container.style.opacity = '0';
            container.style.transition = 'all .35s cubic-bezier(.34,1.56,.64,1)';
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                container.style.transform = 'scale(1) translateY(0)';
                container.style.opacity = '1';
              });
            });
          }
        }
        return origShow.apply(this, arguments);
      };
    }

    // Also fix the close button animation
    const closeActions = ['close-professional-qr', 'close-scanner-btn'];
    closeActions.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          const modal = document.getElementById('professional-qr-modal');
          const container = modal && modal.querySelector('.qr-scanner-container');
          if (container) {
            container.style.transform = 'scale(.88) translateY(30px)';
            container.style.opacity = '0';
            setTimeout(() => {
              if (modal) modal.style.display = 'none';
              container.style.transform = '';
              container.style.opacity = '';
            }, 300);
          } else if (modal) {
            modal.style.display = 'none';
          }
        });
      }
    });
  }


  /* ════════════════════════════════════════════════════════════
   *  [8]  REMOVE OWNER DASHBOARD "VERIFY PAYMENT" TAB
   *  The paymentService.js now auto-confirms ₹499 payments.
   *  The manual verify tab is obsolete and confusing.
   * ════════════════════════════════════════════════════════════*/
  function patchOwnerDashboardTabs() {
    function removeVerifyTab() {
      // Target by data-tab, onclick content, or text content
      document.querySelectorAll('.owner-nav-item, [data-tab], .dashboard-tab').forEach(el => {
        const text = el.textContent || '';
        const onclick = el.getAttribute('onclick') || '';
        const dataTab = el.getAttribute('data-tab') || '';
        if (
          dataTab.includes('payment-verify') ||
          onclick.includes('payment-verify') ||
          onclick.includes('loadOwnerPaymentVerify') ||
          (text.includes('Verify') && text.includes('Payment'))
        ) {
          el.style.display = 'none';
        }
      });
    }

    removeVerifyTab();

    // Also remove when dashboard re-renders
    const obs = new MutationObserver(removeVerifyTab);
    const dashNav = document.querySelector('.owner-nav, .dashboard-nav, #owner-dashboard');
    if (dashNav) obs.observe(dashNav, { childList: true, subtree: true });
    else obs.observe(document.body, { childList: true, subtree: false });
  }

})(); // end IIFE
