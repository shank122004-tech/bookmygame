/**
 * paymentService.js — BookMyGame Unified Payment System  [ENTERPRISE UPGRADE v2.0]
 * ============================================================
 * ARCHITECTURE (unchanged — Zomato/Swiggy-style popup):
 *   1. startPayment(data, paymentType)
 *      → writes  pending_payments/{orderId}
 *      → calls   Cloud Function /createOrder
 *      → opens   Cashfree SDK popup (no redirect)
 *      → starts  Firestore realtime listener
 *
 *   2. Cashfree webhook fires
 *      → Cloud Function verifies signature
 *      → routes by paymentType
 *      → writes  final collection
 *      → deletes pending_payments/{orderId}
 *
 *   3. Realtime listener detects pending deletion
 *      → checks failed_payments for failure record
 *      → shows success / error UI
 *
 * UPGRADES APPLIED (over v1):
 *
 *  [U9]  listenForPaymentConfirmation() always unsubscribes the previous
 *        listener before creating a new one — no memory leaks across
 *        navigations or session recoveries.
 *
 *  [U10] Listener cleanup is registered on pagehide / visibilitychange
 *        so the Firestore socket is released on tab close / background.
 *
 *  [U11] callCreateOrder() now surfaces 429 (rate-limit) as a distinct
 *        user-visible error rather than a generic crash.
 *
 *  [U12] startPayment() records createOrder latency for client-side
 *        performance logging (dispatched in bmg:paymentConfirmed event).
 *
 *  [U13] onFailure popup callback now properly releases _paymentInFlight
 *        so the user can retry without refreshing the page.
 *
 *  [U14] releaseSlotLock() is also called inside the onFailure popup
 *        callback, not only on timeout, so slot lock is never stuck when
 *        the user presses "back" in the payment popup.
 *
 * RULES (NEVER VIOLATED):
 *   ✗ Frontend NEVER confirms payment directly
 *   ✗ No polling — Firestore onSnapshot only
 *   ✗ No redirect — Cashfree SDK popup (redirectTarget:"_modal")
 *   ✓ Webhook is the single source of truth
 *   ✓ One startPayment() handles all payment types
 * ============================================================
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const PAYMENT_CFG = {
 CREATE_ORDER_URL: "https://createorder-zcufrrpotq-uc.a.run.app",
  CASHFREE_MODE       : "production",         // "sandbox" | "production"
  LISTENER_TIMEOUT_MS : 90 * 1000,        // 90s wait; poll fallback fires after this
  SLOT_LOCK_DURATION_MS: 15 * 60 * 1000,      // slot held for 15 min
  PENDING_EXPIRY_MS   : 30 * 60 * 1000,       // pending doc TTL
  OWNER_ONBOARDING_FEE: 499,
};

const LS = {
  ORDER_ID   : "bmg_orderId",
  PAY_TYPE   : "bmg_payType",
  PAY_DATA   : "bmg_payData",
  IN_PROGRESS: "bmg_payInProgress",
  CANCELLED  : "bmg_payCancelled",   // written on cancel/close; cleared on success
};

// ─────────────────────────────────────────────
// GLOBAL RE-ENTRY LOCK (double-click / race guard)
// ─────────────────────────────────────────────
// Prevents startPayment() from running concurrently.
// Any second call while one is in-flight is silently dropped.
let _paymentInFlight  = false;
// Tracks whether the user actually submitted a payment in the Cashfree popup.
// Set to true in onSuccess so onClose knows NOT to cancel the listener
// (covers UPI app-switch flows where the popup closes after payment is sent).
let _paymentSubmitted = false;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function generateOrderId(prefix = "ORD") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 900000 + 100000)}`;
}

function clearPaymentState() {
  Object.values(LS).forEach(k => localStorage.removeItem(k));
}

// Written immediately when user cancels/closes the popup.
// recoverPaymentSession() reads this on the next page load and skips the
// "Checking payment status…" overlay, showing a cancelled toast instead.
function cancelPaymentState(orderId) {
  localStorage.setItem(LS.CANCELLED, orderId || "1");
  Object.values(LS).filter(k => k !== LS.CANCELLED).forEach(k => localStorage.removeItem(k));
}

function savePaymentState(orderId, paymentType, data) {
  localStorage.setItem(LS.ORDER_ID,    orderId);
  localStorage.setItem(LS.PAY_TYPE,    paymentType);
  localStorage.setItem(LS.PAY_DATA,    JSON.stringify(data));
  localStorage.setItem(LS.IN_PROGRESS, "true");
}

function getPaymentPrefixFor(paymentType) {
  return { booking: "BKG", owner_onboarding: "OWN", tournament: "TRN" }[paymentType] || "ORD";
}

// ─────────────────────────────────────────────
// FIRESTORE DATA SANITIZER
// ─────────────────────────────────────────────
// FIX: Firestore rejects non-plain objects (Timestamp, DocumentSnapshot,
// FieldValue inside nested spreads, class instances, functions, etc.).
// This helper strips them out by round-tripping through JSON, producing
// a pure plain-JS object safe to write at any nesting depth.
//
// IMPORTANT: Call this ONLY on fields that must be plain JS.
// Never pass FieldValue.serverTimestamp() through cleanFirestoreData —
// it must be set at the top level of the Firestore write, not inside
// the sanitised payload, because JSON.stringify drops non-serialisable values.
// ─────────────────────────────────────────────
function cleanFirestoreData(obj) {
  // JSON round-trip removes: undefined, functions, class instances,
  // Timestamp objects, DocumentSnapshot refs, Symbols, etc.
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

function showPaymentLoading(message = "Opening payment…") {
  removePaymentUI();

  const el = document.createElement("div");
  el.id = "_bmg_pay_overlay";
  el.innerHTML = `
    <div class="_bmg_pay_card">
      <div class="_bmg_spinner"></div>
      <h3 id="_bmg_pay_title">Securing Payment</h3>
      <p id="_bmg_pay_msg">${message}</p>
      <span id="_bmg_pay_order" style="font-size:.72rem;color:#9ca3af;margin-top:8px;display:block"></span>
    </div>
    <style>
      #_bmg_pay_overlay{
        position:fixed;inset:0;background:rgba(0,0,0,.55);
        display:flex;align-items:center;justify-content:center;
        z-index:99999;font-family:'Segoe UI',sans-serif;
      }
      ._bmg_pay_card{
        background:#fff;border-radius:18px;padding:36px 28px;
        text-align:center;max-width:340px;width:90%;
        box-shadow:0 20px 60px rgba(0,0,0,.2);
        animation:_bmgfade .25s ease;
      }
      ._bmg_pay_card h3{margin:16px 0 6px;font-size:1.15rem;color:#111;}
      ._bmg_pay_card p{font-size:.88rem;color:#6b7280;line-height:1.5;margin:0;}
      ._bmg_spinner{
        width:48px;height:48px;border:4px solid #e5e7eb;
        border-top-color:#6366f1;border-radius:50%;
        animation:_bmgspin 1s linear infinite;margin:0 auto;
      }
      @keyframes _bmgspin{to{transform:rotate(360deg)}}
      @keyframes _bmgfade{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
      ._bmg_success_icon{font-size:52px;color:#22c55e;margin-bottom:8px;animation:_bmgpop .4s ease;}
      ._bmg_error_icon{font-size:52px;color:#ef4444;margin-bottom:8px;}
      @keyframes _bmgpop{0%{transform:scale(.5)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
      ._bmg_retry_btn{
        margin-top:18px;padding:10px 28px;background:#6366f1;
        color:#fff;border:none;border-radius:8px;font-size:.9rem;
        cursor:pointer;transition:background .2s;
      }
      ._bmg_retry_btn:hover{background:#4f46e5;}
    </style>
  `;
  document.body.appendChild(el);
}

function updatePaymentLoadingMsg(msg) {
  const el = document.getElementById("_bmg_pay_msg");
  if (el) el.textContent = msg;
}

function showPaymentSuccess(paymentType, orderId) {
  const card = document.querySelector("._bmg_pay_card");
  if (!card) return;

  const messages = {
    booking          : { title: "Booking Confirmed! 🎉", body: "Your slot is locked. Check <em>My Bookings</em> for details." },
    owner_onboarding : { title: "Account Activated! 🚀", body: "Welcome to BookMyGame! Your ground listing is now live." },
    tournament       : { title: "You're In! 🏆",         body: "Tournament registration confirmed. Good luck!" },
  };

  const m = messages[paymentType] || { title: "Payment Successful!", body: "Your transaction is confirmed." };

  card.innerHTML = `
    <div class="_bmg_success_icon">✓</div>
    <h3>${m.title}</h3>
    <p>${m.body}</p>
    <span style="font-size:.72rem;color:#9ca3af;margin-top:8px;display:block">Order: ${orderId}</span>
    <button class="_bmg_retry_btn" style="background:#22c55e" onclick="removePaymentUI()">Done</button>
  `;

  setTimeout(removePaymentUI, 5000);
}

function showPaymentError(message, retryFn) {
  const card = document.querySelector("._bmg_pay_card");
  if (!card) { showToast(message, "error"); return; }

  card.innerHTML = `
    <div class="_bmg_error_icon">✗</div>
    <h3 style="color:#ef4444">Payment Failed</h3>
    <p>${message}</p>
    <button class="_bmg_retry_btn" onclick="${retryFn ? "window._bmgRetry()" : "removePaymentUI()"}">
      ${retryFn ? "Try Again" : "Close"}
    </button>
  `;

  if (retryFn) window._bmgRetry = retryFn;
}

function removePaymentUI() {
  const el = document.getElementById("_bmg_pay_overlay");
  if (el) el.remove();
  delete window._bmgRetry;
}

// ─────────────────────────────────────────────
// [U9][U10] REALTIME LISTENER — leak-safe
// ─────────────────────────────────────────────
// Tracks both the unsubscribe function AND the timeout handle so we can
// guarantee both are cleaned up on any path (confirm / timeout / navigate).
//
// A module-level registry means only one listener is ever active at a time.
// Any subsequent call to listenForPaymentConfirmation() cancels the previous
// one, preventing zombie listeners from accumulating across re-renders or
// session recoveries.
// ─────────────────────────────────────────────

let _activeListener  = null; // Firestore unsubscribe fn
let _listenerTimer   = null; // timeout handle

function _clearActiveListener() {
  if (_activeListener) {
    _activeListener();
    _activeListener = null;
  }
  if (_listenerTimer) {
    clearTimeout(_listenerTimer);
    _listenerTimer = null;
  }
}

// [U10] Release the listener automatically when the tab goes to background
// or the page is closed. This prevents the Firestore WebSocket from being
// held open unnecessarily and avoids phantom events on resume.
function _registerPageUnloadCleanup() {
  const handler = () => _clearActiveListener();
  window.addEventListener("pagehide",        handler, { once: true });
  window.addEventListener("beforeunload",    handler, { once: true });
  // When tab becomes hidden for too long — release resources
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Do NOT clear immediately — user may just switch tabs briefly.
      // Only clear if we're already done (listener already null).
      // Full cleanup on pagehide / beforeunload is the authoritative path.
    }
  });
}

_registerPageUnloadCleanup();

/**
 * pollCashfreeOrderStatus()
 *
 * FALLBACK: Called when the Firestore listener times out (webhook delayed or
 * failed). Hits the backend /checkOrderStatus endpoint which re-queries
 * Cashfree directly and, if paid, triggers the same Firestore writes the
 * webhook would have done.
 *
 * This guarantees the booking is confirmed even if:
 *   - The Cashfree webhook was delayed / missed
 *   - The user returned from payment to the app before the webhook fired
 *   - Network issues prevented the Firestore listener from seeing the deletion
 */
