import type { ChatStreamRequest } from '../../types/ai';
import type { StreamCallbacks } from './types';

export class ResponseHandler {
  private currentAbortController: AbortController | null = null;
  private isGenerating = false;

  get isStreaming(): boolean {
    return this.isGenerating;
  }

  stopGeneration() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.isGenerating = false;
    }
  }

  async streamChat(
    request: ChatStreamRequest,
    callbacks: StreamCallbacks & { onSources?: (sources: any[]) => void }
  ): Promise<void> {
    this.stopGeneration();

    const controller = new AbortController();
    this.currentAbortController = controller;
    this.isGenerating = true;

    let fullText = '';
    let sourcesList: any[] = [];

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (request.settings?.ollamaBaseUrl) headers['x-ollama-url'] = request.settings.ollamaBaseUrl;
      if (request.settings?.geminiApiKey) headers['x-gemini-api-key'] = request.settings.geminiApiKey;
      if (request.settings?.claudeApiKey) headers['x-claude-api-key'] = request.settings.claudeApiKey;

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const json = await response.json();
          if (json.error) errorMsg = json.error;
        } catch {}
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('No readable stream response received from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') {
            this.isGenerating = false;
            callbacks.onDone(fullText);
            return;
          }

          try {
            const event = JSON.parse(dataStr);
            if (event.type === 'sources' && Array.isArray(event.sources)) {
              sourcesList = event.sources;
              if (callbacks.onSources) {
                callbacks.onSources(sourcesList);
              }
            } else if (event.type === 'chunk' && event.delta) {
              fullText += event.delta;
              callbacks.onChunk(fullText);
            } else if (event.type === 'done') {
              this.isGenerating = false;
              callbacks.onDone(fullText);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Generation error');
            }
          } catch (err: any) {
            if (err.message && err.message !== 'Unexpected end of JSON input') {
              throw err;
            }
          }
        }
      }

      this.isGenerating = false;
      callbacks.onDone(fullText);
    } catch (err: any) {
      this.isGenerating = false;
      if (err.name === 'AbortError') {
        callbacks.onDone(fullText);
        return;
      }
      const normalizedError = this.normalizeError(err, request.provider);
      callbacks.onError(normalizedError);
    } finally {
      this.currentAbortController = null;
    }
  }

  private normalizeError(err: any, provider: string): string {
    const message = err.message || String(err);

    if (provider === 'ollama') {
      if (message.includes('Failed to fetch') || message.includes('unavailable') || message.includes('ECONNREFUSED')) {
        return 'Ollama server is unavailable. Please ensure Ollama is installed and running (`ollama serve`) at http://localhost:11434.';
      }
      if (message.includes('not found')) {
        return `${message}. Run 'ollama pull <model-name>' in your terminal to install it.`;
      }
    }

    if (provider === 'gemini') {
      if (message.includes('API key is missing') || message.includes('API_KEY_INVALID') || message.includes('Invalid Gemini API Key')) {
        return 'Gemini API key is missing or invalid. Please open Settings (gear icon) to configure your Google Gemini API key, or add GEMINI_API_KEY in .env.';
      }
      if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        return 'Google Gemini API quota exceeded or rate limit reached. Please wait a moment.';
      }
    }

    if (provider === 'claude') {
      if (message.includes('API key is missing') || message.includes('Invalid Claude API Key')) {
        return 'Anthropic Claude API key is missing or invalid. Open Settings to configure your Anthropic API key, or set ANTHROPIC_API_KEY in .env.';
      }
      if (message.includes('429')) {
        return 'Anthropic rate limit exceeded. Please wait a moment before trying again.';
      }
    }

    return message || 'An unexpected error occurred during generation.';
  }
}
