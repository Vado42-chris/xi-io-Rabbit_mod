/**
 * xi-io: ibal — Rosetta Stone Lexicon Translation Engine
 * Exposes window.t(key, defaultVal) and window.translateDOM(container)
 */

(function() {
  let lexiconData = {
    activeProfile: "developer",
    customMapping: {},
    profiles: {}
  };

  let resolvedMapping = {};

  // Case preservation helper
  function preserveCase(original, target) {
    if (!target) return original;
    if (original === original.toUpperCase()) return target.toUpperCase();
    if (original.length > 0 && original[0] === original[0].toUpperCase()) {
      return target.charAt(0).toUpperCase() + target.slice(1);
    }
    return target.toLowerCase();
  }

  // Resolve current active profile mapping
  function resolveMapping() {
    const profile = lexiconData.activeProfile || 'developer';
    if (profile === 'custom') {
      resolvedMapping = lexiconData.customMapping || {};
    } else {
      resolvedMapping = lexiconData.profiles[profile] || lexiconData.profiles['developer'] || {};
    }
  }

  // Translate a specific key
  function t(key, defaultVal) {
    if (!key) return '';
    const cleanKey = key.trim().toLowerCase();
    const mapped = resolvedMapping[cleanKey];
    
    if (mapped) {
      return preserveCase(key, mapped);
    }
    return defaultVal !== undefined ? defaultVal : key;
  }

  // Translate all elements with data-t or data-t-placeholder under a container
  function translateDOM(container) {
    const parent = container || document;
    
    // Translate textContent using data-t
    parent.querySelectorAll('[data-t]').forEach(el => {
      const key = el.getAttribute('data-t');
      if (key) {
        // Cache original text so we can re-translate if profile changes
        if (!el.hasAttribute('data-t-orig')) {
          el.setAttribute('data-t-orig', el.textContent || '');
        }
        const origText = el.getAttribute('data-t-orig');
        el.textContent = t(key, origText);
      }
    });

    // Translate placeholder using data-t-placeholder
    parent.querySelectorAll('[data-t-placeholder]').forEach(el => {
      const key = el.getAttribute('data-t-placeholder');
      if (key) {
        if (!el.hasAttribute('data-t-placeholder-orig')) {
          el.setAttribute('data-t-placeholder-orig', el.getAttribute('placeholder') || '');
        }
        const origPlaceholder = el.getAttribute('data-t-placeholder-orig');
        el.setAttribute('placeholder', t(key, origPlaceholder));
      }
    });
  }

  // Initialize and load lexicon from API
  async function init() {
    try {
      const response = await fetch('/api/lexicon');
      if (response.ok) {
        lexiconData = await response.json();
        resolveMapping();
      }
    } catch (err) {
      console.warn('[lexicon] Failed to load lexicon preferences, using fallback defaults:', err.message);
      // Fallback local structures if server is offline
      lexiconData = {
        activeProfile: "developer",
        customMapping: {},
        profiles: {
          developer: {
            workspace: "workspace", workspaces: "workspaces",
            extension: "extension", extensions: "extensions",
            connection: "connection", connections: "connections",
            diagnostic: "diagnostic", diagnostics: "diagnostics",
            task: "task", tasks: "tasks",
            group: "group", subgroup: "subgroup"
          }
        }
      };
      resolveMapping();
    }
    
    // Initial global DOM sweep
    translateDOM(document);
  }

  // Listen for socket events to update dynamically
  if (window.socket) {
    window.socket.on('lexicon-updated', (data) => {
      console.log('[lexicon] Received real-time lexicon updates.');
      lexiconData = data;
      resolveMapping();
      translateDOM(document);
      
      // Dispatch custom event to notify page controllers
      window.dispatchEvent(new CustomEvent('lexicon:updated', { detail: data }));
    });
  }

  // Expose to window scope
  window.lexicon = {
    init,
    t,
    translateDOM,
    getData: () => lexiconData,
    getResolved: () => resolvedMapping
  };
  window.t = t;
  window.translateDOM = translateDOM;

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
