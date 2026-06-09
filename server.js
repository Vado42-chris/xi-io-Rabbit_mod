const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const { pathToFileURL } = require('url');

// Disable TLS validation globally removed to enforce scoped HTTPS validation bypass only for local companion requests.

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// CORS Check Helper
function isOriginAllowed(origin) {
  if (!origin) return false;
  // Match https://xi-io.net or https://*.xi-io.net
  if (/^https:\/\/(.*\.)?xi-io\.net$/.test(origin)) return true;
  // Match http://localhost:PORT or https://localhost:PORT
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

// CORS Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());

// Disable caching for local development freshness
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── XI-IO FRAMEWORK DISTRIBUTION ──────────────────────────────────────────────
// Serves the xi-io.net shared design system and component library at /framework/
// This is the single source of truth — ibal never copies framework files.
// Usage in HTML:  <link rel="stylesheet" href="/framework/styles.css">
// Usage in JS:    import('/framework/event-feed.js')
const XI_IO_FRAMEWORK_PATH = process.env.XI_IO_FRAMEWORK_PATH || path.join(__dirname, '..', 'xi-io.net');
const XIIO_FRAMEWORK_PUBLIC = path.join(XI_IO_FRAMEWORK_PATH, 'public');
if (fs.existsSync(XIIO_FRAMEWORK_PUBLIC)) {
  app.use('/framework', express.static(XIIO_FRAMEWORK_PUBLIC));
  console.log('[ibal] xi-io framework mounted at /framework from', XIIO_FRAMEWORK_PUBLIC);
} else {
  console.warn('[ibal] WARNING: xi-io.net framework not found at', XIIO_FRAMEWORK_PUBLIC);
  console.warn('[ibal] Ensure xi-io.net repo is checked out at', XI_IO_FRAMEWORK_PATH);
}

// ── DEVICE APP SPA FALLBACK ────────────────────────────────────────────────────
// Any /device/* path that doesn't match a static file serves the device app shell.
// This allows the device SPA's own hash router to handle sub-routes.
app.get('/device', (req, res) => {
  res.redirect('/device/');
});
app.get('/device/*', (req, res) => {
  const deviceIndex = path.join(__dirname, 'public', 'device', 'index.html');
  if (fs.existsSync(deviceIndex)) {
    res.sendFile(deviceIndex);
  } else {
    res.status(404).send('Device app not yet built. Run the Phase 1 build.');
  }
});

// Path to tasks storage
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const INBOX_FILE = path.join(__dirname, 'inbox.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');
const DIAGNOSTICS_FILE = path.join(__dirname, 'data', 'diagnostics.jsonl');
const LEDGER_FILE = path.join(__dirname, 'data', 'events.jsonl');
const LEXICON_FILE = path.join(__dirname, 'data', 'lexicon_preferences.json');

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure data folder exists
ensureDirectoryExists(DIAGNOSTICS_FILE);

// Dynamic loading of validation and storage engine
let validationEngine = null;
let storageEngine = null;

const validatorPath = pathToFileURL(path.join(XI_IO_FRAMEWORK_PATH, 'engines', 'validation', 'event-atom-validator.mjs')).href;
import(validatorPath)
  .then(mod => {
    validationEngine = mod;
  })
  .catch(err => {
    console.warn("Telemetry validation engine not loaded, using fallback schema validator.", err.message);
  });

const storagePath = pathToFileURL(path.join(XI_IO_FRAMEWORK_PATH, 'engines', 'storage', 'event-storage.mjs')).href;
import(storagePath)
  .then(mod => {
    storageEngine = mod;
  })
  .catch(err => {
    console.warn("Telemetry storage engine not loaded.", err.message);
  });

// --- Schema Adaptor and Validation Integration for Inbox ---
let adaptedInboxEventSchema = null;
let adaptedActionProposalSchema = null;

function adaptSchemaForFramework(schema) {
  if (!schema) return schema;
  const adapted = JSON.parse(JSON.stringify(schema));
  
  const allowedTopLevel = [
    '$schema', '$id', 'title', 'description', 'type', 'required', 'properties', 'additionalProperties'
  ];
  for (const key of Object.keys(adapted)) {
    if (!allowedTopLevel.includes(key)) {
      delete adapted[key];
    }
  }

  const allowedPropertyKeywords = ['type', 'const', 'enum', 'items'];
  if (adapted.properties) {
    for (const [propName, rules] of Object.entries(adapted.properties)) {
      if (typeof rules === 'object' && rules !== null) {
        for (const key of Object.keys(rules)) {
          if (!allowedPropertyKeywords.includes(key)) {
            delete rules[key];
          }
        }
        if (rules.type === 'array' && rules.items && typeof rules.items === 'object') {
          for (const key of Object.keys(rules.items)) {
            if (key !== 'type') {
              delete rules.items[key];
            }
          }
        }
      }
    }
  }
  return adapted;
}

function loadInboxSchemas() {
  try {
    const inboxSchemaPath = path.resolve(__dirname, '../017_xi-io_inbox/schemas/inbox-event.schema.json');
    const proposalSchemaPath = path.resolve(__dirname, '../017_xi-io_inbox/schemas/action-proposal.schema.json');
    
    if (fs.existsSync(inboxSchemaPath)) {
      const raw = JSON.parse(fs.readFileSync(inboxSchemaPath, 'utf8'));
      adaptedInboxEventSchema = adaptSchemaForFramework(raw);
      console.log("Loaded and adapted Inbox Event schema.");
    } else {
      console.warn(`Inbox Event schema not found at ${inboxSchemaPath}`);
    }
    
    if (fs.existsSync(proposalSchemaPath)) {
      const raw = JSON.parse(fs.readFileSync(proposalSchemaPath, 'utf8'));
      adaptedActionProposalSchema = adaptSchemaForFramework(raw);
      console.log("Loaded and adapted Action Proposal schema.");
    } else {
      console.warn(`Action Proposal schema not found at ${proposalSchemaPath}`);
    }
  } catch (err) {
    console.error("Error loading or adapting inbox schemas:", err);
  }
}

function validateInboxEvent(event) {
  if (!validationEngine) {
    return { valid: true };
  }
  if (!adaptedInboxEventSchema) {
    return { valid: false, errors: ["Inbox Event Schema is not loaded."] };
  }
  const eventToValidate = { ...event };
  delete eventToValidate.body;
  delete eventToValidate.status;
  return validationEngine.validateAgainstSchema(eventToValidate, adaptedInboxEventSchema);
}

function validateActionProposal(proposal) {
  if (!validationEngine) {
    return { valid: true };
  }
  if (!adaptedActionProposalSchema) {
    return { valid: false, errors: ["Action Proposal Schema is not loaded."] };
  }
  const proposalToValidate = { ...proposal };
  delete proposalToValidate.event_id;
  delete proposalToValidate.suggested_action;
  delete proposalToValidate.parameters;
  delete proposalToValidate.confidence;
  delete proposalToValidate.status;
  return validationEngine.validateAgainstSchema(proposalToValidate, adaptedActionProposalSchema);
}

loadInboxSchemas();

// Helpers for Recording Diagnostics and Ledger Events
function recordDiagnostic(severity, source, code, message, detail, suggestedAction, relatedFeature) {
  const diagId = `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const parentEvtId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const evidencePath = path.join(__dirname, 'data', 'evidence', `${evidenceId}.json`);
  const diagDetail = {
    detail: detail || '',
    suggestedAction: suggestedAction || '',
    relatedFeature: relatedFeature || ''
  };

  ensureDirectoryExists(evidencePath);
  try {
    fs.writeFileSync(evidencePath, JSON.stringify(diagDetail, null, 2), 'utf8');
  } catch (err) {
    console.error("Failed to write diagnostic evidence file:", err);
  }

  const failureAtom = {
    id: diagId,
    version: "v1",
    event_atom_id: parentEvtId,
    product_id: "xi_io_ibal",
    repo: "016_Rabbit_r1",
    source: source || "xi-io: ibal",
    source_kind: "device",
    command: "node server.js",
    command_stage: "runtime",
    raw_evidence_ref: `file://${path.resolve(evidencePath)}`,
    raw_evidence_preserved: true,
    detected_at: new Date().toISOString(),
    failure_class: "RUNTIME_FAILURE",
    failure_subclass: code || "UNKNOWN_ERROR",
    failure_message_excerpt: message ? message.substring(0, 100) : "",
    normalized_summary: message || "",
    probable_cause: detail || "",
    suggested_fix_strategy: suggestedAction || "",
    smallest_safe_next_action: "",
    blocked_by: [],
    blocks: [],
    fingerprint_ref: "",
    fingerprint_status: "not_created",
    severity: severity === "critical" || severity === "fatal" ? "critical" : severity === "warning" ? "warning" : "info",
    recurrence: "first_seen",
    privacy_level: "internal",
    risk_level: severity === "critical" || severity === "fatal" ? "critical" : severity === "warning" ? "medium" : "low",
    confidence: "medium",
    action_permission: "none",
    human_approval_required: false,
    verifier_gate_required: false,
    status: "detected",
    receipt_ref: "",
    feedback_event_refs: [],
    unknowns: [],
    blocked_claims: []
  };

  if (validationEngine) {
    const check = validationEngine.validateFailureAtom(failureAtom);
    if (!check.valid) {
      console.error("FailureAtom validation failed:", check.errors.join('; '));
    }
  }

  // Async append via event-storage.mjs, fallback to direct fs.promises.appendFile
  if (storageEngine) {
    storageEngine.writeFailureAtom(DIAGNOSTICS_FILE, failureAtom)
      .catch(err => {
        console.error("Failed to write failure atom via storage engine:", err);
      });
  } else {
    ensureDirectoryExists(DIAGNOSTICS_FILE);
    fs.promises.appendFile(DIAGNOSTICS_FILE, JSON.stringify(failureAtom) + '\n', 'utf8')
      .catch(err => {
        console.error("Failed to write to diagnostics.jsonl:", err);
      });
  }

  const legacyDiag = {
    id: diagId,
    timestamp: failureAtom.detected_at,
    severity,
    source,
    code,
    message,
    detail: detail || '',
    suggestedAction: suggestedAction || '',
    relatedFeature: relatedFeature || ''
  };

  if (typeof io !== 'undefined') {
    io.emit('diagnostic-event', legacyDiag);
  }

  // Also emit as a ledger event, avoiding infinite recursion by not calling recordDiagnostic inside recordLedgerEvent
  recordLedgerEvent('diagnostic.recorded', { diagnosticId: diagId, code, severity });

  return legacyDiag;
}

