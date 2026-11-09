import type { Plugin, ViteDevServer } from 'vite';
import {
  handleAuth,
  handleChatStream,
  handleConversations,
  handleDocuments,
  handleFolders,
  handleHealthCheck,
  handleImageAnalysis,
  handleListModels,
  handleMemoriesAndContexts,
  handleWritingAssistant,
  sendJson,
} from './ai-router.ts';

export function aiApiPlugin(): Plugin {
  return {
    name: 'vite-plugin-chatripe-ai-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        const method = req.method || 'GET';

        // Handle CORS preflight
        if (method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-claude-api-key, x-ollama-url, x-user-id');
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

          if (url === '/api/ai/analyze-image' && method === 'POST') {
            return await handleImageAnalysis(req, res);
          }

          if (url === '/api/ai/chat' && method === 'POST') {
            return await handleChatStream(req, res);
          }
        } catch (err: any) {
          console.error(`[API Error: ${url}]`, err);
          return sendJson(res, 500, { error: err.message || 'Internal server error' });
        }

        next();
      });
    },
  };
}
