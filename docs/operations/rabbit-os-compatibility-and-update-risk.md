# Rabbit OS Compatibility & Update Risk Assessment

This document establishes the stock-safe boundary, risk matrix, update-watch protocol, and device-adapter specifications for the local Rabbit R1 Companion (`xi_io_rabbit_mod`).

---

## 1. Stock-Safe Boundary Definition

The fundamental architectural principle of this companion is to remain **strictly stock-safe**. This ensures that developer workstation operations can be performed without voiding the device warranty, altering device firmware, or triggering anti-tamper security policies.

### Core Rules of the Stock-Safe Boundary
1. **No Firmware Alteration**: The companion app will never require custom Android ROMs, unlocked bootloaders, custom kernels, or rooted firmware partitions.
2. **Zero physical modifications**: All communication must flow over stock physical ports or standard protocols (Wi-Fi, Bluetooth, or standard web browser runtimes).
3. **No Private API Reverse-Engineering**: The app must not rely on reverse-engineered private Rabbit Cloud endpoints (the "Rabbithole") or undocumented internal endpoints that can be shut down or altered at any moment by the manufacturer.
4. **Standard Web Sandbox**: The companion runs strictly inside the standard Chromium/Android WebView environment, accessing physical hardware exclusively through standardized HTML5 Web APIs (e.g. Web Speech API, `getUserMedia` for camera/microphone access, DOM Keyboard/Gamepad event bindings).

---

## 2. Version Drift & Dependency Risk Matrix

Because Rabbit OS is actively maintained and updated via OTA (Over-The-Air) firmware packages, we must map out key dependencies, evaluate how drift can impact features, and detail how the system degrades gracefully.

| Dependency Area | Potential Breaking Event | Risk Level | Direct Impact | Graceful Degradation / Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **Browser WebView / UserAgent** | System Webview update deprecates legacy codec support or modifies security policies (e.g. CORS). | **Low** | Media streaming or web sockets fail to establish connection. | Fallback to text prompt console; issue local diagnostic warn event. |
| **getUserMedia Permission Model** | Browser runtime changes permission requirements (e.g. demanding explicit interactive gesture). | **Medium** | Camera/Microphone stream fails to start, showing permission errors. | Capture failures in the Device Adapter and fallback to file upload or mock input; raise `CAMERA_ACCESS_DENIED`. |
| **Web Speech API (`webkitSpeechRecognition`)** | Cloud-based speech recognition backend is deprecated, restricted, or rate-limited. | **High** | Press-to-Talk (PTT) voice recognition fails or hangs indefinitely. | Fallback automatically to virtual keyboard text entry or local whisper/offline speech model parsing; log warning. |
| **Input Key Bindings** | Device OS updates intercept or map keys like `ArrowUp`, `ArrowDown`, `VolumeUp/Down`, or `Enter` differently. | **Medium** | Scroll wheel navigation or simulated PTT button key listener breaks. | Provide onscreen UI controls (visual buttons, touchscreen scroll wheels, and custom bindable keys) as hot-swappable alternates. |
| **Local Ollama API** | Ollama API introduces breaking changes to the `/api/chat` or `/api/pull` payloads. | **High** | Model switching, chat streams, or model pulling fails. | Implement API version pinning and standard capability validation before sending queries. |
| **Local SSL Cert Validity** | Self-signed certificates expire or are blocked by stricter browser security updates. | **Medium** | App fails to load or connect to Socket.io secure endpoint. | Auto-generate certs using a local setup script and show step-by-step trust instructions in the workstation log. |

---

## 3. Update-Watch & Monitoring Protocol

To stay ahead of breaking OTA updates from Rabbit:
1. **Community/Official RSS Watch**: Monitor the official [rabbit.tech/release-notes](https://www.rabbit.tech/release-notes) and community discussion boards on a bi-weekly schedule.
2. **Pre-OTA Canary Probes**: Run the automated smoke test suite immediately upon notification of any pending or deployed Rabbit OS OTA update.
3. **Ledger Auditing**: Whenever a new OS version is reported:
   - Identify if the web environment has updated.
   - Run manual verification tests for keyboard inputs, audio capture, and visual scan.
   - Log the results in the `compatibility-ledger.md` under the new version header.

---

## 4. Adapter Boundary Specification

To prevent application core logic (`app.js`) from breaking when the target environment changes, all hardware access is routed through a unified, contract-first Device Adapter interface (`window.RabbitDeviceAdapter`).

### Contract Methods

```javascript
/**
 * Interface representing the physical/simulated device connection.
 */
interface RabbitDeviceAdapter {
  // Audio Input (Speech Recognition)
  initAudio(callbacks: { onStart, onResult, onError, onEnd }): void;
  startAudio(): void;
  stopAudio(): void;

  // Audio Output (Speech Synthesis)
  speak(text: string, callbacks?: { onStart, onEnd }): void;
  cancelSpeak(): void;

  // Camera Input
  initCamera(videoElement: HTMLVideoElement, callbacks?: { onStart, onError }): Promise<MediaStream | null>;
  stopCamera(): void;
  captureFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): string | null; // returns base64 image data

  // Navigation & Button Input Binding
  bindInputs(handlers: {
    onVolumeUp: () => void,
    onVolumeDown: () => void,
    onSelect: () => void,
    onPTTDown: () => void,
    onPTTUp: () => void
  }): void;

  // System Diagnostics
  isSupported(): boolean;
  getCapabilities(): string[];
}
```
Any future device port (e.g. WebUSB hardware interface, custom emulator harness, or direct terminal client) must implement this exact contract.
