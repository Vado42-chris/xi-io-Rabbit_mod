/**
 * xi-io: ibal Device App — Hash Router
 * Loads device screen HTML partials into #device-content.
 * Manages #device-nav active state.
 */

const DEVICE_ROUTES = {
  'dashboard':  { file: '/device/pages/dashboard.html',  label: 'Home',      navId: 'dnav-dashboard'  },
  'inbox':      { file: '/device/pages/inbox.html',      label: 'Inbox',     navId: 'dnav-inbox'      },
  'tasks':      { file: '/device/pages/tasks.html',      label: 'Tasks',     navId: 'dnav-tasks'      },
  'assistant':  { file: '/device/pages/assistant.html',  label: 'ibal AI',   navId: 'dnav-assistant'  },
  'vision':     { file: '/device/pages/vision.html',     label: 'Vision',    navId: 'dnav-vision'     },
};

const DEFAULT_SCREEN = 'dashboard';
let currentScreen = null;

async function deviceNavigate(screenKey) {
  const route = DEVICE_ROUTES[screenKey] || DEVICE_ROUTES[DEFAULT_SCREEN];
  if (currentScreen === screenKey) return;

  const content = document.getElementById('device-content');
  if (!content) return;

  content.innerHTML = '<div class="device-loading"><div class="spinner-ring"></div></div>';

  document.querySelectorAll('.device-nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(route.navId);
  if (activeNav) activeNav.classList.add('active');
  document.title = `xi-io: ibal — ${route.label}`;

  try {
    const res = await fetch(route.file, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status}`);
    content.innerHTML = await res.text();
  } catch {
    content.innerHTML = `<div class="device-screen"><p class="muted">Screen not built yet: <code>${screenKey}</code></p></div>`;
  }

  currentScreen = screenKey;
  window.dispatchEvent(new CustomEvent('ibal:device-navigate', { detail: { screen: screenKey } }));
}

function getScreenFromHash() {
  const hash = window.location.hash.replace('#/', '').split('/')[0].trim();
  return DEVICE_ROUTES[hash] ? hash : DEFAULT_SCREEN;
}

document.addEventListener('click', (e) => {
  const item = e.target.closest('.device-nav-item[data-screen]');
  if (!item) return;
  e.preventDefault();
  window.location.hash = `/${item.dataset.screen}`;
});

window.addEventListener('hashchange', () => deviceNavigate(getScreenFromHash()));
document.addEventListener('DOMContentLoaded', () => deviceNavigate(getScreenFromHash()));

window.deviceRouter = { navigate: deviceNavigate };
