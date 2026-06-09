# xi-io: ibal — Event & Notification Taxonomy v1

---

## Event Class Taxonomy

All events in xi-io: ibal conform to the EventAtom schema defined in `xi-io.net`.

### Top-Level Event Classes

| Class | Description |
|---|---|
| `USER_EVENT` | Direct user interaction (click, approve, deny, submit) |
| `INBOX_EVENT` | Item captured by xi-io: inbox, surfaced in ibal |
| `PRODUCT_EVENT` | Product lifecycle change (enabled, disabled, updated) |
| `DEVICE_EVENT` | Device pairing, connection, or trust change |
| `API_EVENT` | Connector health change or API lifecycle event |
| `MODEL_EVENT` | Model availability, pull, or routing event |
| `REPO_EVENT` | Repository state change (commit, push, PR, check) |
| `BUILD_EVENT` | Build lifecycle (triggered, success, failure) |
| `TEST_EVENT` | Test suite lifecycle (run, pass, fail, skip) |
| `LINT_EVENT` | Lint/analysis lifecycle |
| `SECURITY_EVENT` | Security scan result or policy violation |
| `ACCESSIBILITY_EVENT` | A11y check result |
| `STORAGE_EVENT` | Storage root state change (connected, offline, full) |
| `PERMISSION_EVENT` | Permission grant, revoke, or expiry |
| `NOTIFICATION_EVENT` | Notification dispatched, dismissed, or acted upon |
| `RECEIPT_EVENT` | Action receipt written or failed |
| `FEEDBACK_EVENT` | User feedback on AI suggestion or ibal output |
| `FAILURE_EVENT` | FailureAtom — runtime failure requiring attention |
| `DEVICE_SIGNAL` | Low-level signal from a paired device (existing class in ledger) |
| `RUNTIME_FAILURE` | Server/runtime failure (existing class in ledger) |

---

## Concrete Event Subclass Examples

### User & Approval Events
| Subclass | Trigger |
|---|---|
| `ACTION_APPROVAL_REQUIRED` | Ibal queues a side-effecting action |
| `ACTION_APPROVED` | User approves an ActionEnvelope |
| `ACTION_DENIED` | User denies an ActionEnvelope |

### Inbox Events
| Subclass | Trigger |
|---|---|
| `EMAIL_RECEIVED` | New email captured by xi-io: inbox |
| `TASK_CAPTURED` | New task extracted and staged for review |
| `INBOX_ITEM_REVIEWED` | User reviews and routes an inbox item |

### Product Events
| Subclass | Trigger |
|---|---|
| `PRODUCT_ENABLED` | User enables a xi-io product |
| `PRODUCT_DISABLED` | User disables a xi-io product |
| `FEATURE_ENABLED` | User enables a feature within a product |
| `FEATURE_DISABLED` | User disables a feature within a product |

### Device Events
| Subclass | Trigger |
|---|---|
| `DEVICE_CONNECTED` | Paired device establishes connection |
| `DEVICE_DISCONNECTED` | Paired device loses connection |
| `DEVICE_TRUST_CHANGED` | Trust level updated for a paired device |

### API / Connector Events
| Subclass | Trigger |
|---|---|
| `API_TOKEN_EXPIRED` | Credential TTL elapsed |
| `CONNECTOR_DEGRADED` | Connector health check fails |
| `CONNECTOR_REVOKED` | User manually revokes connector access |

### Model Events
| Subclass | Trigger |
|---|---|
| `MODEL_UNAVAILABLE` | Model requested but Ollama offline or model not found |
| `MODEL_PULLED` | Model downloaded successfully |
| `MODEL_PULL_FAILED` | Model download failed |

### Storage Events
| Subclass | Trigger |
|---|---|
| `STORAGE_PATH_UNAVAILABLE` | Storage root path not accessible |
| `INGRESS_SCAN_COMPLETED` | Directory scan returns results |
| `INGRESS_COMMIT_REQUESTED` | User triggers batch ingress commit |
| `real.batch.ingress.commit` | Commit confirmed and written to ledger ✅ (existing) |

### Build / Test / Lint Events
| Subclass | Trigger |
|---|---|
| `BUILD_FAILED` | CI build failure detected |
| `TEST_FAILED` | Test suite failure |
| `CHECK_MUTATED_OUTPUT` | Output changed unexpectedly vs. baseline |
| `LINT_FAILED` | Lint check failure |

### Security / Accessibility Events
| Subclass | Trigger |
|---|---|
| `SECURITY_SCAN_FAILED` | Security audit found vulnerabilities |
| `ACCESSIBILITY_VIOLATION` | A11y check found violations |

### Receipt Events
| Subclass | Trigger |
|---|---|
| `RECEIPT_WRITTEN` | Action completed, receipt committed to ledger |
| `RECEIPT_FAILED` | Action failed to produce a verifiable receipt |

### Feedback Events
| Subclass | Trigger |
|---|---|
| `FEEDBACK_POSITIVE` | User rates Ibal suggestion positively |
| `FEEDBACK_NEGATIVE` | User rates Ibal suggestion negatively |

---

## Notification Types

### Currently Implemented (in UI)
| Notification | Channel | State |
|---|---|---|
| AI-generated action proposals | In-App (device app inbox) | ✅ Enabled |
| Fatal diagnostics | System Alert modal | ✅ Enabled |
| Email Digest via xi-io: inbox | Email | 🔲 Planned |

### Required Notification Types (not yet present)
| Notification | Priority | Trigger Event |
|---|---|---|
| Connector failed | High | `CONNECTOR_DEGRADED` |
| API token expired | High | `API_TOKEN_EXPIRED` |
| Model missing | High | `MODEL_UNAVAILABLE` |
| Storage root offline | High | `STORAGE_PATH_UNAVAILABLE` |
| Paired device disconnected | Medium | `DEVICE_DISCONNECTED` |
| Inbox item needs review | Medium | `INBOX_EVENT` |
| Repo check failed | Medium | `BUILD_FAILED` / `TEST_FAILED` |
| Privacy / security warning | High | `SECURITY_EVENT` |
| Receipt failed | High | `RECEIPT_FAILED` |
| Product update available | Low | `PRODUCT_EVENT` |
| Approval required | Immediate | `ACTION_APPROVAL_REQUIRED` |

---

## Notification Routing Rules (Target)

Each notification type should define:
- `channel` (`in_app` | `email` | `device_push` | `modal`)
- `priority` (`immediate` | `high` | `medium` | `low`)
- `auto_dismiss` (boolean)
- `dismiss_after_ms` (number)
- `requires_action` (boolean — if true, cannot be auto-dismissed)
- `snooze_options` (list of durations)
- `linked_event_subclass` (which EventAtom subclass triggers this)
