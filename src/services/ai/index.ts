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
        this.userSettings = { enableMemory: true, ...JSON.parse(raw) };
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
    action: WritingAssistantAction;
    text: string;
    context?: string;
    provider?: AIProviderId;
    model?: string;
  }): Promise<{ original: string; generated: string; action: string }> {
    const provider = params.provider || 'ollama';
    const model = params.model || this.modelManager.getSelectedModel(provider);

    const res = await fetch('/api/ai/writing-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: params.action,
        text: params.text,
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
    this.responseHandler.stopGeneration();
  }
}

export const aiService = new AIService();
