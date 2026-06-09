# xi-io: ibal — Architecture Rebase Report  
# XIIO-IBAL-ARCHITECTURE-REBASE-001

**Date:** 2026-06-09  
**Executed by:** Antigravity (architecture rebase pass)  
**Scope:** Documentation + test fix only — zero runtime changes

---

## Executive Summary

This repo (`016_Rabbit_r1` / `xi-io-Rabbit_mod`) has been formally rebased as **xi-io: ibal**:
the user-facing mobile ingress, chat, paired-device, product orchestration, and API/model/feature/event
control app for the xi-io ecosystem.

Rabbit R1 is now one **device surface type** in the DeviceRegistry, not the product identity.

---

## Rebase Inventory

### Documents Created (all in `docs/product/`)

| File | Purpose |
|---|---|
| `xi-io-ibal-product-identity-v1.md` | Official name, role, ecosystem position, non-negotiable boundaries |
| `xi-io-ibal-operating-model-v1.md` | 9 product responsibilities, registry architecture, framework vs. product boundary |
| `xi-io-ibal-ui-surface-map-v1.md` | Per-page audit, gap table, Rabbit/R1 string inventory, Ibal chat placement |
| `xi-io-ibal-chat-embedding-plan-v1.md` | Button placement, drawer design, context adapters, safety model, runtime level gate |
| `xi-io-ibal-api-model-device-registry-plan-v1.md` | ConnectorRegistry / ModelRegistry / DeviceRegistry — current state + required additions |
| `xi-io-ibal-event-notification-taxonomy-v1.md` | Full EventAtom class taxonomy, concrete subclasses, notification routing target model |
| `xi-io-ibal-inbox-integration-v1.md` | Inbox → ibal relationship, review card model, routing pipeline |
| `xi-io-ibal-marketplace-impact-v1.md` | Marketplace card metadata, feature list, integration requirements, privacy badge |

---

## Test Fix

| Test | Before | After | Root Cause |
|---|---|---|---|
| Socket.io Ingress Scanning & Commit Telemetry | ❌ FAIL (`5 !== 2`) | ✅ PASS | `waitForLedgerEvent` was reading a stale ledger record from a prior test run that had scanned and committed 5 real directories. Fixed by capturing ledger line count BEFORE commit and only searching newly-appended lines. |

**Final test result:** 10/10 ✅

---

## Existing Docs Status

| Document | Action |
|---|---|
| `docs/RABBIT_MOD_STATUS.md` | Preserved as historical archive (PASS 0) |
| `docs/XI_IO_ALIGNMENT.md` | Preserved, to be retitled in next pass as ibal alignment |
| `docs/MODEL_ROUTER.md` | Preserved, to be updated to remove R1 references |

---

## What Was Intentionally NOT Changed

| Item | Reason |
|---|---|
| `package.json` name | Rename to `xi-io-ibal` scoped to explicit rename pass |
| `server.js` product_id / source strings | Source change scoped to explicit string cleanup pass |
| `README.md` | Full rewrite scoped to explicit README pass |
| `data/events.jsonl` historic records | Historic EventAtoms with `xi_io_rabbit_mod` product_id — never alter |
| Any runtime logic | Zero runtime changes in this pass |

---

## What Is Still "Rabbit / R1" In The Codebase

| Location | Remaining String | Priority |
|---|---|---|
| `README.md` L1 | "Rabbit R1 Local Productivity Companion" | High |
| `package.json` | `"rabbit-r1-local-companion"` | High |
| `server.js` EventAtom `product_id` | `"xi_io_rabbit_mod"` | High |
| `server.js` EventAtom `source` | `"Rabbit r1 companion: ${type}"` | High |
| `docs/MODEL_ROUTER.md` body | "within the Rabbit R1 Companion" | Medium |
| `docs/XI_IO_ALIGNMENT.md` title | "R1 Companion - xi-io Architectural Alignment" | Medium |
| `server.js` startup banner text | "R1 Local Companion Server" | Medium |

All items are documented. None are blocking. All correctable in the next bounded string-cleanup pass.

---

## Gap Summary (Priority Order for Next Pass)

| Priority | Gap | Surface |
|---|---|---|
| 1 | Ibal Chat Button + Drawer | Global — no trace in codebase |
| 2 | Events page (`#/events`) | EventAtom stream exists; no UI |
| 3 | Full Apps Manager | Extensions page is a stub |
| 4 | Device Pairing page (`#/devices`) | DeviceRegistry entirely absent |
| 5 | API Connector cards in Connections | Gmail, GitHub, Calendar absent |
| 6 | Notification live feed | badge element exists but not data-driven |
| 7 | Model privacy/governance controls | capability ≠ authority — not enforced in UI |
| 8 | Full TroubleshootingConsole page | modal is minimal |
| 9 | Marketplace listing metadata | not yet submitted to xi-io.com |
| 10 | Package/repo rename | `rabbit-r1-local-companion` → `xi-io-ibal` |

---

## Next Recommended Pass: XIIO-IBAL-REBASE-002 (Identity Strings)

Scope:
- Update `package.json` name, description, version to `xi-io-ibal`
- Update `server.js` EventAtom `product_id` and `source`
- Update `README.md` to reframe product identity
- Update `docs/XI_IO_ALIGNMENT.md` title
- Update `docs/MODEL_ROUTER.md` body
- Update server startup log line
- Commit with message: `chore: rebase identity strings to xi-io: ibal`

No runtime logic changes required.

---

## Recommended Pass After That: XIIO-IBAL-IBAL-CHAT-001

Scope:
- Implement global Ibal chat button (`#ibal-chat-btn`)
- Implement Ibal chat drawer (`#ibal-drawer`)
- Wire `ibal:navigate` event to context adapter
- Register context adapters on all 6 current page modules
- Implement read-only context-aware prompts at L2
- No model calls, no side effects — context reading and suggestion only

---

## Framework Alignment (Confirmed)

| Requirement | Status |
|---|---|
| EventAtom schema loaded from xi-io.net at startup | ✅ |
| FailureAtom schema loaded from xi-io.net at startup | ✅ |
| EventAtom validation on every ledger write | ✅ |
| Append-only ledger (`data/events.jsonl`) | ✅ |
| Append-only diagnostics ledger (`data/diagnostics.jsonl`) | ✅ |
| Evidence files preserved in `data/evidence/` | ✅ |
| Path traversal protection on `/api/fs/list` | ✅ |
| CORS policy configured and tested | ✅ |
| Self-signed HTTPS for Speech/Camera APIs | ✅ |
| Lexicon / Rosetta Stone with 3 built-in profiles | ✅ |
| Verifier Gate integration | ❌ Planned — not yet wired |
| ActionEnvelope | ❌ Planned — not yet implemented |
| Receipt ledger | ❌ Planned — not yet implemented |
