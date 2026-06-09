# xi-io: ibal — Product Identity v1

## Official Product Name

**xi-io: ibal**

## Former Identity (Superseded)

| Field | Value |
|---|---|
| Former name | Rabbit R1 Local Companion |
| Former npm package name | `rabbit-r1-local-companion` |
| Former repo corpus name | `xi-io-Rabbit_mod` |
| Former project manifest ID | `xi_io_rabbit_mod` |
| Former milestone ID | `XIO-R1-COMPANION-HARDENING-001` |

> [!IMPORTANT]
> The former identity is **superseded** as of XIIO-IBAL-ARCHITECTURE-REBASE-001. Rabbit R1 is no longer
> the product identity — it is one possible **paired device surface** within xi-io: ibal. No runtime
> changes are made in this rebase pass. Identity updates to package.json, manifest, and UI strings
> are scoped to the next bounded pass.

## Current Repo Host

| Field | Value |
|---|---|
| Local path | `/media/chrishallberg/Storage 22/999_Work/003_Projects/016_Rabbit_r1` |
| GitHub remote | `Vado42-chris/xi-io-Rabbit_mod` |
| Default branch | `main` |
| Repo rename required | Yes — target name: `xi-io-ibal` (next pass) |
| Status | **verified** |

## Product Role

xi-io: ibal is the **user-facing mobile ingress, chat, paired-device, product orchestration,
API/model/feature/event control app** for the xi-io ecosystem.

It is the cockpit through which a user:
- manages installed xi-io apps and their settings
- controls which features are enabled per product
- manages API connectors, credentials, and health
- manages local and cloud AI model routing
- pairs and manages physical/virtual device surfaces
- inspects, routes, and acts on events from the ecosystem
- receives and acts on notifications
- runs troubleshooting and diagnostic flows
- communicates with Ibal, the embedded assistant

## Product Position in the xi-io Ecosystem

```text
xi-io.net          → framework spine / control plane / schema owner / Verifier Gate
xi-io: ibal        → THIS PRODUCT — user-facing orchestration and ingress app
xi-io: inbox       → inbox/task/event capture substrate (feeds ibal)
xi-io.com          → public site / marketplace / brand front door
xi-io_bins         → bins / lexicon / Rosetta substrate
xi-io-emulator     → arcade shell / controller-first entertainment product
xi-io-benchmark    → eval / proof / regression harness
```

## What Rabbit R1 Is Now

Rabbit R1 is a **paired device surface type** within xi-io: ibal. It is one entry in the
DeviceRegistry. It is not the product identity. Other device surfaces include:
- Phone / tablet / desktop web
- Future TV/arcade/emulator surfaces
- Any other paired device with a supported trust level

## Key Non-Negotiable Boundaries

- Ibal must not silently execute cross-product side effects.
- Ibal must not bypass Verifier Gate.
- Ibal must not send private data to cloud models without explicit user approval.
- Ibal must not scan arbitrary filesystem roots (path traversal protection implemented in `/api/fs/list`).
- Ibal must not mutate product repos without explicit approval.
- Model capability classification must never become implicit permission to execute.
