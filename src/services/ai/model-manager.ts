import type { AIModel, AIProviderId, UserProviderSettings } from '../../types/ai';

const DEFAULT_SELECTIONS: Record<AIProviderId, string> = {
  ollama: 'llama3.2:3b',
  gemini: 'gemini-2.5-flash',
  claude: 'claude-3-7-sonnet-latest',
};

export class ModelManager {
  private models: AIModel[] = [];
  private selectedModels: Record<AIProviderId, string> = { ...DEFAULT_SELECTIONS };

  constructor() {
    // Load persisted model selections if any
    try {
      const saved = localStorage.getItem('chatripe_selected_models');
      if (saved) {
        this.selectedModels = { ...DEFAULT_SELECTIONS, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  async fetchModels(settings?: UserProviderSettings): Promise<AIModel[]> {
    try {
      const headers: Record<string, string> = {};
      if (settings?.ollamaBaseUrl) headers['x-ollama-url'] = settings.ollamaBaseUrl;
      if (settings?.geminiApiKey) headers['x-gemini-api-key'] = settings.geminiApiKey;
      if (settings?.claudeApiKey) headers['x-claude-api-key'] = settings.claudeApiKey;

      const res = await fetch('/api/ai/models', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.models = data.models || [];

      // Auto-validate current selections against discovered models
      for (const provider of ['ollama', 'gemini', 'claude'] as AIProviderId[]) {
        const available = this.models.filter((m) => m.provider === provider && m.isAvailable);
        const currentSel = this.selectedModels[provider];
        if (available.length > 0 && !available.some((m) => m.id === currentSel)) {
          this.selectedModels[provider] = available[0].id;
        }
      }

      return this.models;
    } catch (err) {
      console.warn('[ModelManager] Could not fetch remote models, returning cached/fallback list');
      return this.models;
    }
  }

  getModelsForProvider(provider: AIProviderId): AIModel[] {
    return this.models.filter((m) => m.provider === provider);
  }

  getSelectedModel(provider: AIProviderId): string {
    return this.selectedModels[provider] || DEFAULT_SELECTIONS[provider];
  }

  setSelectedModel(provider: AIProviderId, modelId: string) {
    this.selectedModels[provider] = modelId;
    try {
      localStorage.setItem('chatripe_selected_models', JSON.stringify(this.selectedModels));
    } catch {
      // Ignore localStorage errors
    }
  }

  getModelDetails(provider: AIProviderId, modelId: string): AIModel | undefined {
    return this.models.find((m) => m.provider === provider && m.id === modelId);
  }
}

