/**
 * Page module for Diagnostics
 */
export function init() {
  const socket = window.ibalSocket; // Share the socket initialized globally in app.js
  if (!socket) return;

  const log = document.getElementById('diag-log');
  const healStatus = document.getElementById('diag-heal-status');

  function appendLog(msg, color) {
    if (!log) return;
    const el = document.createElement('span');
    el.style.color = color || '';
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    // Clear "Waiting..." placeholder if present
    if (log.children.length > 1 && log.firstChild && log.firstChild.textContent.includes('Waiting')) {
      log.firstChild.remove();
    }
  }

  function handleSystemStats(d) {
    const cpu = document.getElementById('diag-cpu');
    const mem = document.getElementById('diag-mem');
    const ollamaEl = document.getElementById('diag-ollama');
    const uptime = document.getElementById('diag-uptime');
    if (cpu && d.cpu !== undefined) cpu.textContent = `${d.cpu.toFixed(1)}%`;
    if (mem && d.memory) mem.textContent = `${(d.memory.used/1073741824).toFixed(1)} GB`;
    if (ollamaEl) {
      ollamaEl.textContent = d.ollamaRunning ? 'Online' : 'Offline';
      ollamaEl.style.color = d.ollamaRunning ? 'var(--ok)' : 'var(--danger)';
    }
    if (uptime && d.uptime) uptime.textContent = `${Math.floor(d.uptime/3600)}h ${Math.floor((d.uptime%3600)/60)}m`;
  }

  function handleDiagnosticEvent(d) {
    appendLog(d.message || JSON.stringify(d), d.severity === 'fatal' ? 'var(--danger)' : '');
  }

  function handleSelfHealStatus(d) {
    if (healStatus) healStatus.textContent = d.message || '';
    appendLog(`SELF-HEAL: ${d.message}`, d.success ? 'var(--ok)' : 'var(--warn)');
  }

  function handleLedgerEvent(d) {
    appendLog(`LEDGER: ${d.type || 'event'} — ${d.summary || d.id || ''}`);
  }

  socket.on('system-stats', handleSystemStats);
  socket.on('diagnostic-event', handleDiagnosticEvent);
  socket.on('self-heal-status', handleSelfHealStatus);
  socket.on('ledger-event', handleLedgerEvent);

  const runHealBtn = document.getElementById('run-heal-diag-btn');
  const healOllamaBtn = document.getElementById('diag-heal-ollama-btn');
  const simulateBtn = document.getElementById('diag-simulate-ingress-btn');

  const onHealClick = () => socket.emit('self-heal-ollama');
  const onSimulateClick = () => {
    socket.emit('simulate-ingress');
    appendLog('Simulated ingress triggered.', 'var(--accent)');
  };

  if (runHealBtn) runHealBtn.addEventListener('click', onHealClick);
  if (healOllamaBtn) healOllamaBtn.addEventListener('click', onHealClick);
  if (simulateBtn) simulateBtn.addEventListener('click', onSimulateClick);

  return () => {
    socket.off('system-stats', handleSystemStats);
    socket.off('diagnostic-event', handleDiagnosticEvent);
    socket.off('self-heal-status', handleSelfHealStatus);
    socket.off('ledger-event', handleLedgerEvent);

    if (runHealBtn) runHealBtn.removeEventListener('click', onHealClick);
    if (healOllamaBtn) healOllamaBtn.removeEventListener('click', onHealClick);
    if (simulateBtn) simulateBtn.removeEventListener('click', onSimulateClick);
  };
}
