import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, hashPassword, UPLOADS_DIR } from './database/db.ts';
import {
  extractDocumentContent,
  generateDocxBuffer,
  indexDocumentChunks,
  searchRelevantChunks,
} from './services/document-service.ts';
import {
  constructEnrichedSystemPrompt,
  deleteMemory,
  deleteResearchContext,
  extractAndSaveConversationMemory,
  getUserMemories,
  getUserResearchContexts,
  saveMemory,
  saveResearchContext,
  updateMemory,
} from './services/memory-service.ts';

// Load environment variables from .env
dotenv.config();

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestPayload {
  conversationId?: string;
  provider: 'ollama' | 'gemini' | 'claude';
  model: string;
  messages: ChatMessagePayload[];
  systemPrompt?: string;
  documentIds?: string[];
  enableMemory?: boolean;
  settings?: {
    geminiApiKey?: string;
    claudeApiKey?: string;
    ollamaBaseUrl?: string;
  };
}

// Fallback known models if providers are offline or not yet probed
export const DEFAULT_MODELS = {
  ollama: [
    { id: 'llama3.2:3b', name: 'Llama 3.2 (3B)', description: 'Fast, compact local model by Meta', parameterSize: '3B', isLocal: true },
    { id: 'llama3.2', name: 'Llama 3.2', description: 'Meta lightweight state-of-the-art model', parameterSize: '3B', isLocal: true },
    { id: 'qwen2.5', name: 'Qwen 2.5', description: 'Alibaba Cloud high-capability model', parameterSize: '7B', isLocal: true },
    { id: 'mistral', name: 'Mistral 7B', description: 'General purpose versatile model', parameterSize: '7B', isLocal: true },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', description: 'Advanced reasoning and problem-solving', parameterSize: '7B/8B', isLocal: true },
    { id: 'gemma3', name: 'Gemma 3', description: 'Google open weights model', parameterSize: '4B/12B', isLocal: true },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Google next-gen high speed multimodal model (Recommended)', parameterSize: 'Cloud', isLocal: false },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced reasoning, deep research and complex analysis', parameterSize: 'Cloud', isLocal: false },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Ultra-fast low-latency cloud model', parameterSize: 'Cloud', isLocal: false },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Efficient general research model', parameterSize: 'Cloud', isLocal: false },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Large context window (1M+ tokens)', parameterSize: 'Cloud', isLocal: false },
  ],
  claude: [
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning and high performance (Anthropic)', parameterSize: 'Cloud', isLocal: false },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Excels at coding and scholarly research', parameterSize: 'Cloud', isLocal: false },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', description: 'Fast, lightweight Claude model', parameterSize: 'Cloud', isLocal: false },
  ],
};

/**
 * Read request JSON body safely with generous size limit for file uploads (35MB)
 */
export async function readJsonBody<T = any>(req: IncomingMessage, maxBytes = 35 * 1024 * 1024): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Request payload too large (max 35MB)'));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      try {
        if (!raw.trim()) {
          resolve({} as T);
        } else {
          resolve(JSON.parse(raw));
        }
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Send JSON response
 */
export function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-api-key, x-claude-api-key, x-ollama-url, x-user-id');
  res.end(JSON.stringify(data));
}

/**
 * Send Server-Sent Events headers
 */
export function initSse(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-api-key, x-claude-api-key, x-ollama-url, x-user-id');
  res.flushHeaders?.();
}

/**
 * Emit an SSE event
 */
export function writeSse(res: ServerResponse, event: { type: 'chunk' | 'done' | 'error' | 'sources'; delta?: string; error?: string; model?: string; sources?: any[] }) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Extract authenticated user ID from request headers or default to scholar
 */
export function getAuthenticatedUserId(req: IncomingMessage): string {
  const customId = req.headers['x-user-id'] as string;
  if (customId && customId.trim()) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(customId.trim());
    if (user) return customId.trim();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(token);
      if (user) return token;
    }
  }

  return 'user_default_scholar';
}

