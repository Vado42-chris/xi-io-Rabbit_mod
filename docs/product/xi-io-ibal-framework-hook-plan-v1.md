# xi-io: ibal — Framework Hook Integration Plan v1

**Document ID:** xi-io-ibal-framework-hook-plan-v1  
**Track:** D — Framework Integration Stubs  
**Date:** 2026-06-09  
**Status:** ✅ Stubs Delivered / 🔴 Backend Not Configured

---

## 1. Purpose

Define the two-way synchronization contract between xi-io: ibal (local operator console)
and the remote xi-io.net framework. All hooks are currently **inert stubs** — they
return well-typed sentinel values and emit local console telemetry only.

This document specifies the contract so that any future backend implementation
can simply replace the stub bodies without changing the public API surface.

---

## 2. Stub File Location

```
public/js/framework-hooks.js
```

Imported as an ES module. No side-effects on import. Tree-shakeable.

---

## 3. Hook Catalogue

### 3.1 Outbound Queue — ibal → xi-io.net

| Hook | Signature | Returns |
|---|---|---|
| `pushOutboundEvent(eventAtom)` | EventAtom object | `{ status, hookName, payload }` |
| `flushOutboundQueue()` | — | `{ status, flushed: 0 }` |

**Activation path:** Replace stub bodies with `fetch('/api/framework/outbound', { method: 'POST', body: JSON.stringify(eventAtom) })`. Backend endpoint TBD.

### 3.2 Inbound Queue — xi-io.net → ibal

| Hook | Signature | Returns |
|---|---|---|
| `pollInboundEvents()` | — | `{ status, events: [] }` |
| `subscribeInbound(callback)` | Function | void |

**Activation path:** Replace `pollInboundEvents` with a long-poll or SSE subscription to xi-io.net egress. Replace `subscribeInbound` with WebSocket listener.

### 3.3 Manifest Sync

| Hook | Signature | Returns |
|---|---|---|
| `pushManifestSnapshot(manifest)` | Registry snapshot object | `{ status }` |
| `fetchRemoteManifest()` | — | `{ status, manifest: null }` |

**Activation path:** Map to xi-io.net `/api/manifests` REST endpoints (v1 schema TBD).

### 3.4 Registry Sync

| Hook | Signature | Returns |
|---|---|---|
| `pushRegistryState(snapshot)` | Registry snapshot | `{ status }` |
| `pullRemoteRegistry()` | — | `{ status, registry: null }` |

**Activation path:** Map to xi-io.net provider registry API.

### 3.5 Diagnostics

| Hook | Signature | Returns |
|---|---|---|
| `getHookHealth()` | — | `{ configured, hookCount, status, note }` |

Used by the Troubleshooting page to surface integration state. Always returns `PENDING_BACKEND` until activation.

---

## 4. Sentinel Status Enum

```js
const HookStatus = {
  NOT_CONFIGURED:  'NOT_CONFIGURED',   // hook exists, endpoint never set
  PENDING_BACKEND: 'PENDING_BACKEND',  // approved but backend not yet deployed
  OK:              'OK',               // live (reserved)
}
```

---

## 5. Activation Prerequisites

| Prerequisite | Status |
|---|---|
| xi-io.net backend `/api/framework/*` endpoints deployed | NOT YET |
| Auth token / API key provisioned for ibal | NOT YET |
| TLS certificate on xi-io.net backend | NOT YET |
| EventAtom schema v1 ratified | NOT YET |
| Manifest schema v1 ratified | NOT YET |

**Do not activate any hook until ALL prerequisites are met.**

---

## 6. Integration with Troubleshooting Page

The Troubleshooting page (Diagnostics) should call `getHookHealth()` on mount and
display a status row in the existing diagnostic card:

```
Framework Integration   [PENDING_BACKEND]   6 hooks defined / 0 active
```

This surfaces integration state without requiring a separate page.
