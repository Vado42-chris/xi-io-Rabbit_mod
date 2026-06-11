# xi-io: ibal - xi-io Architectural Alignment (PASS 1)

This alignment plan details how the xi-io: ibal Console projects data ingress, analysis pipelines, and execution outputs (egress) using standard `xi-io` system telemetry architectures.

---

## 🏗 Architectural Topology (Ingress/Analysis/Egress)

To ensure predictable data tracking, operations are mapped to a structured lifecycle pattern:

```text
  [ INGRESS ] ─────────────► [ ANALYSIS ] ─────────────► [ EGRESS ]
  - Speech dictation         - JSON Validation          - UI update
  - Key events (PTT/Scroll)  - Error checking           - Socket broadcast
  - Camera base64 snaps      - Ollama LLM reasoning     - Local file write
  - Kanban card dragging     - Capability routing       - Audio speech Synthesis
```

### 1. Ingress
Data entering the runtime container originates from:
- **Human Controls**: Keydown actions (`ArrowUp`, `ArrowDown`, `Enter`), PTT clicks, and manual scroll wheel ticks.
- **Client Sensors**: Video camera frame snapshots (as JPEG base64 strings) and browser Web Speech voice dictation strings.
- **Workflow Interventions**: Manual Kanban board dragging, text submissions for new tasks, or model pulling commands.
- **Workstation Inputs**: Node.js telemetry stats (`os` module outputs) and `tasks.jsonl` file reads.

### 2. Analysis
Processing layers evaluate ingress data:
- **Deterministic Validation**: Checking for null fields, verifying model existence, validating JSON payload schemas, checking for active HTTPS certificates.
- **Model Capability Check**: Validating if the selected model matches the requested command category (e.g. refusing vision prompts on a non-vision model).
- **Offline AI Reasoning**: Locally hosted LLM/Vision processing (Ollama tags, chat streams, Llava visual description).

### 3. Egress
Outputs emitted back to the console shell or storage layer:
- **UI Screen Refreshes**: Updating task cards, scroll ridges, connection indicator badges, and model selector options.
- **System Actions**: Local file writes (saving tasks or appending logs), running background model downloads, sending speech synthesis commands.
- **WebSocket Broadcasts**: Transmitting state updates to all active web panel attachments.

---

## 📖 Lexicon Configuration

Standardizing terminology ensures compatibility with `xi-io.net` components:

- **State Types**:
  - `todo`: Task created but not started.
  - `progress`: Task is actively worked on.
  - `done`: Task has been completed.
- **Severity Levels**:
  - `info`: Non-blocking trace output.
  - `warn`: Interrupted service (e.g. model mismatch) but app is functional.
  - `error`: Core module failure (e.g. Ollama offline, task write fail).
  - `fatal`: Server cannot run or bind to port (e.g. SSL cert not found).
- **Capability Tokens**:
  - `chat`: Model supports conversational text instructions.
  - `vision`: Model accepts image base64 arrays.
  - `code`: Model is optimized for source code structure.
  - `tools`: Model supports JSON output schemas and function calling.
  - `embedding`: Model generates numeric text embeddings.

---

## 🗺 Feature Roadmap (Top 10)

### Group A: Safe Immediate Foundation
1. **No-Silent-Failure Diagnostic Agent (PASS 2 - Feature A)**: Continuous tracking of API offline/network disconnect events to make runtime health visible.
2. **Model Capability Router (PASS 2 - Feature B)**: Tag models based on local capabilities to prevent sending invalid inputs.
3. **Append-Only Ledger (PASS 2 - Feature C)**: A local append-only event stream (`data/events.jsonl`) to log user interactions and errors.

### Group B: Medium Feature Integration (Workstation & UI)
4. **Camera Context Scanner**: Points the R1 camera eye at code/documents and reads them via `llava` to identify debug actions.
5. **Task-to-Workflow Builder**: Automated steps generation for a specific task using Ollama JSON tool-calling.
6. **Local Project Memory & RAG Vault**: Index local documentation using embeddings to enrich prompt queries with accurate workspace context.
7. **Private Voice Notes to Structured Project Ledger**: Record ideas on R1, summarize them using local LLM, and automatically append them as event logs in `xi-io.net`.

### Group C: Advanced Device & Custom UI Integrations
8. **XI Local Command Router**: Binds short voice commands (e.g. *"run build"*, *"check status"*) to native workstation scripts.
9. **Agent Swarm Lite**: Let multiple local Ollama models (e.g. a programmer model and a reviewer model) verify changes locally.
10. **RabbitOS Replacement Shell**: Bootstrapping an entirely custom web viewport that overrides the stock device UI, running completely offline.
