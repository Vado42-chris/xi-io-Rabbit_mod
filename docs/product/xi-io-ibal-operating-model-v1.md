# xi-io: ibal — Operating Model v1

## Purpose

This document defines what xi-io: ibal is responsible for, what it owns, what it delegates,
and what it must never do autonomously.

---

## Product Responsibilities

### 1. Apps Manager (ProductRegistry)
- Installed xi-io products and mini-apps
- Available marketplace products
- Enabled / disabled state per product
- Product health status and runtime maturity level
- Product-specific settings panels
- Feature toggles per product
- Required connectors and models per product
- Paired device assignments per product

**Current UI surface:** `public/pages/extensions.html` — labelled "Extensions"  
**Gap:** Page is currently titled "Extensions / Registered Apps" not "Apps". Lexicon translates
`extensions` → `apps` when the `docket` or `custom` profile is active. A dedicated "Apps"
top-level surface with marketplace state, enabled/disabled toggles, and per-product settings
panels does not yet exist.

---

### 2. Feature Manager (FeatureRegistry)
- Enabled / disabled features per product
- Feature requirements (connector, model, device)
- Feature privacy class
- Feature device support matrix
- Feature-to-feature integrations

**Current UI surface:** Not yet present. Planned as a sub-panel within the Apps surface.

---

### 3. Connector / API Manager (ConnectorRegistry)
- Gmail, Google Calendar, GitHub, Ollama, local companion server
- Filesystem storage roots
- Rabbit-like paired devices
- Future provider APIs
- Connection health, scopes, credential references
- Revoked / expired / degraded states

**Current UI surface:** `public/pages/connections.html`  
**Implemented:** Storage Ecosystem cards (Connected/Unavailable), folder picker, batch ingress
scan, socket-based ingress telemetry.  
**Gap:** Gmail, Google Calendar, GitHub, and future provider connectors are not yet wired.
Credential references are not yet stored or displayed.

---

### 4. Model Manager (ModelRegistry)
- Local models (Ollama)
- Cloud models (future)
- Model provider status
- Model capability classification (`chat`, `vision`, `code`, `tools`, `embedding`, `unknown`)
- Model privacy class
- Allowed uses / forbidden uses
- Fallback rules
- Per-product model requirements
- Models allowed for private data
- Models forbidden from tool/action authority

**Current UI surface:** `public/pages/model-config.html`  
**Implemented:** Ollama status card, loaded models list, model capability classification,
rule-based routing strategy indicator.  
**Gap:** Cloud model support, privacy class labelling, per-product model requirements, and
models-forbidden-from-authority controls are not yet present.

---

### 5. Device Pairing Manager (DeviceRegistry)
- Phone / tablet / desktop web surfaces
- Rabbit R1 or compatible paired devices
- Future TV / arcade / emulator surfaces
- Lightweight mode vs full mode
- Allowed products/features per device
- Paired device trust level

**Current UI surface:** Device Preview pane (`#preview-pane`) in the right column of the shell.
Resolution selector supports R1/Square (480×480), phones, tablets, desktop, 10-foot/TV.  
**Gap:** No dedicated Device Pairing management page. Device trust levels, pairing flows, and
per-device product/feature allowlists are not yet present.

---

### 6. Events Manager (EventQueue)
- EventAtoms and FailureAtoms (xi-io.net schema)
- Inbox events, product events, API events, model events, device events
- Notification events, approval events, receipt events, troubleshooting events

**Current implementation:** `data/events.jsonl` (append-only ledger), `data/diagnostics.jsonl`  
**Current UI surface:** `public/pages/diagnostics.html`  
**Gap:** No dedicated Events page. Event browsing, filtering, and review cards are not present.

---

### 7. Notifications Manager (NotificationRules)
- Approval required, connector failed, API token expired, model missing
- Storage root offline, paired device disconnected
- Inbox item needs review, repo check failed
- Privacy/security warning, receipt failed, product update available

**Current UI surface:** `public/pages/notifications.html`  
**Implemented:** In-App Proposals channel (enabled), System Alerts via troubleshooting modal (enabled),
Email Digest via xi-io: inbox (planned).  
**Gap:** Notification rules engine, per-type routing, and badge-driven notification centre
are not yet implemented. `#notif-badge` element exists in the nav but is not yet data-driven.

---

### 8. Troubleshooting Console (TroubleshootingConsole)
- Run health check, connector status, model availability
- Paired device status, storage root status
- Product permission status, event queue status
- Recent failures, failed receipts, diagnostic export
- Safe mode, reset product connection

**Current UI surface:** `public/pages/diagnostics.html` + `#troubleshooting-modal` overlay  
**Implemented:** FailureAtom injection, self-healing diagnostic modal, Ollama offline detection.  
**Gap:** Full TroubleshootingConsole surface with per-connector, per-model, per-device checks,
safe mode toggle, and diagnostic bundle export is not yet present.

---

### 9. Ibal Chat Surface (IbalChatContextAdapter)
- Global floating Ibal button (bottom-right)
- Chat drawer (screen-aware context)
- "Explain this screen" / "Suggest next action" / "Troubleshoot" / "Connect apps" / "Review events"
- Product-safe context adapter per screen
- No silent side effects — ActionEnvelope + Verifier Gate + user approval required

**Current UI surface:** Not yet present.  
**Gap:** Ibal chat button and drawer are entirely absent. This is the highest-priority missing
surface for the next bounded implementation pass.

---

## Registry Architecture (Target State)

```text
ProductRegistry      ← installed apps, enabled/disabled, health, settings
FeatureRegistry      ← per-product features, requirements, privacy class
ConnectorRegistry    ← API connectors, device pairings, data flow permissions
ModelRegistry        ← local/cloud models, capability, privacy class, fallbacks
DeviceRegistry       ← device surfaces, trust levels, pairing state
IntegrationGraph     ← feature-to-feature and product-to-connector links
EventQueue           ← EventAtom/FailureAtom stream, filters, review
NotificationRules    ← routing rules, per-type channel config, badges
TroubleshootingConsole ← health checks, safe mode, diagnostic export
IbalChatContextAdapter ← screen context adapter feeding Ibal chat
ReceiptLedger        ← committed action receipts
FeedbackEventWriter  ← feedback loop atoms written back to xi-io.net
```

## What Must Stay Framework-Owned (xi-io.net)

- EventAtom and FailureAtom schemas
- Verifier Gate contract
- ActionEnvelope definition
- Receipt ledger schema
- Framework-wide privacy and security rules
- Canonical product registry YAML manifests
- Hydration state files

## What Must Stay Product-Local (xi-io: ibal)

- Lexicon preferences (`data/lexicon_preferences.json`)
- Ingress records (`data/ingress_records.json`)
- Local diagnostics ledger (`data/diagnostics.jsonl`)
- Local events ledger (`data/events.jsonl`)
- Evidence files (`data/evidence/`)
- Product-specific settings panels
- Ibal chat context adapters per screen
- Device preview configuration
