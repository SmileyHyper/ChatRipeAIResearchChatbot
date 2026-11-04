import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  handleAuth,
  handleChatStream,
  handleConversations,
  handleDocuments,
  handleFolders,
  handleHealthCheck,
  handleListModels,
  handleMemoriesAndContexts,
  handleWritingAssistant,
  sendJson,
} from './src/server/ai-router.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8443', 10);
const DIST_DIR = path.resolve(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0] || '/';
  const method = req.method || 'GET';

  // CORS headers
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-api-key, x-claude-api-key, x-ollama-url, x-user-id');
    res.end();
    return;
  }

  try {
    if (url.startsWith('/api/auth/')) {
      return await handleAuth(req, res, url);
    }

    if (url.startsWith('/api/conversations')) {
      return await handleConversations(req, res, url, method);
    }

    if (url.startsWith('/api/memories') || url.startsWith('/api/contexts')) {
      return await handleMemoriesAndContexts(req, res, url, method);
    }

    if (url.startsWith('/api/documents')) {
      return await handleDocuments(req, res, url, method);
    }

    if (url.startsWith('/api/folders')) {
      return await handleFolders(req, res, url, method);
    }

    if (url === '/api/ai/writing-assistant' && method === 'POST') {
      return await handleWritingAssistant(req, res);
    }

    if (url === '/api/ai/health' && method === 'GET') {
      return await handleHealthCheck(req, res);
    }

    if (url === '/api/ai/models' && method === 'GET') {
      return await handleListModels(req, res);
    }

    if (url === '/api/ai/chat' && method === 'POST') {
      return await handleChatStream(req, res);
    }
  } catch (err: any) {
    console.error(`[Server API Error: ${url}]`, err);
    return sendJson(res, 500, { error: err.message || 'Server error' });
  }

  // Serve static files from dist/
  if (fs.existsSync(DIST_DIR)) {
    let filePath = path.join(DIST_DIR, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    } catch {
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ChatRipe server running at http://localhost:${PORT}`);
});
