# xi-io: ibal — UI Surface Map v1

## Audit Date: 2026-06-09  
## Audit Scope: Read-only inspection of `public/`, `server.js`, `data/`

---

## Current Navigation Structure

```text
Top Bar
├── Hamburger toggle (sidebar collapse)
├── Brand: "xi-io: ibal" [correct — ✅]
├── Breadcrumb: current section name
├── Connection dot + label (ONLINE / OFFLINE)
├── Health pill (HEALTHY / DEGRADED / UNKNOWN)
├── Eco-status badge (N connected ecosystem apps)
└── Device Preview toggle button

Sidebar (Left)
├── Extensions          → pages/extensions.html   + js/extensions.js
├── Connections         → pages/connections.html  + js/connections.js
├── Model Config        → pages/model-config.html + js/model-config.js
├── Notifications       → pages/notifications.html  (no JS module yet)
├── ─────────────────
├── Diagnostics         → pages/diagnostics.html  + js/diagnostics.js
└── Account             → pages/account.html      + js/account.js

Footer
└── Runtime maturity level badge (L2)

Preview Pane (Right)
└── iframe preview of /device/ at selected resolution
    Resolutions: iPhone, Android, R1/Square, Tablet, Desktop, 10-Foot/TV
```

---

## Per-Page Surface Audit

### Extensions (`#/extensions`)
- **Label in nav:** "Extensions" (lexicon-translated to "Apps" in docket/custom profile)
- **What it surfaces:** Registered xi-io ecosystem apps with health status cards
  (Registered count, Connected count, Offline count, Runtime Level)
- **Missing:** Marketplace state, enable/disable toggles, per-app settings, feature toggles,
  required connector/model links
- **Product gap label:** Apps Manager — partial

### Connections (`#/connections`)
- **Label in nav:** "Connections" (lexicon-translated to "Integrations" in docket profile)
- **What it surfaces:**
  - Ecosystem Local Storage Roots (Primary Workspace, Cloud Sync Cache, Backup Destination)
  - Storage Ingress & Local Scanner (folder picker, preset paths, scan)
  - Batch Ingress Review Queue (candidate list, readiness verification, commit)
  - Connections Telemetry Activity (live socket-fed log)
- **Missing:** Gmail, Google Calendar, GitHub, Ollama provider connector cards;
  credential health, scopes, revoke controls
- **Product gap label:** ConnectorRegistry — storage implemented, API connectors absent

### Model Config (`#/model-config`)
- **Label in nav:** "Model Config"
- **What it surfaces:**
  - Ollama status card (click-to-open-diagnostics)
  - Loaded model count and active model
  - Strategy indicator (rule-then-llm)
  - Available Models grid (capability-classified, loaded from Ollama)
  - Model Router description linking to `docs/MODEL_ROUTER.md`
- **Missing:** Cloud model support, privacy class labels, per-product model requirements,
  models-forbidden-from-authority controls, fallback rule editor
- **Product gap label:** ModelRegistry — local Ollama implemented, cloud/privacy/governance absent

### Notifications (`#/notifications`)
- **Label in nav:** "Notifications"
- **What it surfaces:**
  - Alert Channels section with three static state cards:
    - In-App Proposals (enabled)
    - Email Digest (planned)
    - System Alerts — opens troubleshooting modal (enabled)
- **Missing:** Per-notification-type rules, real notification feed/inbox, badge count driver,
  snooze/dismiss controls
- **Product gap label:** NotificationRules — placeholder only, no live data

### Diagnostics (`#/diagnostics`)
- **Label in nav:** "Diagnostics" (lexicon-translated to "Healthchecks" in docket profile)
- **What it surfaces:** Loaded from `js/diagnostics.js`
- **Confirmed in js/diagnostics.js:** Extension health pings, FailureAtom injection,
  event ledger viewer
