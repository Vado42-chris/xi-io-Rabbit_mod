# XIIO-IBAL-UX-A11Y-FRAMEWORK-HOOKS-001
## UI Information Architecture Audit & Accessibility Report

**Project:** xi-io: ibal  
**Track:** C — Information Architecture Audit  
**Date:** 2026-06-09  
**Status:** ✅ Delivered

---

## 1. Accessibility Scale System

### Implementation Summary
A CSS variable-based comfort-scale system has been applied globally via `public/style.css`.

| Token | Default | Compact | Large |
|---|---|---|---|
| `--ui-scale` | `1.25` | `1.0` | `1.5` |
| Root `font-size` | `20px` (16 × 1.25) | `16px` | `24px` |
| `--topbar-h` | `65px` | `52px` | `78px` |
| `--sidebar-w` | `275px` | `220px` | `330px` |

**Persistence:** Stored in `localStorage` under `ibal-ui-scale`. Restored at boot in `app.js` via an IIFE before first paint.

**User control:** Exposed in `Settings → Account → UI Density & Scale` via `#density-selector`.

### Touch-Target Compliance
All `button`, `input`, `select`, `.btn`, `.icon-btn`, and `.nav-item` elements now enforce `min-height: max(44px, calc(34px * var(--ui-scale)))`, meeting WCAG 2.5.5 (AAA) and Apple/Google minimum 44px target guidelines.

### Focus Ring
A universal `:focus-visible` rule applies a 2px `--accent` outline on all interactive elements, ensuring keyboard navigability is visible at all scale levels.

---

## 2. Information Architecture Audit

### 2.1 Navigation Structure (Current)

```
xi-io: ibal
├── Extensions       (primary landing, extension registry)
├── Connections      (Ollama, REST endpoints, integrations)
├── Model Config     (provider + model selection)
├── Diagnostics      (log viewer, self-heal controls)
└── Settings / Account
    ├── Runtime Profile
    ├── Data Paths
    ├── Rosetta Lexicon (taxonomy)
    └── UI Density & Scale  [NEW — Track B]
```

### 2.2 Gap Analysis by Section

#### Extensions Page
| Feature | Status | Gap |
|---|---|---|
| Extension list with status pills | ✅ Present | — |
| Install / uninstall flow | 🔴 Missing | No install UI defined |
| Extension detail drawer | 🔴 Missing | See §3 below |
| Group/Workspace filter | 🟡 Partial | Lexicon integrated, filter not wired |

**Recommendation:** Extension detail should open a slide-in drawer (not a full page) to preserve list context. Priority: next sprint.

#### Connections Page
| Feature | Status | Gap |
|---|---|---|
| Ollama status card | ✅ Present | Navigates to Diagnostics ✅ |
| REST endpoint registry | ✅ Present | — |
| Integration graph | 🔴 Missing | No visual graph of cross-app wiring |
| Credential vault | 🔴 Missing | Tokens stored inline — no secure vault |

**Recommendation:** Integration graph is a future visualization surface (see §4). Credential vault is a security prerequisite before any xi-io.net handshake goes live.

#### Model Config Page
| Feature | Status | Gap |
|---|---|---|
| Ollama model selector | ✅ Present | — |
| Model role assignment | 🔴 Missing | No "primary / fallback / agent" role concept |
| Provider priority stack | 🔴 Missing | Only one provider at a time |
| Benchmark trigger | 🔴 Missing | See xi-io benchmark integration plan |

**Recommendation:** Model role manager is a medium-term addition. A `roles` field on the model config object is the minimum viable data contract.

#### Diagnostics Page
| Feature | Status | Gap |
|---|---|---|
| Log viewer with level filter | ✅ Present | — |
| Self-heal button w/ progress | ✅ Present | — |
| Storage path verification | ✅ Present | Ledger events emitted ✅ |
| Ibal chat / Troubleshoot AI | 🔴 Missing | See §5 — Ibal Chat Architecture |
| Export log bundle | 🔴 Missing | No download-as-file action |

---

## 3. Apps Orchestration Page (Planned Surface)

**Purpose:** A unified view of all xi-io connected apps, their manifest state, and health.

**Minimum Viable UI:**
- Grid of app tiles (icon, name, runtime level, status pill)
- Filter bar: by level (L1/L2/L3), by health (healthy / degraded / offline)
- Click → App detail drawer with: manifest hash, last sync time, active connections
- "Push manifest" action button (wired to `framework-hooks.pushManifestSnapshot`)

**Data contract:** Served by `GET /api/apps` (not yet implemented on server.js).

**Routing:** `#/apps` — add nav item to sidebar between Extensions and Connections.

---

## 4. Integration Graph (Planned Surface)

**Purpose:** Visual force-directed graph showing live wiring between apps, models, and connections.

**Approach:** SVG or Canvas render (no external charting library required). Nodes = apps/models/endpoints. Edges = active connections.

**Data contract:** `GET /api/graph` — returns `{ nodes: [], edges: [] }` (not yet implemented).

**Trigger:** Can be added as a tab within the Connections page to avoid adding a top-level nav item prematurely.

---

## 5. Troubleshooting Workflows (Current Gaps)

| Workflow | Status | Notes |
|---|---|---|
| Ollama offline → self-heal | ✅ | Fully implemented |
| Log export (download bundle) | 🔴 | Add `/api/logs/export` endpoint + button |
| Storage path repair | 🟡 Partial | Ledger event emitted; no auto-repair |
| Model fallback on failure | 🔴 | Requires model role manager (§2.2) |
| Connection retry with back-off | 🟡 Partial | Socket.io reconnect, no UI feedback |

---

## 6. Recommendations Priority Stack

| Priority | Item | Complexity |
|---|---|---|
| P1 | Extension detail drawer | Small |
| P1 | Log export bundle button | Small |
| P2 | Model role manager (primary/fallback) | Medium |
| P2 | Apps orchestration page | Medium |
| P3 | Integration graph visualization | Large |
| P3 | Credential vault | Large |
| P4 | xi-io.net framework hook activation | Blocked on backend |
