// Establish WebSocket connection via Socket.io
const socket = io();

// R1 Screen UI Elements
const connDot = document.getElementById('conn-dot');
const statusText = document.getElementById('status-text');
const screens = document.querySelectorAll('.screen');
const navDots = document.querySelectorAll('.nav-dot');
const modelSelect = document.getElementById('model-select');
const taskBadge = document.getElementById('task-badge');
const tasksContainer = document.getElementById('tasks-scroll-container');
const chatOutput = document.getElementById('chat-output');
const pttBtn = document.getElementById('ptt-btn');
const visualizerBars = document.querySelectorAll('#visualizer-container .bar');
const videoFeed = document.getElementById('camera-feed');
const photoCanvas = document.getElementById('photo-canvas');
const captureBtn = document.getElementById('capture-btn');
const visionResult = document.getElementById('vision-result');
const newTaskInput = document.getElementById('new-task-input');
const addTaskBtn = document.getElementById('add-task-btn');

// Desktop Workspace UI Elements
const cpuValue = document.getElementById('cpu-value');
const cpuDetail = document.getElementById('cpu-detail');
const ramValue = document.getElementById('ram-value');
const ramDetail = document.getElementById('ram-detail');
const uptimeValue = document.getElementById('uptime-value');
const ollamaStatus = document.getElementById('ollama-status');
const activeModelDisplay = document.getElementById('active-model-display');

const pullModelInput = document.getElementById('pull-model-input');
const pullModelBtn = document.getElementById('pull-model-btn');
const pullProgressContainer = document.getElementById('pull-progress-container');
const pullProgressBar = document.getElementById('pull-progress-bar');
const pullProgressText = document.getElementById('pull-progress-text');
const desktopModelSelect = document.getElementById('desktop-model-select');

const cardsTodo = document.getElementById('cards-todo');
const cardsProgress = document.getElementById('cards-progress');
const cardsDone = document.getElementById('cards-done');
const kanbanNewTask = document.getElementById('kanban-new-task');
const kanbanAddBtn = document.getElementById('kanban-add-btn');

const logsContainer = document.getElementById('logs-container');

// Physical Simulator UI Elements
const physicalPtt = document.getElementById('physical-ptt');
const r1CameraEye = document.getElementById('r1-camera-eye');
const wheelUpBtn = document.getElementById('wheel-up-btn');
const wheelDownBtn = document.getElementById('wheel-down-btn');
const r1ScrollWheel = document.getElementById('r1-scroll-wheel');

// App State
let activeScreen = 'screen-dashboard';
let currentMenuIndex = 0;
let currentTaskIndex = -1;
let tasksList = [];
let localModels = ['llama3', 'phi3', 'llava'];
let selectedModel = 'llama3';
let isRecording = false;
let isStreamingAI = false;
let cameraStream = null;
let ridgesRotation = 0;

// Speech Recognition & Synthesis Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let speechUtterance = null;

