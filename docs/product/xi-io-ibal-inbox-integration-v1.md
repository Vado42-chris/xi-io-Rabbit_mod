# xi-io: ibal — Inbox Integration v1

---

## Relationship Model

```text
xi-io: inbox          → captures incoming items (email, tasks, events, messages)
xi-io: ibal           → reviews, routes, surfaces, and lets the user control them
xi-io.net             → defines EventAtom/FailureAtom schemas and Verifier Gate
```

xi-io: inbox and xi-io: ibal are **sister products**, not the same product.
Inbox is the capture and triage substrate. Ibal is the orchestration and control surface.

---

## What xi-io: inbox Feeds into ibal

| Feed Type | Description | ibal Responsibility |
|---|---|---|
| `INBOX_EVENT` atoms | Structured events from captured emails, tasks, messages | Surface as review cards |
| `EMAIL_RECEIVED` events | Captured emails awaiting triage | Present with routing options |
| `TASK_CAPTURED` events | Tasks extracted from emails or conversations | Surface in task queue |
| EventAtom candidates | Items requiring categorization or routing decision | User controls routing |
| Notification triggers | Items that meet notification rules | Trigger `NOTIFICATION_EVENT` |

---

## ibal Review Card Model

When inbox feeds an item to ibal, the item is surfaced as a **Review Card**:

```text
┌─────────────────────────────────────────────────┐
│ [INBOX ITEM] Email: Subject line here           │
│ From: sender@example.com  · 12 mins ago        │
│                                                 │
│ Ibal summary: "This appears to be a client      │
│ request for a document revision. No actions     │
│ taken. Suggested: Create task, or File."        │
│                                                 │
│ [Create Task] [File] [Archive] [Ask Ibal]       │
└─────────────────────────────────────────────────┘
```

Review cards must NOT auto-execute any action. The user selects the routing outcome.

---

## Routing Actions Available in ibal

| Action | Result | Side Effects |
|---|---|---|
| Create Task | Emits `TASK_CAPTURED` EventAtom candidate | Requires user approval |
| File | Assigns item to a product/docket/case | Requires user approval |
| Archive | Marks item as reviewed, no action | No side effects |
| Ask Ibal | Opens Ibal chat scoped to this inbox item | No side effects |
| Escalate | Flags item for high-priority attention | Emits NOTIFICATION_EVENT |
| Deny / Block | Flags sender or source | Requires confirmation |

---

## EventAtom Pipeline (Inbox → ibal)

```text
xi-io: inbox captures item
       ↓
Writes EventAtom to shared ledger or emits via socket
       ↓
xi-io: ibal receives EventAtom
       ↓
Surfaces as Review Card in ibal Events/Notifications page
       ↓
User selects routing action
       ↓
ibal emits ActionEnvelope (if side-effecting)
       ↓
Verifier Gate validates ActionEnvelope
       ↓
User approves
       ↓
Action executes
       ↓
Receipt written to ledger as RECEIPT_EVENT
```

---

## Current Implementation State

| Component | Status |
|---|---|
| xi-io: inbox repo | Known in ecosystem — local path not confirmed |
| Shared EventAtom ledger | `data/events.jsonl` present in ibal repo |
| Socket event bridge (inbox → ibal) | ❌ Not yet implemented |
| Review card UI | ❌ Not yet present |
| Routing action UI | ❌ Not yet present |
| EventAtom schema | ✅ Loaded from xi-io.net at server startup |

---

## Required Next Steps

1. Confirm xi-io: inbox local path and socket/API contract.
2. Define shared socket namespace or REST polling endpoint for inbox → ibal feed.
3. Design Review Card component.
4. Wire inbox feed to `#/notifications` or a new `#/inbox` route.
5. Implement routing action buttons with ActionEnvelope + Verifier Gate integration.

> [!IMPORTANT]
> xi-io: inbox must NEVER write directly to xi-io: ibal's ledger without going through
> an approved EventAtom → Review Card → User Action → Receipt flow.
