# Rabbit OS Compatibility Ledger

This ledger records historical compatibility checks, test results, and degradation states for the local companion app against official Rabbit OS releases.

---

## 📋 Compatibility Ledger Rules
1. **Verify on OTA Update**: Upon any official Rabbit OS release or update, run the verification checklist.
2. **Log Every Version**: Record the version code, date verified, overall status, and specific test outcomes.
3. **Detail Fallback Conditions**: If a feature degrades, note the fallback used and the diagnostic event code.

---

## 🗺️ Version History & Test Matrix

| Rabbit OS Version | Date Tested | Status | Keypad Input | Audio PTT | Camera Scan | Notes / Fallbacks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **v0.8.120 (Canary)** | 2026-06-03 | **PASS** | Verified | Verified (Degraded) | Verified (Degraded) | Baseline browser emulation. Audio and Camera return warnings but fall back safely without crashing. |
| **v0.8.118** | 2026-05-15 | **PASS** | Verified | Verified (Degraded) | Verified (Degraded) | Initial desktop build verification. |

---

## 🛠️ Verification Routine Checklist

Run these steps when testing compatibility against a new OTA build:

### 1. Verification of Inputs
- [ ] Connect the device to the companion server local interface.
- [ ] Verify scroll navigation works:
  - Arrow up/down selects menu items.
  - Scroll wheel visual element rotates.
- [ ] Verify physical select button or Enter triggers the selected menu item.

### 2. Verification of Audio (PTT)
- [ ] Go to the voice assistant screen.
- [ ] Hold the physical PTT key (Spacebar / simulated physical PTT).
- [ ] Verify that SpeechRecognition starts and the visualizer is animated.
- [ ] Speak a command and verify translation and LLM chat response stream.
- [ ] If SpeechRecognition is blocked or fails, verify that an `AUDIO_REC_FAILED` warning is emitted to the ledger without crashing the app.

### 3. Verification of Camera (Vision Scan)
- [ ] Go to the Vision screen.
- [ ] Verify that camera feed initializes and displays.
- [ ] Capture a snapshot frame.
- [ ] Verify the image is successfully summarized by the selected vision model.
- [ ] If permission is denied or camera is missing, verify `CAMERA_ACCESS_DENIED` is logged and fallback instructions display.

### 4. Verification of Telemetry/REST
- [ ] Run `GET /api/health` and verify `HEALTHY` or `DEGRADED` status response.
- [ ] Run `GET /api/diagnostics` and check for recent event entries.
