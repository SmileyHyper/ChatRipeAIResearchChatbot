# ChatRipe – Multi-Model AI Research Chatbot

**ChatRipe** is a scholarly research AI chatbot built for Southern Leyte State University (SLSU) researchers, scholars, and innovators. It supports local text models through Ollama, local image analysis with Qwen3-VL, and optional Anthropic Claude.

---

## 🌟 Key Features

- **Multi-Model AI Selector**:
  - **Ollama (Local)**: Run private, offline open-weights text models (`llama3.2:3b`, `qwen2.5`, `mistral`, `deepseek-r1`, `gemma3`) directly on your machine.
  - **Qwen3-VL (Local Vision)**: Attach JPEG, PNG, or WebP images for local analysis with `qwen3-vl:8b`.
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
  - Cloud API keys are handled by the backend and are never included in client-side bundles.
  - Configure the optional Claude key via server `.env` or in-app Settings.
  - Never hardcodes credentials or exposes private tokens.

---

## 📐 Architecture Overview

ChatRipe implements a centralized, unified service layer:

```
AI SERVICE
│
├── Provider Manager
│   ├── Ollama Provider (Local HTTP API)
│   └── Claude Provider (@anthropic-ai/sdk)
├── Vision Analysis
│   └── Qwen3-VL (Ollama /api/chat)
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
# 1. Ollama Local Endpoint (Default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# 2. Anthropic Claude API Key (Optional)
# Get your API key at: https://console.anthropic.com/
ANTHROPIC_API_KEY=your_claude_api_key_here

# Development / Production Port
PORT=8443
```

> **Note:** The Claude API key can also be configured interactively via **Settings** without restarting the server.

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

   # Local image analysis:
   ollama pull qwen3-vl:8b

   # Other high-quality models:
   ollama pull qwen2.5
   ollama pull mistral
   ollama pull deepseek-r1
   ollama pull gemma3
   ```

4. **Verify in ChatRipe**:
   Click the **AI Model Selector** dropdown in the top header. Your installed models will appear dynamically under the **Ollama** tab with a green "Online" status indicator.

---

## 🖼️ Local Image Analysis

ChatRipe uses Qwen3-VL through your local Ollama server to analyze image attachments. Existing Ollama text chat continues using the selected text model.

1. Install the vision model:
   ```bash
   ollama pull qwen3-vl:8b
   ```
2. In ChatRipe, choose **Image** in the chat composer, select a JPEG, PNG, or WebP image up to 10 MB, and enter a question or leave the prompt blank for a general description.
3. Submit the prompt. The image is sent to the configured Ollama endpoint and analyzed with `qwen3-vl:8b`. The uploaded image itself is not stored; the prompt and text response are saved in conversation history.

---

## 🧪 Testing the AI Integration

A comprehensive automated test suite is provided to verify connectivity, model discovery, input validation, streaming, and error handling across all providers:

```bash
npm run test:ai
```

The test runner checks:
- Health check endpoints (`/api/ai/health`)
- Dynamic Ollama model discovery (`/api/ai/models`)
- Real-time streaming generation
- Input validation for text and image analysis
- Removal of the Gemini provider and model list
- Helpful notifications when an Ollama model is not installed

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
| **"Model not found in Ollama"** | The requested text or vision model is not downloaded locally | Run `ollama pull <model-name>` (for image analysis, use `ollama pull qwen3-vl:8b`). |
| **Image analysis is unavailable** | Ollama is stopped or `qwen3-vl:8b` is not installed | Start Ollama and run `ollama pull qwen3-vl:8b`. |
| **Claude API authentication failed** | The configured Anthropic API key is invalid | Update the Claude key in `.env` or in-app Settings. |

---

## 📜 License & Acknowledgments

Developed for **Southern Leyte State University (SLSU)** research community.
Built with React 19, Tailwind CSS v4, Vite, Ollama, and the Anthropic SDK.
