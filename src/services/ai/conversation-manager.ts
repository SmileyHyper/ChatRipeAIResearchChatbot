import type { AIProviderId, ChatMessage, Conversation } from '../../types/ai';

const ACTIVE_CONV_KEY = 'chatripe_active_conversation_id';

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private activeId: string | null = null;
  private currentUserId: string = 'user_default_scholar';

  constructor() {
    this.activeId = localStorage.getItem(ACTIVE_CONV_KEY) || null;
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-user-id': this.currentUserId,
    };
  }

  async loadFromDatabase(): Promise<Conversation[]> {
    try {
      const res = await fetch('/api/conversations', { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list: Conversation[] = (data.conversations || []).map((c: any) => ({
          ...c,
          provider: c.ai_provider,
          model: c.ai_model,
          messages: [],
        }));

        this.conversations.clear();
        for (const conv of list) {
          this.conversations.set(conv.id, conv);
        }

        if (!this.activeId || !this.conversations.has(this.activeId)) {
          if (list.length > 0) {
            this.activeId = list[0].id;
          } else {
            await this.createNewConversation('ollama', 'llama3.2:3b');
          }
        }

        // Load active conversation messages
        if (this.activeId) {
          await this.loadConversationDetails(this.activeId);
        }
      }
    } catch (err) {
      console.warn('[ConversationManager] Failed to load from database, checking fallback');
    }

    return this.getAllConversations();
  }

  async loadConversationDetails(id: string): Promise<Conversation | undefined> {
    try {
      const res = await fetch(`/api/conversations/${id}`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const conv: Conversation = {
          ...data.conversation,
          provider: data.conversation.ai_provider,
          model: data.conversation.ai_model,
          messages: (data.messages || []).map((m: any) => ({
            ...m,
            provider: m.ai_provider,
            model: m.ai_model,
            createdAt: m.created_at,
          })),
        };
        this.conversations.set(id, conv);
        return conv;
      }
    } catch (err) {
      console.warn(`[ConversationManager] Failed to load conversation ${id}`);
    }
    return this.conversations.get(id);
  }

  async createNewConversation(provider: AIProviderId = 'ollama', model: string = 'llama3.2:3b'): Promise<Conversation> {
    const tempId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newConv: Conversation = {
      id: tempId,
      title: 'New conversation',
      ai_provider: provider,
      ai_model: model,
      provider,
      model,
      created_at: Date.now(),
      updated_at: Date.now(),
      messages: [],
    };

    this.conversations.set(tempId, newConv);
    this.activeId = tempId;
    localStorage.setItem(ACTIVE_CONV_KEY, tempId);

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          title: 'New conversation',
          ai_provider: provider,
          ai_model: model,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverConv: Conversation = {
          ...data.conversation,
          provider: data.conversation.ai_provider,
          model: data.conversation.ai_model,
          messages: [],
        };
        this.conversations.delete(tempId);
        this.conversations.set(serverConv.id, serverConv);
        this.activeId = serverConv.id;
        localStorage.setItem(ACTIVE_CONV_KEY, serverConv.id);
        return serverConv;
      }
    } catch {}

    return newConv;
  }

  getActiveConversation(): Conversation {
    if (!this.activeId || !this.conversations.has(this.activeId)) {
      const list = this.getAllConversations();
      if (list.length > 0) {
        this.activeId = list[0].id;
      } else {
        const dummy: Conversation = {
          id: 'conv_initial',
          title: 'New conversation',
          ai_provider: 'ollama',
          ai_model: 'llama3.2:3b',
          provider: 'ollama',
          model: 'llama3.2:3b',
          created_at: Date.now(),
          updated_at: Date.now(),
          messages: [],
        };
        this.conversations.set(dummy.id, dummy);
        this.activeId = dummy.id;
      }
    }
    return this.conversations.get(this.activeId!)!;
  }

  async setActiveConversation(id: string): Promise<Conversation | undefined> {
    if (this.conversations.has(id)) {
      this.activeId = id;
      localStorage.setItem(ACTIVE_CONV_KEY, id);
      return await this.loadConversationDetails(id);
    }
    return undefined;
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  async renameConversation(id: string, newTitle: string): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) {
      conv.title = newTitle;
      conv.updated_at = Date.now();
    }
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {}
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    if (this.activeId === id) {
      const remaining = this.getAllConversations();
      this.activeId = remaining.length > 0 ? remaining[0].id : null;
      if (this.activeId) {
        localStorage.setItem(ACTIVE_CONV_KEY, this.activeId);
        await this.loadConversationDetails(this.activeId);
      } else {
        await this.createNewConversation();
      }
    }

    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
    } catch {}
  }

  async clearCurrentMessages(): Promise<void> {
    const active = this.getActiveConversation();
    active.messages = [];
    active.updated_at = Date.now();

    try {
      await fetch(`/api/conversations/${active.id}/messages`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
    } catch {}
  }

  updateConversationProvider(provider: AIProviderId, model: string): void {
    const active = this.getActiveConversation();
    active.ai_provider = provider;
    active.ai_model = model;
    active.provider = provider;
    active.model = model;
    active.updated_at = Date.now();

    try {
      fetch(`/api/conversations/${active.id}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ ai_provider: provider, ai_model: model }),
      });
    } catch {}
  }

  addUserMessage(content: string): ChatMessage {
    const active = this.getActiveConversation();
    const msg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      role: 'user',
      content,
      created_at: Date.now(),
      createdAt: Date.now(),
    };
    active.messages.push(msg);
    active.updated_at = Date.now();

    if (active.messages.length === 1 || active.title === 'New conversation') {
      const cleanTitle = content.trim().replace(/\s+/g, ' ');
      active.title = cleanTitle.length > 36 ? cleanTitle.substring(0, 33) + '...' : cleanTitle;
    }

    return msg;
  }

  addAssistantMessage(content: string, provider: AIProviderId, model: string, error = false): ChatMessage {
    const active = this.getActiveConversation();
    const msg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      role: 'assistant',
      content,
      created_at: Date.now(),
      createdAt: Date.now(),
      provider,
      ai_provider: provider,
      model,
      ai_model: model,
      error,
    };
    active.messages.push(msg);
    active.updated_at = Date.now();
    return msg;
  }

  updateAssistantMessage(id: string, content: string, error = false, sources?: any[]): void {
    const active = this.getActiveConversation();
    const target = active.messages.find((m) => m.id === id);
    if (target) {
      target.content = content;
      target.error = error;
      if (sources) target.sources = sources;
      active.updated_at = Date.now();
    }
  }

  removeLastAssistantMessage(): ChatMessage | undefined {
    const active = this.getActiveConversation();
    if (active.messages.length > 0 && active.messages[active.messages.length - 1].role === 'assistant') {
      const removed = active.messages.pop();
      active.updated_at = Date.now();
      return removed;
    }
    return undefined;
  }
}