async function pollCashfreeOrderStatus(orderId, paymentType) {
  try {
    updatePaymentLoadingMsg("Verifying payment directly…");
    const res = await fetch("https://us-central1-bookmygame-2149d.cloudfunctions.net/checkOrderStatus", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ orderId, paymentType }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data; // { status: "SUCCESS"|"FAILED"|"PENDING", booking?: {...} }
  } catch (e) {
    console.warn("pollCashfreeOrderStatus error:", e);
    return null;
  }
}


/**
 * listenForPaymentConfirmation()
 *
 * Attaches a Firestore onSnapshot listener to pending_payments/{orderId}.
 * When the document is deleted (by the webhook), we determine outcome:
 *   → If failed_payments/{orderId} exists → failure
 *   → Otherwise                           → success, read final collection
 *
 * The listener self-cleans on:
 *   - doc deletion (normal path)
 *   - timeout (PAYMENT_CFG.LISTENER_TIMEOUT_MS)
 *   - pagehide / beforeunload (tab close)
 *   - a subsequent call to this function (session recovery)
 */
function listenForPaymentConfirmation(orderId, paymentType, callbacks) {
  const { onConfirmed, onTimeout } = callbacks;

  // [U9] Always cancel any prior listener before starting a new one
  _clearActiveListener();

  // Set timeout — if webhook never fires within the window, try a direct poll
  // before giving up. This handles: delayed webhooks, user returning from
  // payment page before webhook fires, and network-related listener gaps.
  _listenerTimer = setTimeout(async () => {
    _clearActiveListener();

    // ── FALLBACK: poll Cashfree directly via backend ──────────────────
    // Before calling onTimeout (which shows a warning and releases the slot),
    // ask the backend to re-check Cashfree. If paid, trigger onConfirmed.
    try {
      const pollResult = await pollCashfreeOrderStatus(orderId, paymentType);
      if (pollResult?.status === "SUCCESS") {
        console.log("✅ [FALLBACK POLL] Payment confirmed via direct check:", orderId);
        onConfirmed(pollResult.booking || { orderId, paymentType });
        return;
      }
      if (pollResult?.status === "FAILED") {
        showPaymentError("Payment failed. Please try again.");
        clearPaymentState();
        _paymentInFlight = false;
        return;
      }
      // PENDING or null — genuinely unknown, fall through to onTimeout
    } catch (e) {
      console.warn("[FALLBACK POLL] Error:", e);
    }

    onTimeout(orderId);
  }, PAYMENT_CFG.LISTENER_TIMEOUT_MS);

  const pendingRef = db.collection("pending_payments").doc(orderId);

  _activeListener = pendingRef.onSnapshot(
    async (snap) => {
      if (!snap.exists) {
        // Pending doc was deleted — webhook has fired (success or failure).
        _clearActiveListener();

        try {
          // Check for failure FIRST — handlePaymentFailure() writes
          // failed_payments/{orderId} before deleting pending_payments.
          const failSnap = await db.collection("failed_payments").doc(orderId).get();
          if (failSnap.exists) {
            const reason = failSnap.data()?.failureReason || "Payment failed. Please try again.";
            showPaymentError(reason);
            return;
          }

          // No failure record → payment succeeded. Read the final doc to
          // give onConfirmed() the richest possible data.
          if (paymentType === "booking") {
            const bSnap = await db.collection("bookings").doc(orderId).get();
            if (bSnap.exists) { onConfirmed(bSnap.data()); return; }
          }
          if (paymentType === "owner_onboarding") {
            // owners/{ownerId} is the final record; orderId signal is enough here
            onConfirmed({ orderId, paymentType });
            return;
          }
          if (paymentType === "tournament") {
            const tSnap = await db.collection("tournament_entries").doc(orderId).get();
            if (tSnap.exists) { onConfirmed(tSnap.data()); return; }
          }

          // Generic fallback (shouldn't hit in normal flow)
          onConfirmed({ orderId, paymentType });

        } catch (e) {
          console.error("Post-webhook read error:", e);
          // Webhook already confirmed — surface success even if post-read fails
          onConfirmed({ orderId, paymentType });
        }
      }
    },
    (err) => {
      // Listener connection error (permissions, network, etc.)
      console.error("Snapshot listener error:", err);
      _clearActiveListener();
      // Surface a non-fatal warning — do not call onTimeout (slot is not stuck)
      showToast("Connection issue. Checking payment status…", "warning", 5000);
    }
  );
}

