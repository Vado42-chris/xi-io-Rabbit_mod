/**
 * Page module for Extensions
 */
export function init() {
  const grid = document.getElementById('extensions-card-grid');
  const countReg = document.getElementById('ext-count-registered');
  const countConn = document.getElementById('ext-count-connected');
  const countOff = document.getElementById('ext-count-offline');
  const refreshBtn = document.getElementById('refresh-extensions-btn');

  function statusPill(status) {
    if (status === 'connected') return 'pill pill-ok';
    if (status === 'offline')   return 'pill pill-danger';
    return 'pill pill-neutral';
  }

  function renderCards(extensions) {
    if (!grid) return;
    const connected = extensions.filter(e => e.status === 'connected').length;
    const offline   = extensions.filter(e => e.status === 'offline').length;
    if (countReg)  countReg.textContent  = extensions.length;
    if (countConn) countConn.textContent = connected;
    if (countOff)  countOff.textContent  = offline;

    grid.innerHTML = extensions.map(ext => `
      <article class="project-card">
        <header class="project-card-header">
          <div>
            <p class="project-purpose">${ext.purpose || ext.maturityState || 'app'}</p>
            <h4 class="project-name">${ext.displayName || ext.id}</h4>
          </div>
          <span class="${statusPill(ext.status)}">${ext.status || 'unknown'}</span>
        </header>
        <p class="project-summary">${ext.description || ''}</p>
        <div class="pill-row">
          ${ext.currentRoute ? `<span class="pill pill-neutral">${ext.currentRoute}</span>` : ''}
          ${ext.maturityState ? `<span class="pill pill-neutral">${ext.maturityState}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${ext.currentRoute && ext.status === 'connected' ? `<button class="button button-primary" type="button" onclick="window.ibalPreview?.setUrl('${ext.currentRoute}')">Preview</button>` : ''}
          ${ext.currentRoute ? `<a class="button button-secondary" href="${ext.currentRoute}" target="_blank" rel="noopener">Open ↗</a>` : ''}
        </div>
      </article>
    `).join('');
  }

  function handleExtensionsUpdated(e) {
    renderCards(e.detail || []);
  }

  // Listen for fresh data from app.js poller
  window.addEventListener('ibal:extensions-updated', handleExtensionsUpdated);

  // Fetch directly on load
  fetch('/api/extensions').then(r => r.ok ? r.json() : []).then(renderCards).catch(() => {});

  const handleRefreshClick = () => fetch('/api/extensions').then(r => r.json()).then(renderCards);
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshClick);

  // Return cleanup function to remove event listeners on navigation
  return () => {
    window.removeEventListener('ibal:extensions-updated', handleExtensionsUpdated);
    if (refreshBtn) refreshBtn.removeEventListener('click', handleRefreshClick);
  };
}
