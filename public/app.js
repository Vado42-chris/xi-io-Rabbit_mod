/**
 * xi-io: ibal — Management Console app.js
 * Handles: Socket.io connection status, extension health polling,
 *          Ollama diagnostic modal + self-healing trigger.
 *
 * Device app handlers (tasks, inbox, chat, vision) live in /device/app.js.
 */

/* ── SOCKET.IO CONNECTION ─────────────────────────────────────────────────────── */
const socket = io({ transports: ['websocket'], reconnectionAttempts: 10 });
window.ibalSocket = socket;

/* ── UI COMFORT SCALE RESTORE ────────────────────────────────────────────────── */
(function applyStoredScale() {
  const stored = localStorage.getItem('ibal-ui-scale');
  if (stored) {
    document.documentElement.style.setProperty('--ui-scale', stored);
  }
})();

const connDot   = document.getElementById('conn-dot');
const connLabel = document.getElementById('conn-label');
const healthPill = document.getElementById('health-indicator') || document.getElementById('health-pill');

function setConnectionState(state) {
  if (!connDot) return;
  connDot.className = `conn-dot ${state}`;
  if (connLabel) connLabel.textContent = state.toUpperCase();
}

socket.on('connect',    () => setConnectionState('online'));
socket.on('disconnect', () => setConnectionState('offline'));
socket.on('connect_error', () => setConnectionState('offline'));

socket.on('system-health', (data) => {
  if (!healthPill) return;
  const state = data?.status || 'unknown';
  healthPill.textContent = state.toUpperCase();
  healthPill.className = `health-pill ${state}`;
});

/* ── EXTENSION HEALTH POLLING ─────────────────────────────────────────────────── */
const ecoDot   = document.getElementById('eco-dot');
const ecoCount = document.getElementById('eco-count');

async function pollExtensions() {
  try {
    const res = await fetch('/api/extensions');
    if (!res.ok) return;
    const extensions = await res.json();
    const connected = extensions.filter(e => e.status === 'connected').length;

    if (ecoDot) ecoDot.className = `eco-dot ${connected > 0 ? 'has-connections' : ''}`;
    if (ecoCount) ecoCount.textContent = `${connected} connected`;

    // Broadcast for use by extensions page module
    window.dispatchEvent(new CustomEvent('ibal:extensions-updated', { detail: extensions }));
  } catch {
    // Backend not reachable — silent fail, connection dot handles this
  }
}

// Poll on load and every 30s
pollExtensions();
setInterval(pollExtensions, 30_000);

/* ── OLLAMA DIAGNOSTIC MODAL ─────────────────────────────────────────────────── */
const modal        = document.getElementById('troubleshooting-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const selfHealBtn  = document.getElementById('run-self-heal-btn');
const healProgress = document.getElementById('heal-progress');
const healMsg      = document.getElementById('heal-progress-msg');
const diagStatus   = document.getElementById('diag-status');
const diagError    = document.getElementById('diag-error');
const diagTime     = document.getElementById('diag-time');

function showDiagModal(data = {}) {
  if (!modal) return;
  if (diagStatus) { diagStatus.textContent = data.status || 'Offline'; diagStatus.className = data.status === 'online' ? 'status-online' : 'status-offline'; }
  if (diagError)  diagError.textContent = data.error || 'Unknown error';
  if (diagTime)   diagTime.textContent  = data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : 'Just now';
  modal.classList.remove('hidden');
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => modal?.classList.add('hidden'));
modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

if (selfHealBtn) {
  selfHealBtn.addEventListener('click', () => {
    selfHealBtn.disabled = true;
    healProgress?.classList.remove('hidden');
    if (healMsg) healMsg.textContent = 'Attempting recovery…';
    socket.emit('self-heal-ollama');
  });
}

socket.on('self-heal-status', (data) => {
  if (healMsg) healMsg.textContent = data.message || 'Recovery attempt complete.';
  const isFinished = data.status === 'success' || data.status === 'failed' || data.success !== undefined;
  const isSuccess = data.status === 'success' || data.success === true;

  if (isFinished) {
    if (selfHealBtn) selfHealBtn.disabled = false;
    if (isSuccess) {
      setTimeout(() => {
        modal?.classList.add('hidden');
        healProgress?.classList.add('hidden');
      }, 1500);
    }
  } else {
    if (selfHealBtn) selfHealBtn.disabled = true;
  }
});

socket.on('diagnostic-event', (data) => {
  if (data?.severity === 'fatal' || data?.code === 'OLLAMA_OFFLINE') showDiagModal(data);
});

// Allow the ollama status card (if present) to navigate to the diagnostics page
document.addEventListener('click', (e) => {
  if (e.target.closest('#ollama-status-card')) {
    window.location.hash = '/diagnostics';
  }
});

/* ── NAVIGATION REACTIONS ─────────────────────────────────────────────────────── */
// When the extensions page loads, trigger a fresh poll
window.addEventListener('ibal:navigate', (e) => {
  if (e.detail?.route === 'extensions') pollExtensions();
});
