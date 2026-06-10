/**
 * chat-context-adapter.js
 * Enables page-specific context awareness for Ibal responses.
 */

/**
 * Collects current page, selected item, and diagnostics context.
 * @returns {object} PageContext
 */
export function getPageContext() {
  const hash = window.location.hash || '#extensions';
  const route = hash.replace('#', '');
  
  // Try to find the human-friendly page title
  const breadcrumb = document.getElementById('breadcrumb-text');
  const pageTitle = breadcrumb ? breadcrumb.textContent : route;

  let selection = null;
  let diagnostic = null;

  // 1. Check if the active page module exports a getContext function
  if (window.activePageModule && typeof window.activePageModule.getContext === 'function') {
    try {
      const customCtx = window.activePageModule.getContext();
      if (customCtx) {
        if (customCtx.selection) selection = customCtx.selection;
        if (customCtx.diagnostic) diagnostic = customCtx.diagnostic;
      }
    } catch (err) {
      console.warn('[Context Adapter] Failed to get context from page module:', err);
    }
  }

  // 2. If no module-level context, collect standard fallback details from the DOM
  if (!selection) {
    // Check for active list items or details views in DOM
    const activeRow = document.querySelector('tr.active, .item-card.active, .selected');
    if (activeRow) {
      selection = {
        text: activeRow.innerText.replace(/\s+/g, ' ').trim(),
        id: activeRow.id || activeRow.dataset.id || null
      };
    }
  }

  // If we're on the diagnostics page, collect standard diagnostics metadata if not provided
  if (route === 'diagnostics' && !diagnostic) {
    const healthPill = document.getElementById('health-pill');
    const connLabel = document.getElementById('conn-label');
    diagnostic = {
      health: healthPill ? healthPill.textContent : 'UNKNOWN',
      connection: connLabel ? connLabel.textContent : 'OFFLINE',
    };
  }

  return {
    route,
    pageTitle,
    selection,
    diagnostic
  };
}

/**
 * Builds the system prompt based on the provided PageContext.
 * @param {object} context 
 * @returns {string} System prompt
 */
export function buildSystemPrompt(context) {
  const { pageTitle, selection, diagnostic } = context;
  
  let prompt = `You are Ibal, the xi-io ecosystem operator assistant.\n`;
  prompt += `Current operator page: ${pageTitle}\n`;
  
  if (selection) {
    prompt += `Selected item: ${JSON.stringify(selection)}\n`;
  }
  
  if (diagnostic) {
    prompt += `Current diagnostic state: ${JSON.stringify(diagnostic)}\n`;
  }

  prompt += `\nAnswer only using information visible in the current xi-io: ibal console.\n`;
  prompt += `Do not fabricate extension names, model names, or connection URLs.\n`;

  return prompt;
}
