# xi-io: ibal — Ibal Chat Embedding Plan v1

## Status: Planned (not yet implemented)

---

## Purpose

Ibal is the embedded chat-based assistant and conductor within xi-io: ibal. Ibal appears
in every screen to help the user understand current state, suggest next actions, route events,
queue approvals, and troubleshoot — without ever executing side effects silently.

---

## Embedding Strategy

### Global Floating Button

```text
Position: fixed, bottom-right of #app-shell
Z-index: above all panels and overlays
Element: <button id="ibal-chat-btn"> with Ibal avatar/icon
State: always visible (disabled state shows "coming soon" tooltip at L1/L2 runtime)
```

The button is always rendered. At early runtime levels (L1, L2) it displays a tooltip
indicating the Ibal chat is not yet available, preserving the correct information architecture
while avoiding premature implementation.

### Chat Drawer

```text
Element: <aside id="ibal-drawer"> sliding in from the right edge
Width: 380px (min), responsive
Trigger: clicking #ibal-chat-btn
Dismiss: clicking backdrop, Escape key, or close button
State: independent of page routing — persists across navigation
```

---

## Screen-Aware Context

The drawer receives context from the current route via the `ibal:navigate` custom event
already dispatched by `router.js`:

```js
window.dispatchEvent(new CustomEvent('ibal:navigate', {
  detail: { route: routeKey, label: route.label }
}));
```

Each page should register a **context adapter** that the drawer queries on open:

```js
// Example context adapter (registered per-page module)
window.ibalContext = {
  screen: 'connections',
  summary: 'Managing storage roots and ingress scanning.',
  suggestedPrompts: [
    'Explain this screen',
    'What storage roots are connected?',
    'Why is Cloud Sync Cache unavailable?',
    'Help me scan a folder',
    'Troubleshoot storage'
  ],
  safeActions: ['read', 'summarize', 'suggest'],
  forbiddenActions: ['commit', 'delete', 'write-to-disk']
};
```

---

## Required Chat Affordances (Per Screen)

| Prompt | Available On | Notes |
|---|---|---|
| "Explain this screen" | All screens | Default — always available |
| "Suggest next action" | All screens | Route-context aware |
| "Troubleshoot" | All screens | Links to diagnostics and health checks |
| "Connect apps" | Extensions, Connections | Opens relevant connector guide |
| "Review events" | Events, Diagnostics | Lists recent EventAtoms from ledger |
| "Run health check" | Diagnostics, Model Config | Triggers read-only health ping |
| "What models are available?" | Model Config | Reads Ollama /api/tags |
| "Why is [connector] offline?" | Connections | Reads connector health from cache |

---

## Safety Model for Ibal Chat

```text
Read screen state                 → allowed
Navigate the app                  → allowed (via ibalRouter.navigate)
Summarize current state           → allowed
Explain a screen or config        → allowed
Suggest next action               → allowed
Draft a text artifact             → allowed
Queue an action for approval      → allowed (creates ActionEnvelope candidate)
Approve artifacts                 → USER ACTION REQUIRED — never automated
Run safe read-only checks         → confirmation required
Run local bridge actions          → confirmation + ActionEnvelope required
Deploy or write to live system    → strong confirmation + Verifier Gate required
Change secrets or credentials     → blocked — separate secure flow only
Send private data to cloud model  → blocked unless explicit user opt-in per session
```

---

## ActionEnvelope Integration

When Ibal suggests an action that has side effects:

1. Ibal presents the action as a **candidate card** in the drawer.
2. The card shows: action type, target, payload preview, risk level, model used, data sent.
3. The user must explicitly click **Approve** or **Deny**.
4. Approved actions emit an `ActionEnvelope` to the appropriate handler.
5. Completion emits a receipt to `data/events.jsonl` via `recordLedgerEvent`.
6. Denied actions are logged as `ACTION_DENIED` events with no side effect.

---

## Product-Safe Context Adapter Contract

Each page module (`js/<page>.js`) should export an optional `ibalContextAdapter()` function:

```js
export function ibalContextAdapter() {
  return {
    screen: 'model-config',
    summary: 'Viewing local Ollama models and routing configuration.',
    dataAvailable: ['ollama-status', 'model-list', 'capability-tags'],
    suggestedPrompts: ['...'],
    safeActions: ['read'],
    forbiddenActions: ['pull-model-without-approval', 'delete-model']
  };
}
```

The Ibal drawer queries this adapter on route change and injects it as the system context
for the next Ibal turn.

---

## Runtime Level Gate

| Runtime Level | Ibal Availability |
|---|---|
| L1 | Button visible, tooltip: "Ibal coming in L2" |
| L2 | Button active, drawer opens, read-only context only |
| L3 | Action queue and approval flow enabled |
| L4 | Full agentic interview and artifact extraction enabled |

Current runtime level: **L2** (shown in sidebar footer and Extensions page metric).