// Service Logger Helper
function logActivity(message, type = 'system') {
  if (!logsContainer) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logsContainer.appendChild(entry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    pttBtn.textContent = "LISTENING...";
    pttBtn.classList.add('recording');
    chatOutput.textContent = "Listening...";
    startVisualizer();
    logActivity("Voice input capture started.", "system");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    logActivity(`Speech recognized: "${transcript}"`, "user");
    chatOutput.textContent = `You: "${transcript}"\n\nAI: `;
    sendChatPrompt(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    chatOutput.textContent = `Speech Error: ${event.error}. Please try again.`;
    logActivity(`Speech recognition error: ${event.error}`, "system");
    stopVisualizer();
  };

  recognition.onend = () => {
    isRecording = false;
    if (pttBtn.textContent === "LISTENING...") {
      pttBtn.textContent = "PUSH TO TALK";
      pttBtn.classList.remove('recording');
    }
    stopVisualizer();
  };
} else {
  console.warn("Web Speech API not supported in this browser.");
}

// Visualizer animation
let visualizerInterval = null;
function startVisualizer() {
  if (visualizerInterval) clearInterval(visualizerInterval);
  visualizerInterval = setInterval(() => {
    visualizerBars.forEach(bar => {
      const height = Math.floor(Math.random() * 15) + 3;
      bar.style.height = `${height}px`;
    });
  }, 100);
}

function stopVisualizer() {
  if (visualizerInterval) {
    clearInterval(visualizerInterval);
    visualizerInterval = null;
  }
  visualizerBars.forEach(bar => {
    bar.style.height = '2px';
  });
}

// ----------------- Socket.io Events -----------------

socket.on('connect', () => {
  connDot.className = 'dot connected';
  statusText.textContent = 'CONNECTED';
  logActivity("WebSocket connected to workstation.", "socket");
  socket.emit('get-models');
});

socket.on('disconnect', () => {
  connDot.className = 'dot disconnected';
  statusText.textContent = 'DISCONNECTED';
  logActivity("WebSocket disconnected.", "socket");
});

// Update models list
socket.on('models-list', (models) => {
  if (models && models.length > 0) {
    localModels = models;
    modelSelect.innerHTML = '';
    desktopModelSelect.innerHTML = '';
    
    models.forEach(model => {
      const opt1 = document.createElement('option');
      opt1.value = model;
      opt1.textContent = model;
      
      const opt2 = document.createElement('option');
      opt2.value = model;
      opt2.textContent = model;

      // Default to llama3 or phi3 if found
      if (model.includes('llama3') || model.includes('phi3') || model.includes('llava')) {
        opt1.selected = true;
        opt2.selected = true;
        selectedModel = model;
      }
      modelSelect.appendChild(opt1);
      desktopModelSelect.appendChild(opt2);
    });
    
    ollamaStatus.textContent = 'ONLINE';
    ollamaStatus.style.color = 'var(--color-green)';
    activeModelDisplay.textContent = selectedModel;
    logActivity(`Ollama tags loaded: ${models.join(', ')}`, "system");
  } else {
    ollamaStatus.textContent = 'OFFLINE';
    ollamaStatus.style.color = 'var(--color-red)';
    activeModelDisplay.textContent = 'No models found';
    logActivity("Ollama offline or no local models found.", "system");
  }
});

// System Stats Response
socket.on('system-stats', (stats) => {
  if (cpuValue) cpuValue.textContent = `${stats.cpu.load}%`;
  if (cpuDetail) cpuDetail.textContent = `${stats.cpu.cores} Cores - ${stats.cpu.model}`;
  if (ramValue) ramValue.textContent = `${stats.memory.percentage}%`;
  if (ramDetail) {
    const usedGb = (stats.memory.used / (1024 * 1024 * 1024)).toFixed(1);
    const totalGb = (stats.memory.total / (1024 * 1024 * 1024)).toFixed(1);
    ramDetail.textContent = `${usedGb} / ${totalGb} GB`;
  }
  if (uptimeValue) uptimeValue.textContent = `${stats.uptime}h`;
});

// Model Pull Progress
socket.on('pull-progress', (data) => {
  if (data.status === 'success') {
    pullProgressContainer.classList.add('hidden');
    pullModelInput.value = '';
    logActivity("Model download complete and loaded.", "system");
  } else if (data.status === 'error') {
    pullProgressContainer.classList.add('hidden');
    logActivity(`Pull failed: ${data.message}`, "system");
  } else if (data.completed && data.total) {
    const pct = ((data.completed / data.total) * 100).toFixed(1);
    pullProgressBar.style.width = `${pct}%`;
    pullProgressText.textContent = `Downloading: ${pct}% (${data.status})`;
  } else {
    pullProgressText.textContent = data.status || 'Processing...';
  }
});

// Handle incoming task list updates
socket.on('tasks', (tasks) => {
  tasksList = tasks;
  const pendingCount = tasks.filter(t => !t.completed).length;
  taskBadge.textContent = pendingCount;

  // Render R1 Pocket view tasks
  tasksContainer.innerHTML = '';
  if (tasks.length === 0) {
    tasksContainer.innerHTML = '<div class="loading-text">No tasks. Create one!</div>';
  } else {
    tasks.forEach((task, index) => {
      const card = document.createElement('div');
      card.className = `task-card ${task.completed ? 'completed' : ''} ${index === currentTaskIndex ? 'active' : ''}`;
      card.id = `task-${task.id}`;
      card.innerHTML = `
        <div class="task-checkbox" onclick="toggleTask(${task.id})"></div>
        <div class="task-text">${task.text}</div>
      `;
      tasksContainer.appendChild(card);
    });
  }

  // Render Kanban Board columns
  cardsTodo.innerHTML = '';
  cardsProgress.innerHTML = '';
  cardsDone.innerHTML = '';

  tasks.forEach(task => {
    const status = task.status || (task.completed ? 'done' : 'todo');
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.id = `kanban-${task.id}`;
    card.innerHTML = `
      <span>${task.text}</span>
      <button class="delete-card-btn" onclick="deleteTask(${task.id})">×</button>
    `;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', task.id);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    if (status === 'todo') {
      cardsTodo.appendChild(card);
    } else if (status === 'progress') {
      cardsProgress.appendChild(card);
    } else {
      cardsDone.appendChild(card);
    }
  });

  logActivity(`Tasks sync'd: ${tasks.length} total tasks.`, "socket");
});