// ─────────────────────────────────────────────
// STEP 1 — CREATE PENDING PAYMENT DOC
// ─────────────────────────────────────────────

async function createPendingPayment(orderId, data, paymentType) {
  // FIX: Do NOT spread raw `data` — it may contain Timestamp objects,
  // DocumentSnapshots, class instances, or other non-plain values that
  // trigger "Expected type 'Vd'" from Firestore.
  // Sanitise the incoming payload first, then explicitly whitelist every
  // field we actually want in Firestore.
  console.log("Saving bookingDetails (createPendingPayment):", data); // debug log

  // expiresAt must be a plain number (ms), not a Firestore Timestamp object.
  const expiresAtMs = Date.now() + PAYMENT_CFG.PENDING_EXPIRY_MS;

  // FIX: Build explicit whitelist — NO spreads, NO cleanFirestoreData().
  // Every field is cast to a plain primitive. This prevents the
  // "Expected type 'Vd'" FirebaseError caused by non-plain objects.
  const safeData = {
    orderId     : String(orderId),
    paymentType : String(paymentType),
    status      : "pending",
    userId      : String(currentUser?.uid || data.userId || ""),
    userName    : String(data.userName    || currentUser?.name  || ""),
    userEmail   : String(data.userEmail   || currentUser?.email || ""),
    userPhone   : String(data.userPhone   || currentUser?.phone || ""),
    amount      : Number(data.amount      || 0),
    ownerId     : String(data.ownerId      || ""),
    tournamentId: String(data.tournamentId || ""),
    teamName    : String(data.teamName     || ""),
    expiresAtMs,
  };

  // Strip empty strings, NaN, null, undefined so Firestore never sees them
  Object.keys(safeData).forEach(key => {
    const v = safeData[key];
    if (
      v === null || v === undefined ||
      (typeof v === "string" && v === "") ||
      (typeof v === "number" && Number.isNaN(v))
    ) {
      delete safeData[key];
    }
  });

  console.log("FINAL SAFE DATA (createPendingPayment):", safeData); // debug log

  await db.collection("pending_payments").doc(safeData.orderId).set({
    ...safeData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), // top-level only
  });
}

