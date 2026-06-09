/**
 * Page module for Diagnostics
 */
export function init() {
  const socket = window.ibalSocket; // Share the socket initialized globally in app.js
  if (!socket) return;

  const log = document.getElementById('diag-log');
  const healStatus = document.getElementById('diag-heal-status');
  const logFilter = document.getElementById('log-level-filter');
  const clearBtn = document.getElementById('btn-clear-diag-log');
  
  const runHealBtn = document.getElementById('run-heal-diag-btn');
  const healOllamaBtn = document.getElementById('diag-heal-ollama-btn');
  const simulateBtn = document.getElementById('diag-simulate-ingress-btn');

  let allLogs = [];

  const LEVEL_HIERARCHY = {
    'all': -1,
    'info': 1,
    'warn': 2,
    'error': 3,
    'fatal': 4
  };

  const SEVERITY_VALUE = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'warning': 2,
    'error': 3,
    'fatal': 4
  };

  function getSeverityClass(sev) {
    const s = (sev || 'info').toLowerCase();
    if (s === 'fatal') return 'diagnostics-log-line danger font-bold';
    if (s === 'error') return 'diagnostics-log-line danger';
    if (s === 'warn' || s === 'warning') return 'diagnostics-log-line warn';
    if (s === 'success' || s === 'ok') return 'diagnostics-log-line success';
    return 'diagnostics-log-line info';
  }

  function getSeverityValue(sev) {
    const s = (sev || 'info').toLowerCase();
    if (s === 'success' || s === 'ok') return 1; // Treat success/ok as info for filtering threshold
    return SEVERITY_VALUE[s] !== undefined ? SEVERITY_VALUE[s] : 1;
  }

  function renderLogs() {
    if (!log) return;
    log.innerHTML = '';
    
    const filterLevel = logFilter ? logFilter.value : 'all';
    const minVal = LEVEL_HIERARCHY[filterLevel] !== undefined ? LEVEL_HIERARCHY[filterLevel] : -1;

    const filtered = allLogs.filter(item => {
      const val = getSeverityValue(item.severity);
      return val >= minVal;
    });

    if (filtered.length === 0) {
      const el = document.createElement('span');
      el.className = 'diagnostics-log-line info muted';
      el.textContent = 'No events matching filter level.';
      log.appendChild(el);
      return;
    }

    filtered.forEach(item => {
      const el = document.createElement('span');
      el.className = getSeverityClass(item.severity);
      
      const timeStr = item.timestamp instanceof Date ? item.timestamp.toLocaleTimeString() : new Date(item.timestamp).toLocaleTimeString();
      el.textContent = `[${timeStr}] ${item.message}`;
      log.appendChild(el);
    });

    log.scrollTop = log.scrollHeight;
  }

  function addLog(msg, severity = 'info', timestamp = new Date()) {
    allLogs.push({ timestamp: new Date(timestamp), severity, message: msg });
    if (allLogs.length > 500) {
      allLogs.shift();
    }
    renderLogs();
  }

  function setHealingLoading(isLoading) {
    if (runHealBtn) {
      runHealBtn.disabled = isLoading;
      runHealBtn.textContent = isLoading ? 'Healing...' : 'Run Self-Healing';
    }
    if (healOllamaBtn) {
      healOllamaBtn.disabled = isLoading;
      healOllamaBtn.textContent = isLoading ? 'Healing...' : 'Restart Ollama';
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/diagnostics');
      const data = await res.json();
      
      allLogs = [];

      if (data.recentDiagnostics) {
        data.recentDiagnostics.forEach(d => {
          const msg = d.message || d.summary || JSON.stringify(d);
          const timestamp = d.timestamp || d.detected_at || new Date();
          const severity = d.severity || 'error';
          allLogs.push({ timestamp: new Date(timestamp), severity, message: msg });
        });
      }
      if (data.recentEvents) {
        data.recentEvents.forEach(e => {
          const msg = `LEDGER: ${e.type || 'event'} — ${e.summary || e.id || ''}`;
          const timestamp = e.timestamp || new Date();
          allLogs.push({ timestamp: new Date(timestamp), severity: 'info', message: msg });
        });
      }

      // Sort chronological
      allLogs.sort((a, b) => a.timestamp - b.timestamp);
      renderLogs();
    } catch (err) {
      addLog(`Failed to pre-load diagnostics history: ${err.message}`, 'error');
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
      ollamaEl.className = 'metric-value ' + (d.ollamaRunning ? 'text-ok' : 'text-danger');
    }
    if (uptime && d.uptime) uptime.textContent = `${Math.floor(d.uptime/3600)}h ${Math.floor((d.uptime%3600)/60)}m`;
  }

  function handleDiagnosticEvent(d) {
    addLog(d.message || JSON.stringify(d), d.severity || 'error', d.timestamp || d.detected_at);
  }

  function handleSelfHealStatus(d) {
    if (healStatus) healStatus.textContent = d.message || '';
    
    let severity = 'info';
    if (d.status === 'failed') severity = 'error';
    else if (d.status === 'warn') severity = 'warn';
    else if (d.success === false) severity = 'error';
    else if (d.success === true) severity = 'success';
    
    addLog(`SELF-HEAL: ${d.message}`, severity);

    if (d.status === 'success' || d.status === 'failed') {
      setHealingLoading(false);
    }
  }

  function handleLedgerEvent(d) {
    addLog(`LEDGER: ${d.type || 'event'} — ${d.summary || d.id || ''}`, 'info', d.timestamp);
  }

  // Socket registers
  socket.on('system-stats', handleSystemStats);
  socket.on('diagnostic-event', handleDiagnosticEvent);
  socket.on('self-heal-status', handleSelfHealStatus);
  socket.on('ledger-event', handleLedgerEvent);

  const onHealClick = () => {
    setHealingLoading(true);
    socket.emit('self-heal-ollama');
  };

  const onSimulateClick = () => {
    socket.emit('simulate-ingress');
    addLog('Simulated ingress triggered.', 'info');
  };

  const onClearClick = () => {
    allLogs = [];
    renderLogs();
  };

  if (runHealBtn) runHealBtn.addEventListener('click', onHealClick);
  if (healOllamaBtn) healOllamaBtn.addEventListener('click', onHealClick);
  if (simulateBtn) simulateBtn.addEventListener('click', onSimulateClick);
  if (clearBtn) clearBtn.addEventListener('click', onClearClick);
  if (logFilter) logFilter.addEventListener('change', renderLogs);

  // Load history immediately
  loadHistory();

  return () => {
    socket.off('system-stats', handleSystemStats);
    socket.off('diagnostic-event', handleDiagnosticEvent);
    socket.off('self-heal-status', handleSelfHealStatus);
    socket.off('ledger-event', handleLedgerEvent);

    if (runHealBtn) runHealBtn.removeEventListener('click', onHealClick);
    if (healOllamaBtn) healOllamaBtn.removeEventListener('click', onHealClick);
    if (simulateBtn) simulateBtn.removeEventListener('click', onSimulateClick);
    if (clearBtn) clearBtn.removeEventListener('click', onClearClick);
    if (logFilter) logFilter.removeEventListener('change', renderLogs);
  };
}