// Stream AI response text
socket.on('chat-token', (token) => {
  if (!isStreamingAI) {
    isStreamingAI = true;
    logActivity("AI stream response started.", "ai");
    // Clear initial state
    if (activeScreen === 'screen-chat') {
      const promptText = chatOutput.textContent;
      if (promptText.includes('You:')) {
        const userPart = promptText.split('AI: ')[0];
        chatOutput.textContent = userPart + 'AI: ';
      } else {
        chatOutput.textContent = 'AI: ';
      }
    } else if (activeScreen === 'screen-camera') {
      visionResult.classList.remove('hidden');
      visionResult.textContent = 'Scanning...';
    }
  }

  if (activeScreen === 'screen-chat') {
    chatOutput.textContent += token;
    chatOutput.scrollTop = chatOutput.scrollHeight;
  } else if (activeScreen === 'screen-camera') {
    if (visionResult.textContent === 'Scanning...') visionResult.textContent = '';
    visionResult.textContent += token;
  }
});

socket.on('chat-done', () => {
  isStreamingAI = false;
  logActivity("AI stream completed.", "ai");
  // Speech synthesize the output if allowed
  if (activeScreen === 'screen-chat') {
    const fullText = chatOutput.textContent.split('AI: ')[1] || chatOutput.textContent;
    speakResponse(fullText);
  } else if (activeScreen === 'screen-camera') {
    speakResponse(visionResult.textContent);
  }
});

socket.on('chat-error', (errMsg) => {
  isStreamingAI = false;
  if (activeScreen === 'screen-chat') {
    chatOutput.textContent = errMsg;
  } else if (activeScreen === 'screen-camera') {
    visionResult.classList.remove('hidden');
    visionResult.textContent = errMsg;
  }
  logActivity(`AI Error: ${errMsg}`, "ai");
  speakResponse("Error connecting to local AI server.");
});

// ----------------- Helper Actions -----------------

// Navigation helper
function showScreen(screenId) {
  screens.forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    activeScreen = screenId;
    logActivity(`Pocket viewport routed to: ${screenId.replace('screen-', '')}`, "system");
  }

  // Update dots
  navDots.forEach(dot => {
    if (dot.getAttribute('data-screen') === screenId) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Handle specific screen triggers
  if (screenId === 'screen-camera') {
    startCamera();
  } else {
    stopCamera();
  }

  // Stop reading text when switching screens
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// Speak response via Web Speech TTS
function speakResponse(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  
  speechUtterance = new SpeechSynthesisUtterance(text);
  speechUtterance.rate = 1.05; 
  speechUtterance.pitch = 1.0;
  window.speechSynthesis.speak(speechUtterance);
}

// Send chat request to Ollama
function sendChatPrompt(prompt) {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  socket.emit('chat-prompt', {
    prompt: prompt,
    model: selectedModel
  });
}

// Task CRUD Globals for onclick attributes
window.toggleTask = function(id) {
  socket.emit('toggle-task', id);
};

window.deleteTask = function(id) {
  socket.emit('delete-task', id);
};

// Camera activation
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 320 }
    });
    videoFeed.srcObject = cameraStream;
  } catch (err) {
    console.error("Camera access failed:", err);
    visionResult.classList.remove('hidden');
    visionResult.textContent = "Camera access denied. Ensure HTTPS context.";
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  videoFeed.srcObject = null;
}

