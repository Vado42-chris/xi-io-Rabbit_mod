# Rabbit R1 Local Companion Status Report (PASS 0)

This report details the results of the repository audit, verifying file structures, dependencies, API interactions, and current state.

---

## 📂 File Tree & Component Inventory

```text
016_Rabbit_r1/
├── cert.pem (SSL certificate)
├── key.pem (SSL key)
├── package.json (npm scripts: start, cert)
├── package-lock.json
├── server.js (HTTPS Express + Socket.io gateway)
├── tasks.json (JSON tasks datastore)
└── public/
    ├── index.html (Simulated R1 UI & Telemetry Panel)
    ├── app.js (Client events, Web Speech, Webcam capture)
    └── style.css (TE-inspired custom style theme)
```

---

## ⚙️ Service Runtime & API Map

### 1. HTTP REST Endpoints
- **GET `/api/ping`**: Returns server status. `{ status: "ok", time: "..." }`. Used as a basic health check.

### 2. Socket.io Event Registry
The bidirectional websocket communications map as follows:

| Socket Event (Inbound to Server) | Payload | Server Response Event | Description |
| :--- | :--- | :--- | :--- |
| `get-models` | None | `models-list` | Queries Ollama local tags and returns active list. |
| `get-system-stats` | None | `system-stats` | Queries `os` details (load average, memory percentage, uptime). |
| `pull-model` | `modelName` (string) | `pull-progress` | Commands Ollama to pull a model, streaming progress chunks. |
| `fetch-tasks` | None | `tasks` | Fetches tasks list from `tasks.json`. |
| `create-task` | `taskText` (string) | `tasks` (broadcast) | Appends task and broadcasts updated list. |
| `toggle-task` | `taskId` (number) | `tasks` (broadcast) | Toggles completion boolean and updates list. |
| `update-task-status` | `{ taskId, status }` | `tasks` (broadcast) | Updates task column (todo, progress, done) for Kanban sync. |
| `delete-task` | `taskId` (number) | `tasks` (broadcast) | Deletes a task card from list and database. |
| `chat-prompt` | `{ prompt, model }` | `chat-token` / `chat-done` | Pipes prompt to Ollama chat stream. |
| `vision-prompt` | `{ prompt, imageBase64, model }` | `chat-token` / `chat-done` | Runs chat with base64 image payload (via Llava). |

---

## 🧠 Ollama Integration Details
- Uses native `fetch` calls to connect to `OLLAMA_HOST` (defaults to `http://localhost:11434`).
- Routes handled:
  - `GET /api/tags`
  - `POST /api/pull` (streamed line-by-line JSON responses)
  - `POST /api/chat` (streamed messages, supports markdown & system prompts)

---

## ⚠️ Gaps & Failure Analysis
During PASS 0, we identified the following limitations and gaps:
1. **Ollama Offline Visibility**: If the Ollama daemon is down, the console shows "Ollama offline" but there is no specific diagnostic error code or fallback routing.
2. **Missing Media APIs Handling**: SpeechRecognition and media capture fail silently or throw browser console exceptions if permissions are denied or context is insecure.
3. **No Append-Only Ledger**: Tasks are overwritten inside `tasks.json`, meaning there is no historic ledger of actions performed by either client or server.
4. **Model Capability Blind Spot**: Available model tags are listed blindly in the dropdown without telling the user which models are optimized for chat vs. vision vs. code.
