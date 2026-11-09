export type AIProviderId = 'ollama' | 'claude';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: AIProviderId;
  description?: string;
  parameterSize?: string;
  isLocal: boolean;
  isAvailable: boolean;
}

export interface ProviderStatus {
  id: AIProviderId;
  name: string;
  type: 'local' | 'cloud';
  isConnected: boolean;
  isConfigured: boolean;
  message?: string;
  latencyMs?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
  created_at?: number;
  provider?: AIProviderId;
  ai_provider?: AIProviderId;
  model?: string;
  ai_model?: string;
  error?: boolean;
  sources?: Array<{
    documentId: string;
    title: string;
    authors?: string;
    year?: number;
    excerpt: string;
  }>;
}

export interface Conversation {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  ai_provider: AIProviderId;
  ai_model: string;
  provider?: AIProviderId;
  model?: string;
  created_at: number;
  updated_at: number;
  createdAt?: number;
  updatedAt?: number;
  archived_at?: number | null;
  messages: ChatMessage[];
  last_message_preview?: string;
  message_count?: number;
}

export interface MemoryItem {
  id: string;
  user_id: string;
  conversation_id?: string;
  memory_type: 'fact' | 'preference' | 'topic' | 'goal' | 'summary';
  memory_content: string;
  importance: number;
  created_at: number;
  updated_at: number;
}

export interface ResearchContextItem {
  id: string;
  user_id: string;
  title: string;
  context_content: string;
  source_conversation_id?: string;
  created_at: number;
  updated_at: number;
}

export interface ResearchFolder {
  id: string;
  user_id: string;
  folder_name: string;
  parent_folder_id?: string;
  created_at: number;
  doc_count?: number;
}

export interface ResearchDocument {
  id: string;
  user_id: string;
  folder_id?: string;
  title: string;
  description?: string;
  document_type: 'paper' | 'proposal' | 'literature_review' | 'thesis' | 'notes';
  content?: string;
  html_content?: string;
  file_path?: string;
  file_format: string;
  authors?: string;
  publication_year?: number;
  abstract?: string;
  keywords?: string;
  research_category?: string;
  publication_source?: string;
  doi?: string;
  file_size?: number;
  created_at: number;
  updated_at: number;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  content_snapshot?: string;
  html_snapshot?: string;
  created_at: number;
}

export interface UserProviderSettings {
  claudeApiKey?: string;
  ollamaBaseUrl?: string;
  enableMemory?: boolean;
}

export interface ChatStreamRequest {
  conversationId?: string;
  provider: AIProviderId;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  systemPrompt?: string;
  documentIds?: string[];
  enableMemory?: boolean;
  settings?: UserProviderSettings;
}

export type WritingAssistantAction =
  | 'improve'
  | 'grammar'
  | 'paraphrase'
  | 'summarize'
  | 'expand'
  | 'shorten'
  | 'objectives'
  | 'methodology'
  | 'conclusion'
  | 'abstract'
  | 'references';