// ==========================================
// 1. AUTHENTICATION CONTROLLER
// ==========================================
export async function handleAuth(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const { email, password } = body;
    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as any;
    if (!user) {
      return sendJson(res, 401, { error: 'Invalid email or password' });
    }

    const inputHash = hashPassword(password);
    if (user.password_hash !== inputHash) {
      return sendJson(res, 401, { error: 'Invalid email or password' });
    }

    return sendJson(res, 200, {
      user: { id: user.id, name: user.name, email: user.email },
      token: user.id,
    });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const { name, email, password } = body;
    if (!name || !email || !password) {
      return sendJson(res, 400, { error: 'Name, email, and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return sendJson(res, 400, { error: 'User with this email already exists' });
    }

    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = Date.now();
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), cleanEmail, passwordHash, now, now);

    // Create default research folder
    db.prepare(`
      INSERT INTO research_folders (id, user_id, folder_name, parent_folder_id, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(`folder_${id}_gen`, id, 'General Research', now);

    return sendJson(res, 201, {
      user: { id, name: name.trim(), email: cleanEmail },
      token: id,
    });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const userId = getAuthenticatedUserId(req);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    return sendJson(res, 200, { user });
  }

  sendJson(res, 404, { error: 'Auth route not found' });
}

// ==========================================
// 2. CONVERSATIONS & MESSAGES CONTROLLER
// ==========================================
export async function handleConversations(req: IncomingMessage, res: ServerResponse, pathname: string, method: string) {
  const userId = getAuthenticatedUserId(req);

  // List all conversations for the user
  if (pathname === '/api/conversations' && method === 'GET') {
    const rows = db.prepare(`
      SELECT c.*, 
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
    `).all(userId) as any[];

    return sendJson(res, 200, { conversations: rows });
  }

  // Create new conversation
  if (pathname === '/api/conversations' && method === 'POST') {
    const body = await readJsonBody(req);
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const title = body.title || 'New conversation';
    const provider = body.ai_provider || 'ollama';
    const model = body.ai_model || 'llama3.2:3b';

    db.prepare(`
      INSERT INTO conversations (id, user_id, title, description, ai_provider, ai_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, title, body.description || null, provider, model, now, now);

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return sendJson(res, 201, { conversation: conv });
  }

  // Conversation detail: /api/conversations/:id
  const matchDetail = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (matchDetail) {
    const convId = matchDetail[1];

    if (method === 'GET') {
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId) as any;
      if (!conv) return sendJson(res, 404, { error: 'Conversation not found' });

      const messages = db.prepare(`
        SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
      `).all(convId);

      return sendJson(res, 200, { conversation: conv, messages });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(req);
      const now = Date.now();
      const updates: string[] = ['updated_at = ?'];
      const params: any[] = [now];

      if (body.title) {
        updates.push('title = ?');
        params.push(body.title);
      }
      if (body.ai_provider) {
        updates.push('ai_provider = ?');
        params.push(body.ai_provider);
      }
      if (body.ai_model) {
        updates.push('ai_model = ?');
        params.push(body.ai_model);
      }
      if (typeof body.archived !== 'undefined') {
        updates.push('archived_at = ?');
        params.push(body.archived ? now : null);
      }

      params.push(convId, userId);
      db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
      return sendJson(res, 200, { conversation: conv });
    }

    if (method === 'DELETE') {
      db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(convId, userId);
      return sendJson(res, 200, { success: true });
    }
  }

  // Clear messages in conversation: /api/conversations/:id/messages
  const matchClear = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (matchClear && method === 'DELETE') {
    const convId = matchClear[1];
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?').run(Date.now(), convId, userId);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 404, { error: 'Conversation endpoint not found' });
}

// ==========================================
// 3. MEMORIES & RESEARCH CONTEXTS CONTROLLER
// ==========================================
export async function handleMemoriesAndContexts(req: IncomingMessage, res: ServerResponse, pathname: string, method: string) {
  const userId = getAuthenticatedUserId(req);

  // Memories list & create
  if (pathname === '/api/memories') {
    if (method === 'GET') {
      const memories = getUserMemories(userId);
      return sendJson(res, 200, { memories });
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.memory_content) {
        return sendJson(res, 400, { error: 'Memory content is required' });
      }
      const item = saveMemory({
        userId,
        conversationId: body.conversation_id,
        memoryType: body.memory_type || 'fact',
        memoryContent: body.memory_content,
        importance: body.importance || 1,
      });
      return sendJson(res, 201, { memory: item });
    }
  }

  // Single memory update / delete
  const matchMem = pathname.match(/^\/api\/memories\/([^/]+)$/);
  if (matchMem) {
    const memId = matchMem[1];
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJsonBody(req);
      const success = updateMemory(memId, userId, body.memory_content, body.importance);
      return sendJson(res, 200, { success });
    }
    if (method === 'DELETE') {
      const success = deleteMemory(memId, userId);
      return sendJson(res, 200, { success });
    }
  }

  // Research Contexts list & create
  if (pathname === '/api/contexts') {
    if (method === 'GET') {
      const contexts = getUserResearchContexts(userId);
      return sendJson(res, 200, { contexts });
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.title || !body.context_content) {
        return sendJson(res, 400, { error: 'Title and context_content are required' });
      }
      const item = saveResearchContext({
        userId,
        title: body.title,
        contextContent: body.context_content,
        sourceConversationId: body.source_conversation_id,
      });
      return sendJson(res, 201, { context: item });
    }
  }

  // Single context delete
  const matchCtx = pathname.match(/^\/api\/contexts\/([^/]+)$/);
  if (matchCtx && method === 'DELETE') {
    const ctxId = matchCtx[1];
    const success = deleteResearchContext(ctxId, userId);
    return sendJson(res, 200, { success });
  }

  sendJson(res, 404, { error: 'Memory endpoint not found' });
}

