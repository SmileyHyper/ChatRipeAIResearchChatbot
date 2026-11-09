import { ProviderManager } from './provider-manager';
import { ModelManager } from './model-manager';
import { ConversationManager } from './conversation-manager';
import { ResponseHandler } from './response-handler';
import type { AIProviderId, UserProviderSettings, WritingAssistantAction } from '../../types/ai';

const SETTINGS_KEY = 'chatripe_user_provider_settings_v1';

export class AIService {
  public providerManager: ProviderManager;
  public modelManager: ModelManager;
  public conversationManager: ConversationManager;
  public responseHandler: ResponseHandler;

  private userSettings: UserProviderSettings = {
    enableMemory: true,
  };
  private imageAbortController: AbortController | null = null;

  constructor() {
    this.providerManager = new ProviderManager();
    this.modelManager = new ModelManager();
    this.conversationManager = new ConversationManager();
    this.responseHandler = new ResponseHandler();

    this.loadSettings();
  }

  loadSettings(): UserProviderSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const savedSettings = JSON.parse(raw);
        delete savedSettings.geminiApiKey;
        this.userSettings = { enableMemory: true, ...savedSettings };
      }
    } catch {
      this.userSettings = { enableMemory: true };
    }
    return this.userSettings;
  }

  saveSettings(settings: UserProviderSettings) {
    this.userSettings = { ...this.userSettings, ...settings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.userSettings));
    } catch (err) {
      console.warn('[AIService] Failed to save user settings');
    }
  }

  getSettings(): UserProviderSettings {
    return { ...this.userSettings };
  }

  async analyzeImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
    const conversation = this.conversationManager.getActiveConversation();
    const userMessage = `${prompt.trim()}\n\n[Image attached]`;
    this.conversationManager.addUserMessage(userMessage);
    const assistantMessage = this.conversationManager.addAssistantMessage('', 'ollama', 'qwen3-vl:8b');
    const controller = new AbortController();
    this.imageAbortController = controller;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.userSettings.ollamaBaseUrl) headers['x-ollama-url'] = this.userSettings.ollamaBaseUrl;

      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: conversation.id,
          imageBase64,
          mimeType,
          prompt: prompt.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Image analysis failed (${response.status})`);
      }
      if (typeof data.content !== 'string' || !data.content.trim()) {
        throw new Error('Qwen3-VL returned an empty image analysis.');
      }

      this.conversationManager.updateAssistantMessage(assistantMessage.id, data.content);
      await this.conversationManager.loadConversationDetails(conversation.id);
      return data.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image analysis failed.';
      const errorMessage = error instanceof DOMException && error.name === 'AbortError'
        ? 'Image analysis was stopped.'
        : message;
      this.conversationManager.updateAssistantMessage(assistantMessage.id, errorMessage, true);
      throw new Error(errorMessage);
    } finally {
      if (this.imageAbortController === controller) this.imageAbortController = null;
    }
  }

  async init() {
    const settings = this.getSettings();
    await Promise.allSettled([
      this.providerManager.checkAllStatuses(settings),
      this.modelManager.fetchModels(settings),
      this.conversationManager.loadFromDatabase(),
    ]);
  }

  async sendMessage(
    userText: string,
    callbacks: {
      onStartAssistantMsg: (id: string) => void;
      onChunk: (delta: string) => void;
      onDone: (fullText: string) => void;
      onError: (error: string) => void;
      onSources?: (sources: any[]) => void;
    },
    options?: {
      documentIds?: string[];
    }
  ) {
    const text = userText.trim();
    if (!text) return;

    // 1. Add user message
    this.conversationManager.addUserMessage(text);

    // 2. Determine provider and model
    const conv = this.conversationManager.getActiveConversation();
    const provider = conv.provider || 'ollama';
    const model = conv.model || this.modelManager.getSelectedModel(provider);

    // 3. Create placeholder assistant message
    const assistantMsg = this.conversationManager.addAssistantMessage('', provider, model);
    callbacks.onStartAssistantMsg(assistantMsg.id);

    // 4. Prepare chat payload with history
    const historyPayload = conv.messages
      .slice(0, -1) // exclude the empty assistant message just added
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    let currentSources: any[] = [];

    // 5. Stream response
    await this.responseHandler.streamChat(
      {
        conversationId: conv.id,
        provider,
        model,
        messages: historyPayload,
        documentIds: options?.documentIds,
        enableMemory: this.userSettings.enableMemory !== false,
        settings: this.getSettings(),
      },
      {
        onSources: (sources) => {
          currentSources = sources;
          this.conversationManager.updateAssistantMessage(assistantMsg.id, '', false, sources);
          if (callbacks.onSources) callbacks.onSources(sources);
        },
        onChunk: (fullChunkText) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, fullChunkText, false, currentSources);
          callbacks.onChunk(fullChunkText);
        },
        onDone: (finalText) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, finalText, false, currentSources);
          callbacks.onDone(finalText);
        },
        onError: (errMsg) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, errMsg, true);
          callbacks.onError(errMsg);
        },
      }
    );
  }

  async regenerateLastMessage(callbacks: {
    onStartAssistantMsg: (id: string) => void;
    onChunk: (delta: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: string) => void;
    onSources?: (sources: any[]) => void;
  }, options?: { documentIds?: string[] }) {
    const conv = this.conversationManager.getActiveConversation();
    if (conv.messages.length === 0) return;

    if (conv.messages[conv.messages.length - 1].role === 'assistant') {
      this.conversationManager.removeLastAssistantMessage();
    }

    const lastUserMessage = conv.messages[conv.messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') return;

    const provider = conv.provider || 'ollama';
    const model = conv.model || this.modelManager.getSelectedModel(provider);

    const assistantMsg = this.conversationManager.addAssistantMessage('', provider, model);
    callbacks.onStartAssistantMsg(assistantMsg.id);

    const historyPayload = conv.messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let currentSources: any[] = [];

    await this.responseHandler.streamChat(
      {
        conversationId: conv.id,
        provider,
        model,
        messages: historyPayload,
        documentIds: options?.documentIds,
        enableMemory: this.userSettings.enableMemory !== false,
        settings: this.getSettings(),
      },
      {
        onSources: (sources) => {
          currentSources = sources;
          this.conversationManager.updateAssistantMessage(assistantMsg.id, '', false, sources);
          if (callbacks.onSources) callbacks.onSources(sources);
        },
        onChunk: (chunkText) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, chunkText, false, currentSources);
          callbacks.onChunk(chunkText);
        },
        onDone: (finalText) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, finalText, false, currentSources);
          callbacks.onDone(finalText);
        },
        onError: (errMsg) => {
          this.conversationManager.updateAssistantMessage(assistantMsg.id, errMsg, true);
          callbacks.onError(errMsg);
        },
      }
    );
  }
  async runWritingAssistant(params: {
    prompt: string;
    text?: string;
    hasSelection?: boolean;
    history?: { role: 'user' | 'assistant'; content: string }[];
    humanize?: boolean;
    context?: string;
    provider?: AIProviderId;
    model?: string;
  }): Promise<{ original: string; generated: string; action: string; humanized?: boolean }> {
    const provider = params.provider || 'ollama';
    const model = params.model || this.modelManager.getSelectedModel(provider);

    const res = await fetch('/api/ai/writing-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        text: params.text,
        hasSelection: params.hasSelection,
        history: params.history,
        humanize: params.humanize,
        context: params.context,
        provider,
        model,
        settings: this.getSettings(),
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Writing assistant error (${res.status})`);
    }

    return await res.json();
  }
  stopGeneration() {
    this.imageAbortController?.abort();
    this.imageAbortController = null;
    this.responseHandler.stopGeneration();
  }
}

export const aiService = new AIService();
