# Local Model Capability Router (PASS 2 - Feature B)

This document defines the routing rules and capability classifications for local Ollama models within the Rabbit R1 Companion.

---

## 🏷️ Model Capability Classifications

To prevent sending incompatible payloads to models (e.g., prompting a text-only model with images or calling function schemas on unsupported backends), models are labeled using name-based pattern matching.

### 📋 Capability Buckets

1. **`vision`**
   - **Criteria**: Name contains `llava`, `vision`, `moondream`, `bakllava`, or `minicpm`.
   - **Action**: Eligible for media inputs, base64 image array processing, and camera scan summarization.

2. **`code`**
   - **Criteria**: Name contains `coder`, `codellama`, `deepseek-coder`, or `code`.
   - **Action**: Optimized for structured programming, syntax validation, and shell action scaffolding.

3. **`embedding`**
   - **Criteria**: Name contains `embed`, `minilm`, or `mxbai-embed`.
   - **Action**: Converts raw strings to floating-point vectors for local RAG retrieval. Blocked from chat generation endpoints.

4. **`tools`**
   - **Criteria**: Name contains `llama3`, `qwen2.5`, `mistral`, or `command-r` (excluding embedding models).
   - **Action**: Supports JSON structured output constraints and client-side tool/function calling schemas.

5. **`chat`**
   - **Criteria**: General text models (name contains `llama`, `phi`, `gemma`, `mistral`, `qwen`, `command`, `chat`, `instruct`, `deepseek`, or matches `vision`/`code` tags).
   - **Action**: Handles standard multi-turn text dialogs and voice transcription prompt reasoning.

6. **`unknown`**
   - **Criteria**: Fallback when no other criteria are met.
   - **Action**: Treated as basic chat/text generation with no special properties.

---

## 🛠️ Routing Matrix

When a user triggers an interaction on the R1 Companion, the router applies the following restrictions:

| Interface Context | Required Capability | Default Fallback Action |
| :--- | :--- | :--- |
| **Voice Assistant** (`chat-prompt`) | `chat` | Allow execution, log `unknown` warning if classification fails. |
| **Vision Scan** (`vision-prompt`) | `vision` | Automatically route image data to a model supporting `vision` (e.g. `llava`) or raise a client-side warning. |
| **Workspace RAG** | `embedding` | Warn user if active model does not support generating vectors. |
| **JSON Task Generators** | `tools` | Fallback to structured formatting instructions in system prompt if model lacks native tool calling. |