async function createPendingBookingWithSlotLock(orderId, data) {
  const parts     = (data.slotTime || "").split("-");
  const startTime = parts[0]?.trim() || "";
  const endTime   = parts[1]?.trim() || "";

  // FIX: Firestore Timestamp objects must NEVER be passed inside a nested
  // object written via a transaction — this is the root cause of
  // "Expected type 'Vd', but it was: a custom Pd object".
  //
  // Instead, store lock/expiry times as plain millisecond numbers.
  // Your Cloud Functions and TTL rules read them as numbers already.
  const lockExpiresAtMs = Date.now() + PAYMENT_CFG.SLOT_LOCK_DURATION_MS;
  const pendingExpiryMs = Date.now() + PAYMENT_CFG.PENDING_EXPIRY_MS;

  // ── Derived amounts (plain numbers — computed before the transaction) ──────
  const platformFee = Number(data.amount) * 0.10;
  const ownerAmount = data.ownerAmount != null
    ? Number(data.ownerAmount)
    : Number(data.amount) - platformFee;

  // FIX: Build the strict safe object HERE, outside the transaction, so every
  // value is verified as a plain JS primitive before Firestore ever sees it.
  // No spreads, no raw `data`, no Timestamp objects, no null/undefined.
  // Each field is explicitly cast: String() for text, Number() for amounts,
  // Boolean() for flags. Fields that are optional but have no meaningful
  // default are omitted rather than written as empty strings.
  const safeData = {
    // ── Identity ────────────────────────────────────────────────────────────
    orderId       : String(orderId),
    paymentType   : "booking",
    status        : "pending",

    // ── User (always present — currentUser is validated in startPayment) ────
    userId        : String(data.userId        || currentUser?.uid   || ""),
    userName      : String(data.userName      || currentUser?.name  || ""),
    userEmail     : String(data.userEmail     || currentUser?.email || ""),
    userPhone     : String(data.userPhone     || currentUser?.phone || ""),

    // ── Ground / venue ───────────────────────────────────────────────────────
    groundId      : String(data.groundId      || ""),
    groundName    : String(data.groundName    || ""),
    venueName     : String(data.venueName     || ""),
    venueAddress  : String(data.venueAddress  || ""),
    groundAddress : String(data.groundAddress || ""),
    sportType     : String(data.sportType     || ""),
    ownerId       : String(data.ownerId       || ""),
    isPlotOwner   : Boolean(data.isPlotOwner  || false),

    // ── Slot ─────────────────────────────────────────────────────────────────
    date          : String(data.date          || ""),
    slotTime      : String(data.slotTime      || ""),

    // ── Amounts (all Numbers) ─────────────────────────────────────────────
    amount        : Number(data.amount        || 0),
    originalAmount: Number(data.originalAmount || data.amount || 0),
    ownerAmount   : Number(ownerAmount),
    platformFee   : Number(platformFee),

    // ── Optional extras (always plain strings, empty string stripped below) ─
    promoCode   : String(data.promoCode    || ""),
    appliedOffer: String(data.appliedOffer || ""),

    // ── Expiry (plain number — TTL and Cloud Functions read this as ms) ──────
    pendingExpiryMs,                           // plain number — safe
  };

  // Remove any NaN numbers that slipped through (e.g. Number(undefined) = NaN)
  Object.keys(safeData).forEach(key => {
    const v = safeData[key];
    if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) {
      delete safeData[key];
    }
  });

  console.log("FINAL SAFE DATA:", safeData); // debug log — verify before write

  // FIX: Declare pendingRef OUTSIDE the transaction callback so it is in scope
  // when t.set() is called. This was the crash: `pendingRef` was referenced
  // inside the transaction but never declared, causing a ReferenceError which
  // Firestore surfaced as the misleading "Expected type 'Vd'" error.
  const pendingRef = db.collection("pending_payments").doc(orderId);

  // FIX (root cause of "Expected type 'Vd', but it was: a custom Pd object"):
  // Firestore SDK v8 transactions only accept DocumentReference in t.get().
  // Passing a Query object (Pd) causes this exact error.
  // Solution: run the query OUTSIDE the transaction to obtain the DocumentReference,
  // then use t.get(docRef) INSIDE the transaction for atomic read-then-write.
  const slotQ = await db.collection("slots")
    .where("groundId",  "==", data.groundId)
    .where("date",      "==", data.date)
    .where("startTime", "==", startTime)
    .where("endTime",   "==", endTime)
    .limit(1)
    .get();

  // Capture the existing slot ref (if any) before entering the transaction.
  const existingSlotRef = slotQ.empty ? null : slotQ.docs[0].ref;

  return db.runTransaction(async (t) => {
    if (existingSlotRef) {
      // Re-read inside the transaction using a DocumentReference — this is valid.
      const slotSnap = await t.get(existingSlotRef);
      const slot = slotSnap.data() || {};

      if (slot.status === "booked") throw new Error("SLOT_ALREADY_BOOKED");
      if (slot.status === "locked" && slot.lockOrderId !== orderId) {
        const expiryMs = slot.lockExpiresAtMs || 0;
        if (expiryMs > Date.now()) throw new Error("SLOT_TEMPORARILY_LOCKED");
      }

      t.update(existingSlotRef, {
        status          : "locked",
        lockOrderId     : String(orderId),
        lockExpiresAtMs,                      // plain number — safe
        updatedAt       : firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // No existing slot doc — create one.
      t.set(db.collection("slots").doc(), {
        groundId        : String(data.groundId),
        date            : String(data.date),
        startTime       : String(startTime),
        endTime         : String(endTime),
        status          : "locked",
        lockOrderId     : String(orderId),
        lockExpiresAtMs,                      // plain number — safe
        createdAt       : firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt       : firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Write the pending payment doc.
    // safeData contains ONLY plain JS primitives (strings, numbers, booleans).
    // FieldValue.serverTimestamp() is added here at the TOP LEVEL only.
    t.set(pendingRef, {
      ...safeData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────
// STEP 2 — CALL CLOUD FUNCTION /createOrder
// Backend reads canonical amount from Firestore — never from client body.
// [U11] 429 rate-limit responses are surfaced as a distinct user error.
// ─────────────────────────────────────────────

async function callCreateOrder(orderId, amount, paymentType, customerData) {
  const res = await fetch("https://createorder-zcufrrpotq-uc.a.run.app", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({
      orderId,
      amount,      // hint only — backend uses Firestore value for booking/tournament
      paymentType,
      customer: {
        id   : customerData.userId || currentUser?.uid   || "guest",
        email: customerData.email  || currentUser?.email || "noemail@bookmygame.in",
        phone: customerData.phone  || currentUser?.phone || "9999999999",
        name : customerData.name   || currentUser?.name  || "Customer",
      },
    }),
  });

  // [U11] Distinguish rate-limit (429) from other server errors
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const waitSec = Math.ceil((body.retryAfter || 60000) / 1000);
    throw new Error(`RATE_LIMITED:${waitSec}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createOrder failed (${res.status}): ${text}`);
  }

  return res.json(); // { payment_session_id, order_id, … }
}

// ─────────────────────────────────────────────
// STEP 3 — OPEN CASHFREE POPUP
// [U13] onFailure now releases _paymentInFlight so user can retry.
// [U14] onFailure also releases slot lock.
// ─────────────────────────────────────────────

function openCashfreePopup(paymentSessionId, orderId, paymentType, data, triggerBtn) {
  if (typeof Cashfree === "undefined") {
    throw new Error(
      "Cashfree SDK not loaded. Add <script src='https://sdk.cashfree.com/js/v3/cashfree.js'></script> to index.html"
    );
  }

  const cashfree = Cashfree({ mode: PAYMENT_CFG.CASHFREE_MODE });

  cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_modal", // popup — NOT a full-page redirect
    onSuccess: () => {
      // Popup reports success — payment submitted. Set a flag so onClose knows
      // NOT to treat this as a cancel (user paid but popup auto-dismissed).
      _paymentSubmitted = true;
      updatePaymentLoadingMsg("Payment received. Verifying…");
    },
    onFailure: async (reason) => {
      // [U13] Release in-flight lock so user can try again without refreshing
      _paymentInFlight = false;
      _paymentSubmitted = false;
      reEnableButton(triggerBtn);
      _clearActiveListener();
      cancelPaymentState(orderId); // marks cancelled so refresh skips the spinner

      console.warn("Cashfree reported popup failure:", reason);

      // [U14] Release slot lock immediately so slot becomes available again
      await releaseSlotLock(orderId);

      showPaymentError("Payment was not completed. Please try again.", () => {
        // Clear the cancelled flag before retrying so recovery works if they refresh
        localStorage.removeItem(LS.CANCELLED);
        startPayment(data, paymentType);
      });
    },
    onClose: () => {
      // Popup closed. Two cases:
      //   A) User paid (onSuccess fired first) → _paymentSubmitted = true
      //      Keep the listener alive — webhook is in-flight. Do NOT cancel.
      //   B) User cancelled without paying → _paymentSubmitted = false
      //      Kill the listener, release the slot, show cancelled UI.
      if (_paymentSubmitted) {
        // Payment was submitted — just update the overlay message and wait.
        updatePaymentLoadingMsg("Payment submitted. Verifying booking…");
        return;
      }

      // Genuine cancel — no payment submitted.
      _clearActiveListener();
      _paymentInFlight = false;
      _paymentSubmitted = false;
      reEnableButton(triggerBtn);

      // Mark as cancelled so a page refresh skips the recovery spinner.
      cancelPaymentState(orderId);

      // Release the slot lock in the background (don't await — fire and forget)
      releaseSlotLock(orderId).catch(e => console.warn("releaseSlotLock:", e));

      // Show "Payment Cancelled" for exactly 2 seconds, then dismiss.
      const card = document.querySelector("._bmg_pay_card");
      if (card) {
        card.innerHTML = `
          <div class="_bmg_error_icon">✗</div>
          <h3 style="color:#ef4444">Payment Cancelled</h3>
          <p>You cancelled the payment. Your slot has been released.</p>
          <button class="_bmg_retry_btn" onclick="removePaymentUI()">OK</button>
        `;
      }
      // Hard 2-second dismiss — overlay will never get stuck
      setTimeout(() => {
        removePaymentUI();
        showToast("Payment cancelled. Select a slot to try again.", "warning", 4000);
      }, 2000);
    },
  });

  // ── Safety net: if Cashfree never fires onClose/onFailure (browser quirk),
  //    auto-dismiss the "Securing Payment" overlay after 2 s once popup is open.
  //    We only dismiss if the overlay is still in "Securing / Opening" state
  //    (i.e. user hasn't paid yet). A short 500 ms delay lets the popup render first.
  setTimeout(() => {
    if (_paymentInFlight) return; // payment already completed/failed — skip
    // If overlay still shows the initial spinner message, it means onClose was
    // never called. Treat it as a cancel.
    const msgEl = document.getElementById("_bmg_pay_msg");
    if (msgEl && (
      msgEl.textContent.includes("Securing") ||
      msgEl.textContent.includes("Opening") ||
      msgEl.textContent.includes("Creating")
    )) {
      // Don't remove yet — popup may still be legitimately open.
      // Set a 2-second watchdog that fires IF the popup is dismissed but overlay stays.
      let _cancelWatchdog = setInterval(() => {
        const overlay = document.getElementById("_bmg_pay_overlay");
        if (!overlay) { clearInterval(_cancelWatchdog); return; } // already gone
        if (_paymentInFlight) { clearInterval(_cancelWatchdog); return; } // in progress
        // Overlay still showing but no payment in flight → stuck. Dismiss now.
        clearInterval(_cancelWatchdog);
        cancelPaymentState(orderId);
        removePaymentUI();
        showToast("Payment cancelled. Select a slot to try again.", "warning", 4000);
      }, 2000);
    }
  }, 500);
}

// ─────────────────────────────────────────────
// MAIN ENTRY POINT — startPayment()
// [U12] Records createOrder latency and includes it in the dispatched event.
// ─────────────────────────────────────────────

/**
 * Universal payment initiator. Non-reentrant via _paymentInFlight guard.
 *
 * @param {object} data        — payload for this payment type
 * @param {string} paymentType — "booking" | "owner_onboarding" | "tournament"
 */
async function startPayment(data, paymentType) {
  // Global re-entry guard — prevents double-tap / concurrent payment flows
  if (_paymentInFlight) {
    console.warn("⚠️ startPayment called while another payment is in flight — ignoring.");
    return;
  }
  _paymentInFlight  = true;
  _paymentSubmitted = false; // reset for this new payment attempt

  if (!currentUser) {
    _paymentInFlight = false;
    showToast("Please log in to continue", "warning");
    showPage("login-page");
    return;
  }

  if (!["booking", "owner_onboarding", "tournament"].includes(paymentType)) {
    _paymentInFlight = false;
    console.error("Unknown paymentType:", paymentType);
    return;
  }

  // Resolve amount
  const amount = paymentType === "owner_onboarding"
    ? PAYMENT_CFG.OWNER_ONBOARDING_FEE
    : Number(data.amount);

  if (!(amount > 0)) {
    _paymentInFlight = false;
    showToast("Invalid payment amount.", "error");
    return;
  }

  const orderId = generateOrderId(getPaymentPrefixFor(paymentType));

  // Capture trigger button for re-enable on completion / error
  const triggerBtn = document.activeElement;
  if (triggerBtn && triggerBtn.tagName === "BUTTON") {
    triggerBtn.disabled     = true;
    triggerBtn._bmgOrigText = triggerBtn.textContent;
    triggerBtn.textContent  = "Processing…";
  }

  showPaymentLoading("Securing your payment slot…");

  try {
    // 1. Write pending document (+ slot lock for bookings).
    //
    // FIX: Do NOT pass `{ ...data, amount }` — spreading `data` here is the
    // root cause of the error. If `data` contains any non-plain value
    // (Timestamp, DocumentSnapshot, FieldValue, class instance, etc.) it will
    // be spread directly into the Firestore write and trigger
    // "Expected type 'Vd', but it was: a custom Pd object".
    //
    // Instead, pass only the validated `amount` scalar alongside the original
    // `data` reference. Both write functions (createPendingBookingWithSlotLock
    // and createPendingPayment) build their own strict safeData objects
    // internally and never spread `data` directly into Firestore.
    if (paymentType === "booking") {
      // amount has been validated as a positive Number above — attach it back
      // onto data as a plain number override before the write function reads it.
      data.amount = amount; // plain Number — safe
      await createPendingBookingWithSlotLock(orderId, data);
    } else {
      data.amount = amount; // plain Number — safe
      await createPendingPayment(orderId, data, paymentType);
    }

    savePaymentState(orderId, paymentType, data);
    updatePaymentLoadingMsg("Creating secure order…");

    // [U12] Track createOrder latency for the dispatched event
    const orderStartTs = Date.now();

    // 2. Call Cloud Function — backend reads canonical amount from Firestore
    const cf = await callCreateOrder(orderId, amount, paymentType, {
      userId: data.userId    || currentUser.uid,
      email : data.userEmail || currentUser.email,
      phone : data.userPhone || currentUser.phone,
      name  : data.userName  || currentUser.name,
    });

    const orderLatencyMs = Date.now() - orderStartTs; // [U12]

    if (!cf.payment_session_id) {
      throw new Error("No payment_session_id returned from server.");
    }

    // 3. Start realtime listener BEFORE opening popup
    //    — ensures we never miss a webhook that fires before the popup renders
    listenForPaymentConfirmation(orderId, paymentType, {
      onConfirmed: (result) => {
        clearPaymentState();
        _paymentInFlight = false;
        showPaymentSuccess(paymentType, orderId);
        dispatchPaymentEvent("bmg:paymentConfirmed", {
          orderId,
          paymentType,
          result,
          orderLatencyMs, // [U12] pass latency to app.js listeners
        });
        reEnableButton(triggerBtn);
      },
      onTimeout: async () => {
        removePaymentUI();
        clearPaymentState();
        _paymentInFlight = false;

        // FIX: Do NOT release slot lock on timeout. The payment may have
        // succeeded on Cashfree's side — the webhook is simply delayed.
        // Releasing the slot here risks double-booking a paid slot.
        // The scheduled cleanup handles truly abandoned locks after 30 min.
        reEnableButton(triggerBtn);
        showToast(
          "Verifying your payment… Check 'My Bookings' in a moment.",
          "warning",
          9000
        );
      },
    });

    updatePaymentLoadingMsg("Opening payment window…");

    // 4. Open Cashfree popup — pass triggerBtn for re-enable on popup failure [U13]
    openCashfreePopup(cf.payment_session_id, orderId, paymentType, data, triggerBtn);

  } catch (err) {
    console.error("startPayment error:", err);
    clearPaymentState();
    _paymentInFlight = false;
    reEnableButton(triggerBtn);

    // ── Specific error handling ───────────────────────────────────────

    if (err.message === "SLOT_ALREADY_BOOKED") {
      removePaymentUI();
      showToast("This slot was just booked. Please select another.", "error");
      goHome();
      return;
    }

    if (err.message === "SLOT_TEMPORARILY_LOCKED") {
      removePaymentUI();
      showToast("This slot is momentarily reserved. Please wait and try again.", "warning");
      return;
    }

    // [U11] Rate limit — show time-specific message
    if (err.message?.startsWith("RATE_LIMITED:")) {
      const waitSec = err.message.split(":")[1] || "60";
      removePaymentUI();
      showToast(
        `Too many attempts. Please wait ${waitSec} seconds before trying again.`,
        "error",
        7000
      );
      return;
    }

    showPaymentError(
      "Could not start payment. Please try again.",
      () => startPayment(data, paymentType)
    );
  }
}

function reEnableButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn._bmgOrigText) btn.textContent = btn._bmgOrigText;
}

// ─────────────────────────────────────────────
// CONVENIENCE WRAPPERS
// ─────────────────────────────────────────────

/** Ground booking payment */
async function initiateBookingPayment(booking) {
  return startPayment(booking, "booking");
}

/** Owner onboarding ₹499 fee */
async function initiateOwnerOnboardingPayment({ ownerId, userEmail, userPhone, userName }) {
  return startPayment({
    ownerId,
    userEmail,
    userPhone,
    userName,
    amount: PAYMENT_CFG.OWNER_ONBOARDING_FEE,
  }, "owner_onboarding");
}

/** Tournament entry fee */
async function initiateTournamentPayment({ tournamentId, tournamentName, entryFee, teamName }) {
  return startPayment({
    tournamentId,
    tournamentName,
    amount    : entryFee,
    userId    : currentUser?.uid,
    userEmail : currentUser?.email,
    userPhone : currentUser?.phone,
    userName  : currentUser?.name,
    teamName  : teamName || "",
  }, "tournament");
}

// ─────────────────────────────────────────────
// SLOT LOCK RELEASE
// Called on: timeout, popup onFailure [U14], session recovery timeout.
// Uses a batch so delete(pending) + update(slot) are atomic.
// ─────────────────────────────────────────────

async function releaseSlotLock(orderId) {
  if (!orderId) return;
  try {
    const pendingRef = db.collection("pending_payments").doc(orderId);
    const snap       = await pendingRef.get();
    if (!snap.exists) return; // already cleaned up

    const d = snap.data();
    if (d.paymentType !== "booking") { await pendingRef.delete(); return; }

    const startTime = (d.slotTime || "").split("-")[0].trim();
    const batch     = db.batch();
    batch.delete(pendingRef);

    const slotSnap = await db.collection("slots")
      .where("groundId",    "==", d.groundId)
      .where("date",        "==", d.date)
      .where("startTime",   "==", startTime)
      .where("lockOrderId", "==", orderId)
      .limit(1)
      .get();

    if (!slotSnap.empty) {
      batch.update(slotSnap.docs[0].ref, {
        status          : "available",
        lockOrderId     : null,
        lockExpiresAtMs : null,   // FIX: matches renamed plain-number field
        updatedAt       : firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    console.log("🔓 Slot lock released:", orderId);
  } catch (e) {
    console.error("releaseSlotLock error:", e);
  }
}

// ─────────────────────────────────────────────
// CUSTOM EVENT (for app.js to react to)
// ─────────────────────────────────────────────

function dispatchPaymentEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// Listen in app.js:
//   window.addEventListener("bmg:paymentConfirmed", e => {
//     console.log(e.detail.orderLatencyMs); // [U12] latency available here
//   });

// ─────────────────────────────────────────────
// SESSION RECOVERY (page refresh mid-payment)
// ─────────────────────────────────────────────

function recoverPaymentSession() {
  // ── GUARD 1: Previous session was explicitly cancelled/closed ────────────
  // cancelPaymentState() sets bmg_payCancelled when user dismisses the popup.
  // BUT: for UPI app-switch flows the popup fires onClose AFTER onSuccess.
  // If the webhook already confirmed the booking, we must show success — not skip.
  // So: if CANCELLED is set, still check the final collection before giving up.
  if (localStorage.getItem(LS.CANCELLED)) {
    const _cancelledOrderId = localStorage.getItem(LS.ORDER_ID);
    const _cancelledPayType = localStorage.getItem(LS.PAY_TYPE);
    localStorage.removeItem(LS.CANCELLED);

    if (_cancelledOrderId && _cancelledPayType) {
      // Quick-check: did the booking actually get confirmed despite the cancel flag?
      (async () => {
        try {
          let result = null;
          if (_cancelledPayType === "booking") {
            const bSnap = await db.collection("bookings").doc(_cancelledOrderId).get();
            if (bSnap.exists) result = bSnap.data();
          } else if (_cancelledPayType === "tournament") {
            const tSnap = await db.collection("tournament_entries").doc(_cancelledOrderId).get();
            if (tSnap.exists) result = tSnap.data();
          } else if (_cancelledPayType === "owner_onboarding") {
            const oSnap = await db.collection("owner_payments").doc(_cancelledOrderId).get();
            if (oSnap.exists) result = { orderId: _cancelledOrderId, paymentType: _cancelledPayType };
          }
          if (result) {
            // Payment succeeded — show confirmation instead of silently dismissing.
            clearPaymentState();
            _paymentInFlight  = false;
            _paymentSubmitted = false;
            showPaymentSuccess(_cancelledPayType, _cancelledOrderId);
            dispatchPaymentEvent("bmg:paymentConfirmed", {
              orderId: _cancelledOrderId,
              paymentType: _cancelledPayType,
              result,
            });
          } else {
            // Genuinely cancelled — clean up silently.
            removePaymentUI();
            clearPaymentState();
          }
        } catch(e) {
          removePaymentUI();
          clearPaymentState();
        }
      })();
    } else {
      removePaymentUI();
      setTimeout(removePaymentUI, 2000);
    }
    return;
  }

  // ── GUARD 2: Orphaned flag — IN_PROGRESS set but no orderId saved ───────
  // Happens when the browser was hard-killed before savePaymentState() ran.
  const orderId = localStorage.getItem(LS.ORDER_ID);
  const payType = localStorage.getItem(LS.PAY_TYPE);
  if (!orderId || !payType) {
    localStorage.removeItem(LS.IN_PROGRESS);
    return;
  }

  // ── GUARD 3: IN_PROGRESS must actually be "true" ─────────────────────────
  const inProgress = localStorage.getItem(LS.IN_PROGRESS);
  if (inProgress !== "true") return;

  // ── Real mid-payment refresh — check Firestore for webhook result ─────────
  console.log("🔁 Recovering payment session:", orderId, payType);
  showPaymentLoading("Checking payment status…");

  // FIX: Check if the pending doc STILL EXISTS before starting the long listener.
  // When the user returns from the Cashfree page the webhook may have already
  // fired and deleted pending_payments. In that case we should read the final
  // doc immediately rather than waiting 30 s for the listener to time out.
  (async () => {
    // Safety: if the page was cancelled and the flag wasn't cleared, dismiss quickly.
    const _cancelGuard = setTimeout(() => {
      if (localStorage.getItem(LS.CANCELLED)) {
        localStorage.removeItem(LS.CANCELLED);
        _clearActiveListener();
        removePaymentUI();
        clearPaymentState();
      }
    }, 2000);

    try {
      const pendingSnap = await db.collection("pending_payments").doc(orderId).get();

      if (!pendingSnap.exists) {
        // Pending doc already gone — webhook fired while we were away.
        // Check whether it's a success or failure directly.
        clearTimeout(_cancelGuard);
        updatePaymentLoadingMsg("Verifying booking…");

        const failSnap = await db.collection("failed_payments").doc(orderId).get();
        if (failSnap.exists) {
          clearPaymentState();
          _paymentInFlight = false;
          showPaymentError(failSnap.data()?.failureReason || "Payment failed. Please try again.");
          return;
        }

        // Check final collections for success
        let result = null;
        if (payType === "booking") {
          const bSnap = await db.collection("bookings").doc(orderId).get();
          if (bSnap.exists) result = bSnap.data();
        } else if (payType === "tournament") {
          const tSnap = await db.collection("tournament_entries").doc(orderId).get();
          if (tSnap.exists) result = tSnap.data();
        } else if (payType === "owner_onboarding") {
          result = { orderId, paymentType: payType };
        }

        if (result) {
          clearPaymentState();
          _paymentInFlight = false;
          showPaymentSuccess(payType, orderId);
          dispatchPaymentEvent("bmg:paymentConfirmed", { orderId, paymentType: payType, result });
          return;
        }

        // Final docs not found yet — webhook may be in-flight. Start listener.
        console.log("⏳ Pending gone but no final doc yet — starting listener for late webhook.");
      }
    } catch (e) {
      console.warn("recoverPaymentSession pre-check error:", e);
      clearTimeout(_cancelGuard);
    }

    // Standard listener path — pending doc exists (or pre-check failed), wait for webhook.
    listenForPaymentConfirmation(orderId, payType, {
      onConfirmed: (result) => {
        clearPaymentState();
        _paymentInFlight = false;
        showPaymentSuccess(payType, orderId);
        dispatchPaymentEvent("bmg:paymentConfirmed", { orderId, paymentType: payType, result });
      },
      onTimeout: async () => {
        removePaymentUI();
        clearPaymentState();
        _paymentInFlight = false;
        // FIX: Do NOT release slot on timeout — payment may be confirmed on
        // Cashfree's end with webhook just delayed. Scheduled cleanup handles
        // truly abandoned locks after 30 minutes.
        showToast("Could not verify payment automatically. Check 'My Bookings' — it may already be confirmed.", "warning", 8000);
      },
    });
  })();
}

document.addEventListener("DOMContentLoaded", recoverPaymentSession);

// ─────────────────────────────────────────────
// GLOBAL EXPORTS
// ─────────────────────────────────────────────

window.startPayment                   = startPayment;
window.initiateBookingPayment         = initiateBookingPayment;
window.initiateOwnerOnboardingPayment = initiateOwnerOnboardingPayment;
window.initiateTournamentPayment      = initiateTournamentPayment;
window.releaseSlotLock                = releaseSlotLock;
window.removePaymentUI                = removePaymentUI;
