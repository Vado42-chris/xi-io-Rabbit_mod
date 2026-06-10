/**
 * xi-io: ibal — Management Console Hash Router
 * Loads management page HTML partials into #content-area.
 * Updates sidebar .active state and #breadcrumb-text on route change.
 */

const ROUTES = {
  'extensions':   { file: 'pages/extensions.html',   label: 'Extensions',  navId: 'nav-extensions'  },
  'connections':  { file: 'pages/connections.html',  label: 'Connections', navId: 'nav-connections'  },
  'model-config': { file: 'pages/model-config.html', label: 'Model Config',navId: 'nav-model-config' },
  'notifications':{ file: 'pages/notifications.html',label: 'Notifications',navId: 'nav-notifications'},
  'diagnostics':  { file: 'pages/diagnostics.html',  label: 'Diagnostics', navId: 'nav-diagnostics'  },
  'account':      { file: 'pages/account.html',      label: 'Account',     navId: 'nav-account'      },
};

const DEFAULT_ROUTE = 'extensions';

// Page module registry — JS modules are dynamically imported after HTML loads
const PAGE_MODULES = {
  'extensions':   'js/extensions.js',
  'connections':  'js/connections.js',
  'model-config': 'js/model-config.js',
  'diagnostics':  'js/diagnostics.js',
  'account':      'js/account.js',
};

let currentRoute = null;
let pageModuleCleanup = null; // Optional cleanup fn returned by page modules

async function navigate(routeKey) {
  const route = ROUTES[routeKey] || ROUTES[DEFAULT_ROUTE];
  if (currentRoute === routeKey) return;

  const contentArea = document.getElementById('content-area');
  const breadcrumb = document.getElementById('breadcrumb-text');

  // Cleanup previous page module if it registered one
  if (typeof pageModuleCleanup === 'function') {
    pageModuleCleanup();
    pageModuleCleanup = null;
  }
  window.activePageModule = null;

  // Show loading state
  contentArea.innerHTML = '<div class="page-loading"><div class="spinner-ring"></div><p>Loading…</p></div>';

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(route.navId);
  if (activeNav) activeNav.classList.add('active');

  // Update breadcrumb
  if (breadcrumb) breadcrumb.textContent = route.label;

  // Update document title
  document.title = `xi-io: ibal — ${route.label}`;

  try {
    const res = await fetch(route.file, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    contentArea.innerHTML = await res.text();
    if (typeof window.translateDOM === 'function') {
      window.translateDOM(contentArea);
    }
  } catch (err) {
    contentArea.innerHTML = `
      <div class="page-shell">
        <article class="panel">
          <p class="eyebrow">page error</p>
          <h3>${route.label}</h3>
          <p class="muted">Could not load page: <code>${err.message}</code></p>
          <p class="muted">Build status: this page may not exist yet. See Phase 1 task list.</p>
        </article>
      </div>`;
  }

  // Dynamically import page-specific JS module if registered
  if (PAGE_MODULES[routeKey]) {
    try {
      const mod = await import(`./${PAGE_MODULES[routeKey]}`);
      window.activePageModule = mod;
      if (typeof mod.init === 'function') {
        pageModuleCleanup = mod.init() || null;
      }
    } catch (err) {
      console.error(`[Router] Failed to load module for route ${routeKey}:`, err);
    }
  }

  currentRoute = routeKey;
  // Dispatch event for other scripts (e.g. app.js can react to page changes)
  window.dispatchEvent(new CustomEvent('ibal:navigate', { detail: { route: routeKey, label: route.label } }));
}

function getRouteFromHash() {
  const hash = window.location.hash.replace('#/', '').split('/')[0].trim();
  return ROUTES[hash] ? hash : DEFAULT_ROUTE;
}

function handleRouteChange() {
  navigate(getRouteFromHash());
}

// Wire up nav link clicks (prevent full reload, use hash)
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item[data-page]');
  if (!navItem) return;
  e.preventDefault();
  const page = navItem.dataset.page;
  window.location.hash = `/${page}`;
});

// Listen for hash changes
window.addEventListener('hashchange', handleRouteChange);

// Initial load
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lexicon && typeof window.lexicon.init === 'function') {
    await window.lexicon.init();
  }
  handleRouteChange();
});

// Expose for other scripts
window.ibalRouter = { navigate, getRouteFromHash };
