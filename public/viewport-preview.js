/**
 * xi-io: ibal — Viewport Preview Controller
 * Scales the #preview-iframe to match the selected device resolution
 * within the available #device-frame-wrapper space.
 *
 * Resolution select value format: "WIDTHxHEIGHT" e.g. "768x1024"
 */

(function () {
  const iframe = document.getElementById('preview-iframe');
  const wrapper = document.getElementById('device-frame-wrapper');
  const resolutionSelect = document.getElementById('device-resolution-select');
  const urlSelect = document.getElementById('preview-url-select');
  const badge = document.getElementById('resolution-badge');

  if (!iframe || !wrapper || !resolutionSelect) return;

  function parseResolution(value) {
    const [w, h] = (value || '768x1024').split('x').map(Number);
    return { w: w || 768, h: h || 1024 };
  }

  function applyScale() {
    const { w, h } = parseResolution(resolutionSelect.value);
    const paneW = wrapper.clientWidth  - 16; // 8px padding each side
    const paneH = wrapper.clientHeight - 16;

    // Scale to fit — never upscale beyond 1:1
    const scaleX = paneW / w;
    const scaleY = paneH / h;
    const scale  = Math.min(scaleX, scaleY, 1);

    iframe.style.width  = `${w}px`;
    iframe.style.height = `${h}px`;
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top center';
    iframe.style.display = 'block';

    if (badge) badge.textContent = `${w} × ${h}  ·  ${Math.round(scale * 100)}%`;
  }

  function applyUrl() {
    if (!urlSelect) return;
    const url = urlSelect.value;
    if (url && iframe.src !== new URL(url, window.location.href).href) {
      iframe.src = url;
    }
  }

  // Toggle preview pane
  const toggleBtn = document.getElementById('preview-toggle-btn');
  const shell = document.getElementById('app-shell');
  const toggleIcon = document.getElementById('preview-toggle-icon');

  if (toggleBtn && shell) {
    toggleBtn.addEventListener('click', () => {
      const isTablet = window.matchMedia('(max-width: 1099px)').matches;
      if (isTablet) {
        shell.classList.toggle('preview-visible');
      } else {
        shell.classList.toggle('preview-hidden');
      }
      const isHidden = shell.classList.contains('preview-hidden') || !shell.classList.contains('preview-visible');
      if (toggleIcon) toggleIcon.textContent = isHidden ? '▶' : '◀';
      // Re-calculate scale after layout settles
      setTimeout(applyScale, 350);
    });
  }

  // Sidebar toggle
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  if (sidebarToggleBtn && shell) {
    sidebarToggleBtn.addEventListener('click', () => {
      shell.classList.toggle('sidebar-collapsed');
      setTimeout(applyScale, 200);
    });
  }

  // Resolution change
  resolutionSelect.addEventListener('change', applyScale);

  // URL change
  if (urlSelect) urlSelect.addEventListener('change', applyUrl);

  // Resize observer — re-scale when pane dimensions change
  const observer = new ResizeObserver(() => applyScale());
  observer.observe(wrapper);

  // Initial render
  applyScale();
  applyUrl();

  // Expose for external use (e.g. extensions page can set preview URL)
  window.ibalPreview = {
    setResolution(value) { resolutionSelect.value = value; applyScale(); },
    setUrl(url) {
      if (urlSelect) {
        // Add option if not present
        const exists = [...urlSelect.options].some(o => o.value === url);
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = url; opt.textContent = url;
          urlSelect.appendChild(opt);
        }
        urlSelect.value = url;
      }
      iframe.src = url;
    },
    refresh() { iframe.contentWindow?.location.reload(); },
  };
})();
