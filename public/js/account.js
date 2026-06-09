/**
 * xi-io: ibal — Account Page / Rosetta Stone Lexicon Controller
 */

export function init() {
  const form = document.getElementById('lexicon-settings-form');
  const profileSelect = document.getElementById('lexicon-profile');
  const customContainer = document.getElementById('custom-lexicon-mappings');
  const previewContainer = document.getElementById('lexicon-chain-preview');
  const statusMsg = document.getElementById('lexicon-status-message');

  // Input mapping elements
  const mapInputs = {
    workspace: document.getElementById('map-workspace'),
    workspaces: document.getElementById('map-workspaces'),
    extension: document.getElementById('map-extension'),
    extensions: document.getElementById('map-extensions'),
    connection: document.getElementById('map-connection'),
    connections: document.getElementById('map-connections'),
    diagnostic: document.getElementById('map-diagnostic'),
    diagnostics: document.getElementById('map-diagnostics'),
    task: document.getElementById('map-task'),
    tasks: document.getElementById('map-tasks'),
    group: document.getElementById('map-group'),
    subgroup: document.getElementById('map-subgroup')
  };

  if (!form || !profileSelect) {
    console.warn('[account.js] Required lexicon settings panel elements not found.');
    return;
  }

  // Load preferences data from translation engine cache
  const lexiconData = window.lexicon ? window.lexicon.getData() : {};

  // Setup initial values
  if (lexiconData.activeProfile) {
    profileSelect.value = lexiconData.activeProfile;
  }

  // Fill in custom mapping inputs if they exist in cache
  const customMapping = lexiconData.customMapping || {};
  for (const [key, inputEl] of Object.entries(mapInputs)) {
    if (inputEl) {
      inputEl.value = customMapping[key] || '';
    }
  }

  // Helper to show/hide custom mappings section
  function updateCustomSectionVisibility() {
    const isCustom = profileSelect.value === 'custom';
    if (isCustom) {
      customContainer.classList.remove('hidden');
    } else {
      customContainer.classList.add('hidden');
    }
  }

  // Get mappings for current profile or custom mapping inputs
  function getTemporaryMappings() {
    const profile = profileSelect.value;
    if (profile === 'custom') {
      const mapping = {};
      for (const [key, inputEl] of Object.entries(mapInputs)) {
        if (inputEl) {
          mapping[key] = inputEl.value.trim() || key;
        }
      }
      return mapping;
    } else {
      return (lexiconData.profiles && lexiconData.profiles[profile]) || {};
    }
  }

  // Render the visual chain hierarchy preview
  function renderChainPreview() {
    if (!previewContainer) return;
    const mappings = getTemporaryMappings();

    // Order: Group -> Subgroup -> Workspace -> Extension -> Connection -> Diagnostic -> Task
    const chain = [
      { label: 'group', value: mappings.group || 'group' },
      { label: 'subgroup', value: mappings.subgroup || 'subgroup' },
      { label: 'workspace', value: mappings.workspace || 'workspace' },
      { label: 'extension', value: mappings.extension || 'extension' },
      { label: 'connection', value: mappings.connection || 'connection' },
      { label: 'diagnostic', value: mappings.diagnostic || 'diagnostic' },
      { label: 'task', value: mappings.task || 'task' }
    ];

    previewContainer.innerHTML = '';
    chain.forEach((node, idx) => {
      // Node element
      const nodeEl = document.createElement('div');
      nodeEl.className = 'preview-node';
      nodeEl.innerHTML = `
        <span class="node-type">${node.label}</span>
        <span class="node-value">${node.value}</span>
      `;
      previewContainer.appendChild(nodeEl);

      // Arrow separator if not last
      if (idx < chain.length - 1) {
        const arrowEl = document.createElement('span');
        arrowEl.className = 'preview-arrow';
        arrowEl.textContent = ' ➜ ';
        previewContainer.appendChild(arrowEl);
      }
    });
  }

  // Show status notification
  function showStatus(text, type) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.className = `status-msg ${type}`;
    statusMsg.style.opacity = '1';
    setTimeout(() => {
      statusMsg.style.opacity = '0';
    }, 4000);
  }

  // Bind change and input events
  const onProfileChange = () => {
    updateCustomSectionVisibility();
    renderChainPreview();
  };

  const onCustomInput = () => {
    renderChainPreview();
  };

  profileSelect.addEventListener('change', onProfileChange);
  for (const inputEl of Object.values(mapInputs)) {
    if (inputEl) {
      inputEl.addEventListener('input', onCustomInput);
    }
  }

  // Form submission
  const onSubmit = async (e) => {
    e.preventDefault();
    const activeProfile = profileSelect.value;
    const customMappingPayload = {};
    for (const [key, inputEl] of Object.entries(mapInputs)) {
      if (inputEl) {
        customMappingPayload[key] = inputEl.value.trim() || key;
      }
    }

    try {
      const response = await fetch('/api/lexicon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeProfile,
          customMapping: customMappingPayload
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        showStatus('Lexicon settings saved and broadcasted successfully.', 'success');
      } else {
        showStatus(resData.error || 'Failed to save lexicon preferences.', 'error');
      }
    } catch (err) {
      showStatus(`Network error: ${err.message}`, 'error');
    }
  };

  form.addEventListener('submit', onSubmit);

  // Handle UI Density & Comfort Scale
  const densitySelector = document.getElementById('density-selector');
  if (densitySelector) {
    const currentScale = localStorage.getItem('ibal-ui-scale') || '1.25';
    densitySelector.value = currentScale;
  }

  const onDensityChange = (e) => {
    const selectedScale = e.target.value;
    localStorage.setItem('ibal-ui-scale', selectedScale);
    document.documentElement.style.setProperty('--ui-scale', selectedScale);
  };

  if (densitySelector) {
    densitySelector.addEventListener('change', onDensityChange);
  }

  // Initial render sweep
  updateCustomSectionVisibility();
  renderChainPreview();

  // Listen for external real-time updates to synchronize forms
  const onLexiconUpdatedEvent = (e) => {
    const updatedData = e.detail;
    if (updatedData.activeProfile) {
      profileSelect.value = updatedData.activeProfile;
    }
    const updatedCustom = updatedData.customMapping || {};
    for (const [key, inputEl] of Object.entries(mapInputs)) {
      if (inputEl) {
        inputEl.value = updatedCustom[key] || '';
      }
    }
    updateCustomSectionVisibility();
    renderChainPreview();
  };
  window.addEventListener('lexicon:updated', onLexiconUpdatedEvent);

  // Cleanup handler
  return () => {
    profileSelect.removeEventListener('change', onProfileChange);
    for (const inputEl of Object.values(mapInputs)) {
      if (inputEl) {
        inputEl.removeEventListener('input', onCustomInput);
      }
    }
    form.removeEventListener('submit', onSubmit);
    window.removeEventListener('lexicon:updated', onLexiconUpdatedEvent);
    if (densitySelector) {
      densitySelector.removeEventListener('change', onDensityChange);
    }
  };
}