// ==========================================
// 4. RESEARCH LIBRARY DOCUMENTS CONTROLLER
// ==========================================
export async function handleDocuments(req: IncomingMessage, res: ServerResponse, pathname: string, method: string) {
  const userId = getAuthenticatedUserId(req);

  // List all documents
  if (pathname === '/api/documents' && method === 'GET') {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const folderId = urlObj.searchParams.get('folderId');
    const search = urlObj.searchParams.get('search');

    let sql = 'SELECT * FROM research_documents WHERE user_id = ?';
    const params: any[] = [userId];

    if (folderId) {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }
    if (search) {
      sql += ' AND (title LIKE ? OR abstract LIKE ? OR keywords LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY updated_at DESC';
    const documents = db.prepare(sql).all(...params);
    return sendJson(res, 200, { documents });
  }

  // Upload document: /api/documents/upload
  if (pathname === '/api/documents/upload' && method === 'POST') {
    const body = await readJsonBody(req);
    const { fileName, fileFormat, fileBase64, folderId, title, authors, publicationYear, category } = body;

    if (!fileName || !fileBase64) {
      return sendJson(res, 400, { error: 'fileName and fileBase64 are required' });
    }

    const ext = (fileFormat || path.extname(fileName)).toLowerCase().replace(/^\./, '');
    const buffer = Buffer.from(fileBase64, 'base64');

    // Save physical file to uploads/
    const diskFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, diskFileName);
    fs.writeFileSync(filePath, buffer);

    // Parse content
    const parsed = await extractDocumentContent(buffer, ext, fileName);

    const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const docTitle = title || fileName.replace(/\.[^/.]+$/, '');

    db.prepare(`
      INSERT INTO research_documents (
        id, user_id, folder_id, title, description, document_type, content, html_content,
        file_path, file_format, authors, publication_year, abstract, keywords,
        research_category, publication_source, doi, file_size, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      userId,
      folderId || null,
      docTitle,
      body.description || null,
      body.document_type || 'paper',
      parsed.text,
      parsed.html,
      filePath,
      ext,
      authors || parsed.authors || null,
      publicationYear || parsed.year || new Date().getFullYear(),
      parsed.abstract || body.abstract || null,
      body.keywords || null,
      category || 'General',
      body.publication_source || null,
      body.doi || null,
      buffer.length,
      now,
      now
    );

    // Index chunks for RAG
    indexDocumentChunks(docId, parsed.text);

    // Initial version snapshot
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, content_snapshot, html_snapshot, created_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(`ver_${docId}_1`, docId, parsed.text, parsed.html, now);

    const createdDoc = db.prepare('SELECT * FROM research_documents WHERE id = ?').get(docId);
    return sendJson(res, 201, { document: createdDoc });
  }

  // Create document manually (e.g. from template or blank editor): /api/documents
  if (pathname === '/api/documents' && method === 'POST') {
    const body = await readJsonBody(req);
    const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const docTitle = body.title || 'Untitled Research Paper';
    const content = body.content || '';
    const htmlContent = body.html_content || `<div class="doc-body"><p>${content}</p></div>`;

    db.prepare(`
      INSERT INTO research_documents (
        id, user_id, folder_id, title, description, document_type, content, html_content,
        file_path, file_format, authors, publication_year, abstract, keywords,
        research_category, publication_source, doi, file_size, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      userId,
      body.folder_id || null,
      docTitle,
      body.description || null,
      body.document_type || 'paper',
      content,
      htmlContent,
      null,
      'docx',
      body.authors || 'SLSU Researcher',
      body.publication_year || new Date().getFullYear(),
      body.abstract || null,
      body.keywords || null,
      body.research_category || 'General',
      body.publication_source || null,
      body.doi || null,
      content.length,
      now,
      now
    );

    // Index chunks
    indexDocumentChunks(docId, content);

    // Version 1
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, content_snapshot, html_snapshot, created_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(`ver_${docId}_1`, docId, content, htmlContent, now);

    const doc = db.prepare('SELECT * FROM research_documents WHERE id = ?').get(docId);
    return sendJson(res, 201, { document: doc });
  }

  // Download DOCX: /api/documents/:id/download-docx
  const matchDocx = pathname.match(/^\/api\/documents\/([^/]+)\/download-docx$/);
  if (matchDocx && method === 'GET') {
    const docId = matchDocx[1];
    const doc = db.prepare('SELECT * FROM research_documents WHERE id = ? AND user_id = ?').get(docId, userId) as any;
    if (!doc) return sendJson(res, 404, { error: 'Document not found' });

    try {
      const buffer = await generateDocxBuffer({
        title: doc.title,
        content: doc.content || '',
        authors: doc.authors,
        abstract: doc.abstract,
        category: doc.research_category,
      });

      const cleanName = doc.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Research_Paper';
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanName}.docx"`);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
      return;
    } catch (err: any) {
      return sendJson(res, 500, { error: `Failed to generate DOCX: ${err.message}` });
    }
  }

  // Versions history: /api/documents/:id/versions
  const matchVersions = pathname.match(/^\/api\/documents\/([^/]+)\/versions$/);
  if (matchVersions && method === 'GET') {
    const docId = matchVersions[1];
    const versions = db.prepare(`
      SELECT id, document_id, version_number, created_at
      FROM document_versions
      WHERE document_id = ?
      ORDER BY version_number DESC
    `).all(docId);
    return sendJson(res, 200, { versions });
  }

  // Restore version: /api/documents/:id/restore-version
  const matchRestore = pathname.match(/^\/api\/documents\/([^/]+)\/restore-version$/);
  if (matchRestore && method === 'POST') {
    const docId = matchRestore[1];
    const body = await readJsonBody(req);
    const versionNumber = body.version_number;

    const version = db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND version_number = ?').get(docId, versionNumber) as any;
    if (!version) return sendJson(res, 404, { error: 'Version not found' });

    const now = Date.now();
    db.prepare(`
      UPDATE research_documents
      SET content = ?, html_content = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(version.content_snapshot, version.html_snapshot, now, docId, userId);

    const updatedDoc = db.prepare('SELECT * FROM research_documents WHERE id = ?').get(docId);
    return sendJson(res, 200, { document: updatedDoc });
  }

  // Single document GET, PUT, DELETE: /api/documents/:id
  const matchSingle = pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (matchSingle) {
    const docId = matchSingle[1];

    if (method === 'GET') {
      const doc = db.prepare('SELECT * FROM research_documents WHERE id = ? AND user_id = ?').get(docId, userId);
      if (!doc) return sendJson(res, 404, { error: 'Document not found' });
      return sendJson(res, 200, { document: doc });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJsonBody(req);
      const existing = db.prepare('SELECT * FROM research_documents WHERE id = ? AND user_id = ?').get(docId, userId) as any;
      if (!existing) return sendJson(res, 404, { error: 'Document not found' });

      const now = Date.now();
      const newTitle = body.title || existing.title;
      const newContent = typeof body.content !== 'undefined' ? body.content : existing.content;
      const newHtml = typeof body.html_content !== 'undefined' ? body.html_content : existing.html_content;
      const newAuthors = typeof body.authors !== 'undefined' ? body.authors : existing.authors;
      const newYear = typeof body.publication_year !== 'undefined' ? body.publication_year : existing.publication_year;
      const newAbstract = typeof body.abstract !== 'undefined' ? body.abstract : existing.abstract;
      const newCategory = typeof body.research_category !== 'undefined' ? body.research_category : existing.research_category;
      const newKeywords = typeof body.keywords !== 'undefined' ? body.keywords : existing.keywords;
      const newFolderId = typeof body.folder_id !== 'undefined' ? body.folder_id : existing.folder_id;

      db.prepare(`
        UPDATE research_documents
        SET title = ?, content = ?, html_content = ?, authors = ?, publication_year = ?,
            abstract = ?, research_category = ?, keywords = ?, folder_id = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(newTitle, newContent, newHtml, newAuthors, newYear, newAbstract, newCategory, newKeywords, newFolderId, now, docId, userId);

      // Create new version snapshot if content changed significantly
      if (body.content && body.content !== existing.content) {
        const lastVer = db.prepare('SELECT MAX(version_number) as max_ver FROM document_versions WHERE document_id = ?').get(docId) as any;
        const nextVer = (lastVer?.max_ver || 0) + 1;
        db.prepare(`
          INSERT INTO document_versions (id, document_id, version_number, content_snapshot, html_snapshot, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`ver_${docId}_${nextVer}`, docId, newContent, newHtml, now);

        // Re-index chunks
        indexDocumentChunks(docId, newContent);
      }

      const updated = db.prepare('SELECT * FROM research_documents WHERE id = ?').get(docId);
      return sendJson(res, 200, { document: updated });
    }

    if (method === 'DELETE') {
      const doc = db.prepare('SELECT file_path FROM research_documents WHERE id = ? AND user_id = ?').get(docId, userId) as any;
      if (doc && doc.file_path && fs.existsSync(doc.file_path)) {
        try {
          fs.unlinkSync(doc.file_path);
        } catch {}
      }
      db.prepare('DELETE FROM research_documents WHERE id = ? AND user_id = ?').run(docId, userId);
      return sendJson(res, 200, { success: true });
    }
  }

  sendJson(res, 404, { error: 'Document endpoint not found' });
}

// ==========================================
// 5. FOLDERS CONTROLLER
// ==========================================
export async function handleFolders(req: IncomingMessage, res: ServerResponse, pathname: string, method: string) {
  const userId = getAuthenticatedUserId(req);

  if (pathname === '/api/folders') {
    if (method === 'GET') {
      const folders = db.prepare(`
        SELECT f.*, (SELECT COUNT(*) FROM research_documents WHERE folder_id = f.id) as doc_count
        FROM research_folders f
        WHERE f.user_id = ?
        ORDER BY f.folder_name ASC
      `).all(userId);
      return sendJson(res, 200, { folders });
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.folder_name) {
        return sendJson(res, 400, { error: 'Folder name is required' });
      }
      const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const now = Date.now();
      db.prepare(`
        INSERT INTO research_folders (id, user_id, folder_name, parent_folder_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, body.folder_name.trim(), body.parent_folder_id || null, now);

      const created = db.prepare('SELECT * FROM research_folders WHERE id = ?').get(id);
      return sendJson(res, 201, { folder: created });
    }
  }

  const matchFolder = pathname.match(/^\/api\/folders\/([^/]+)$/);
  if (matchFolder && method === 'DELETE') {
    const folderId = matchFolder[1];
    db.prepare('DELETE FROM research_folders WHERE id = ? AND user_id = ?').run(folderId, userId);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 404, { error: 'Folder endpoint not found' });
}

// ==========================================
// 6. AI WRITING ASSISTANT (chat-to-prompt + humanizer)
// ==========================================
const WRITING_SYSTEM_PROMPT = `You are an expert academic writing assistant embedded in a research paper editor.
- Follow the user's instruction exactly, using the provided document text or selection as source material.
- If the instruction asks for a rewrite or draft, return ONLY the text to insert, with no meta-commentary, preambles, or markdown symbols such as ** or #.
- If the user asks a question, answer briefly and directly.
- Never invent citations, statistics, or findings that are not in the provided text.`;

const HUMANIZE_SYSTEM_PROMPT = `You are an editor who makes academic prose read like it was written by a careful human researcher.
Rewrite the text following these rules:
- Preserve every fact, number, citation, technical term, and the original meaning. Do not add new claims.
- Vary sentence length and structure; mix short and long sentences. Avoid uniform rhythm.
- Remove filler and stock phrases (e.g. "delve into", "it is important to note", "in today's world", "plays a crucial role", "moreover/furthermore" chains, "in conclusion", "tapestry", "landscape", "underscores").
- Prefer plain, specific wording over inflated vocabulary. Use active voice where natural.
- Keep a formal scholarly register suitable for a thesis or journal paper. No slang, no emojis.
- Avoid excessive lists, em dashes, and symmetrical "not only... but also" constructions.
Return ONLY the rewritten text.`;

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  ollama: 'llama3.2:3b',
  gemini: 'gemini-2.5-flash',
  claude: 'claude-3-7-sonnet-latest',
};

async function callWritingModel(opts: {
  provider: string;
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  settings?: any;
}): Promise<string> {
  const { provider, model, system, messages, settings } = opts;

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key is missing. Configure in Settings.');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: { systemInstruction: system },
    });
    return response.text || '';
  }

  if (provider === 'claude') {
    const apiKey = settings?.claudeApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Claude API key is missing. Configure in Settings.');
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages,
    });
    return (msg.content[0] as any)?.text || '';
  }

  const ollamaUrl = settings?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
  const resp = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      stream: false,
    }),
  });
  if (!resp.ok) throw new Error(`Ollama error (${resp.status}): ${await resp.text()}`);
  const data: any = await resp.json();
  return data.message?.content || '';
}

