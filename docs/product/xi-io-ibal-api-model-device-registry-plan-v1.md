# xi-io: ibal — API, Model & Device Registry Plan v1

---

## ConnectorRegistry (API Connectors)

### Implemented

| Connector | Type | Status | Location |
|---|---|---|---|
| Local filesystem storage roots | Storage | ✅ Implemented | `connections.html` + `/api/storage/status` |
| Local companion server (self) | Internal | ✅ Implemented | `server.js` health ping |
| Ollama local daemon | AI model provider | ✅ Implemented | `model-config.html` + `/api/models` |

### Planned

| Connector | Type | Priority | Notes |
|---|---|---|---|
| Gmail | Email/Events | High | Feeds xi-io: inbox |
| Google Calendar | Events/Tasks | High | Feeds xi-io: inbox |
| GitHub | Repo/CI | High | Already referenced in xi-io.net registry |
| Rabbit-like paired device | Device bridge | Medium | R1 currently the only known surface |
| Future provider APIs | Various | Low | Pluggable via ConnectorRegistry |

### Connector Card Schema (target)

Each connector must surface:
- `connector_id` (unique slug)
- `display_name`
- `type` (`api` | `storage` | `device` | `internal`)
- `status` (`connected` | `degraded` | `offline` | `revoked` | `expired`)
- `scopes` (list of granted permission scopes)
- `credential_ref` (reference to credential store — never raw secret)
- `last_checked` (ISO timestamp)
- `health_message` (human-readable)
- `revoke_action` (safe revoke endpoint or flow)

---

## ModelRegistry (AI Models)

### Implemented

| Capability | Classification | Source | Status |
|---|---|---|---|
| `chat` | Pattern match on name | Ollama `/api/tags` | ✅ Implemented |
| `vision` | Pattern match (llava, moondream, etc.) | Ollama `/api/tags` | ✅ Implemented |
| `code` | Pattern match (coder, codellama, etc.) | Ollama `/api/tags` | ✅ Implemented |
| `tools` | Pattern match (llama3, qwen2.5, etc.) | Ollama `/api/tags` | ✅ Implemented |
| `embedding` | Pattern match (embed, minilm, etc.) | Ollama `/api/tags` | ✅ Implemented |
| `unknown` | Fallback | Ollama `/api/tags` | ✅ Implemented |

### Required Model Registry Additions

| Field | Description | Status |
|---|---|---|
| `privacy_class` | `local_only` / `cloud_allowed` / `private_data_allowed` | ❌ Not present |
| `allowed_uses` | List of authorized use cases per model | ❌ Not present |
| `forbidden_uses` | e.g. `tool_authority`, `private_data` | ❌ Not present |
| `fallback_chain` | Ordered list of fallback models if primary unavailable | ❌ Not present |
| `per_product_requirement` | Which products require which model capabilities | ❌ Not present |
| `cloud_provider` | For future cloud models | ❌ Not present |

### Model Privacy Rule (Non-Negotiable)

> Model capability classification must **never** become implicit permission to execute.
> A model classified as `tools` does not automatically gain authority to run local commands.
> Authority is separately granted via the Verifier Gate and explicit user approval.

---

## DeviceRegistry (Device Surfaces)

### Currently Supported (Preview Only)

| Surface | Type | Resolution | Status |
|---|---|---|---|
| iPhone 14 | Phone | 390×844 | ✅ Preview supported |
| Android | Phone | 360×800 | ✅ Preview supported |
| iPhone Plus | Phone | 428×926 | ✅ Preview supported |
| R1 / Square | Compact paired device | 480×480 | ✅ Preview supported |
| iPad Generic | Tablet | 768×1024 | ✅ Preview supported (default) |
| iPad Air | Tablet | 820×1180 | ✅ Preview supported |
| iPad Pro | Tablet | 1024×1366 | ✅ Preview supported |
| Laptop | Desktop | 1280×800 | ✅ Preview supported |
| Wide Desktop | Desktop | 1440×900 | ✅ Preview supported |
| Full HD | Desktop | 1920×1080 | ✅ Preview supported |
| TV HD | 10-Foot | 1920×1080 | ✅ Preview supported |
| 4K | 10-Foot | 3840×2160 | ✅ Preview supported |

### Required Device Registry Additions

| Field | Description | Status |
|---|---|---|
| `device_id` | Unique identifier for a paired device | ❌ Not present |
| `trust_level` | `untrusted` / `low` / `standard` / `high` | ❌ Not present |
| `pairing_state` | `unpaired` / `pairing` / `paired` / `revoked` | ❌ Not present |
| `allowed_products` | Which xi-io products run on this device | ❌ Not present |
| `allowed_features` | Which features are permitted on this device | ❌ Not present |
| `mode` | `lightweight` / `full` | ❌ Not present |
| `last_seen` | ISO timestamp | ❌ Not present |
| `device_type` | `phone` / `tablet` / `desktop` / `paired_device` / `tv` | ❌ Not present |

> [!NOTE]
> Rabbit R1 is modelled as `device_type: paired_device`. It is **not** the product identity.
> It is one entry in the DeviceRegistry with a specific trust level and allowed feature set.

---

## IntegrationGraph (Feature-to-Feature Links)

Not yet present. The IntegrationGraph tracks which features depend on which connectors, models,
and devices — enabling ibal to surface actionable "this feature requires X connector" prompts
when a dependency is missing or degraded.

Target schema per integration edge:
- `source_feature_id`
- `target_feature_id` or `target_connector_id` or `target_model_id`
- `dependency_type` (`required` / `optional` / `enhances`)
- `health_impact` (`blocking` / `degraded` / `informational`)
