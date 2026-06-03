const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

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

// Path to tasks storage
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const DIAGNOSTICS_FILE = path.join(__dirname, 'data', 'diagnostics.jsonl');
const LEDGER_FILE = path.join(__dirname, 'data', 'events.jsonl');

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure data folder exists
ensureDirectoryExists(DIAGNOSTICS_FILE);

// Helpers for Recording Diagnostics and Ledger Events
function recordDiagnostic(severity, source, code, message, detail, suggestedAction, relatedFeature) {
  const event = {
    id: `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    severity,
    source,
    code,
    message,
    detail: detail || '',
    suggestedAction: suggestedAction || '',
    relatedFeature: relatedFeature || ''
  };

  ensureDirectoryExists(DIAGNOSTICS_FILE);
  try {
    fs.appendFileSync(DIAGNOSTICS_FILE, JSON.stringify(event) + '\n');
  } catch (err) {
    console.error("Failed to write to diagnostics.jsonl:", err);
  }

  if (typeof io !== 'undefined') {
    io.emit('diagnostic-event', event);
  }

  // Also emit as a ledger event, avoiding infinite recursion by not calling recordDiagnostic inside recordLedgerEvent
  recordLedgerEvent('diagnostic.recorded', { diagnosticId: event.id, code: event.code, severity: event.severity });

  return event;
}

function recordLedgerEvent(type, payload = {}) {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type,
    payload
  };

  ensureDirectoryExists(LEDGER_FILE);
  try {
    fs.appendFileSync(LEDGER_FILE, JSON.stringify(event) + '\n');
  } catch (err) {
    console.error("Failed to write to events.jsonl:", err);
  }

  if (typeof io !== 'undefined') {
    io.emit('ledger-event', event);
  }
  return event;
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
    (name.includes('llama3') || name.includes('qwen2.5') || name.includes('mistral') || name.includes('command-r')) &&
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

  // Write fatal diagnostic event directly to disk
  const event = {
    id: `diag_${Date.now()}_startup`,
    timestamp: new Date().toISOString(),
    severity: 'fatal',
    source: 'server',
    code: 'SSL_CERT_ERROR',
    message: 'SSL certificates missing or invalid.',
    detail: err.message,
    suggestedAction: 'Run `npm run cert` in the project directory to generate localhost self-signed SSL certificates.',
    relatedFeature: 'server'
  };

  ensureDirectoryExists(DIAGNOSTICS_FILE);
  fs.appendFileSync(DIAGNOSTICS_FILE, JSON.stringify(event) + '\n');

  process.exit(1);
}

// Create HTTPS Server
const server = https.createServer(sslOptions, app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// HTTP REST Routes
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  recordLedgerEvent('socket.connect', { socketId: socket.id });

  // Send initial tasks to client
  socket.emit('tasks', readTasks());

  // Handle request for Ollama models
  socket.on('get-models', async () => {
    try {
      console.log("Fetching local models from Ollama...");
      const response = await fetch(`${OLLAMA_HOST}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama HTTP error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const models = data.models ? data.models.map(m => {
        return {
          name: m.name,
          capabilities: classifyModelCapabilities(m.name)
        };
      }) : [];
      socket.emit('models-list', models);
      recordLedgerEvent('model.listed', { count: models.length, models: models.map(m => m.name) });
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
      socket.emit('models-list', []);
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
    const taskIndex = tasks.findIndex(t => t.id === taskId);
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
    const taskIndex = tasks.findIndex(t => t.id === taskId);
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
    tasks = tasks.filter(t => t.id !== taskId);
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
    event.id = event.id || `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    event.timestamp = event.timestamp || new Date().toISOString();

    ensureDirectoryExists(DIAGNOSTICS_FILE);
    try {
      fs.appendFileSync(DIAGNOSTICS_FILE, JSON.stringify(event) + '\n');
    } catch (err) {
      console.error("Failed to write client diagnostic to disk:", err);
    }

    socket.broadcast.emit('diagnostic-event', event);
    recordLedgerEvent('diagnostic.recorded', { diagnosticId: event.id, code: event.code, severity: event.severity, source: event.source });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    recordLedgerEvent('socket.disconnect', { socketId: socket.id });
  });
});
// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`   R1 Local Companion Server is running!`);
  console.log(`   Local Address:  https://localhost:${PORT}`);
  console.log(`=================================================`);
});
