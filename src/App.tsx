import React, { useState, useEffect, useRef } from 'react';
import { aiService } from './services/ai';
import type { AIModel, AIProviderId, Conversation, ProviderStatus, ResearchDocument, UserProviderSettings } from './types/ai';
import { ModelSelector } from './components/ModelSelector';
import { SettingsModal } from './components/SettingsModal';
import { MessageItem } from './components/MessageItem';
import { ChatComposer } from './components/ChatComposer';
import { SidebarConversations } from './components/SidebarConversations';
import { ResearchLibrary } from './components/ResearchLibrary';
import { ResearchEditor } from './components/ResearchEditor';
import { ConversationHistoryView } from './components/ConversationHistoryView';

interface AttachedImage {
  name: string;
  mimeType: string;
  base64: string;
  dataUrl: string;
}

export default function App() {
  const [activeNav, setActiveNav] = useState('Chat');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // AI & Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [providers, setProviders] = useState<Record<AIProviderId, ProviderStatus>>({
    ollama: { id: 'ollama', name: 'Ollama', type: 'local', isConnected: false, isConfigured: true },
    claude: { id: 'claude', name: 'Claude (Anthropic)', type: 'cloud', isConnected: false, isConfigured: false },
  });
  const [models, setModels] = useState<AIModel[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Research Materials & Editor States
  const [editorDocument, setEditorDocument] = useState<ResearchDocument | null>(null);
  const [attachedDocument, setAttachedDocument] = useState<ResearchDocument | null>(null);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeNav === 'Chat') {
      scrollToBottom();
    }
  }, [activeConv?.messages, isStreaming, activeNav]);

  // Initial load
  useEffect(() => {
    async function setup() {
      await refreshData();
      const allConvs = await aiService.conversationManager.loadFromDatabase();
      setConversations(allConvs);
      const active = aiService.conversationManager.getActiveConversation();
      setActiveConv({ ...active });
    }
    setup();
  }, []);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const userSettings = aiService.getSettings();
      const [statuses, fetchedModels] = await Promise.all([
        aiService.providerManager.checkAllStatuses(userSettings),
        aiService.modelManager.fetchModels(userSettings),
      ]);
      setProviders(statuses);
      setModels(fetchedModels);
    } catch (err) {
      console.warn('Error refreshing providers or models:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Switch Conversation
  const handleSelectConversation = async (id: string) => {
    aiService.stopGeneration();
    setIsStreaming(false);
    const conv = await aiService.conversationManager.setActiveConversation(id);
    if (conv) {
      setActiveConv({ ...conv });
    }
  };

  // New Conversation
  const handleNewConversation = async () => {
    aiService.stopGeneration();
    setIsStreaming(false);
    const currentProvider = activeConv?.provider || 'ollama';
    const currentModel = activeConv?.model || aiService.modelManager.getSelectedModel(currentProvider);
    const newConv = await aiService.conversationManager.createNewConversation(currentProvider, currentModel);
    const all = await aiService.conversationManager.loadFromDatabase();
    setConversations(all);
    setActiveConv({ ...newConv });
    setPrompt('');
    setAttachedImage(null);
    setImageError(null);
  };

  // Delete Conversation
  const handleDeleteConversation = async (id: string) => {
    await aiService.conversationManager.deleteConversation(id);
    const remaining = aiService.conversationManager.getAllConversations();
    setConversations([...remaining]);
    const active = aiService.conversationManager.getActiveConversation();
    setActiveConv({ ...active });
  };

  // Rename Conversation
  const handleRenameConversation = async (id: string, newTitle: string) => {
    await aiService.conversationManager.renameConversation(id, newTitle);
    const all = aiService.conversationManager.getAllConversations();
    setConversations([...all]);
    if (activeConv?.id === id) {
      setActiveConv({ ...activeConv, title: newTitle });
    }
  };

  // Clear Messages
  const handleClearChat = async () => {
    await aiService.conversationManager.clearCurrentMessages();
    const active = aiService.conversationManager.getActiveConversation();
    setActiveConv({ ...active });
    setAttachedImage(null);
    setImageError(null);
  };

  // Switch Provider & Model
  const handleSelectProviderAndModel = (provider: AIProviderId, modelId: string) => {
    aiService.modelManager.setSelectedModel(provider, modelId);
    aiService.conversationManager.updateConversationProvider(provider, modelId);
    const active = aiService.conversationManager.getActiveConversation();
    setActiveConv({ ...active });
    setConversations(aiService.conversationManager.getAllConversations());
  };

  // Send Prompt Message
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend === undefined ? prompt : textToSend;
    if ((!messageText.trim() && !attachedImage) || isStreaming) return;

    if (attachedImage) {
      const imagePrompt = messageText.trim() || 'Describe this image.';
      setPrompt('');
      setIsStreaming(true);

      try {
        const analysis = aiService.analyzeImage(attachedImage.base64, attachedImage.mimeType, imagePrompt);
        const active = aiService.conversationManager.getActiveConversation();
        setActiveConv({ ...active });
        setConversations(aiService.conversationManager.getAllConversations());
        await analysis;
        setAttachedImage(null);
        setImageError(null);
      } catch (error) {
        setPrompt(messageText);
        setImageError(error instanceof Error ? error.message : 'Image analysis failed.');
      } finally {
        setIsStreaming(false);
        const active = aiService.conversationManager.getActiveConversation();
        setActiveConv({ ...active });
        setConversations(aiService.conversationManager.getAllConversations());
      }
      return;
    }

    if (!messageText.trim()) return;

    setPrompt('');
    setIsStreaming(true);

    try {
      await aiService.sendMessage(
        messageText,
        {
          onStartAssistantMsg: () => {
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
            setConversations(aiService.conversationManager.getAllConversations());
          },
          onChunk: () => {
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
          onDone: () => {
            setIsStreaming(false);
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
            setConversations(aiService.conversationManager.getAllConversations());
          },
          onError: () => {
            setIsStreaming(false);
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
        },
        {
          documentIds: attachedDocument ? [attachedDocument.id] : undefined,
        }
      );
    } catch {
      setIsStreaming(false);
      const active = aiService.conversationManager.getActiveConversation();
      setActiveConv({ ...active });
    }
  };

  const handleImageSelect = async (file: File | null) => {
    setImageError(null);
    if (!file) {
      setAttachedImage(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAttachedImage(null);
      setImageError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachedImage(null);
      setImageError('Image must be 10 MB or smaller.');
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'));
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      const separatorIndex = dataUrl.indexOf(',');
      if (separatorIndex < 0) throw new Error('Could not encode the selected image.');
      setAttachedImage({
        name: file.name,
        mimeType: file.type,
        base64: dataUrl.slice(separatorIndex + 1),
        dataUrl,
      });
    } catch (error) {
      setAttachedImage(null);
      setImageError(error instanceof Error ? error.message : 'Could not read the selected image.');
    }
  };

  // Regenerate Last Assistant Message
  const handleRegenerate = async () => {
    if (isStreaming) return;
    setIsStreaming(true);

    try {
      await aiService.regenerateLastMessage(
        {
          onStartAssistantMsg: () => {
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
          onChunk: () => {
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
          onDone: () => {
            setIsStreaming(false);
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
          onError: () => {
            setIsStreaming(false);
            const active = aiService.conversationManager.getActiveConversation();
            setActiveConv({ ...active });
          },
        },
        {
          documentIds: attachedDocument ? [attachedDocument.id] : undefined,
        }
      );
    } catch {
      setIsStreaming(false);
      const active = aiService.conversationManager.getActiveConversation();
      setActiveConv({ ...active });
    }
  };

  // Stop Streaming
  const handleStopGeneration = () => {
    aiService.stopGeneration();
    setIsStreaming(false);
    const active = aiService.conversationManager.getActiveConversation();
    setActiveConv({ ...active });
  };

  // Save Settings
  const handleSaveSettings = async (settings: UserProviderSettings) => {
    aiService.saveSettings(settings);
    await refreshData();
  };

  // Handlers for Research Library actions
  const handleOpenDocInEditor = (doc: ResearchDocument) => {
    setEditorDocument(doc);
    setActiveNav('Paper Editor');
  };

  const handleQueryDocWithAI = (doc: ResearchDocument) => {
    setAttachedDocument(doc);
    setActiveNav('Chat');
    setPrompt(`Summarize key findings and methodology of "${doc.title}":`);
  };

  const handleCreateNewPaper = () => {
    setEditorDocument(null);
    setActiveNav('Paper Editor');
  };

  const currentProvider = activeConv?.provider || 'ollama';
  const currentModel = activeConv?.model || aiService.modelManager.getSelectedModel(currentProvider);
  const messages = activeConv?.messages || [];

  return (
    <div className="app-shell" style={{ '--sidebar-width': sidebarCollapsed ? '72px' : '264px' } as React.CSSProperties}>
      {/* Mobile Toggle Button */}
      <button
        className="mobile-menu"
        onClick={() => setMenuOpen(true)}
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Sidebar with Navigation & History */}
      <SidebarConversations
        conversations={conversations}
        activeId={activeConv?.id || ''}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        menuOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <main>
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <i>/</i>
            <strong>{activeNav}</strong>
          </div>

          <div className="flex items-center gap-3">
            {/* Multi-Model Selector Dropdown */}
            <ModelSelector
              currentProvider={currentProvider}
              currentModel={currentModel}
              providers={providers}
              models={models}
              onSelectProviderAndModel={handleSelectProviderAndModel}
              onOpenSettings={() => setSettingsOpen(true)}
              onRefresh={refreshData}
              isRefreshing={isRefreshing}
            />

            {/* Status Pill */}
            <div className="agent-status hidden sm:flex">
              <span className={isStreaming ? 'animate-ping' : ''} />
              <b>{isStreaming ? 'Generating response...' : 'ChatRipe is ready'}</b>
            </div>
          </div>
        </header>

        <div className="main-content">
          {/* VIEW 1: ACTIVE CHAT */}
          {activeNav === 'Chat' && (
            <div className="space-y-6">
              {messages.length === 0 && (
                <section className="hero">
                  <div className="eyebrow">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8fd0f3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7zM5 3l.7 2.3L8 6l-2.3.7L5 9l-.7-2.3L2 6l2.3-.7z" />
                    </svg>
                    Your scholarly partner
                  </div>
                  <h1>
                    What will you <em>advance</em> today?
                  </h1>
                  <p>
                    Move from inquiry to impact with an AI research platform equipped with persistent memory, a document library with RAG citation grounding, and Microsoft Word paper editing.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-6 pt-4 border-t border-white/10">
                    {[
                      'Synthesize findings on climate-smart farming methodologies',
                      'Formulate quantitative research questions for thesis defense',
                      'Conduct bibliographical analysis of regional technology adoption',
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => {
                          setPrompt(sample);
                          handleSendMessage(sample);
                        }}
                        className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-left text-xs transition-colors border border-white/10 backdrop-blur-xs"
                      >
                        <span className="font-semibold block text-sky-200 text-[11px]">Research Prompt</span>
                        <span className="line-clamp-2 mt-0.5">{sample}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Messages Stream */}
              {messages.length > 0 && (
                <section className="conversation" aria-live="polite">
                  {messages.map((msg, index) => {
                    const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
                    return (
                      <MessageItem
                        key={msg.id}
                        message={msg}
                        isStreaming={isStreaming && isLastAssistant}
                        isLastAssistantMessage={isLastAssistant}
                        onRegenerate={msg.model === 'qwen3-vl:8b' ? undefined : handleRegenerate}
                        onOpenSettings={() => setSettingsOpen(true)}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </section>
              )}

              {/* Chat Composer with Document Attachment */}
              <ChatComposer
                prompt={prompt}
                onPromptChange={setPrompt}
                onSend={() => handleSendMessage()}
                onStop={handleStopGeneration}
                onClear={handleClearChat}
                isStreaming={isStreaming}
                currentProvider={currentProvider}
                currentModel={currentModel}
                hasMessages={messages.length > 0}
                attachedDocument={attachedDocument}
                onRemoveAttachment={() => setAttachedDocument(null)}
                attachedImage={attachedImage}
                imageError={imageError}
                onImageSelect={handleImageSelect}
              />
            </div>
          )}

          {/* VIEW 2: CONVERSATION HISTORY */}
          {activeNav === 'History' && (
            <ConversationHistoryView
              conversations={conversations}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                setActiveNav('Chat');
              }}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
              onSaveAsContext={async (title, content) => {
                await fetch('/api/contexts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, context_content: content }),
                });
                alert('Saved conversation as research context!');
              }}
            />
          )}

          {/* VIEW 3: RESEARCH LIBRARY */}
          {activeNav === 'Research Library' && (
            <ResearchLibrary
              onOpenInEditor={handleOpenDocInEditor}
              onQueryWithAI={handleQueryDocWithAI}
              onCreateNewDoc={handleCreateNewPaper}
            />
          )}

          {/* VIEW 4: MICROSOFT WORD-STYLE RESEARCH PAPER EDITOR */}
          {activeNav === 'Paper Editor' && (
            <ResearchEditor
              initialDocument={editorDocument}
              onBackToLibrary={() => setActiveNav('Research Library')}
            />
          )}

         
          {/* Footer */}
          <footer>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Built for responsible scholarship
            </span>
            <p>Southern Leyte State University • Research · Innovation · Publication · Extension</p>
          </footer>
        </div>
      </main>

      {/* Provider Configuration Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={aiService.getSettings()}
        providers={providers}
        onSave={handleSaveSettings}
        onRefreshHealth={refreshData}
      />
    </div>
  );
}