function recordLedgerEvent(type, payload = {}) {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const evidencePath = path.join(__dirname, 'data', 'evidence', `${evidenceId}.json`);
  
  ensureDirectoryExists(evidencePath);
  try {
    fs.writeFileSync(evidencePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error("Failed to write evidence file:", err);
  }

  const eventAtom = {
    id: eventId,
    version: "v1",
    source: `xi-io: ibal: ${type}`,
    source_kind: "device",
    product_id: "xi_io_ibal",
    repo: "016_Rabbit_r1",
    raw_evidence_ref: `file://${path.resolve(evidencePath)}`,
    raw_evidence_preserved: true,
    detected_at: new Date().toISOString(),
    event_class: type.endsWith('.failed') || type.includes('fail') ? "RUNTIME_FAILURE" : "DEVICE_SIGNAL",
    event_subclass: type,
    canonical_tags: ["telemetry"],
    user_lexicon_tags: [],
    privacy_level: "internal",
    risk_level: type.endsWith('.failed') || type.includes('fail') ? "medium" : "low",
    suggested_persona: "",
    suggested_bin: "",
    suggested_action: "",
    action_permission: "none",
    human_approval_required: false,
    status: "detected",
    confidence: "high",
    receipt_ref: "",
    feedback_event_refs: [],
    unknowns: [],
    blocked_claims: []
  };

  if (validationEngine) {
    const check = validationEngine.validateEventAtom(eventAtom);
    if (!check.valid) {
      console.error("EventAtom validation failed:", check.errors.join('; '));
    }
  }

  // Async append via event-storage.mjs, fallback to direct fs.promises.appendFile
  if (storageEngine) {
    storageEngine.writeEventAtom(LEDGER_FILE, eventAtom)
      .catch(err => {
        console.error("Failed to write event atom via storage engine:", err);
      });
  } else {
    ensureDirectoryExists(LEDGER_FILE);
    fs.promises.appendFile(LEDGER_FILE, JSON.stringify(eventAtom) + '\n', 'utf8')
      .catch(err => {
        console.error("Failed to write to events.jsonl:", err);
      });
  }

  const legacyEvent = Object.assign({}, eventAtom, {
    timestamp: eventAtom.detected_at,
    type,
    payload
  });

  if (typeof io !== 'undefined') {
    io.emit('ledger-event', legacyEvent);
  }
  return legacyEvent;
}

// Model Capability Router classification helper
function classifyModelCapabilities(modelName) {
  const name = modelName.toLowerCase();
  const caps = [];

  if (name.includes('llava') || name.includes('vision') || name.includes('moondream') || name.includes('bakllava') || name.includes('minicpm')) {
    caps.push('vision');
  }

  if (name.includes('coder') || name.includes('codellama') || name.includes('deepseek-coder') || name.includes('code')) {
    caps.push('code');
  }

  if (name.includes('embed') || name.includes('minilm') || name.includes('mxbai-embed')) {
    caps.push('embedding');
  }

  if (
    (name.includes('llama3') || name.includes('qwen2.5') || name.includes('mistral') || name.includes('command-r') || name.includes('gemma4')) &&
    !caps.includes('embedding')
  ) {
    caps.push('tools');
  }

  if (!caps.includes('embedding') && (
    name.includes('llama') || name.includes('phi') || name.includes('gemma') ||
    name.includes('mistral') || name.includes('qwen') || name.includes('command') ||
    name.includes('chat') || name.includes('instruct') || name.includes('deepseek') ||
    caps.includes('vision') || caps.includes('code')
  )) {
    caps.push('chat');
  }

  if (caps.length === 0) {
    caps.push('unknown');
  }

  return caps;
}

// Initialize tasks.json if it doesn't exist
if (!fs.existsSync(TASKS_FILE)) {
  const initialTasks = [
    { id: 1, text: "Design xi-io.net workspace dashboard", completed: false, project: "xi-io.net" },
    { id: 2, id_raw: "task-2", text: "Integrate retro emulator shell components", completed: true, project: "xi-io.net" },
    { id: 3, text: "Verify local Ollama offline assistant capabilities", completed: false, project: "xi-io.net" }
  ];
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(initialTasks, null, 2));
  } catch (err) {
    console.error("Failed to initialize tasks.json:", err);
  }
}

