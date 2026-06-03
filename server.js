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

// Initialize tasks.json if it doesn't exist
if (!fs.existsSync(TASKS_FILE)) {
  const initialTasks = [
    { id: 1, text: "Design xi-io.net workspace dashboard", completed: false, project: "xi-io.net" },
    { id: 2, id_raw: "task-2", text: "Integrate retro emulator shell components", completed: true, project: "xi-io.net" },
    { id: 3, text: "Verify local Ollama offline assistant capabilities", completed: false, project: "xi-io.net" }
  ];
  fs.writeFileSync(TASKS_FILE, JSON.stringify(initialTasks, null, 2));
}

// Helpers for reading/writing tasks
function readTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading tasks:", err);
    return [];
  }
}

function writeTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error("Error writing tasks:", err);
  }
}

// SSL Options (from generated key/cert)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

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
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial tasks to client
  socket.emit('tasks', readTasks());

  // Handle request for Ollama models
  socket.on('get-models', async () => {
    try {
      console.log("Fetching local models from Ollama...");
      const response = await fetch(`${OLLAMA_HOST}/api/tags`);
      if (!response.ok) throw new Error(`Ollama HTTP error ${response.status}`);
      const data = await response.json();
      const models = data.models ? data.models.map(m => m.name) : [];
      socket.emit('models-list', models);
    } catch (err) {
      console.error("Failed to connect to Ollama:", err.message);
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
      
      // Update models list and broadcast to all
      const responseList = await fetch(`${OLLAMA_HOST}/api/tags`);
      const data = await responseList.json();
      const models = data.models ? data.models.map(m => m.name) : [];
      io.emit('models-list', models);
    } catch (err) {
      console.error(`Error pulling model ${modelName}:`, err);
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
      console.log(`Task ${taskId} status updated to ${status}`);
    }
  });

  // Handle task deletion
  socket.on('delete-task', (taskId) => {
    let tasks = readTasks();
    tasks = tasks.filter(t => t.id !== taskId);
    writeTasks(tasks);
    io.emit('tasks', tasks);
    console.log(`Task ${taskId} deleted`);
  });

  // Handle Ollama voice/text chat prompt (Streaming)
  socket.on('chat-prompt', async ({ prompt, model }) => {
    console.log(`Received prompt for model [${model}]: "${prompt}"`);
    if (!prompt) return;

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
      console.log('Stream completed successfully.');

    } catch (err) {
      console.error("Error communicating with Ollama:", err);
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
      console.log('Vision stream completed.');

    } catch (err) {
      console.error("Error communicating with Ollama Vision:", err);
      socket.emit('chat-error', `Vision AI Unavailable: Ensure Ollama is running vision model '${model}'`);
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`   R1 Local Companion Server is running!`);
  console.log(`   Local Address:  https://localhost:${PORT}`);
  console.log(`=================================================`);
});