export async function handleWritingAssistant(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  const {
    prompt,                 
    text = '',             
    hasSelection = false,
    history = [],          
    humanize = false,
    context,
    provider = 'ollama',
    settings,
  } = body;
  const model = body.model || DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL_BY_PROVIDER.ollama;

  if (!prompt || !String(prompt).trim()) {
    return sendJson(res, 400, { error: 'prompt is required' });
  }

  try {
    const cleanHistory = (Array.isArray(history) ? history : [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-8)
      .map((m: any) => ({ role: m.role, content: String(m.content) }));

    const userTurn = [
      `Paper: ${context || 'Scholarly Research Paper'}`,
      text.trim()
        ? `${hasSelection ? 'Selected text' : 'Current document text'}:\n"""\n${text}\n"""`
        : 'No document text provided.',
      `Instruction: ${String(prompt).trim()}`,
    ].join('\n\n');

    let generated = (
      await callWritingModel({
        provider,
        model,
        system: WRITING_SYSTEM_PROMPT,
        messages: [...cleanHistory, { role: 'user', content: userTurn }],
        settings,
      })
    ).trim();

    // Second pass: humanize the draft
    if (humanize && generated) {
      const humanized = await callWritingModel({
        provider,
        model,
        system: HUMANIZE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: generated }],
        settings,
      });
      if (humanized.trim()) generated = humanized.trim();
    }

    return sendJson(res, 200, {
      original: text,
      generated,
      action: 'chat',
      humanized: Boolean(humanize),
    });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message || 'AI Writing Assistant generation failed' });
  }
}

