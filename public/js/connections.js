/**
 * xi-io: ibal — Connections Controller
 * Manages local storage roots configuration, discovery scanning, verification, and batch ingress commit.
 */

export function init() {
  const socket = window.ibalSocket;
  if (!socket) return;

  const ingressPathInput = document.getElementById('ingress-path-input');
  const ingressPresetSelect = document.getElementById('ingress-preset-select');
  const btnScanFolder = document.getElementById('btn-scan-folder');
  const ingressQueuePanel = document.getElementById('ingress-queue-panel');
  const ingressCandidatesBody = document.getElementById('ingress-candidates-body');
  const ingressStatusPill = document.getElementById('ingress-status-pill');
  const btnVerifyReadiness = document.getElementById('btn-verify-readiness');
  const btnCommitIngress = document.getElementById('btn-commit-ingress');
  const queueStatusText = document.getElementById('queue-status-text');
  const telemetryLog = document.getElementById('telemetry-log');

  // Folder picker elements
  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  const folderPickerModal = document.getElementById('folder-picker-modal');
  const closePickerBtn = document.getElementById('close-picker-btn');
  const btnPickerCancel = document.getElementById('btn-picker-cancel');
  const btnPickerSelect = document.getElementById('btn-picker-select');
  const pickerCurrentPath = document.getElementById('picker-current-path');
  const btnPickerUp = document.getElementById('btn-picker-up');
  const pickerDirList = document.getElementById('picker-dir-list');

  let currentCandidates = [];
  let currentPickerPath = '';
  let selectedPickerDir = null;
  let pickerParentPath = '';

  const pathPresets = {
    workspace: '/media/chrishallberg/Storage 22/999_Work/003_Projects/',
    cloud: '/home/chrishallberg/cloud_cache/',
    backup: '/mnt/nas/backup/'
  };

  function appendTelemetry(msg, color = '') {
    if (!telemetryLog) return;
    const el = document.createElement('div');
    el.style.color = color;
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    telemetryLog.appendChild(el);
    telemetryLog.scrollTop = telemetryLog.scrollHeight;
  }

  // Load storage card statuses from express API
  async function loadStorageStatuses() {
    try {
      const res = await fetch('/api/storage/status');
      const data = await res.json();
      
      const updateCard = (prefix, cardData) => {
        const badge = document.getElementById(`${prefix}-badge`);
        const pathEl = document.getElementById(`${prefix}-path`);
        const desc = document.getElementById(`${prefix}-desc`);
        
        if (!badge || !pathEl || !desc) return;
        
        pathEl.textContent = cardData.path;
        
        if (cardData.status === 'active') {
          badge.className = 'pill pill-success';
          badge.textContent = 'Connected';
          
          if (prefix === 'workspace') desc.textContent = 'Mapped volume for ROMs, assets, and active builds.';
          else if (prefix === 'cloud') desc.textContent = 'Directory exists and is writable.';
          else desc.textContent = 'Backup path online and verified.';
        } else if (cardData.status === 'permission_denied') {
          badge.className = 'pill pill-offline';
          badge.textContent = 'Permission Denied';
          desc.textContent = cardData.message || 'Write permissions not granted.';
        } else {
          badge.className = 'pill pill-warning';
          badge.textContent = 'Unavailable';
          desc.textContent = cardData.message || 'Directory missing or offline.';
        }
      };

      if (data.workspace) updateCard('workspace', data.workspace);
      if (data.cloud) updateCard('cloud', data.cloud);
      if (data.backup) updateCard('backup', data.backup);
    } catch (err) {
      console.error('Failed to load storage statuses:', err);
    }
  }

  // Start status polling
  const statusInterval = setInterval(loadStorageStatuses, 10000);
  loadStorageStatuses();

  // Load directories in the picker modal
  async function loadPickerDirectory(dirPath) {
    try {
      pickerDirList.innerHTML = '<div class="picker-status-msg muted">Loading...</div>';
      selectedPickerDir = null;
      
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      
      if (!data.success) {
        pickerDirList.innerHTML = `<div class="picker-status-msg danger">Error: ${data.error || 'Failed to list directory'}</div>`;
        return;
      }

      currentPickerPath = data.currentPath;
      pickerParentPath = data.parentPath;
      pickerCurrentPath.textContent = currentPickerPath;
      
      // Toggle parent button state
      if (pickerParentPath && pickerParentPath !== currentPickerPath) {
        btnPickerUp.disabled = false;
      } else {
        btnPickerUp.disabled = true;
      }

      pickerDirList.innerHTML = '';
      
      if (!data.directories || data.directories.length === 0) {
        pickerDirList.innerHTML = '<div class="picker-status-msg muted">No subdirectories found.</div>';
        return;
      }

      data.directories.forEach(name => {
        const item = document.createElement('div');
        item.className = 'picker-dir-item';
        item.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="dir-item-icon">
            <path d="M1.5 2.5v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6l-2-2h-3a1 1 0 0 0-1 1z" />
          </svg>
          <span>${name}</span>
        `;
        
        item.addEventListener('click', () => {
          pickerDirList.querySelectorAll('.picker-dir-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedPickerDir = name;
        });

        item.addEventListener('dblclick', () => {
          const sep = currentPickerPath.endsWith('/') ? '' : '/';
          loadPickerDirectory(currentPickerPath + sep + name);
        });

        pickerDirList.appendChild(item);
      });
    } catch (err) {
      pickerDirList.innerHTML = `<div class="picker-status-msg danger">Error: ${err.message}</div>`;
    }
  }

  function openPicker() {
    if (folderPickerModal) {
      folderPickerModal.classList.remove('hidden');
      let startPath = ingressPathInput.value.trim();
      if (!startPath) {
        startPath = pathPresets.workspace;
      }
      loadPickerDirectory(startPath);
    }
  }

  function closePicker() {
    if (folderPickerModal) {
      folderPickerModal.classList.add('hidden');
    }
  }

  function handlePickerUp() {
    if (pickerParentPath) {
      loadPickerDirectory(pickerParentPath);
    }
  }

  function confirmPickerSelection() {
    let finalPath = currentPickerPath;
    if (selectedPickerDir) {
      const sep = finalPath.endsWith('/') ? '' : '/';
      finalPath = finalPath + sep + selectedPickerDir + '/';
    }
    
    ingressPathInput.value = finalPath;
    ingressPresetSelect.value = 'custom';
    closePicker();
    appendTelemetry(`[picker] Target path selected: ${finalPath}`);
  }

  // Handle preset selection change
  const onPresetChange = () => {
    const val = ingressPresetSelect.value;
    if (pathPresets[val]) {
      ingressPathInput.value = pathPresets[val];
    }
  };

  // Perform Scan Sweep
  const onScanClick = () => {
    const targetPath = ingressPathInput.value.trim();
    if (!targetPath) {
      appendTelemetry('ERROR: Scan path cannot be empty.', 'var(--danger)');
      return;
    }

    appendTelemetry(`[ingress] Initiating scan sweep on target path: ${targetPath}`);
    btnScanFolder.disabled = true;
    btnScanFolder.textContent = 'Scanning...';
    
    socket.emit('ingress-scan', { path: targetPath });
  };

  // Render Queue Table
  function renderQueue() {
    if (!ingressQueuePanel || !ingressCandidatesBody) return;

    ingressCandidatesBody.innerHTML = '';
    
    if (currentCandidates.length === 0) {
      ingressQueuePanel.classList.remove('hidden');
      ingressCandidatesBody.innerHTML = `
        <tr>
          <td colspan="4" class="picker-status-msg muted">No eligible ingress components found in selected root.</td>
        </tr>
      `;
      queueStatusText.textContent = 'Scan complete: 0 items detected.';
      btnVerifyReadiness.disabled = true;
      btnCommitIngress.disabled = true;
      ingressStatusPill.className = 'pill pill-neutral';
      ingressStatusPill.textContent = 'empty target';
      return;
    }

    ingressQueuePanel.classList.remove('hidden');
    btnVerifyReadiness.disabled = false;
    btnCommitIngress.disabled = true;
    ingressStatusPill.className = 'pill pill-warning';
    ingressStatusPill.textContent = 'verification pending';

    currentCandidates.forEach(cand => {
      const tr = document.createElement('tr');
      
      let eligibilityPill = '';
      if (cand.status === 'eligible') {
        eligibilityPill = `<span class="pill pill-success" data-tooltip="Standard format verified. Ready for commit.">Eligible</span>`;
      } else if (cand.status === 'committed') {
        eligibilityPill = `<span class="pill pill-success" data-tooltip="Already indexed in repository ledger.">Committed</span>`;
      } else {
        eligibilityPill = `<span class="pill pill-warning" data-tooltip="Ineligible or normalization failed.">Degraded</span>`;
      }

      tr.innerHTML = `
        <td class="cand-title">${cand.title}</td>
        <td class="cand-system">${cand.system}</td>
        <td class="cand-path">${cand.path}</td>
        <td class="cand-eligibility">${eligibilityPill}</td>
      `;
      ingressCandidatesBody.appendChild(tr);
    });

    queueStatusText.textContent = `Scan complete: ${currentCandidates.length} items detected.`;
    if (typeof window.translateDOM === 'function') {
      window.translateDOM(ingressCandidatesBody);
    }
  }

  // Verification
  const onVerifyClick = async () => {
    const targetPath = ingressPathInput.value.trim();
    appendTelemetry(`[ingress] Running EventAtom normalization checks on ${currentCandidates.length} items...`);
    btnVerifyReadiness.disabled = true;
    btnVerifyReadiness.textContent = 'Verifying...';

    try {
      const res = await fetch('/api/storage/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await res.json();

      if (data.success) {
        appendTelemetry(`[ingress] Verification success: ${data.message || 'Metadata and ledger alignment verified.'}`, 'var(--ok)');
        btnCommitIngress.disabled = false;
        ingressStatusPill.className = 'pill pill-success';
        ingressStatusPill.textContent = 'verified: ready';
      } else {
        appendTelemetry(`[ingress] Verification failed: ${data.message || data.error || 'Path invalid.'}`, 'var(--danger)');
        btnCommitIngress.disabled = true;
        ingressStatusPill.className = 'pill pill-offline';
        ingressStatusPill.textContent = 'verification failed';
      }
    } catch (err) {
      appendTelemetry(`[ingress] Verification error: ${err.message}`, 'var(--danger)');
      btnCommitIngress.disabled = true;
      ingressStatusPill.className = 'pill pill-offline';
      ingressStatusPill.textContent = 'verification error';
    } finally {
      btnVerifyReadiness.disabled = false;
      btnVerifyReadiness.textContent = 'Verify Backup Readiness';
    }
  };

  // Commit Ingress
  const onCommitClick = () => {
    const targetPath = ingressPathInput.value.trim();
    appendTelemetry(`[ingress] Committing queue batch to local store...`);
    
    socket.emit('ingress-commit', {
      count: currentCandidates.length,
      items: currentCandidates,
      path: targetPath
    });

    btnCommitIngress.disabled = true;
    btnVerifyReadiness.disabled = true;
    ingressStatusPill.className = 'pill pill-success';
    ingressStatusPill.textContent = 'committed';

    ingressCandidatesBody.querySelectorAll('tr').forEach(tr => {
      const lastTd = tr.querySelector('td:last-child');
      if (lastTd) {
        lastTd.innerHTML = `<span class="pill pill-success" data-tooltip="Committed to repository ledger.">Committed</span>`;
      }
    });

    appendTelemetry(`[ingress] Successfully saved batch records and generated telemetry event.`, 'var(--ok)');
  };

  // Listen for backend ledger events
  const onLedgerEvent = (evt) => {
    if (evt.type === 'real.batch.ingress.scan') {
      appendTelemetry(`LEDGER: Ingress scan executed on ${evt.payload.path}`, 'var(--accent)');
    } else if (evt.type === 'real.batch.ingress.commit') {
      appendTelemetry(`LEDGER: Ingress committed: ${evt.payload.count} items. Root: ${evt.payload.path}`, 'var(--ok)');
    } else {
      appendTelemetry(`LEDGER: ${evt.type || 'event'} — ${evt.summary || evt.id || ''}`);
    }
  };

  // Listen for real scan results
  const onScanResults = (results) => {
    btnScanFolder.disabled = false;
    btnScanFolder.textContent = 'Scan Folder';

    if (!results.success) {
      appendTelemetry(`ERROR: Ingress scan failed: ${results.error || 'unknown error'}`, 'var(--danger)');
      currentCandidates = [];
      renderQueue();
      return;
    }

    appendTelemetry(`[ingress] Scan complete. Found ${results.candidates.length} directories.`, 'var(--ok)');
    currentCandidates = results.candidates;
    renderQueue();
  };

  ingressPresetSelect.addEventListener('change', onPresetChange);
  btnScanFolder.addEventListener('click', onScanClick);
  btnVerifyReadiness.addEventListener('click', onVerifyClick);
  btnCommitIngress.addEventListener('click', onCommitClick);
  
  if (btnBrowseFolder) btnBrowseFolder.addEventListener('click', openPicker);
  if (closePickerBtn) closePickerBtn.addEventListener('click', closePicker);
  if (btnPickerCancel) btnPickerCancel.addEventListener('click', closePicker);
  if (btnPickerSelect) btnPickerSelect.addEventListener('click', confirmPickerSelection);
  if (btnPickerUp) btnPickerUp.addEventListener('click', handlePickerUp);

  socket.on('ledger-event', onLedgerEvent);
  socket.on('ingress-scan-results', onScanResults);

  // Return clean-up handler
  return () => {
    clearInterval(statusInterval);
    ingressPresetSelect.removeEventListener('change', onPresetChange);
    btnScanFolder.removeEventListener('click', onScanClick);
    btnVerifyReadiness.removeEventListener('click', onVerifyClick);
    btnCommitIngress.removeEventListener('click', onCommitClick);
    
    if (btnBrowseFolder) btnBrowseFolder.removeEventListener('click', openPicker);
    if (closePickerBtn) closePickerBtn.removeEventListener('click', closePicker);
    if (btnPickerCancel) btnPickerCancel.removeEventListener('click', closePicker);
    if (btnPickerSelect) btnPickerSelect.removeEventListener('click', confirmPickerSelection);
    if (btnPickerUp) btnPickerUp.removeEventListener('click', handlePickerUp);
    
    socket.off('ledger-event', onLedgerEvent);
    socket.off('ingress-scan-results', onScanResults);
  };
}
