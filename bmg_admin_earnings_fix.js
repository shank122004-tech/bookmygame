/**
 * bmg_admin_earnings_fix.js
 * ─────────────────────────────────────────────────────────────
 * FIX: "Owner Earnings" tab in Admin Dashboard is not clickable.
 *
 * ROOT CAUSE:
 *  1. The tab button exists in the UI (added by previous fix) but
 *     loadAdminDashboard() does getElementById('admin-owner-earnings-tab')
 *     which fails → JS error → tab does nothing.
 *  2. The tab id convention is  admin-{tab}-tab  so the tab key must
 *     be 'owner-earnings' and the element id 'admin-owner-earnings-tab'.
 *  3. loadAdminDashboard() has no 'owner-earnings' branch → falls through.
 *
 * FIX:
 *  A. Inject the tab button with the correct id into .admin-tabs.
 *  B. Patch loadAdminDashboard() to handle 'owner-earnings' tab.
 *  C. Wire the click via the same event-delegation map the app uses.
 *
 * LOAD ORDER — add after bmg_master_fix_v2.js in index.html:
 *   <script src="bmg_admin_earnings_fix.js"></script>
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  const TAB_ID  = 'admin-owner-earnings-tab';
  const TAB_KEY = 'owner-earnings';           // used inside loadAdminDashboard
  const CONT_ID = 'admin-dashboard-content';  // existing content container

  /* ── 1. Inject the tab button if it's missing ─────────────────── */
  function injectEarningsTab() {
    if (document.getElementById(TAB_ID)) return; // already present

    const tabBar = document.querySelector('.admin-tabs');
    if (!tabBar) return;

    const btn = document.createElement('button');
    btn.id        = TAB_ID;
    btn.className = 'tab-btn';
    btn.innerHTML = '<i class="fas fa-chart-bar" style="margin-right:5px;"></i>Owner Earnings';
    btn.style.cssText = 'white-space:nowrap;';

    // Insert BEFORE the red Delete tab so it doesn't get hidden behind it
    const deleteTab = document.getElementById('admin-delete-tab');
    if (deleteTab) {
      tabBar.insertBefore(btn, deleteTab);
    } else {
      tabBar.appendChild(btn);
    }

    console.log('[AdminEarningsFix] Tab button injected');
  }

  /* ── 2. Wire click on the injected button ─────────────────────── */
  function wireTabClick() {
    // Use event delegation on .admin-tabs so it works even after
    // the button is re-injected on page revisits
    const tabBar = document.querySelector('.admin-tabs');
    if (!tabBar || tabBar.__bmgEarningsWired) return;
    tabBar.__bmgEarningsWired = true;

    tabBar.addEventListener('click', function (e) {
      const btn = e.target.closest(`#${TAB_ID}`);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      // Mark active (same logic as loadAdminDashboard)
      document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Load the content
      const container = document.getElementById(CONT_ID);
      if (container && typeof window.loadAdminOwnerEarnings === 'function') {
        container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
        window.loadAdminOwnerEarnings(container);
      } else {
        console.error('[AdminEarningsFix] loadAdminOwnerEarnings not found or container missing');
      }
    });

    console.log('[AdminEarningsFix] Tab click wired via delegation');
  }

  /* ── 3. Patch loadAdminDashboard to handle 'owner-earnings' ───── */
  function patchLoadAdminDashboard() {
    const orig = window.loadAdminDashboard;
    if (typeof orig !== 'function') return;
    if (orig.__bmgEarningsPatched) return;

    window.loadAdminDashboard = async function (tab) {
      if (tab === TAB_KEY) {
        // Handle active-tab styling ourselves since the orig will crash
        // if getElementById('admin-owner-earnings-tab') doesn't exist yet
        injectEarningsTab(); // ensure button exists first

        document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        const earningsBtn = document.getElementById(TAB_ID);
        if (earningsBtn) earningsBtn.classList.add('active');

        const container = document.getElementById(CONT_ID);
        if (container) {
          container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
          if (typeof window.loadAdminOwnerEarnings === 'function') {
            await window.loadAdminOwnerEarnings(container);
          } else {
            container.innerHTML = '<p style="text-align:center;padding:32px;color:#ef4444;">Earnings module not loaded. Please refresh.</p>';
          }
        }
        return;
      }
      // All other tabs → original function
      return orig.call(this, tab);
    };

    window.loadAdminDashboard.__bmgEarningsPatched = true;
    console.log('[AdminEarningsFix] loadAdminDashboard patched');
  }

  /* ── 4. Also register in the app's click-handler map ─────────── */
  function registerInClickMap() {
    // The app builds a click map at startup (ids → functions).
    // If it's already been built, directly add our handler.
    const appMap = window._bmgClickMap || window._clickHandlers;
    if (appMap && typeof appMap === 'object') {
      appMap[TAB_ID] = () => window.loadAdminDashboard(TAB_KEY);
    }

    // Also add a direct event listener as the most reliable fallback
    const btn = document.getElementById(TAB_ID);
    if (btn && !btn.__bmgDirectWired) {
      btn.__bmgDirectWired = true;
      btn.addEventListener('click', () => window.loadAdminDashboard(TAB_KEY));
    }
  }

  /* ── 5. Run on every admin page visit ────────────────────────── */
  function setup() {
    injectEarningsTab();
    wireTabClick();
    patchLoadAdminDashboard();
    registerInClickMap();
  }

  // Initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(setup, 200));
  } else {
    setTimeout(setup, 200);
  }

  // Re-run whenever admin dashboard page is shown (handles back-navigation)
  window.addEventListener('bmg:pageShown', (e) => {
    if (e.detail?.pageId === 'admin-dashboard-page') {
      setTimeout(setup, 100);
    }
  });

  // Also observe DOM changes in case admin page is rendered dynamically
  const observer = new MutationObserver(() => {
    if (document.querySelector('.admin-tabs') && !document.getElementById(TAB_ID)) {
      setup();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  console.log('✅ [bmg_admin_earnings_fix.js] Loaded');

})();
