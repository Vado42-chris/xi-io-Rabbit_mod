/**
 * xi-io: ibal — Device App socket handlers
 * Manages: tasks, inbox, proposals, AI chat, vision, system stats.
 * The management console (public/app.js) handles diagnostics and extensions.
 */

const socket = io({ transports: ['websocket'], reconnectionAttempts: 10 });

/* ── CONNECTION STATUS ───────────────────────────────────────────────── */
const deviceConnDot = document.getElementById('device-conn-dot');
socket.on('connect',    () => { if (deviceConnDot) deviceConnDot.className = 'conn-dot online'; });
socket.on('disconnect', () => { if (deviceConnDot) deviceConnDot.className = 'conn-dot offline'; });
socket.on('connect_error', () => { if (deviceConnDot) deviceConnDot.className = 'conn-dot offline'; });

/* ── SHARED STATE (in-memory, refreshed by events) ───────────────────── */
window.ibalState = {
  tasks: [],
  inbox: [],
  proposals: [],
  models: [],
};

/* ── TASKS ───────────────────────────────────────────────────────────── */
socket.on('tasks', (data) => {
  window.ibalState.tasks = data || [];
  const badge = document.getElementById('tasks-badge');
  const pending = window.ibalState.tasks.filter(t => t.status !== 'done').length;
  if (badge) { badge.textContent = pending; badge.classList.toggle('hidden', pending === 0); }
  window.dispatchEvent(new CustomEvent('ibal:tasks-updated', { detail: window.ibalState.tasks }));
});

function requestTasks() { socket.emit('get-tasks'); }

/* ── INBOX / PROPOSALS ───────────────────────────────────────────────── */
socket.on('inbox-state', (data) => {
  window.ibalState.inbox     = data?.inbox     || [];
  window.ibalState.proposals = data?.proposals || [];

  const badge = document.getElementById('inbox-badge');
  const pending = window.ibalState.proposals.filter(p => p.status === 'pending').length;
  if (badge) { badge.textContent = pending; badge.classList.toggle('hidden', pending === 0); }

  window.dispatchEvent(new CustomEvent('ibal:inbox-updated', { detail: data }));
});

function requestInbox() { socket.emit('get-inbox'); }

function approveProposal(proposalId) {
  socket.emit('approve-proposal', { id: proposalId });
}
function rejectProposal(proposalId) {
  socket.emit('reject-proposal', { id: proposalId });
}

/* ── AI CHAT ─────────────────────────────────────────────────────────── */
let chatBuffer = '';

socket.on('chat-token', (data) => {
  chatBuffer += data?.token || '';
  window.dispatchEvent(new CustomEvent('ibal:chat-token', { detail: { buffer: chatBuffer, token: data?.token } }));
});

socket.on('chat-response', (data) => {
  chatBuffer = '';
  window.dispatchEvent(new CustomEvent('ibal:chat-complete', { detail: data }));
});

function sendChatMessage(text) {
  chatBuffer = '';
  socket.emit('chat-message', { message: text });
}

/* ── MODELS ──────────────────────────────────────────────────────────── */
socket.on('models-list', (data) => {
  window.ibalState.models = data?.models || [];
  window.dispatchEvent(new CustomEvent('ibal:models-updated', { detail: window.ibalState.models }));
});

function requestModels() { socket.emit('get-models'); }

/* ── LEDGER EVENTS ───────────────────────────────────────────────────── */
socket.on('ledger-event', (data) => {
  window.dispatchEvent(new CustomEvent('ibal:ledger-event', { detail: data }));
});

/* ── PAGE-LEVEL EVENT DELEGATION ─────────────────────────────────────── */
// Approve/reject buttons rendered inside device screen HTML
document.addEventListener('click', (e) => {
  const approveBtn = e.target.closest('[data-action="approve-proposal"]');
  if (approveBtn) { approveProposal(approveBtn.dataset.id); return; }

  const rejectBtn = e.target.closest('[data-action="reject-proposal"]');
  if (rejectBtn) { rejectProposal(rejectBtn.dataset.id); return; }

  const taskCheck = e.target.closest('[data-action="toggle-task"]');
  if (taskCheck) { socket.emit('toggle-task', { id: taskCheck.dataset.id }); return; }
});

/* ── INIT ON SCREEN CHANGE ───────────────────────────────────────────── */
window.addEventListener('ibal:device-navigate', (e) => {
  const { screen } = e.detail;
  if (screen === 'inbox' || screen === 'dashboard') requestInbox();
  if (screen === 'tasks' || screen === 'dashboard') requestTasks();
  if (screen === 'assistant') requestModels();
});

/* ── AI BUTTON SHORTCUT ──────────────────────────────────────────────── */
const deviceAiBtn = document.getElementById('device-ai-btn');
if (deviceAiBtn) {
  deviceAiBtn.addEventListener('click', () => {
    window.location.hash = '/assistant';
  });
}

/* ── INITIAL DATA LOAD ───────────────────────────────────────────────── */
socket.on('connect', () => {
  requestTasks();
  requestInbox();
});

// Expose public API for device screen inline scripts
window.ibalDevice = { sendChatMessage, approveProposal, rejectProposal, requestTasks, requestInbox, socket };