// Scan/Capture frame
function captureImageAndAnalyze() {
  if (!cameraStream) return;
  
  const ctx = photoCanvas.getContext('2d');
  photoCanvas.width = 320;
  photoCanvas.height = 320;
  
  // Draw current video frame
  ctx.drawImage(videoFeed, 0, 0, 320, 320);
  const base64Image = photoCanvas.toDataURL('image/jpeg');
  
  visionResult.classList.remove('hidden');
  visionResult.textContent = "Sending image to Ollama...";
  
  const visionModel = selectedModel.includes('llava') ? selectedModel : 'llava';
  socket.emit('vision-prompt', {
    prompt: "Scan this workspace layout or context. Provide a summary of details for xi-io.net project management.",
    imageBase64: base64Image,
    model: visionModel
  });
  logActivity(`Captured vision scan frame with model [${visionModel}]`, "system");
}

// ----------------- Event Listeners -----------------

// Telemetry interval
setInterval(() => {
  if (socket.connected) {
    socket.emit('get-system-stats');
  }
}, 3000);

// Model pull handler
pullModelBtn.addEventListener('click', () => {
  const modelName = pullModelInput.value.trim();
  if (modelName) {
    socket.emit('pull-model', modelName);
    pullProgressContainer.classList.remove('hidden');
    pullProgressBar.style.width = '0%';
    pullProgressText.textContent = `Initiating pull for ${modelName}...`;
    logActivity(`Pulling Ollama model '${modelName}'`, "socket");
  }
});

// Model select change synchronizations
modelSelect.addEventListener('change', (e) => {
  selectedModel = e.target.value;
  desktopModelSelect.value = selectedModel;
  activeModelDisplay.textContent = selectedModel;
  logActivity(`Selected AI Model: ${selectedModel}`, "system");
});

desktopModelSelect.addEventListener('change', (e) => {
  selectedModel = e.target.value;
  modelSelect.value = selectedModel;
  activeModelDisplay.textContent = selectedModel;
  logActivity(`Selected AI Model: ${selectedModel}`, "system");
});

// Kanban board drag-and-drop configuration
[cardsTodo, cardsProgress, cardsDone].forEach(col => {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (taskIdStr) {
      const taskId = parseInt(taskIdStr);
      const newStatus = col.id.replace('cards-', '');
      socket.emit('update-task-status', { taskId, status: newStatus });
    }
  });
});

// Kanban actions
kanbanAddBtn.addEventListener('click', () => {
  const text = kanbanNewTask.value;
  if (text.trim()) {
    socket.emit('create-task', text);
    kanbanNewTask.value = '';
  }
});

kanbanNewTask.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = kanbanNewTask.value;
    if (text.trim()) {
      socket.emit('create-task', text);
      kanbanNewTask.value = '';
    }
  }
});

// Pocket screen actions
addTaskBtn.addEventListener('click', () => {
  const text = newTaskInput.value;
  if (text.trim()) {
    socket.emit('create-task', text);
    newTaskInput.value = '';
  }
});

newTaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = newTaskInput.value;
    if (text.trim()) {
      socket.emit('create-task', text);
      newTaskInput.value = '';
    }
  }
});

// Menu item routing clicks
document.querySelectorAll('.menu-item').forEach((item) => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-target');
    showScreen(target);
  });
});

// Dot navigation
navDots.forEach(dot => {
  dot.addEventListener('click', () => {
    showScreen(dot.getAttribute('data-screen'));
  });
});

// Back buttons
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showScreen(btn.getAttribute('data-target'));
  });
});

// PTT click behavior
pttBtn.addEventListener('mousedown', () => {
  if (recognition) recognition.start();
});
pttBtn.addEventListener('mouseup', () => {
  if (recognition && isRecording) recognition.stop();
});
pttBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (recognition) recognition.start();
});
pttBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (recognition && isRecording) recognition.stop();
});

// Physical Simulator Interactive Handlers
if (physicalPtt) {
  physicalPtt.addEventListener('mousedown', () => {
    physicalPtt.classList.add('active');
    if (recognition) recognition.start();
  });
  physicalPtt.addEventListener('mouseup', () => {
    physicalPtt.classList.remove('active');
    if (recognition && isRecording) recognition.stop();
  });
  physicalPtt.addEventListener('touchstart', (e) => {
    e.preventDefault();
    physicalPtt.classList.add('active');
    if (recognition) recognition.start();
  });
  physicalPtt.addEventListener('touchend', (e) => {
    e.preventDefault();
    physicalPtt.classList.remove('active');
    if (recognition && isRecording) recognition.stop();
  });
}