// ==========================================
// 7. MULTI-MODEL HEALTH & MODEL DISCOVERY
// ==========================================
export async function handleHealthCheck(req: IncomingMessage, res: ServerResponse) {
  const customOllamaUrl = (req.headers['x-ollama-url'] as string) || DEFAULT_OLLAMA_URL;
  const customGeminiKey = (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY;
  const customClaudeKey = (req.headers['x-claude-api-key'] as string) || process.env.ANTHROPIC_API_KEY;

  const results: Record<string, any> = {
    ollama: {
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      isConnected: false,
      isConfigured: true,
      endpoint: customOllamaUrl,
      message: 'Checking...',
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      isConnected: false,
      isConfigured: Boolean(customGeminiKey && customGeminiKey.trim().length > 5),
      message: customGeminiKey ? 'API Key configured' : 'API Key missing',
    },
    claude: {
      id: 'claude',
      name: 'Claude (Anthropic)',
      type: 'cloud',
      isConnected: false,
      isConfigured: Boolean(customClaudeKey && customClaudeKey.trim().length > 5),
      message: customClaudeKey ? 'API Key configured' : 'API Key optional (not set)',
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const start = Date.now();
    const ollamaRes = await fetch(`${customOllamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    if (ollamaRes.ok) {
      const data: any = await ollamaRes.json();
      const count = data.models?.length || 0;
      results.ollama.isConnected = true;
      results.ollama.latencyMs = Date.now() - start;
      results.ollama.message = count > 0 ? `Connected (${count} model${count > 1 ? 's' : ''} installed)` : 'Connected (No models installed)';
    } else {
      results.ollama.message = `Ollama returned status ${ollamaRes.status}`;
    }
  } catch {
    results.ollama.isConnected = false;
    results.ollama.message = 'Ollama server unavailable. Ensure Ollama is running (`ollama serve`).';
  }

  if (results.gemini.isConfigured) {
    results.gemini.isConnected = true;
    results.gemini.message = 'Ready (API Key configured)';
  }

  if (results.claude.isConfigured) {
    results.claude.isConnected = true;
    results.claude.message = 'Ready (API Key configured)';
  }

  sendJson(res, 200, results);
}

export async function handleListModels(req: IncomingMessage, res: ServerResponse) {
  const customOllamaUrl = (req.headers['x-ollama-url'] as string) || DEFAULT_OLLAMA_URL;
  const customGeminiKey = (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY;
  const customClaudeKey = (req.headers['x-claude-api-key'] as string) || process.env.ANTHROPIC_API_KEY;

  const models: Array<{
    id: string;
    name: string;
    provider: 'ollama' | 'gemini' | 'claude';
    description?: string;
    parameterSize?: string;
    isLocal: boolean;
    isAvailable: boolean;
  }> = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const ollamaRes = await fetch(`${customOllamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    if (ollamaRes.ok) {
      const data: any = await ollamaRes.json();
      const installedModels: any[] = data.models || [];
      if (installedModels.length > 0) {
        for (const item of installedModels) {
          const sizeGB = item.size ? `${(item.size / 1024 / 1024 / 1024).toFixed(1)} GB` : undefined;
          const paramSize = item.details?.parameter_size || sizeGB || 'Local';
          models.push({
            id: item.name || item.model,
            name: `${item.name || item.model}`,
            provider: 'ollama',
            description: `Locally installed Ollama model (${item.details?.family || 'GGUF'})`,
            parameterSize: paramSize,
            isLocal: true,
            isAvailable: true,
          });
        }
      } else {
        DEFAULT_MODELS.ollama.forEach((m) => models.push({ ...m, provider: 'ollama', isAvailable: false }));
      }
    } else {
      DEFAULT_MODELS.ollama.forEach((m) => models.push({ ...m, provider: 'ollama', isAvailable: false }));
    }
  } catch {
    DEFAULT_MODELS.ollama.forEach((m) => models.push({ ...m, provider: 'ollama', isAvailable: false }));
  }

  const isGeminiAvailable = Boolean(customGeminiKey && customGeminiKey.trim().length > 5);
  DEFAULT_MODELS.gemini.forEach((m) => models.push({ ...m, provider: 'gemini', isAvailable: isGeminiAvailable }));

  const isClaudeAvailable = Boolean(customClaudeKey && customClaudeKey.trim().length > 5);
  DEFAULT_MODELS.claude.forEach((m) => models.push({ ...m, provider: 'claude', isAvailable: isClaudeAvailable }));

  sendJson(res, 200, { models });
}

// ==========================================
// 8. UNIFIED STREAMING CHAT (With RAG & Memory Persistence)
// ==========================================
export async function handleChatStream(req: IncomingMessage, res: ServerResponse) {
  const userId = getAuthenticatedUserId(req);
  let body: ChatRequestPayload;

  try {
    body = await readJsonBody<ChatRequestPayload>(req);
  } catch (err: any) {
    return sendJson(res, 400, { error: err.message || 'Invalid request body' });
  }

  const { provider, model, messages, systemPrompt, settings, documentIds, enableMemory = true } = body;

  if (!provider) return sendJson(res, 400, { error: 'Missing required field: provider' });
  if (!model) return sendJson(res, 400, { error: 'Missing required field: model' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: 'Messages array cannot be empty' });
  }

  const lastUserMsg = messages[messages.length - 1];
  if (!lastUserMsg || !lastUserMsg.content || !lastUserMsg.content.trim()) {
    return sendJson(res, 400, { error: 'Cannot send an empty message' });
  }

  // 1. Ensure conversation exists in DB
  let conversationId = body.conversationId;
  const now = Date.now();

  if (!conversationId) {
    conversationId = 'conv_' + now + '_' + Math.random().toString(36).substring(2, 6);
    const titleSnippet = lastUserMsg.content.trim().replace(/\s+/g, ' ').slice(0, 36);
    db.prepare(`
      INSERT INTO conversations (id, user_id, title, ai_provider, ai_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(conversationId, userId, titleSnippet, provider, model, now, now);
  } else {
    const conv = db.prepare('SELECT title FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, userId) as any;
    if (!conv) {
      const conflictingConversation = db.prepare('SELECT id FROM conversations WHERE id = ?').get(conversationId);
      if (conflictingConversation) {
        return sendJson(res, 404, { error: 'Conversation not found' });
      }

      const titleSnippet = lastUserMsg.content.trim().replace(/\s+/g, ' ').slice(0, 36);
      db.prepare(`
        INSERT INTO conversations (id, user_id, title, ai_provider, ai_model, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(conversationId, userId, titleSnippet, provider, model, now, now);
    } else if (conv.title === 'New conversation' || conv.title.length === 0) {
      const cleanTitle = lastUserMsg.content.trim().replace(/\s+/g, ' ').slice(0, 36);
      db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(cleanTitle, now, conversationId);
    } else {
      db.prepare('UPDATE conversations SET updated_at = ?, ai_provider = ?, ai_model = ? WHERE id = ? AND user_id = ?')
        .run(now, provider, model, conversationId, userId);
    }
  }

  // 2. Persist User Message to SQLite
  const userMsgId = 'msg_' + now + '_' + Math.random().toString(36).substring(2, 6);
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, ai_provider, ai_model, created_at)
    VALUES (?, ?, 'user', ?, ?, ?, ?)
  `).run(userMsgId, conversationId, lastUserMsg.content, provider, model, now);

  // 3. RAG Retrieval from Research Library
  let retrievedChunks: any[] = [];
  try {
    retrievedChunks = searchRelevantChunks(userId, lastUserMsg.content, documentIds, 4);
  } catch (err) {
    console.warn('[RAG] Chunk search error:', err);
  }

  // 4. Construct enriched system prompt (memories + research contexts + document excerpts)
  const enrichedSystemPrompt = constructEnrichedSystemPrompt({
    basePrompt: systemPrompt,
    userId,
    conversationId,
    enableMemory,
    retrievedChunks: retrievedChunks.map((c) => ({
      documentTitle: c.documentTitle,
      authors: c.authors,
      year: c.year,
      content: c.content,
    })),
  });

  // Extract any salient memory asynchronously
  if (enableMemory) {
    extractAndSaveConversationMemory(userId, conversationId, lastUserMsg.content);
  }

  initSse(res);

  // Send source citations event if documents were retrieved
  if (retrievedChunks.length > 0) {
    writeSse(res, {
      type: 'sources',
      sources: retrievedChunks.map((c) => ({
        documentId: c.documentId,
        title: c.documentTitle,
        authors: c.authors,
        year: c.year,
        excerpt: c.content.slice(0, 200) + '...',
      })),
    });
  }

  let isAborted = false;
  res.on('close', () => {
    if (!res.writableEnded) isAborted = true;
  });

  let fullGeneratedText = '';

  try {
    const streamPayload: ChatRequestPayload = {
      ...body,
      systemPrompt: enrichedSystemPrompt,
    };

    if (provider === 'ollama') {
      await streamOllamaChat(streamPayload, res, () => isAborted, (chunk) => {
        fullGeneratedText += chunk;
      });
    } else if (provider === 'gemini') {
      await streamGeminiChat(streamPayload, res, () => isAborted, (chunk) => {
        fullGeneratedText += chunk;
      });
    } else if (provider === 'claude') {
      await streamClaudeChat(streamPayload, res, () => isAborted, (chunk) => {
        fullGeneratedText += chunk;
      });
    } else {
      writeSse(res, { type: 'error', error: `Unsupported AI provider: ${provider}` });
      res.end();
      return;
    }

    if (isAborted) return;

    // Persist Assistant Response in database
    if (fullGeneratedText.trim()) {
      const assistantMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, ai_provider, ai_model, created_at)
        VALUES (?, ?, 'assistant', ?, ?, ?, ?)
      `).run(assistantMsgId, conversationId, fullGeneratedText, provider, model, Date.now());
    }

    writeSse(res, { type: 'done', model });
    res.end();
  } catch (err: any) {
    if (!isAborted && !res.writableEnded && !res.destroyed) {
      console.error(`[Chat Stream Error - ${provider}]:`, err);
      writeSse(res, { type: 'error', error: err.message || 'Generation failed' });
      res.end();
    }
  }
}

