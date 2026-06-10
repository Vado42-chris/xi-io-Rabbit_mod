/**
 * ibal-chat.js
 * Lifecycle, SSE stream consumption, and focus management for Ibal Chat Drawer.
 */

import { getPageContext, buildSystemPrompt } from './chat-context-adapter.js';

let drawer = null;
let triggerBtn = null;
let closeBtn = null;
let chatForm = null;
let chatInput = null;
let messagesContainer = null;
let modelIndicator = null;
let contextText = null;

let previouslyFocused = null;
let activeModel = 'llama3';
let chatHistory = [];
let isGenerating = false;

// Format simple markdown syntax into safe HTML
function formatMarkdown(text) {
  // Escape HTML to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced Code blocks
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Paragraphs and lists
  const blocks = html.split(/\n\n+/);
  const formattedBlocks = blocks.map(block => {
    if (block.startsWith('<pre>')) return block;
    
    // Check if it's a list
    if (block.trim().startsWith('- ') || block.trim().startsWith('* ')) {
      const items = block.split(/\n[-*]\s+/).filter(Boolean);
      if (items[0] && (items[0].startsWith('- ') || items[0].startsWith('* '))) {
        items[0] = items[0].substring(2);
      }
      return `<ul>${items.map(item => `<li>${item.trim()}</li>`).join('')}</ul>`;
    }

    return `<p>${block.trim().replace(/\n/g, '<br>')}</p>`;
  });

  return formattedBlocks.join('');
}

// Update the active context banner based on current page state
function updateContextBanner() {
  if (!contextText) return;
  const context = getPageContext();
  contextText.textContent = `Context: ${context.pageTitle}${context.selection ? ` (${context.selection.id || 'Selected Item'})` : ''}`;
}

// Toggle drawer visibility
function toggleDrawer() {
  if (!drawer) return;
  if (drawer.classList.contains('hidden')) {
    openDrawer();
  } else {
    closeDrawer();
  }
}

// Open drawer and trap focus
function openDrawer() {
  if (!drawer) return;
  previouslyFocused = document.activeElement;
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  updateContextBanner();

  // Query fresh list of models
  if (window.ibalSocket) {
    window.ibalSocket.emit('get-models');
  }

  // Focus input
  setTimeout(() => {
    if (chatInput) chatInput.focus();
  }, 100);

  // Dispatch custom open event
  window.dispatchEvent(new CustomEvent('ibal:chat-open', { detail: { context: getPageContext() } }));
}

// Close drawer and restore focus
function closeDrawer() {
  if (!drawer) return;
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
  
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }

  // Dispatch custom close event
  window.dispatchEvent(new CustomEvent('ibal:chat-close'));
}

// Append a message to the UI
function appendMessage(role, text) {
  if (!messagesContainer) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role}`;
  
  const metaSpan = document.createElement('span');
  metaSpan.className = 'meta';
  metaSpan.textContent = role === 'user' ? 'You' : role === 'system' ? 'System' : 'Ibal';
  msgDiv.appendChild(metaSpan);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'chat-message-content';
  contentDiv.innerHTML = formatMarkdown(text);
  msgDiv.appendChild(contentDiv);

  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return contentDiv;
}

// Handle message submission and stream consumption
async function handleFormSubmit(e) {
  e.preventDefault();
  if (isGenerating || !chatInput) return;

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto'; // Reset height
  
  // Disable input & send button during generation
  isGenerating = true;
  chatInput.disabled = true;
  const submitBtn = chatForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  // Append user message
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  // Append thinking indicator for assistant
  const assistantContentDiv = appendMessage('assistant', 'Thinking...');

  // Build page context & system prompt
  const context = getPageContext();
  const systemPrompt = buildSystemPrompt(context);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: activeModel,
        messages: chatHistory,
        systemPrompt: systemPrompt
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    let hasReceivedTokens = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Hold partial line in buffer

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.error) {
              assistantText = `Error: ${data.error}`;
              assistantContentDiv.innerHTML = formatMarkdown(assistantText);
              break;
            }
            if (data.delta) {
              if (!hasReceivedTokens) {
                assistantText = ''; // Clear "Thinking..."
                hasReceivedTokens = true;
              }
              assistantText += data.delta;
              assistantContentDiv.innerHTML = formatMarkdown(assistantText);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          } catch (err) {
            console.error('[Ibal Chat] Error parsing stream line:', line, err);
          }
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.substring(6));
        if (data.delta) {
          if (!hasReceivedTokens) {
            assistantText = '';
            hasReceivedTokens = true;
          }
          assistantText += data.delta;
          assistantContentDiv.innerHTML = formatMarkdown(assistantText);
        }
      } catch (err) {}
    }

    // Save assistant response to chat history
    chatHistory.push({ role: 'assistant', content: assistantText });

  } catch (err) {
    console.error('[Ibal Chat] Inference request failed:', err);
    assistantContentDiv.innerHTML = `<span class="text-danger">Failed to connect to local assistant: ${err.message}</span>`;
  } finally {
    isGenerating = false;
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Focus trap logic
function handleFocusTrap(e) {
  if (!drawer || drawer.classList.contains('hidden')) return;

  const focusable = Array.from(drawer.querySelectorAll('button, textarea'));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.key === 'Tab') {
    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }
}

// Setup Event Listeners and Socket bindings
function initChat() {
  drawer = document.getElementById('ibal-chat-drawer');
  triggerBtn = document.getElementById('ibal-chat-trigger');
  closeBtn = document.getElementById('ibal-chat-close-btn');
  chatForm = document.getElementById('ibal-chat-form');
  chatInput = document.getElementById('ibal-chat-input');
  messagesContainer = document.getElementById('ibal-chat-messages');
  modelIndicator = document.getElementById('ibal-chat-model-indicator');
  contextText = document.getElementById('ibal-chat-context-text');

  if (!drawer) return;

  // Toggle trigger button listener
  if (triggerBtn) {
    triggerBtn.addEventListener('click', toggleDrawer);
  }

  // Close button listener
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  // Submit form listener
  if (chatForm) {
    chatForm.addEventListener('submit', handleFormSubmit);
  }

  // Auto-grow textarea height
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    });
  }

  // Global keydown listeners for shortcuts and focus trap
  window.addEventListener('keydown', (e) => {
    // Ctrl+Shift+I to toggle
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      toggleDrawer();
    }
    // Escape to close
    if (e.key === 'Escape' && !drawer.classList.contains('hidden')) {
      e.preventDefault();
      closeDrawer();
    }
  });

  drawer.addEventListener('keydown', handleFocusTrap);

  // Router context changes
  window.addEventListener('ibal:navigate', () => {
    if (!drawer.classList.contains('hidden')) {
      updateContextBanner();
    }
  });

  // Socket bindings for active model config
  if (window.ibalSocket) {
    window.ibalSocket.on('models-list', (models) => {
      const list = models || [];
      if (list.length > 0) {
        activeModel = list[0].name;
      } else {
        activeModel = 'none (offline)';
      }
      if (modelIndicator) {
        modelIndicator.textContent = activeModel;
      }
    });
    // Request models list initially
    window.ibalSocket.emit('get-models');
  }
}

// Auto initialize when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChat);
} else {
  initChat();
}

// Export programmatic interface
window.ibalChat = {
  open: (ctx) => {
    openDrawer();
    if (ctx && contextText) {
      contextText.textContent = `Context: ${ctx.pageTitle || 'Custom'}`;
    }
  },
  close: closeDrawer,
  toggle: toggleDrawer
};