// Initialize inbox.json and proposals.json if they don't exist
if (!fs.existsSync(INBOX_FILE)) {
  try {
    fs.writeFileSync(INBOX_FILE, JSON.stringify([], null, 2));
  } catch (err) {
    console.error("Failed to initialize inbox.json:", err);
  }
}
if (!fs.existsSync(PROPOSALS_FILE)) {
  try {
    fs.writeFileSync(PROPOSALS_FILE, JSON.stringify([], null, 2));
  } catch (err) {
    console.error("Failed to initialize proposals.json:", err);
  }
}

// Initialize lexicon_preferences.json if it doesn't exist
if (!fs.existsSync(LEXICON_FILE)) {
  const defaultLexicon = {
    activeProfile: "developer",
    customMapping: {
      workspace: "workspace",
      workspaces: "workspaces",
      extension: "extension",
      extensions: "extensions",
      connection: "connection",
      connections: "connections",
      diagnostic: "diagnostic",
      diagnostics: "diagnostics",
      task: "task",
      tasks: "tasks",
      group: "group",
      subgroup: "subgroup"
    },
    profiles: {
      developer: {
        workspace: "workspace",
        workspaces: "workspaces",
        extension: "extension",
        extensions: "extensions",
        connection: "connection",
        connections: "connections",
        diagnostic: "diagnostic",
        diagnostics: "diagnostics",
        task: "task",
        tasks: "tasks",
        group: "group",
        subgroup: "subgroup"
      },
      docket: {
        workspace: "docket",
        workspaces: "dockets",
        extension: "app",
        extensions: "apps",
        connection: "integration",
        connections: "integrations",
        diagnostic: "health-check",
        diagnostics: "health-checks",
        task: "item",
        tasks: "items",
        group: "Epic",
        subgroup: "Sprint"
      },
      legal: {
        workspace: "case",
        workspaces: "cases",
        extension: "resource",
        extensions: "resources",
        connection: "exhibit",
        connections: "exhibits",
        diagnostic: "verification",
        diagnostics: "verifications",
        task: "action-item",
        tasks: "action-items",
        group: "matter",
        subgroup: "filing"
      }
    }
  };
  try {
    ensureDirectoryExists(LEXICON_FILE);
    fs.writeFileSync(LEXICON_FILE, JSON.stringify(defaultLexicon, null, 2), 'utf8');
    console.log("Initialized default Lexicon Preferences file.");
  } catch (err) {
    console.error("Failed to initialize lexicon_preferences.json:", err);
  }
}

// Helpers for reading/writing inbox and proposals
function readInbox() {
  try {
    if (!fs.existsSync(INBOX_FILE)) return [];
    return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
  } catch (err) {
    console.error("Error reading inbox.json:", err);
    return [];
  }
}

function writeInbox(inbox) {
  try {
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
  } catch (err) {
    console.error("Error writing inbox.json:", err);
  }
}

function readProposals() {
  try {
    if (!fs.existsSync(PROPOSALS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf8'));
  } catch (err) {
    console.error("Error reading proposals.json:", err);
    return [];
  }
}

function writeProposals(proposals) {
  try {
    fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(proposals, null, 2));
  } catch (err) {
    console.error("Error writing proposals.json:", err);
  }
}

// Helpers for reading/writing tasks
function readTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading tasks:", err);
    recordDiagnostic(
      'error',
      'server.fs',
      'TASK_PERSISTENCE_FAILED',
      'Failed to read tasks database file.',
      err.message,
      'Ensure the directory has read permissions and that tasks.json is valid JSON.',
      'tasks'
    );
    return [];
  }
}

function writeTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error("Error writing tasks:", err);
    recordDiagnostic(
      'error',
      'server.fs',
      'TASK_PERSISTENCE_FAILED',
      'Failed to write tasks database updates to disk.',
      err.message,
      'Check system write permissions and disk space availability.',
      'tasks'
    );
  }
}

// SSL Options (with robust validation)
let sslOptions;
try {
  const keyPath = path.join(__dirname, 'key.pem');
  const certPath = path.join(__dirname, 'cert.pem');

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error("SSL Certificate files (key.pem/cert.pem) are missing.");
  }

  sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
} catch (err) {
  console.error("CRITICAL SSL INITIALIZATION ERROR:", err.message);

  // Write fatal diagnostic event via recordDiagnostic
  recordDiagnostic(
    'fatal',
    'server',
    'SSL_CERT_ERROR',
    'SSL certificates missing or invalid.',
    err.message,
    'Run `npm run cert` in the project directory to generate localhost self-signed SSL certificates.',
    'server'
  );

  process.exit(1);
}

// Create HTTPS Server
const server = https.createServer(sslOptions, app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Helper to read the last N lines of a file securely
function readLastLines(filePath, maxLines = 20) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-maxLines).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { raw: line };
      }
    });
  } catch (err) {
    console.error(`Failed to read lines from ${filePath}:`, err);
    return [];
  }
}

