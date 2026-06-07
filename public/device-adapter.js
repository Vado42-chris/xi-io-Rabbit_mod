/**
 * Rabbit Device Adapter
 * 
 * Formalized adapter boundary encapsulating browser-native Speech, Camera,
 * and key/button inputs. Provides graceful degradation stubs and keeps 
 * main app logic decoupled from physical/hardware API variations.
 */
class DefaultRabbitDeviceAdapter {
  constructor() {
    this.recognition = null;
    this.cameraStream = null;
    this.speechUtterance = null;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
  }

  /**
   * Check if any key hardware capability is supported by the browser runtime.
   */
  isSupported() {
    return !!this.recognition || (navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia);
  }

  /**
   * Query device capabilities.
   */
  getCapabilities() {
    const caps = [];
    if (this.recognition) caps.push('speech-recognition');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) caps.push('camera');
    if (window.speechSynthesis) caps.push('speech-synthesis');
    return caps;
  }

  /**
   * Initialize speech recognition listeners.
   */
  initAudio(callbacks) {
    if (!this.recognition) {
      if (callbacks.onError) {
        callbacks.onError({ error: 'not-supported', message: 'Speech recognition API not supported in browser.' });
      }
      return;
    }

    this.recognition.onstart = () => {
      if (callbacks.onStart) callbacks.onStart();
    };

    this.recognition.onresult = (event) => {
      if (callbacks.onResult) {
        const transcript = event.results[0][0].transcript;
        callbacks.onResult(transcript);
      }
    };

    this.recognition.onerror = (event) => {
      if (callbacks.onError) callbacks.onError(event);
    };

    this.recognition.onend = () => {
      if (callbacks.onEnd) callbacks.onEnd();
    };
  }

  /**
   * Start capture.
   */
  startAudio() {
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn("SpeechRecognition start attempted but failed:", err.message);
      }
    }
  }

  /**
   * Stop capture.
   */
  stopAudio() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn("SpeechRecognition stop attempted but failed:", err.message);
      }
    }
  }

  /**
   * Speak output using system text-to-speech.
   */
  speak(text, callbacks) {
    if (!window.speechSynthesis) {
      console.warn("Speech synthesis not supported in browser.");
      return;
    }
    this.cancelSpeak();
    
    this.speechUtterance = new SpeechSynthesisUtterance(text);
    this.speechUtterance.rate = 1.05;
    this.speechUtterance.pitch = 1.0;

    if (callbacks) {
      if (callbacks.onStart) this.speechUtterance.onstart = callbacks.onStart;
      if (callbacks.onEnd) this.speechUtterance.onend = callbacks.onEnd;
    }

    window.speechSynthesis.speak(this.speechUtterance);
  }

  /**
   * Cancel active synthesis speech.
   */
  cancelSpeak() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Initialize user media camera stream.
   */
  async initCamera(videoElement, callbacks) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (callbacks && callbacks.onError) {
        callbacks.onError(new Error('Camera API not supported in this browser.'));
      }
      return null;
    }

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 320, height: 320 }
      });
      videoElement.srcObject = this.cameraStream;
      if (callbacks && callbacks.onStart) callbacks.onStart();
      return this.cameraStream;
    } catch (err) {
      if (callbacks && callbacks.onError) {
        callbacks.onError(err);
      }
      return null;
    }
  }

  /**
   * Close camera.
   */
  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
  }

  /**
   * Captures the current camera feed frame to canvas.
   */
  captureFrame(videoElement, canvasElement) {
    if (!this.cameraStream) return null;
    const ctx = canvasElement.getContext('2d');
    canvasElement.width = 320;
    canvasElement.height = 320;
    ctx.drawImage(videoElement, 0, 0, 320, 320);
    return canvasElement.toDataURL('image/jpeg');
  }

  /**
   * Bind external keys / inputs (Volume/Arrows/Enter/PTT).
   */
  bindInputs(handlers) {
    window.addEventListener('keydown', (e) => {
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

      if (isUp) {
        e.preventDefault();
        if (handlers.onVolumeUp) handlers.onVolumeUp();
      } else if (isDown) {
        e.preventDefault();
        if (handlers.onVolumeDown) handlers.onVolumeDown();
      } else if (isSelect) {
        // Spacebar acts as PTT down in chat, so handle separately for select
        if (e.key === ' ' && handlers.onPTTDown) return;
        e.preventDefault();
        if (handlers.onSelect) handlers.onSelect();
      }
    });

    // Spacebar PTT trigger (hold key to talk)
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !e.repeat) {
        const activeEl = document.activeElement;
        if (
          (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) ||
          (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'))
        ) {
          return;
        }
        e.preventDefault();
        if (handlers.onPTTDown) handlers.onPTTDown();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        const activeEl = document.activeElement;
        if (
          (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) ||
          (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'))
        ) {
          return;
        }
        e.preventDefault();
        if (handlers.onPTTUp) handlers.onPTTUp();
      }
    });
  }
}

// Assign to global namespace
window.RabbitDeviceAdapter = new DefaultRabbitDeviceAdapter();