- **Missing:** Full TroubleshootingConsole surface — per-connector, per-model, per-device
  checks, safe mode toggle, diagnostic bundle export
- **Product gap label:** TroubleshootingConsole — partial

### Account (`#/account`)
- **Label in nav:** "Account"
- **What it surfaces:** Rosetta Stone Lexicon settings panel
  - Profile selector (developer / docket / legal / custom)
  - Live node hierarchy preview chain
  - Custom terminology mapping form
  - Save / reset controls
- **Missing:** User identity, auth settings, product privacy settings, paired device trust,
  data export controls
- **Product gap label:** Account/Settings — lexicon implemented, identity/auth absent

### Troubleshooting Modal (global overlay)
- **Trigger:** Health pill click, fatal diagnostic event
- **What it surfaces:**
  - Service diagnostic details (service name, status, error, last checked)
  - "Run Self-Healing Diagnostics" button
  - Recovery progress indicator
- **Product gap label:** TroubleshootingConsole modal — minimal implementation present

---

## Missing UI Surfaces (Priority Order)

| Priority | Surface | Notes |
|---|---|---|
| 1 | **Ibal Chat Button + Drawer** | No trace in codebase. Highest gap. |
| 2 | **Events page** (`#/events`) | EventAtom stream exists in `data/events.jsonl`; no UI |
| 3 | **Apps page** (full, not Extensions stub) | marketplace state, enable/disable, per-app settings |
| 4 | **Device Pairing page** (`#/devices`) | DeviceRegistry absent entirely |
| 5 | **API Connector cards** in Connections | Gmail, GitHub, Google Calendar absent |
| 6 | **Notification live feed** | `#notif-badge` wired but not data-driven |
| 7 | **Model privacy/governance controls** | capability ≠ permission — not enforced in UI |
| 8 | **Full TroubleshootingConsole page** | Diagnostic modal is minimal |

---

## Where the App Still Says "Rabbit / R1"

| Location | String | Action Required |
|---|---|---|
| `README.md` line 1 | "Rabbit R1 Local Productivity Companion" | Update to xi-io: ibal |
| `README.md` body | Multiple R1 hardware simulator references | Reframe as paired-device surface |
| `package.json` name | `"rabbit-r1-local-companion"` | Rename to `"xi-io-ibal"` (next pass) |
| `package.json` description | "Local-first productivity companion for Rabbit R1" | Update |
| `server.js` startup banner | "R1 Local Companion Server is running!" | Update |
| `server.js` `product_id` in EventAtom | `"xi_io_rabbit_mod"` | Update to `"xi_io_ibal"` |
| `server.js` `source` in EventAtom | `"Rabbit r1 companion: ${type}"` | Update to `"xi-io: ibal: ${type}"` |
| `docs/RABBIT_MOD_STATUS.md` | Entire document title and content | Superseded — preserve as archive |
| `docs/XI_IO_ALIGNMENT.md` | Title: "R1 Companion - xi-io Architectural Alignment" | Update |
| `docs/MODEL_ROUTER.md` | "within the Rabbit R1 Companion" | Update |
| `public/pages/extensions.html` | "Connected xi-io apps and registered mini-apps" | Minor — acceptable |
| `data/events.jsonl` records | Historic `product_id: "xi_io_rabbit_mod"` | Historic — do not alter |

> [!NOTE]
> `index.html` title is already **"xi-io: ibal"** ✅  
> `router.js` already uses **"xi-io: ibal"** in `document.title` ✅  
> `server.js` startup log already says **"[ibal]"** prefix ✅

---

## Ibal Chat — Recommended Placement

When implemented, the Ibal button should be:
- A **floating pill button** anchored bottom-right of `#app-shell`, outside `#main-layout`
- Z-index above all other elements, always visible
- Clicking opens a **slide-up drawer** from the right edge
- The drawer receives **screen context** from the current route via `ibal:navigate` event
- Context adapter per route feeds the initial system prompt for screen-awareness
