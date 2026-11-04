import type { AIProviderId, ProviderStatus, UserProviderSettings } from '../../types/ai';
import type { IAIProvider } from './types';

class OllamaProvider implements IAIProvider {
  readonly id = 'ollama' as const;
  readonly name = 'Ollama';
  readonly type = 'local' as const;

  async checkHealth(settings?: UserProviderSettings): Promise<ProviderStatus> {
    try {
      const headers: Record<string, string> = {};
      if (settings?.ollamaBaseUrl) headers['x-ollama-url'] = settings.ollamaBaseUrl;

      const res = await fetch('/api/ai/health', { headers });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return data.ollama || {
        id: 'ollama',
        name: 'Ollama',
        type: 'local',
        isConnected: false,
        isConfigured: true,
        message: 'Could not retrieve Ollama status',
      };
    } catch (err: any) {
      return {
        id: 'ollama',
        name: 'Ollama',
        type: 'local',
        isConnected: false,
        isConfigured: true,
        message: 'Ollama server unavailable (http://localhost:11434)',
      };
    }
  }

  async listModels(settings?: UserProviderSettings) {
    try {
      const headers: Record<string, string> = {};
      if (settings?.ollamaBaseUrl) headers['x-ollama-url'] = settings.ollamaBaseUrl;

      const res = await fetch('/api/ai/models', { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).filter((m: any) => m.provider === 'ollama');
    } catch {
      return [];
    }
  }
}

class GeminiProvider implements IAIProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini';
  readonly type = 'cloud' as const;

  async checkHealth(settings?: UserProviderSettings): Promise<ProviderStatus> {
    try {
      const headers: Record<string, string> = {};
      if (settings?.geminiApiKey) headers['x-gemini-api-key'] = settings.geminiApiKey;

      const res = await fetch('/api/ai/health', { headers });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return data.gemini || {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'cloud',
        isConnected: false,
        isConfigured: false,
        message: 'Check failed',
      };
    } catch {
      return {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'cloud',
        isConnected: false,
        isConfigured: Boolean(settings?.geminiApiKey),
        message: 'Backend server not responding',
      };
    }
  }

  async listModels(settings?: UserProviderSettings) {
    try {
      const headers: Record<string, string> = {};
      if (settings?.geminiApiKey) headers['x-gemini-api-key'] = settings.geminiApiKey;

      const res = await fetch('/api/ai/models', { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).filter((m: any) => m.provider === 'gemini');
    } catch {
      return [];
    }
  }
}

class ClaudeProvider implements IAIProvider {
  readonly id = 'claude' as const;
  readonly name = 'Claude (Anthropic)';
  readonly type = 'cloud' as const;

  async checkHealth(settings?: UserProviderSettings): Promise<ProviderStatus> {
    try {
      const headers: Record<string, string> = {};
      if (settings?.claudeApiKey) headers['x-claude-api-key'] = settings.claudeApiKey;

      const res = await fetch('/api/ai/health', { headers });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return data.claude || {
        id: 'claude',
        name: 'Claude (Anthropic)',
        type: 'cloud',
        isConnected: false,
        isConfigured: false,
        message: 'Check failed',
      };
    } catch {
      return {
        id: 'claude',
        name: 'Claude (Anthropic)',
        type: 'cloud',
        isConnected: false,
        isConfigured: Boolean(settings?.claudeApiKey),
        message: 'Backend server not responding',
      };
    }
  }

  async listModels(settings?: UserProviderSettings) {
    try {
      const headers: Record<string, string> = {};
      if (settings?.claudeApiKey) headers['x-claude-api-key'] = settings.claudeApiKey;

      const res = await fetch('/api/ai/models', { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).filter((m: any) => m.provider === 'claude');
    } catch {
      return [];
    }
  }
}

export class ProviderManager {
  private providers: Map<AIProviderId, IAIProvider> = new Map();
  private statuses: Map<AIProviderId, ProviderStatus> = new Map();

  constructor() {
    this.register(new OllamaProvider());
    this.register(new GeminiProvider());
    this.register(new ClaudeProvider());
  }

  register(provider: IAIProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: AIProviderId): IAIProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  async checkAllStatuses(settings?: UserProviderSettings): Promise<Record<AIProviderId, ProviderStatus>> {
    try {
      const headers: Record<string, string> = {};
      if (settings?.ollamaBaseUrl) headers['x-ollama-url'] = settings.ollamaBaseUrl;
      if (settings?.geminiApiKey) headers['x-gemini-api-key'] = settings.geminiApiKey;
      if (settings?.claudeApiKey) headers['x-claude-api-key'] = settings.claudeApiKey;

      const res = await fetch('/api/ai/health', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.ollama) this.statuses.set('ollama', data.ollama);
        if (data.gemini) this.statuses.set('gemini', data.gemini);
        if (data.claude) this.statuses.set('claude', data.claude);
      }
    } catch (err) {
      // If endpoint failed, run individual health checks
      for (const provider of this.providers.values()) {
        const status = await provider.checkHealth(settings);
        this.statuses.set(provider.id, status);
      }
    }

    return {
      ollama: this.statuses.get('ollama') || {
        id: 'ollama',
        name: 'Ollama',
        type: 'local',
        isConnected: false,
        isConfigured: true,
        message: 'Offline',
      },
      gemini: this.statuses.get('gemini') || {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'cloud',
        isConnected: false,
        isConfigured: false,
        message: 'Not configured',
      },
      claude: this.statuses.get('claude') || {
        id: 'claude',
        name: 'Claude (Anthropic)',
        type: 'cloud',
        isConnected: false,
        isConfigured: false,
        message: 'Not configured',
      },
    };
  }

  getStatus(id: AIProviderId): ProviderStatus | undefined {
    return this.statuses.get(id);
  }
}

