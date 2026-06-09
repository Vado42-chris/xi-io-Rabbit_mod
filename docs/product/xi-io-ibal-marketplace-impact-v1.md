# xi-io: ibal — Marketplace Impact v1

---

## Purpose

This document defines what xi-io: ibal exposes to xi-io.com for marketplace listing,
product discovery, feature metadata, integration requirements, and privacy badges.

---

## Marketplace Card Metadata

```yaml
product_id: xi_io_ibal
display_name: "xi-io: ibal"
tagline: "Orchestrate your xi-io ecosystem. Apps, models, connectors, devices — in one place."
category: orchestration
device_support:
  - phone
  - tablet
  - desktop
  - paired_device
  - tv
pricing_model: free_local
local_first: true
cloud_required: false
cloud_optional: true  # future — cloud model connectors
open_source: partial  # framework is open; product is first-party
```

---

## Feature Metadata (for Marketplace Listing)

| Feature | Display Name | Status | Privacy Class | Requires |
|---|---|---|---|---|
| Apps Manager | Installed Apps | In Build | internal | — |
| Feature Manager | Feature Controls | Planned | internal | Apps Manager |
| Connector Manager | Connections | In Build | internal | — |
| Model Manager | Model Config | In Build | internal | Ollama (optional) |
| Device Pairing | Device Manager | Planned | internal | paired device |
| Events Manager | Event Stream | Planned | internal | EventAtom schema |
| Notifications | Alerts | Partial | internal | — |
| Troubleshooting | Health Console | Partial | internal | — |
| Ibal Chat | Ibal Assistant | Planned | `local_only` default | local model recommended |
| Lexicon / Rosetta | Terminology Settings | Implemented | internal | — |
| Batch Ingress | Storage Ingress | Implemented | internal | storage root |
| Inbox Integration | Inbox Review | Planned | internal | xi-io: inbox |

---

## Integration Metadata (for Marketplace Discovery)

| Integration | Type | Direction | Status |
|---|---|---|---|
| xi-io: inbox | Sister product | Bidirectional | Planned |
| xi-io.net | Framework | Upstream | Active |
| xi-io.com | Marketing/Marketplace | Downstream | Planned |
| Ollama | Local AI provider | External | Active |
| Gmail | Email connector | External | Planned |
| Google Calendar | Calendar connector | External | Planned |
| GitHub | Repo connector | External | Planned |

---

## API / Model / Device Requirements (Marketplace Transparency)

### Required at Launch
- None (fully local, self-contained)

### Optional Enhancements
| Requirement | Reason | Graceful Degradation |
|---|---|---|
| Ollama daemon | Local AI model routing | Rule-based fallback active |
| Local storage paths | Ingress scanning | Manual path entry still works |
| xi-io: inbox | Inbox review cards | Notifications section shows "planned" |

### Cloud Requirements
- None at L2 runtime
- Future cloud model connectors are opt-in only, with explicit user approval per session

---

## Privacy Badge

```text
Privacy Class: LOCAL_FIRST
- All data stored on device (data/*.jsonl, data/*.json)
- No telemetry sent externally
- Cloud model use requires explicit per-session opt-in
- Path traversal protection enforced on filesystem API
- Credentials never stored in conversation text or localStorage
```

---

## Device Support Matrix (Marketplace)

| Device Type | Support Level | Notes |
|---|---|---|
| Desktop web (Chrome, Firefox, Edge) | Full | Primary development target |
| Tablet (iPad, Android tablet) | Full | Responsive layout |
| Phone | Partial | `/device/` view optimized; management console responsive |
| Rabbit R1 (paired device) | Partial | `/device/` view; 480×480 frame |
| TV / 10-Foot | Preview only | Resolution selector supports 1080p and 4K |

---

## Enabled Feature List (Current State for Marketplace)

Features currently live and verified:
1. Storage root connectivity cards
2. Interactive folder picker and path browser (traversal-protected)
3. Batch ingress directory scanner
4. Batch ingress commit with EventAtom ledger
5. Ollama local model browser and capability classification
6. Model router (rule-based + LLM strategy)
7. Lexicon / Rosetta Stone terminology translation
8. Extension / App health monitoring
9. Diagnostics ledger viewer
10. Troubleshooting modal with self-healing trigger
11. Device preview pane (all resolutions)
12. Hash-based SPA routing
13. Notification channel configuration (partial)

---

## What Must Be Marketed vs. What Must Not

### Marketable
- Local-first, zero cloud dependency
- Multi-surface device preview
- Ollama integration with privacy-safe routing
- Modular lexicon for domain-specific terminology
- EventAtom / FailureAtom telemetry compliance

### Not Marketable Until Implemented
- Ibal chat (no button or drawer yet)
- Full Apps manager with marketplace state
- Gmail / Google Calendar / GitHub connectors
- xi-io: inbox review cards
- Full troubleshooting console
