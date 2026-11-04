# ChatRipe – Multi-Model AI Research Chatbot

**ChatRipe** is a scholarly research AI chatbot built for Southern Leyte State University (SLSU) researchers, scholars, and innovators. It features a **Multi-Model AI System** that allows seamless switching between **local on-device models via Ollama**, **cloud-based models via Google Gemini**, and **Anthropic Claude** through a single unified interface.

---

## 🌟 Key Features

- **Multi-Model AI Selector**:
  - **Ollama (Local)**: Run private, offline open-weights models (`llama3.2:3b`, `qwen2.5`, `mistral`, `deepseek-r1`, `gemma3`) directly on your machine.
  - **Google Gemini (Cloud)**: Connect to Google's state-of-the-art models (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`) using the official `@google/genai` SDK.
  - **Anthropic Claude (Cloud, Optional)**: Connect to Claude (`claude-3-7-sonnet-latest`, `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`).
- **Dynamic Model Discovery**: Automatically inspects the local Ollama server and lists all currently installed models.
- **Real-Time Streaming**: Live streaming token-by-token generation with typing cursor and smooth rendering.
- **Scholarly Markdown & Syntax Highlighting**: Full GitHub Flavored Markdown (GFM) support, tables, math-friendly typography, and code blocks with one-click copy.
- **Multi-Conversation Management**:
  - Create multiple conversations.
  - Automatic title generation based on initial prompt.
  - Conversation persistence in browser `localStorage`.
  - Delete or clear conversation history.
- **Controls & Actions**:
  - Stop generation mid-stream.
  - Regenerate last response.
  - Copy entire response.
  - Clear conversation.
- **Enterprise Security & Key Management**:
  - Secure backend proxy/middleware prevents API keys from being leaked to client-side bundles.
  - Configure keys via server `.env` or in-app secure Settings modal.
  - Never hardcodes credentials or exposes private tokens.

---

## 📐 Architecture Overview

ChatRipe implements a centralized, unified service layer:

```
AI SERVICE
│
├── Provider Manager
│   ├── Ollama Provider (Local HTTP API)
│   ├── Gemini Provider (Official @google/genai SDK)
│   └── Claude Provider (@anthropic-ai/sdk)
│
├── Model Manager
│   ├── Dynamic Model Discovery (/api/ai/models)
│   ├── Model Selection & Persistence
│   └── Availability Status
│
├── Conversation Manager
│   ├── Multi-Conversation Storage
│   ├── Message History & Context Management
│   └── LocalStorage Persistence
│
└── Response Handler
    ├── Server-Sent Events (SSE) Streaming
    ├── Request Timeout & AbortController (Stop Generation)
    └── Normalized Actionable Error Messages
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm** or **pnpm**
- *(Optional for local AI)* **Ollama**: Installed from [ollama.com](https://ollama.com)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/SmileyHyper/ChatRipeAIResearchChatbot.git
cd ChatRipeAIResearchChatbot
npm install
```

### 3. Environment Variables Configuration

Copy the example configuration file to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your preferred settings:

```env
# 1. Google Gemini API Key (Cloud)
# Get your free API key at: https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here

# 2. Ollama Local Endpoint (Default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# 3. Anthropic Claude API Key (Optional)
# Get your API key at: https://console.anthropic.com/
ANTHROPIC_API_KEY=your_claude_api_key_here

# Development / Production Port
PORT=8443
```

> **Note:** API keys can also be configured interactively via the in-app **Settings & Keys** modal without restarting the server.

### 4. Running the Development Server

Start the Vite development server (which includes the built-in AI API proxy middleware):

```bash
npm run dev
```

Open `http://localhost:8443` in your browser.

---

## 🦙 Ollama Local AI Setup

To run models locally without any cloud API fees or external network dependency:

1. **Install Ollama**:
   Download and install Ollama from [https://ollama.com](https://ollama.com).

2. **Start the Ollama server**:
   ```bash
   ollama serve
   ```
   *(On Windows/macOS, opening the Ollama application automatically starts the service at `http://localhost:11434`)*.

3. **Download your desired models**:
   ```bash
   # Recommended compact model (3.2B parameters, ~2.0 GB):
   ollama pull llama3.2:3b

   # Other high-quality models:
   ollama pull qwen2.5
   ollama pull mistral
   ollama pull deepseek-r1
   ollama pull gemma3
   ```

4. **Verify in ChatRipe**:
   Click the **AI Model Selector** dropdown in the top header. Your installed models will appear dynamically under the **Ollama** tab with a green "Online" status indicator.

---

## ♊ Google Gemini Setup

To use Google's cloud models:

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set the key in `.env`:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```
   *Or* open the **Settings** modal (gear icon) in the ChatRipe web UI and paste your key.
3. Switch the AI Model Selector to **Gemini** and select your model (e.g., `gemini-2.5-flash` or `gemini-2.5-pro`).

Supported Gemini models:
- `gemini-2.5-flash` (Recommended next-generation fast model)
- `gemini-2.5-pro` (Advanced reasoning & deep research)
- `gemini-2.0-flash` (Ultra-low latency)
- `gemini-1.5-flash` (Efficient general research)
- `gemini-1.5-pro` (Long-context analysis)

---

## 🧪 Testing the AI Integration

A comprehensive automated test suite is provided to verify connectivity, model discovery, input validation, streaming, and error handling across all providers:

```bash
npm run test:ai
```

The test runner will automatically test:
- Health check endpoints (`/api/ai/health`)
- Dynamic Ollama model discovery (`/api/ai/models`)
- Real-time streaming generation
- Input validation (empty messages rejected with 400)
- Graceful handling of missing or invalid API keys
- Helpful notifications when a model is not yet installed

---

## 🏗️ Production Build & Standalone Server

To build the client bundle and run with the standalone Node server:

```bash
# Build the production bundle
npm run build

# Start the full-stack production server
npm start
```

The server will serve both the compiled frontend assets from `dist/` and the `/api/ai/*` streaming endpoints on port `8443`.

---

## 🛠️ Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Ollama server is unavailable"** | Ollama is not running or not listening on port 11434 | Run `ollama serve` in a terminal or launch the Ollama desktop app. |
| **"Model not found in Ollama"** | The requested model is not downloaded locally | Run `ollama pull <model-name>` (e.g. `ollama pull llama3.2:3b`). |
| **"Gemini API key is missing"** | No API key provided in `.env` or Settings | Add `GEMINI_API_KEY` to `.env` or paste it in the in-app Settings modal. |
| **"Invalid Gemini API Key"** | The provided key has expired or is invalid | Generate a new key at [Google AI Studio](https://aistudio.google.com/). |
| **"Resource exhausted / 429"** | Rate limit or quota reached on free cloud tier | Wait a few seconds, switch to another model, or switch to local Ollama. |

---

## 📜 License & Acknowledgments

Developed for **Southern Leyte State University (SLSU)** research community.
Built with React 19, Tailwind CSS v4, Vite, Google GenAI SDK, and Ollama.