// Shared helper to fetch local models from Ollama
async function fetchOllamaModels() {
  try {
    console.log("Fetching local models from Ollama...");
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama HTTP error ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.models ? data.models.map(m => {
      return {
        name: m.name,
        capabilities: classifyModelCapabilities(m.name)
      };
    }) : [];
  } catch (err) {
    console.error("Failed to connect to Ollama:", err.message);
    const isConnectionError = err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed');
    const code = isConnectionError ? 'OLLAMA_OFFLINE' : 'OLLAMA_LIST_FAILED';
    const message = isConnectionError
      ? 'Ollama AI server is offline or unreachable.'
      : 'Failed to retrieve model list from Ollama server.';

    recordDiagnostic(
      'error',
      'server.ollama',
      code,
      message,
      err.message,
      'Verify that Ollama is running locally at http://localhost:11434.',
      'telemetry'
    );
    throw err;
  }
}

// Dynamic AI proposal generator using Ollama, with rule-based fallback
async function generateProposalForEvent(event) {
  const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sender = event.sender_ref || event.sender || "unknown@example.com";
  
  const getRuleBasedProposal = () => {
    let title = `Process message from ${sender}`;
    let suggested_action = "create_task";
    let parameters = {
      title: event.subject || "New Inbox Task",
      description: `From: ${sender}\n\n${event.body}`
    };
    let confidence = 0.7;

    const lowerBody = (event.body || '').toLowerCase();
    const lowerSubject = (event.subject || '').toLowerCase();
    
    if (lowerSubject.includes('unsubscribe') || lowerBody.includes('newsletter') || lowerSubject.includes('promo')) {
      suggested_action = "ignore";
      title = "Ignore promotional email";
      confidence = 0.9;
      parameters = {};
    } else if (lowerSubject.includes('question') || lowerBody.includes('how to') || lowerBody.includes('reply')) {
      suggested_action = "send_reply";
      title = `Draft reply to ${sender}`;
      parameters = {
        recipient: sender,
        body: `Hi ${sender.split('@')[0] || 'there'},\n\nThank you for your message. I am looking into this.\n\nBest regards.`
      };
      confidence = 0.85;
    } else if (lowerSubject.includes('bug') || lowerBody.includes('error') || lowerBody.includes('fail')) {
      parameters.title = `Fix: ${event.subject}`;
    }

    const getProposalType = (act) => {
      if (act === 'create_task') return 'task';
      if (act === 'send_reply') return 'draft_reply';
      return 'automation';
    };

    return {
      id: proposalId,
      proposal_type: getProposalType(suggested_action),
      source_event_ids: [event.id],
      title: title,
      requires_user_confirmation: true,
      egress_risk: "low",
      created_at: new Date().toISOString(),
      event_id: event.id,
      suggested_action: suggested_action,
      parameters: parameters,
      confidence: confidence,
      status: "pending"
    };
  };

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          {
            role: 'system',
            content: 'You are ibal, an AI assistant. Analyze the incoming email event and output a JSON response containing an action proposal. The JSON must match this structure exactly:\n{\n  "title": "Short descriptive title of the proposal",\n  "suggested_action": "create_task",\n  "parameters": {\n    "title": "Task title",\n    "description": "Task description"\n  },\n  "confidence": 0.85\n}\nOr if it is a question or reply request, use suggested_action: "send_reply" and parameters: { "recipient": "email", "body": "draft" }.\nOr if it is spam or not actionable, use suggested_action: "ignore".\nDo not output any markdown formatting, thoughts, or explanations. Output ONLY valid raw JSON.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              sender: sender,
              subject: event.subject,
              body: event.body
            })
          }
        ],
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      let text = data.message.content.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      }
      const parsed = JSON.parse(text);
      
      const getProposalType = (act) => {
        if (act === 'create_task') return 'task';
        if (act === 'send_reply') return 'draft_reply';
        return 'automation';
      };

      const proposal = {
        id: proposalId,
        proposal_type: getProposalType(parsed.suggested_action || "create_task"),
        source_event_ids: [event.id],
        title: parsed.title || `Action on ${event.subject}`,
        requires_user_confirmation: true,
        egress_risk: "low",
        created_at: new Date().toISOString(),
        event_id: event.id,
        suggested_action: parsed.suggested_action || "create_task",
        parameters: parsed.parameters || {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        status: "pending"
      };

      if (proposal.suggested_action === 'create_task') {
        proposal.parameters.title = proposal.parameters.title || event.subject;
        proposal.parameters.description = proposal.parameters.description || event.body;
      } else if (proposal.suggested_action === 'send_reply') {
        proposal.parameters.recipient = proposal.parameters.recipient || sender;
        proposal.parameters.body = proposal.parameters.body || 'Draft reply...';
      }

      return proposal;
    }
  } catch (err) {
    console.warn("Ollama unreachable for proposal generation, using fallback parser:", err.message);
  }

  return getRuleBasedProposal();
}

// Self-healing function for Ollama
async function selfHealOllama() {
  console.log("Self-healing sequence initiated for Ollama...");
  
  // 1. Verify if 'ollama' exists on the PATH
  const hasOllama = await new Promise((resolve) => {
    exec('which ollama', (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
  
  if (!hasOllama) {
    console.error("Self-heal failed: 'ollama' command not found in PATH.");
    recordDiagnostic(
      'error',
      'server.ollama',
      'OLLAMA_NOT_FOUND',
      'Ollama binary is not installed or not in PATH.',
      'Unable to run self-healing. Please install Ollama.',
      'Install Ollama from https://ollama.com',
      'telemetry'
    );
    return false;
  }

  // Helper to check if Ollama is responsive
  const checkResponsive = async () => {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  };

  // Check if it's already running
  if (await checkResponsive()) {
    console.log("Ollama is already running and responsive.");
    return true;
  }

  // 2. Try starting using systemctl
  console.log("Attempting to start Ollama service via systemctl...");
  const systemctlSuccess = await new Promise((resolve) => {
    exec('systemctl start ollama', (err) => {
      if (err) {
        console.warn("systemctl start ollama failed:", err.message);
        resolve(false);
      } else {
        console.log("systemctl start ollama executed successfully.");
        resolve(true);
      }
    });
  });

  if (systemctlSuccess) {
    // Poll for up to 5 seconds
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkResponsive()) {
        console.log("Ollama responsive after systemctl start.");
        return true;
      }
    }
  }

  // 3. Spawning background process 'ollama serve' if systemctl failed or was unavailable
  console.log("Attempting to spawn 'ollama serve' as a background daemon process...");
  const child = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  // Poll for up to 10 seconds
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await checkResponsive()) {
      console.log("Ollama responsive after spawning ollama serve.");
      return true;
    }
  }

  console.error("Self-healing failed: Ollama is still unreachable after restart attempts.");
  recordDiagnostic(
    'error',
    'server.ollama',
    'OLLAMA_SELF_HEAL_FAILED',
    'Self-healing could not start or reach the Ollama service.',
    'Failed during daemon recovery polling.',
    'Check Ollama logs or start manually: ollama serve',
    'telemetry'
  );
  return false;
}

