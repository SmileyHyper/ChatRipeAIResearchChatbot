import type { AIModel, AIProviderId, ProviderStatus, UserProviderSettings } from '../../types/ai';

export interface IAIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly type: 'local' | 'cloud';
  checkHealth(settings?: UserProviderSettings): Promise<ProviderStatus>;
  listModels(settings?: UserProviderSettings): Promise<AIModel[]>;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

