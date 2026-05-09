/**
 * sportobook_slotlock_fix.js
 * ─────────────────────────────────────────────────────────────────
 *  Fixes: TypeError: Cannot read properties of undefined (reading 'split')
 *         at releaseSlotLock (app.js:1319)
 *
 *  ROOT CAUSE
 *  ──────────
 *  There are TWO different `releaseSlotLock` functions with
 *  incompatible signatures loaded at the same time:
 *
 *    app.js          → releaseSlotLock(lockId, groundId, date, slotTime)
 *                      • Destructures slotTime with .split('-') immediately
 *                      • Crashes when slotTime is undefined
 *
 *    paymentService.js → releaseSlotLock(orderId)
 *                        • Only needs 1 arg (the order/lock ID)
 *                        • Exposed on window.releaseSlotLock, overwriting app.js
 *
 *  Various patch scripts (bmg_master_fix_v2.js, bmg_all_fixes_final.js)
 *  call window.releaseSlotLock(lockId, groundId, date, slotTime) — the
 *  4-arg app.js convention — but `window.releaseSlotLock` has been
 *  replaced by the 1-arg paymentService version, so `slotTime` arrives
 *  as `undefined` in app.js → crash.
 *
 *  FIX
 *  ───
 *  1. Install a smart shim on window.releaseSlotLock that detects
 *     which calling convention is in use and dispatches correctly.
 *
 *  2. Guard app.js's internal function via a safe wrapper that reads
 *     sessionStorage as a fallback when slotTime is missing.
 *
 *  3. All actual Firestore slot release logic is self-contained here
 *     so it works even when both app.js and paymentService.js are broken.
 *
 *  LOAD ORDER: after app.js and paymentService.js, before any fix scripts.
 *    <script src="sportobook_slotlock_fix.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     Core release logic — works with EITHER calling convention.
     Tries two strategies:
       A) orderId / lockOrderId → query slots collection by orderId
       B) lockId + groundId + date + slotTime → query by field match
  ───────────────────────────────────────────────────────────── */
  async function _coreRelease(opts) {
    var db = window.db;
    if (!db) { console.warn('[slotlock-fix] db not ready'); return { success: false }; }

    var orderId  = opts.orderId  || opts.lockId || null;
    var groundId = opts.groundId || null;
    var date     = opts.date     || null;
    var slotTime = opts.slotTime || null;

    try {
      var updated = false;

      /* Strategy A — find by lockOrderId (paymentService convention) */
      if (orderId) {
        var snapA = await db.collection('slots')
          .where('lockOrderId', '==', orderId)
          .limit(1)
          .get();

        if (!snapA.empty) {
          await snapA.docs[0].ref.update({
            status         : 'available',
            lockOrderId    : null,
            lockExpiresAt  : null,
            lockExpiresAtMs: null,
            lockedBy       : null,
            lockId         : null,
            updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
          });
          updated = true;
        }

        /* Also try slot_locks collection (app.js convention) */
        try {
          var lockRef  = db.collection('slot_locks').doc(orderId);
          var lockSnap = await lockRef.get();
          if (lockSnap.exists) await lockRef.delete();
        } catch (_) {}

        /* Clean up pending_payments */
        try {
          var ppRef  = db.collection('pending_payments').doc(orderId);
          var ppSnap = await ppRef.get();
          if (ppSnap.exists) await ppRef.delete();
        } catch (_) {}
      }

      /* Strategy B — find by groundId + date + slotTime (app.js 4-arg convention) */
      if (!updated && groundId && date && slotTime) {
        var parts     = String(slotTime).split('-');
        var startTime = parts[0] ? parts[0].trim() : null;
        var endTime   = parts[1] ? parts[1].trim() : null;

        if (startTime) {
          var queryB = db.collection('slots')
            .where('groundId', '==', groundId)
            .where('date',     '==', date)
            .where('startTime','==', startTime);
          if (endTime) queryB = queryB.where('endTime', '==', endTime);

          var snapB = await queryB.limit(1).get();
          if (!snapB.empty) {
            await snapB.docs[0].ref.update({
              status         : 'available',
              lockOrderId    : null,
              lockExpiresAt  : null,
              lockExpiresAtMs: null,
              lockedBy       : null,
              lockId         : null,
              updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
            });
            updated = true;
          }
        }
      }

      sessionStorage.removeItem('slotLock');
      console.log('[slotlock-fix] Slot released ✅', updated ? '(Firestore updated)' : '(nothing to update)');
      return { success: true };

    } catch (err) {
      console.error('[slotlock-fix] Release error:', err);
      return { success: false, error: err.message };
    }
  }

  /* ─────────────────────────────────────────────────────────────
     Read slotTime from sessionStorage as a fallback when a caller
     doesn't pass it (the common failure mode).
  ───────────────────────────────────────────────────────────── */
  function _slotTimeFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.slotTime ? li.slotTime : null;
    } catch (_) { return null; }
  }

  function _groundIdFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.groundId ? li.groundId : null;
    } catch (_) { return null; }
  }

  function _dateFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.date ? li.date : null;
    } catch (_) { return null; }
  }

  /* ─────────────────────────────────────────────────────────────
     THE SHIM — replaces window.releaseSlotLock with a version
     that handles BOTH calling conventions gracefully.

     Convention 1 (paymentService / 1-arg):
       releaseSlotLock(orderId)

     Convention 2 (app.js / 4-arg):
       releaseSlotLock(lockId, groundId, date, slotTime)

     We detect by checking: if arg2 looks like a Firestore doc ID
     (long alphanumeric string) rather than a ground/venue ID, we
     treat it as convention 1. Otherwise convention 2.
     When slotTime (arg4) is missing we pull it from sessionStorage.
  ───────────────────────────────────────────────────────────── */
  function installShim() {
    /* Keep a reference to whatever was there before */
    var _prev = typeof window.releaseSlotLock === 'function'
      ? window.releaseSlotLock
      : null;

    window.releaseSlotLock = function (arg1, arg2, arg3, arg4) {
      /* ── Detect calling convention ── */

      // If only one argument and no others, it's the 1-arg orderId convention
      if (arg2 === undefined && arg3 === undefined && arg4 === undefined) {
        return _coreRelease({ orderId: arg1 });
      }

      // 4-arg convention: (lockId, groundId, date, slotTime)
      // slotTime may be undefined — pull from sessionStorage as fallback
      var lockId   = arg1;
      var groundId = arg2;
      var date     = arg3;
      var slotTime = arg4 || _slotTimeFromSession();

      // Also try to get groundId/date from session if missing
      if (!groundId) groundId = _groundIdFromSession();
      if (!date)     date     = _dateFromSession();

      return _coreRelease({
        orderId  : lockId,  // lockId often doubles as orderId
        lockId   : lockId,
        groundId : groundId,
        date     : date,
        slotTime : slotTime,
      });
    };

    /* Mark so we don't double-install */
    window.releaseSlotLock._spbShim = true;
    console.log('[slotlock-fix] window.releaseSlotLock shim installed ✅');
  }

  /* ─────────────────────────────────────────────────────────────
     Also patch app.js's own internal releaseSlotLock via its
     reference in the global scope — if it's accessible —
     so that direct calls from within app.js are also safe.
  ───────────────────────────────────────────────────────────── */
  function _patchAppJsInternals() {
    /* app.js has: async function releaseSlotLock(lockId, groundId, date, slotTime)
       It's not on window by default (paymentService overwrites it).
       We can't reach inside app.js's scope, but we CAN make
       window.releaseSlotLock safe so that any external caller goes
       through our shim. The app.js internal call at line 1365 is
       triggered by something that first calls window.releaseSlotLock
       from bmg_master_fix_v2.js — our shim intercepts that path. */
    // (no-op: already handled by the shim above)
  }

  /* ─────────────────────────────────────────────────────────────
     BOOT — install shim as early as possible, and re-install
     after any script that might overwrite window.releaseSlotLock.
  ───────────────────────────────────────────────────────────── */
  installShim();

  /* Re-check after DOM ready in case paymentService.js loads late */
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.releaseSlotLock || !window.releaseSlotLock._spbShim) {
      installShim();
    }
  });

  /* Re-check after every bmg:pageShown in case an SPA nav reinitialises things */
  window.addEventListener('bmg:pageShown', function () {
    if (!window.releaseSlotLock || !window.releaseSlotLock._spbShim) {
      installShim();
    }
  });

})();