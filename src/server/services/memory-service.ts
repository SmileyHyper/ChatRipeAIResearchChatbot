import { db } from '../database/db.ts';

export interface MemoryItem {
  id: string;
  userId: string;
  conversationId?: string;
  memoryType: 'fact' | 'preference' | 'topic' | 'goal' | 'summary';
  memoryContent: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResearchContextItem {
  id: string;
  userId: string;
  title: string;
  contextContent: string;
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Retrieve saved memories for a user, sorted by importance and update recency
 */
export function getUserMemories(userId: string): MemoryItem[] {
  const rows = db.prepare(`
    SELECT id, user_id, conversation_id, memory_type, memory_content, importance, created_at, updated_at
    FROM conversation_memory
    WHERE user_id = ?
    ORDER BY importance DESC, updated_at DESC
    LIMIT 30
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    conversationId: r.conversation_id || undefined,
    memoryType: r.memory_type,
    memoryContent: r.memory_content,
    importance: r.importance,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Save or update a memory
 */
export function saveMemory(params: {
  userId: string;
  conversationId?: string;
  memoryType: 'fact' | 'preference' | 'topic' | 'goal' | 'summary';
  memoryContent: string;
  importance?: number;
}): MemoryItem {
  const now = Date.now();
  const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const importance = params.importance || 1;

  db.prepare(`
    INSERT INTO conversation_memory (id, user_id, conversation_id, memory_type, memory_content, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.userId, params.conversationId || null, params.memoryType, params.memoryContent, importance, now, now);

  return {
    id,
    userId: params.userId,
    conversationId: params.conversationId,
    memoryType: params.memoryType,
    memoryContent: params.memoryContent,
    importance,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update an existing memory
 */
export function updateMemory(id: string, userId: string, content: string, importance?: number): boolean {
  const now = Date.now();
  let sql = 'UPDATE conversation_memory SET memory_content = ?, updated_at = ?';
  const params: any[] = [content, now];

  if (typeof importance === 'number') {
    sql += ', importance = ?';
    params.push(importance);
  }

  sql += ' WHERE id = ? AND user_id = ?';
  params.push(id, userId);

  const res = db.prepare(sql).run(...params);
  return res.changes > 0;
}

/**
 * Delete a memory
 */
export function deleteMemory(id: string, userId: string): boolean {
  const res = db.prepare('DELETE FROM conversation_memory WHERE id = ? AND user_id = ?').run(id, userId);
  return res.changes > 0;
}

/**
 * Retrieve saved research contexts
 */
export function getUserResearchContexts(userId: string): ResearchContextItem[] {
  const rows = db.prepare(`
    SELECT id, user_id, title, context_content, source_conversation_id, created_at, updated_at
    FROM research_context
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    contextContent: r.context_content,
    sourceConversationId: r.source_conversation_id || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Save research context item
 */
export function saveResearchContext(params: {
  userId: string;
  title: string;
  contextContent: string;
  sourceConversationId?: string;
}): ResearchContextItem {
  const now = Date.now();
  const id = 'ctx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  db.prepare(`
    INSERT INTO research_context (id, user_id, title, context_content, source_conversation_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.userId, params.title, params.contextContent, params.sourceConversationId || null, now, now);

  return {
    id,
    userId: params.userId,
    title: params.title,
    contextContent: params.contextContent,
    sourceConversationId: params.sourceConversationId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete research context
 */
export function deleteResearchContext(id: string, userId: string): boolean {
  const res = db.prepare('DELETE FROM research_context WHERE id = ? AND user_id = ?').run(id, userId);
  return res.changes > 0;
}

/**
 * Assemble AI Context before sending prompt to AI provider:
 * 1. Relevant previous messages (context window)
 * 2. Saved user memories (if enabled)
 * 3. Related research context
 * 4. RAG document chunks
 */
export function constructEnrichedSystemPrompt(params: {
  basePrompt?: string;
  userId: string;
  conversationId?: string;
  enableMemory?: boolean;
  retrievedChunks?: Array<{ documentTitle: string; content: string; authors?: string; year?: number }>;
}): string {
  const { basePrompt, userId, enableMemory = true, retrievedChunks } = params;

  let enriched = basePrompt || 'You are ChatRipe, an advanced scholarly research AI assistant dedicated to responsible academic inquiry, rigorous analysis, and scholarly writing at Southern Leyte State University (SLSU).';

  // 1. Inject Saved Memories
  if (enableMemory) {
    const memories = getUserMemories(userId);
    if (memories.length > 0) {
      enriched += '\n\n### USER RESEARCH PROFILE & MEMORY:';
      enriched += '\nRemember the following user research context and preferences across sessions:';
      for (const m of memories.slice(0, 8)) {
        enriched += `\n- [${m.memoryType.toUpperCase()}]: ${m.memoryContent}`;
      }
    }

    // 2. Inject Active Research Contexts
    const contexts = getUserResearchContexts(userId);
    if (contexts.length > 0) {
      enriched += '\n\n### SAVED RESEARCH CONTEXT:';
      for (const c of contexts.slice(0, 3)) {
        enriched += `\n- **${c.title}**: ${c.contextContent.slice(0, 300)}...`;
      }
    }
  }

  // 3. Inject RAG Retrieved Document Content
  if (retrievedChunks && retrievedChunks.length > 0) {
    enriched += '\n\n### RETRIEVED LIBRARY DOCUMENTS (RAG GROUNDING):';
    enriched += '\nYou MUST prioritize the following verified research excerpts in your response. Cite the source document title whenever referencing findings. Do NOT fabricate citations or claim that a document contains information that is not present in these excerpts:';

    retrievedChunks.forEach((chunk, index) => {
      const citation = `${chunk.documentTitle}${chunk.authors ? ` (${chunk.authors}${chunk.year ? `, ${chunk.year}` : ''})` : ''}`;
      enriched += `\n\n[Source ${index + 1}: ${citation}]\n${chunk.content}`;
    });
  }

  return enriched;
}

/**
 * Automatically extract key research topics or facts from a conversation to store as memory
 */
export function extractAndSaveConversationMemory(userId: string, conversationId: string, userText: string) {
  // Simple heuristic memory extraction for common research phrases
  const lower = userText.toLowerCase();

  if (lower.includes('my thesis is') || lower.includes('my topic is') || lower.includes('i am studying') || lower.includes('researching')) {
    const content = userText.trim();
    saveMemory({
      userId,
      conversationId,
      memoryType: 'topic',
      memoryContent: content.length > 200 ? content.slice(0, 197) + '...' : content,
      importance: 4,
    });
  } else if (lower.includes('my methodology') || lower.includes('using qualitative') || lower.includes('using quantitative')) {
    saveMemory({
      userId,
      conversationId,
      memoryType: 'fact',
      memoryContent: userText.trim().slice(0, 200),
      importance: 3,
    });
  }
}