if (r1CameraEye) {
  r1CameraEye.addEventListener('click', () => {
    r1CameraEye.classList.toggle('active');
    logActivity("Physical camera eye rotated.", "system");
  });
}

function rotateWheelRidges(delta) {
  ridgesRotation += delta;
  const ridges = document.getElementById('r1-scroll-ridges');
  if (ridges) {
    ridges.style.transform = `rotate(${ridgesRotation}deg)`;
  }
}

function dispatchSimulatedKey(keyName) {
  const event = new KeyboardEvent('keydown', {
    key: keyName,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(event);
}

if (wheelUpBtn) {
  wheelUpBtn.addEventListener('click', () => {
    rotateWheelRidges(-30);
    dispatchSimulatedKey('ArrowUp');
  });
}

if (wheelDownBtn) {
  wheelDownBtn.addEventListener('click', () => {
    rotateWheelRidges(30);
    dispatchSimulatedKey('ArrowDown');
  });
}

if (r1ScrollWheel) {
  r1ScrollWheel.addEventListener('click', () => {
    dispatchSimulatedKey('Enter');
  });
}

// Camera scan button
captureBtn.addEventListener('click', () => {
  captureImageAndAnalyze();
});

// ----------------- Keyboard Key Navigation Mapping -----------------
window.addEventListener('keydown', (e) => {
  // Ignore events when user is typing in form fields or selecting elements
  const activeEl = document.activeElement;
  if (
    (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) ||
    (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'))
  ) {
    return;
  }

  const isUp = (e.key === 'AudioVolumeUp' || e.key === 'ArrowUp');
  const isDown = (e.key === 'AudioVolumeDown' || e.key === 'ArrowDown');
  const isSelect = (e.key === 'Enter' || e.key === ' ' || e.key === 'Select'); 

  if (isUp || isDown || isSelect) {
    // Intercept to prevent default adjustments
    e.preventDefault();

    if (activeScreen === 'screen-dashboard') {
      const items = document.querySelectorAll('.menu-list .menu-item');
      
      if (isUp) {
        items[currentMenuIndex].classList.remove('active');
        currentMenuIndex = (currentMenuIndex - 1 + items.length) % items.length;
        items[currentMenuIndex].classList.add('active');
        rotateWheelRidges(-30);
      } else if (isDown) {
        items[currentMenuIndex].classList.remove('active');
        currentMenuIndex = (currentMenuIndex + 1) % items.length;
        items[currentMenuIndex].classList.add('active');
        rotateWheelRidges(30);
      } else if (isSelect) {
        const targetScreen = items[currentMenuIndex].getAttribute('data-target');
        showScreen(targetScreen);
      }
    } 
    
    else if (activeScreen === 'screen-tasks') {
      const cards = document.querySelectorAll('.scroll-list .task-card');
      if (cards.length === 0) return;

      if (isUp) {
        if (currentTaskIndex !== -1) cards[currentTaskIndex].classList.remove('active');
        currentTaskIndex = (currentTaskIndex - 1 + cards.length) % cards.length;
        cards[currentTaskIndex].classList.add('active');
        cards[currentTaskIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        rotateWheelRidges(-30);
      } else if (isDown) {
        if (currentTaskIndex !== -1) cards[currentTaskIndex].classList.remove('active');
        currentTaskIndex = (currentTaskIndex + 1) % cards.length;
        cards[currentTaskIndex].classList.add('active');
        cards[currentTaskIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        rotateWheelRidges(30);
      } else if (isSelect) {
        if (currentTaskIndex !== -1) {
          const taskElement = cards[currentTaskIndex];
          const id = parseInt(taskElement.id.replace('task-', ''));
          toggleTask(id);
        }
      }
    }

    else if (activeScreen === 'screen-chat' && isSelect) {
      if (!isRecording) {
        if (recognition) recognition.start();
      } else {
        if (recognition) recognition.stop();
      }
    }
  }
});

// Setup default screen
showScreen('screen-dashboard');
