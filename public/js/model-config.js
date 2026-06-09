/**
 * Page module for Model Config
 */
export function init() {
  const socket = window.ibalSocket; // Share the socket initialized globally in app.js
  const ollamaStatus = document.getElementById('model-ollama-status');
  const modelCount = document.getElementById('model-count');
  const modelActive = document.getElementById('model-active');
  const modelsGrid = document.getElementById('models-list-grid');
  const refreshBtn = document.getElementById('refresh-models-btn');

  function handleModelsList(data) {
    const models = data?.models || [];
    if (ollamaStatus) {
      ollamaStatus.textContent = models.length > 0 ? 'Online' : 'Offline';
      ollamaStatus.style.color = models.length > 0 ? 'var(--ok)' : 'var(--danger)';
    }
    if (modelCount) modelCount.textContent = models.length;
    if (modelActive && models[0]) modelActive.textContent = models[0].name || '—';
    if (modelsGrid) {
      modelsGrid.innerHTML = models.length
        ? models.map(m => `
          <article class="project-card">
            <header class="project-card-header">
              <div>
                <p class="project-purpose">${m.size || ''}</p>
                <h4 class="project-name">${m.name}</h4>
              </div>
              <span class="pill pill-ok">available</span>
            </header>
            <p class="project-summary">${m.details?.family || 'local model'}</p>
          </article>`).join('')
        : '<p class="muted">No models loaded. Is Ollama running?</p>';
    }
  }

  if (socket) {
    socket.on('models-list', handleModelsList);
    socket.emit('get-models');
  }

  const handleRefreshClick = () => {
    if (socket) socket.emit('get-models');
  };
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshClick);

  return () => {
    if (socket) socket.off('models-list', handleModelsList);
    if (refreshBtn) refreshBtn.removeEventListener('click', handleRefreshClick);
  };
}
