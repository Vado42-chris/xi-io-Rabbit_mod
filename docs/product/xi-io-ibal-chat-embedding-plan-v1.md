# xi-io: ibal — Chat Embedding Architecture Plan v1

**Document ID:** xi-io-ibal-chat-embedding-plan-v1  
**Track:** E & F — Ibal Chat Surface Architecture  
**Date:** 2026-06-09  
**Status:** 🟡 Architectural Draft — No implementation yet

---

## 1. Purpose

Define the persistent global Ibal chat surface: a slide-in drawer that provides context-aware AI assistance across all ibal pages without requiring a dedicated route. This is a product-local definition. No xi-io.net remote backend communication is implemented at this stage.

---

## 2. Design Principles

1. **Global, not routed.** The chat drawer is always accessible via keyboard shortcut or FAB — it overlays the current page without navigating away.
2. **Context-aware.** When the drawer opens, it receives a `PageContext` object describing the user's current location, selected items, and any diagnostic state.
3. **Inert until model is configured.** If no Ollama model is connected, the drawer renders a "No model connected" state card linking to Model Config.
4. **No data leaves the device.** All inference calls go to `localhost:3000/api/chat` — the local Ollama proxy. The xi-io.net hook surface (`framework-hooks.js`) is available for future forwarding but is not wired.

---

## 3. UI Architecture

### 3.1 Trigger Surface
| Trigger | Behaviour |
|---|---|
| Keyboard: `Ctrl+Shift+I` | Toggles drawer open/closed |
| Top-bar icon button `#ibal-chat-trigger` | Toggles drawer |
| Programmatic: `window.ibalChat.open(context)` | Opens with pre-loaded context |

### 3.2 Drawer Anatomy

```
+---------------------------------------------+
|  [page-ctx]  Ibal Assistant           [x]   |
|  Context: Diagnostics                        |
| ------------------------------------------- |
|  [Message thread area -- scrollable]         |
|                                              |
|  -----------------------------------------  |
|  [ Input field                      ] [->]  |
|  Model: llama3.2 via localhost               |
+---------------------------------------------+
```

- **Width:** `min(420px, 100vw)` — slide from right edge
- **Height:** Full viewport height minus top-bar
- **Z-index:** 200 (above preview pane, below modals at 300)
- **Animation:** `transform: translateX(100%)` to `translateX(0)` with `transition: 0.22s ease-out`

### 3.3 Context Adapter

The `PageContext` object is constructed by the context adapter and passed to the chat session on open:

```js
/**
 * @typedef {object} PageContext
 * @property {string} route           - Current hash route (e.g. 'diagnostics')
 * @property {string} pageTitle       - Human label (e.g. 'Diagnostics')
 * @property {object|null} selection  - Any selected item (extension, connection, log entry)
 * @property {object|null} diagnostic - Latest diagnostic state (Ollama status, errors)
 */
```

Each page module is responsible for exporting a `getContext()` function. The router calls this on every navigate and stores the result in `window.ibalPageContext`.

### 3.4 System Prompt Injection

On session open, the context adapter constructs a system prompt prefix:

```
You are Ibal, the xi-io ecosystem operator assistant.
Current operator page: {pageTitle}
{selection ? "Selected item: " + JSON.stringify(selection) : ""}
{diagnostic ? "Current diagnostic state: " + JSON.stringify(diagnostic) : ""}

Answer only using information visible in the current xi-io: ibal console.
Do not fabricate extension names, model names, or connection URLs.
```

---

## 4. Data Flow

```
User types message
       |
       v
ibal-chat.js  -> POST /api/chat  { model, messages[], systemPrompt }
                        |
                        v
                server.js  ->  Ollama /api/chat (streaming)
                        |
                        v
             Server-sent stream back to drawer
                        |
                        v
             Rendered as markdown in thread area
```

### 4.1 API Contract (local only)
```
POST /api/chat
Body: {
  model: string,          // active model from model-config
  messages: [{ role, content }],
  systemPrompt: string    // injected by context adapter
}
Response: text/event-stream (SSE)
```

---

## 5. File Plan

| File | Role |
|---|---|
| `public/js/ibal-chat.js` | Drawer mount/unmount, input, streaming render |
| `public/js/chat-context-adapter.js` | `getPageContext()`, `buildSystemPrompt()` |
| `public/components/ibal-chat-drawer.html` | Drawer HTML fragment (injected by app.js) |
| `server.js` | Add `POST /api/chat` route proxying to Ollama |

---

## 6. Notification & Event Model

| Event Name | Direction | Payload | Purpose |
|---|---|---|---|
| `ibal:chat-open` | to drawer | `{ context }` | Open drawer with context |
| `ibal:chat-close` | from drawer | — | Drawer closed by user |
| `ibal:chat-response` | from server | `{ delta, done }` | SSE stream token |
| `ibal:page-context` | to adapter | `{ route, selection }` | Page navigation broadcast |

---

## 7. Accessibility Requirements

- Drawer must be `role="dialog"` with `aria-label="Ibal Assistant"` and `aria-modal="true"`
- Focus must be trapped inside when open (focus-trap pattern)
- Keyboard: `Escape` closes the drawer and returns focus to the trigger element
- Chat messages must be in a `role="log"` `aria-live="polite"` container
- Input field must have `aria-label="Message Ibal"`

---

## 8. Deferred (Not In This Track)

- Multi-turn memory / session persistence across pages
- xi-io.net relay of chat sessions for cloud model access
- Voice input / TTS output
- Tool-calling / function-calling (Ollama tool-use API)
- Per-extension AI agent routing

---

## 9. Implementation Readiness Gate

Before implementation begins, the following must be in place:

| Gate | Status |
|---|---|
| Ollama model confirmed reachable on `/api/chat` | DONE — diagnostics flow confirms |
| `--ui-scale` system live | DONE — Track B complete |
| `framework-hooks.js` stubs in place | DONE — Track D complete |
| `POST /api/chat` route added to server.js | NOT YET |
| Drawer HTML fragment created | NOT YET |
| `ibal-chat.js` and `chat-context-adapter.js` authored | NOT YET |