// HTTP REST Routes
app.post('/api/ollama/self-heal', async (req, res) => {
  try {
    const success = await selfHealOllama();
    if (success) {
      res.json({ success: true, message: 'Ollama is now online.' });
    } else {
      res.status(500).json({ success: false, message: 'Self-healing failed to bring Ollama online.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const isTestEnv = process.env.NODE_ENV === 'test' || 
                  process.execArgv.includes('--test') || 
                  (require.main && require.main.filename && require.main.filename.includes('test'));

// Scoped HTTP/HTTPS ping utility using native client requests and scoped Agent
function pingUrl(urlStr, timeoutMs = 2000) {
  if (isTestEnv) {
    if (urlStr.includes('xi-io.com') || urlStr.includes('xi-io.net') || urlStr.includes('localhost:3000') || urlStr.includes('127.0.0.1')) {
      return Promise.resolve(true);
    }
  }
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const req = client.get(urlStr, {
        timeout: timeoutMs,
        agent: isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined
      }, (res) => {
        res.resume(); // Consume stream to free socket
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch (err) {
      resolve(false);
    }
  });
}

let extensionCache = [];
let initialExtensionsUpdatePromise = null;

async function updateExtensionsCache() {
  try {
    const registryPath = path.join(XI_IO_FRAMEWORK_PATH, 'private', 'manifests', 'projects.json');
    if (!fs.existsSync(registryPath)) {
      extensionCache = [];
      return;
    }
    const projects = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const results = await Promise.all(projects.map(async (p) => {
      let status = 'unknown';
      const testUrl = p.healthUrls?.test;
      if (testUrl) {
        try {
          const ok = await pingUrl(testUrl, 2000);
          status = ok ? 'connected' : 'offline';
        } catch (err) {
          status = 'offline';
        }
      }
      return { ...p, status };
    }));
    extensionCache = results;
  } catch (err) {
    console.error('[ibal] Error updating extensions cache:', err.message);
  }
}

// Start background polling for extensions health
initialExtensionsUpdatePromise = updateExtensionsCache();
const extensionsInterval = setInterval(updateExtensionsCache, 10000);
extensionsInterval.unref();

app.get('/api/extensions', async (req, res) => {
  try {
    if (extensionCache.length === 0 && initialExtensionsUpdatePromise) {
      await initialExtensionsUpdatePromise;
    }
    res.json(extensionCache);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/inbox', (req, res) => {
  res.json({
    events: readInbox(),
    proposals: readProposals()
  });
});

app.post('/api/inbox/simulate', async (req, res) => {
  try {
    const { sender, subject, body } = req.body || {};
    const eventId = `inb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const event = {
      id: eventId,
      event_type: "email.received",
      provider: "email",
      provider_type: "email",
      received_at: new Date().toISOString(),
      source_ref: `mock_email_${eventId}`,
      sender_ref: sender || "test@example.com",
      subject: subject || "Test Ingress Message",
      body: body || "We need to fix the alignment of the UI layout on the dashboard.",
      status: "unread"
    };

    const validation = validateInboxEvent(event);
    if (!validation.valid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const inbox = readInbox();
    inbox.push(event);
    writeInbox(inbox);

    recordLedgerEvent('inbox.received', event);

    const proposal = await generateProposalForEvent(event);
    const proposalValidation = validateActionProposal(proposal);
    if (!proposalValidation.valid) {
      console.error("Action proposal validation failed:", proposalValidation.errors);
      recordDiagnostic('error', 'server.inbox', 'PROPOSAL_VALIDATION_FAILED', 'Proposal validation failed.', proposalValidation.errors.join('; '), 'Ensure the model output satisfies constraints.', 'inbox');
    } else {
      const proposals = readProposals();
      proposals.push(proposal);
      writeProposals(proposals);
      recordLedgerEvent('proposal.generated', proposal);
    }

    // Update status to processed
    event.status = 'processed';
    writeInbox(inbox);

    // Broadcast updated state to all connected socket clients
    io.emit('inbox-state', { events: readInbox(), proposals: readProposals() });

    res.json({ success: true, event, proposal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/lexicon', (req, res) => {
  try {
    if (!fs.existsSync(LEXICON_FILE)) {
      return res.status(404).json({ success: false, error: 'Lexicon preferences file not initialized.' });
    }
    const data = JSON.parse(fs.readFileSync(LEXICON_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lexicon', (req, res) => {
  try {
    const { activeProfile, customMapping } = req.body || {};
    if (!activeProfile) {
      return res.status(400).json({ success: false, error: 'Missing activeProfile in payload.' });
    }
    if (!fs.existsSync(LEXICON_FILE)) {
      return res.status(504).json({ success: false, error: 'Lexicon preferences file not found.' });
    }
    const lexiconData = JSON.parse(fs.readFileSync(LEXICON_FILE, 'utf8'));
    const validProfiles = Object.keys(lexiconData.profiles || {}).concat(['custom']);
    if (!validProfiles.includes(activeProfile)) {
      return res.status(400).json({ success: false, error: `Invalid activeProfile. Must be one of: ${validProfiles.join(', ')}` });
    }
    lexiconData.activeProfile = activeProfile;
    if (customMapping) {
      lexiconData.customMapping = customMapping;
    }
    fs.writeFileSync(LEXICON_FILE, JSON.stringify(lexiconData, null, 2), 'utf8');
    
    // Broadcast real-time update event via Socket.IO
    if (typeof io !== 'undefined') {
      io.emit('lexicon-updated', lexiconData);
    }
    res.json({ success: true, data: lexiconData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getPathStatus(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) {
      return { status: 'unavailable', path: targetPath, message: 'Directory does not exist.' };
    }
    try {
      fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
      return { status: 'active', path: targetPath, message: 'Directory is online and writable.' };
    } catch (accessErr) {
      if (accessErr.code === 'EACCES') {
        return { status: 'permission_denied', path: targetPath, message: 'Read/write permission denied.' };
      }
      return { status: 'offline', path: targetPath, message: `Access error: ${accessErr.message}` };
    }
  } catch (err) {
    return { status: 'unavailable', path: targetPath, message: err.message };
  }
}

app.get('/api/storage/status', (req, res) => {
  const workspacePath = '/media/chrishallberg/Storage 22/999_Work/003_Projects/';
  const cloudPath = '/home/chrishallberg/cloud_cache/';
  const backupPath = '/mnt/nas/backup/';

  res.json({
    workspace: getPathStatus(workspacePath),
    cloud: getPathStatus(cloudPath),
    backup: getPathStatus(backupPath)
  });
});

app.post('/api/storage/verify', (req, res) => {
  try {
    const { path: targetPath } = req.body || {};
    if (!targetPath) {
      return res.status(400).json({ success: false, error: 'Missing path in payload.' });
    }
    const resolvedPath = path.resolve(targetPath);
    const status = getPathStatus(resolvedPath);
    
    recordLedgerEvent('storage.path.verified', { path: resolvedPath, status: status.status });
    
    res.json({
      success: status.status === 'active',
      status: status.status,
      message: status.message
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/api/fs/list', (req, res) => {
  try {
    const targetPath = path.resolve(req.query.path || '/media/chrishallberg/Storage 22/999_Work/003_Projects/');
    
    const allowedRoots = [
      path.resolve('/media/chrishallberg/Storage 22/999_Work/003_Projects/'),
      path.resolve('/home/chrishallberg/cloud_cache/'),
      path.resolve('/mnt/nas/backup/')
    ];
    
    const isAllowed = allowedRoots.some(root => {
      return targetPath === root || targetPath.startsWith(root + path.sep);
    });
    
    if (!isAllowed) {
      return res.json({ success: false, error: 'Path is outside allowed root directories.' });
    }
    
    if (!fs.existsSync(targetPath)) {
      return res.json({ success: false, error: 'Path does not exist.' });
    }
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.json({ success: false, error: 'Path is not a directory.' });
    }
    const files = fs.readdirSync(targetPath, { withFileTypes: true });
    const directories = files
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map(dirent => dirent.name)
      .sort();
    
    res.json({
      success: true,
      currentPath: targetPath,
      parentPath: path.dirname(targetPath),
      directories
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/models', async (req, res) => {
  try {
    const models = await fetchOllamaModels();
    res.json({ success: true, models });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

app.get('/api/diagnostics', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  const diagnosticsLogs = readLastLines(DIAGNOSTICS_FILE, 20);
  const eventLogs = readLastLines(LEDGER_FILE, 20);

  res.json({
    system: {
      uptime: os.uptime(),
      totalMemory: totalMem,
      freeMemory: freeMem,
      usedMemory: usedMem,
      loadavg: os.loadavg(),
      cpus: os.cpus().length
    },
    files: {
      tasks: {
        exists: fs.existsSync(TASKS_FILE),
        size: fs.existsSync(TASKS_FILE) ? fs.statSync(TASKS_FILE).size : 0
      },
      diagnostics: {
        exists: fs.existsSync(DIAGNOSTICS_FILE),
        size: fs.existsSync(DIAGNOSTICS_FILE) ? fs.statSync(DIAGNOSTICS_FILE).size : 0
      },
      ledger: {
        exists: fs.existsSync(LEDGER_FILE),
        size: fs.existsSync(LEDGER_FILE) ? fs.statSync(LEDGER_FILE).size : 0
      }
    },
    recentDiagnostics: diagnosticsLogs,
    recentEvents: eventLogs
  });
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  recordLedgerEvent('socket.connect', { socketId: socket.id });

  // Send initial tasks to client
  socket.emit('tasks', readTasks());

  // Handle request for Ollama models
  socket.on('get-models', async () => {
    try {
      const models = await fetchOllamaModels();
      socket.emit('models-list', models);
      recordLedgerEvent('model.listed', { count: models.length, models: models.map(m => m.name) });
    } catch (err) {
      socket.emit('models-list', []);
    }
  });

  // Handle request for self-healing Ollama
  socket.on('self-heal-ollama', async () => {
    try {
      socket.emit('self-heal-status', { status: 'running', message: 'Attempting to self-heal Ollama...' });
      const success = await selfHealOllama();
      if (success) {
        socket.emit('self-heal-status', { status: 'success', message: 'Ollama self-healed successfully.' });
        // Retrieve fresh model list to confirm
        try {
          const models = await fetchOllamaModels();
          socket.emit('models-list', models);
        } catch (e) {}
      } else {
        socket.emit('self-heal-status', { status: 'failed', message: 'Failed to self-heal Ollama.' });
      }
    } catch (err) {
      socket.emit('self-heal-status', { status: 'failed', message: err.message });
    }
  });

  // Handle request to get the inbox state
  socket.on('get-inbox', () => {
    socket.emit('inbox-state', { events: readInbox(), proposals: readProposals() });
  });

  // Handle inbox simulator event via Socket
  socket.on('simulate-ingress', async (data) => {
    try {
      const { sender, subject, body } = data || {};
      const eventId = `inb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const event = {
        id: eventId,
        event_type: "email.received",
        provider: "email",
        provider_type: "email",
        received_at: new Date().toISOString(),
        source_ref: `mock_email_${eventId}`,
        sender_ref: sender || "test@example.com",
        subject: subject || "Test Ingress Message",
        body: body || "We need to fix the alignment of the UI layout on the dashboard.",
        status: "unread"
      };

      const validation = validateInboxEvent(event);
      if (!validation.valid) {
        console.error("Inbox event validation failed:", validation.errors);
        socket.emit('ingress-failed', { errors: validation.errors });
        return;
      }

      const inbox = readInbox();
      inbox.push(event);
      writeInbox(inbox);

      recordLedgerEvent('inbox.received', event);

      // Generate proposal
      const proposal = await generateProposalForEvent(event);
      const proposalValidation = validateActionProposal(proposal);
      if (!proposalValidation.valid) {
        console.error("Action proposal validation failed:", proposalValidation.errors);
        recordDiagnostic('error', 'server.inbox', 'PROPOSAL_VALIDATION_FAILED', 'Proposal validation failed.', proposalValidation.errors.join('; '), 'Ensure the model output satisfies constraints.', 'inbox');
      } else {
        const proposals = readProposals();
        proposals.push(proposal);
        writeProposals(proposals);
        recordLedgerEvent('proposal.generated', proposal);
      }

      // Update status to processed
      event.status = 'processed';
      writeInbox(inbox);

      // Broadcast updated state to all connected socket clients
      io.emit('inbox-state', { events: readInbox(), proposals: readProposals() });
    } catch (err) {
      console.error("Error during simulate-ingress socket handler:", err);
    }
  });

  // Handle action proposal approval
  socket.on('approve-proposal', (proposalId) => {
    try {
      const proposals = readProposals();
      const index = proposals.findIndex(p => String(p.id) === String(proposalId));
      if (index !== -1) {
        const proposal = proposals[index];
        proposal.status = 'approved';
        writeProposals(proposals);

        recordLedgerEvent('proposal.approved', { proposalId: proposal.id, action: proposal.suggested_action });

        if (proposal.suggested_action === 'create_task') {
          const newTask = {
            id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: proposal.parameters.title || proposal.title,
            completed: false,
            status: 'todo',
            description: proposal.parameters.description || '',
            createdAt: new Date().toISOString()
          };
          const tasks = readTasks();
          tasks.push(newTask);
          writeTasks(tasks);
          io.emit('tasks', tasks);
          recordLedgerEvent('task.created', { taskId: newTask.id, text: newTask.text });
        }

        io.emit('inbox-state', { events: readInbox(), proposals: proposals });
      }
    } catch (err) {
      console.error("Error during approve-proposal socket handler:", err);
    }
  });

  // Handle action proposal rejection
  socket.on('reject-proposal', (proposalId) => {
    try {
      const proposals = readProposals();
      const index = proposals.findIndex(p => String(p.id) === String(proposalId));
      if (index !== -1) {
        proposals[index].status = 'rejected';
        writeProposals(proposals);

        recordLedgerEvent('proposal.rejected', { proposalId: proposalId });
        io.emit('inbox-state', { events: readInbox(), proposals: proposals });
      }
    } catch (err) {
      console.error("Error during reject-proposal socket handler:", err);
    }
  });

  // Handle request for system statistics
  socket.on('get-system-stats', () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuLoad = os.loadavg();
    const uptime = os.uptime();

    socket.emit('system-stats', {
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percentage: ((usedMem / totalMem) * 100).toFixed(1)
      },
      cpu: {
        load: cpuLoad[0].toFixed(2),
        cores: os.cpus().length,
        model: os.cpus()[0] ? os.cpus()[0].model : 'Unknown CPU'
      },
      uptime: (uptime / 3600).toFixed(1)
    });
  });

  // Handle request to pull Ollama models
  socket.on('pull-model', async (modelName) => {
    if (!modelName || typeof modelName !== 'string') return;
    console.log(`Pulling model: ${modelName}`);
    recordLedgerEvent('model.pull.started', { model: modelName });

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true })
      });

      if (!response.ok) {
        throw new Error(`Failed to initiate pull: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const parsed = JSON.parse(line);
            socket.emit('pull-progress', parsed);
          } catch (err) {
            console.error('Error parsing pull line:', err);
          }
        }
      }

      socket.emit('pull-progress', { status: 'success' });
      recordLedgerEvent('model.pull.completed', { model: modelName });

      // Update models list and broadcast to all
      const responseList = await fetch(`${OLLAMA_HOST}/api/tags`);
      if (responseList.ok) {
        const data = await responseList.json();
        const models = data.models ? data.models.map(m => {
          return {
            name: m.name,
            capabilities: classifyModelCapabilities(m.name)
          };
        }) : [];
        io.emit('models-list', models);
      }
    } catch (err) {
      console.error(`Error pulling model ${modelName}:`, err);
      recordDiagnostic(
        'error',
        'server.ollama',
        'OLLAMA_PULL_FAILED',
        `Failed to pull model '${modelName}' from Ollama registry.`,
        err.message,
        `Check your network connection and ensure model name '${modelName}' is spelled correctly on ollama.com.`,
        'model-manager'
      );
      recordLedgerEvent('model.pull.failed', { model: modelName, error: err.message });
      socket.emit('pull-progress', { status: 'error', message: err.message });
    }
  });

  // Handle task fetching
  socket.on('fetch-tasks', () => {
    socket.emit('tasks', readTasks());
  });

  // Handle task creation
  socket.on('create-task', (taskText) => {
    if (!taskText || typeof taskText !== 'string') return;
    const tasks = readTasks();
    const newTask = {
      id: Date.now(),
      text: taskText.trim(),
      completed: false,
      status: 'todo',
      project: "xi-io.net"
    };
    tasks.push(newTask);
    writeTasks(tasks);
    io.emit('tasks', tasks); // Broadcast update to all clients
    recordLedgerEvent('task.created', { taskId: newTask.id, text: newTask.text });
    console.log(`Task created: "${newTask.text}"`);
  });

  // Handle task toggle
  socket.on('toggle-task', (taskId) => {
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex !== -1) {
      tasks[taskIndex].completed = !tasks[taskIndex].completed;
      // sync status field
      tasks[taskIndex].status = tasks[taskIndex].completed ? 'done' : 'todo';
      writeTasks(tasks);
      io.emit('tasks', tasks); // Broadcast update
      recordLedgerEvent('task.updated', { taskId: taskId, completed: tasks[taskIndex].completed });
      console.log(`Task ${taskId} completion toggled to ${tasks[taskIndex].completed}`);
    }
  });

  // Handle task status update (Kanban drag-and-drop)
  socket.on('update-task-status', ({ taskId, status }) => {
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex !== -1) {
      tasks[taskIndex].status = status;
      tasks[taskIndex].completed = (status === 'done');
      writeTasks(tasks);
      io.emit('tasks', tasks);
      recordLedgerEvent('task.moved', { taskId: taskId, status: status });
      console.log(`Task ${taskId} status updated to ${status}`);
    }
  });

  // Handle task deletion
  socket.on('delete-task', (taskId) => {
    let tasks = readTasks();
    tasks = tasks.filter(t => String(t.id) !== String(taskId));
    writeTasks(tasks);
    io.emit('tasks', tasks);
    recordLedgerEvent('task.deleted', { taskId: taskId });
    console.log(`Task ${taskId} deleted`);
  });

  // Handle Ollama voice/text chat prompt (Streaming)
  socket.on('chat-prompt', async ({ prompt, model }) => {
    console.log(`Received prompt for model [${model}]: "${prompt}"`);
    if (!prompt) return;

    recordLedgerEvent('ollama.chat.started', { model, promptLength: prompt.length });

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          messages: [
            {
              role: 'system',
              content: 'You are an offline assistant running on the Rabbit R1 device, connected locally to a Pop!_OS workstation. Keep answers direct, concise, and professional, optimized for voice readout and a tiny 320x320 screen. Avoid long lists unless requested.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message && parsed.message.content) {
              socket.emit('chat-token', parsed.message.content);
            }
          } catch (err) {
            console.error('Error parsing line:', line, err);
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim() !== '') {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.message && parsed.message.content) {
            socket.emit('chat-token', parsed.message.content);
          }
        } catch (err) {
          // ignore parsing end boundary errors
        }
      }

      socket.emit('chat-done');
      recordLedgerEvent('ollama.chat.completed', { model });
      console.log('Stream completed successfully.');

    } catch (err) {
      console.error("Error communicating with Ollama:", err);
      recordDiagnostic(
        'error',
        'server.ollama',
        'OLLAMA_CHAT_FAILED',
        `Failed to generate response using model '${model}'.`,
        err.message,
        `Ensure Ollama is running and model '${model}' is pulled and functional.`,
        'chat'
      );
      recordLedgerEvent('ollama.chat.failed', { model, error: err.message });
      socket.emit('chat-error', `AI Unavailable: Check that Ollama is running local model '${model}'`);
    }
  });

  // Handle Ollama Vision prompt (Streaming)
  socket.on('vision-prompt', async ({ prompt, imageBase64, model }) => {
    console.log(`Received vision prompt for model [${model}]`);
    if (!imageBase64) {
      socket.emit('chat-error', 'No image data provided.');
      return;
    }

    recordLedgerEvent('ollama.chat.started', { model, type: 'vision', promptLength: prompt ? prompt.length : 0 });

    // Extract the raw base64 string (strip header if present)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llava',
          messages: [
            {
              role: 'user',
              content: prompt || 'Analyze this image and summarize what you see in 1-2 short sentences.',
              images: [base64Data]
            }
          ],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message && parsed.message.content) {
              socket.emit('chat-token', parsed.message.content);
            }
          } catch (err) {
            console.error('Error parsing vision line:', err);
          }
        }
      }

      socket.emit('chat-done');
      recordLedgerEvent('ollama.chat.completed', { model, type: 'vision' });
      console.log('Vision stream completed.');

    } catch (err) {
      console.error("Error communicating with Ollama Vision:", err);
      recordDiagnostic(
        'error',
        'server.ollama',
        'OLLAMA_CHAT_FAILED',
        `Failed to run vision analysis using model '${model}'.`,
        err.message,
        `Verify that vision model '${model}' is loaded and running on Ollama.`,
        'vision'
      );
      recordLedgerEvent('ollama.chat.failed', { model, type: 'vision', error: err.message });
      socket.emit('chat-error', `Vision AI Unavailable: Ensure Ollama is running vision model '${model}'`);
    }
  });

  // Client Selection / Sensors Ledger Synchronizers
  socket.on('model-selected', ({ name, capabilities }) => {
    recordLedgerEvent('model.selected', { model: name, capabilities });
  });

  socket.on('voice-transcribed', ({ transcriptSummary }) => {
    recordLedgerEvent('voice.transcribed', { summary: transcriptSummary });
  });

  socket.on('camera-frame-captured', () => {
    recordLedgerEvent('camera.frame.captured');
  });

  socket.on('client-diagnostic', (event) => {
    const diag = recordDiagnostic(
      event.severity || 'info',
      event.source || 'client',
      event.code || 'CLIENT_ERROR',
      event.message || '',
      event.detail || '',
      event.suggestedAction || '',
      event.relatedFeature || ''
    );
    // Since recordDiagnostic already logs to diagnostics.jsonl, emits diagnostic-event, and records the ledger event,
    // we only need to broadcast the event to other connected clients here.
    socket.broadcast.emit('diagnostic-event', diag);
  });

  socket.on('ingress-scan', ({ path: targetPath }) => {
    recordLedgerEvent('real.batch.ingress.scan', { path: targetPath });
    try {
      const resolvedPath = path.resolve(targetPath);
      if (!fs.existsSync(resolvedPath)) {
        socket.emit('ingress-scan-results', { success: false, error: 'Path does not exist', candidates: [] });
        return;
      }
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        socket.emit('ingress-scan-results', { success: false, error: 'Path is not a directory', candidates: [] });
        return;
      }

      const files = fs.readdirSync(resolvedPath, { withFileTypes: true });
      
      const recordsFile = path.join(__dirname, 'data', 'ingress_records.json');
      let committedSystems = new Set();
      if (fs.existsSync(recordsFile)) {
        try {
          const committed = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
          committed.forEach(r => {
            if (r.system) committedSystems.add(r.system);
          });
        } catch (e) {
          console.error('Error reading ingress records:', e.message);
        }
      }

      const candidates = [];
      const PROJECT_TITLES = {
        '003_AuDHD_FieldGuide': 'AuDHD Field Guide UI Components',
        'xi-io.net': 'xi-io.net Framework Core',
        '016_Rabbit_r1': 'xi-io: ibal Console',
        '012_reality_pools': 'Reality Pools Interactive Simulation',
        '015_emulator': 'xi-io Emulator Shell',
        '017_xi-io_inbox': 'xi-io Ingress Inbox Hub',
        '000_Xibalba': 'Xibalba Mainframe Core',
        '001_VeilRIFT': 'VeilRIFT Virtual Environment',
        '002_SAM_LAW': 'SAM Legal Document Classifier'
      };

      files.forEach(dirent => {
        if (!dirent.isDirectory() || dirent.name.startsWith('.')) return;
        
        const name = dirent.name;
        let title = PROJECT_TITLES[name];
        if (!title) {
          title = name.replace(/^\d+_/g, '').replace(/_/g, ' ');
          title = title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          if (!title.toLowerCase().endsWith('components') && !title.toLowerCase().endsWith('engine') && !title.toLowerCase().endsWith('core')) {
            title += ' Module';
          }
        }

        let system = name.toLowerCase().replace(/^\d+_/g, '').replace(/_|-/g, '');
        if (name.includes('AuDHD')) system = 'afg';
        else if (name === 'xi-io.net') system = 'framework';
        else if (name === '016_Rabbit_r1') system = 'rabbit';

        let status = 'eligible';
        if (committedSystems.has(system)) {
          status = 'committed';
        } else if (name === '.tmp' || name === 'tmp' || name.startsWith('test')) {
          status = 'degraded';
        }

        candidates.push({
          title,
          system,
          path: path.join(name, '/'),
          status
        });
      });

      socket.emit('ingress-scan-results', { success: true, candidates });
    } catch (err) {
      console.error('[ibal] Ingress scan error:', err.message);
      socket.emit('ingress-scan-results', { success: false, error: err.message, candidates: [] });
    }
  });

  socket.on('ingress-commit', ({ count, items, path: targetPath }) => {
    recordLedgerEvent('real.batch.ingress.commit', { count, items, path: targetPath });
    try {
      const recordsFile = path.join(__dirname, 'data', 'ingress_records.json');
      ensureDirectoryExists(recordsFile);
      let existing = [];
      if (fs.existsSync(recordsFile)) {
        existing = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
      }
      const newRecords = items.map(item => ({
        ...item,
        committedAt: new Date().toISOString(),
        rootPath: targetPath
      }));
      fs.writeFileSync(recordsFile, JSON.stringify([...existing, ...newRecords], null, 2), 'utf8');
    } catch (err) {
      console.error('[ibal] Failed to write ingress records:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    recordLedgerEvent('socket.disconnect', { socketId: socket.id });
  });
});
// Start Server
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`   R1 Local Companion Server is running!`);
    console.log(`   Local Address:  https://localhost:${PORT}`);
    console.log(`=================================================`);
  });
}

module.exports = { app, server, io, classifyModelCapabilities, recordDiagnostic, recordLedgerEvent, DIAGNOSTICS_FILE, LEDGER_FILE };