/**
 * Stream Ollama Local AI
 */
async function streamOllamaChat(
  payload: ChatRequestPayload,
  res: ServerResponse,
  checkAborted: () => boolean,
  onChunk: (c: string) => void
) {
  const ollamaUrl = payload.settings?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;

  const formattedMessages: Array<{ role: string; content: string }> = [];
  if (payload.systemPrompt) {
    formattedMessages.push({ role: 'system', content: payload.systemPrompt });
  }

  for (const m of payload.messages) {
    formattedMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response: Response;
  try {
    response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: payload.model,
        messages: formattedMessages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Ollama generation timed out after 120 seconds for model ${payload.model}.`);
    }
    throw new Error(`Cannot connect to Ollama server at ${ollamaUrl}. Ensure Ollama is running ('ollama serve').`);
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 404 || errorText.toLowerCase().includes('not found')) {
      throw new Error(`Model '${payload.model}' was not found in Ollama. Run 'ollama pull ${payload.model}' to download it.`);
    }
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  if (!response.body) throw new Error('Ollama returned empty response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    if (checkAborted()) {
      reader.cancel();
      break;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.message?.content) {
          onChunk(parsed.message.content);
          writeSse(res, { type: 'chunk', delta: parsed.message.content, model: payload.model });
        }
        if (parsed.done) {
          return;
        }
      } catch {}
    }
  }

}

/**
 * Stream Google Gemini Cloud AI
 */
async function streamGeminiChat(
  payload: ChatRequestPayload,
  res: ServerResponse,
  checkAborted: () => boolean,
  onChunk: (c: string) => void
) {
  const apiKey = payload.settings?.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Google Gemini API key is missing. Set GEMINI_API_KEY in your .env file or enter your API key in Settings.');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const contents = payload.messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  try {
    const responseStream = await ai.models.generateContentStream({
      model: payload.model,
      contents,
      config: {
        systemInstruction: payload.systemPrompt,
      },
    });

    for await (const chunk of responseStream) {
      if (checkAborted()) break;
      const text = chunk.text;
      if (text) {
        onChunk(text);
        writeSse(res, { type: 'chunk', delta: text, model: payload.model });
      }
    }

  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
      throw new Error('Invalid Gemini API Key. Please verify your API key in Settings or .env.');
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new Error('Gemini API quota exceeded or rate limit reached. Please wait a moment.');
    }
    throw new Error(`Google Gemini Error: ${msg}`);
  }
}

/**
 * Stream Anthropic Claude AI
 */
async function streamClaudeChat(
  payload: ChatRequestPayload,
  res: ServerResponse,
  checkAborted: () => boolean,
  onChunk: (c: string) => void
) {
  const apiKey = payload.settings?.claudeApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Anthropic Claude API key is missing. Set ANTHROPIC_API_KEY in your .env file or enter your API key in Settings.');
  }

  const anthropic = new Anthropic({ apiKey: apiKey.trim() });

  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of payload.messages) {
    if (m.role === 'system') continue;
    anthropicMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    });
  }

  try {
    const stream = await anthropic.messages.stream({
      model: payload.model,
      max_tokens: 4096,
      system: payload.systemPrompt,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (checkAborted()) {
        stream.controller.abort();
        break;
      }

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk(event.delta.text);
        writeSse(res, { type: 'chunk', delta: event.delta.text, model: payload.model });
      }
    }

  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes('401') || msg.includes('invalid x-api-key')) {
      throw new Error('Invalid Claude API Key. Please verify your Anthropic API key in Settings.');
    }
    if (msg.includes('429')) {
      throw new Error('Anthropic API rate limit exceeded.');
    }
    throw new Error(`Anthropic Claude Error: ${msg}`);
  }
}
