import React, { useState } from 'react';
import type { Conversation } from '../types/ai';

interface ConversationHistoryViewProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  onSaveAsContext: (title: string, content: string) => void;
}

export function ConversationHistoryView({
  conversations,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onSaveAsContext,
}: ConversationHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.last_message_preview || '').toLowerCase().includes(search.toLowerCase());

    const isArchived = Boolean(c.archived_at);
    return matchesSearch && (activeTab === 'archived' ? isArchived : !isArchived);
  });

  const handleStartRename = (c: Conversation) => {
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#082b5c] font-['Montserrat']">Conversation History & Archive</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search, rename, resume, or archive past scholarly research dialogues across Ollama and Claude.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search past conversations..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 shadow-xs"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'active' ? 'bg-[#082b5c] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Active Conversations
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'archived' ? 'bg-[#082b5c] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Archived
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
          No conversations found matching your filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const isEditing = editingId === c.id;

            return (
              <div
                key={c.id}
                className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start justify-between gap-3 text-xs"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase ${
                      c.ai_provider === 'ollama' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                    }`}>
                      {c.ai_provider || c.provider || 'AI'}
                    </span>
                    <span className="font-mono text-slate-500 text-[10px]">
                      {c.ai_model || c.model}
                    </span>
                    <span className="text-slate-400 text-[10px]">•</span>
                    <span className="text-slate-400 text-[10px]">
                      {new Date(c.updated_at || c.created_at).toLocaleString()}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="px-2 py-1 border border-slate-300 rounded text-xs font-semibold w-72"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(c.id)}
                        className="px-2 py-1 bg-emerald-600 text-white rounded font-bold text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-slate-500 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h3
                      onClick={() => onSelectConversation(c.id)}
                      className="font-bold text-sm text-[#082b5c] hover:text-[#0a58ca] cursor-pointer truncate"
                    >
                      {c.title}
                    </h3>
                  )}

                  {c.last_message_preview && (
                    <p className="text-slate-500 line-clamp-1 italic text-[11px]">
                      "{c.last_message_preview}"
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 pt-2 sm:pt-0">
                  <button
                    onClick={() => onSelectConversation(c.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#082f66] hover:bg-[#0d4b91] text-white font-bold text-xs shadow-xs"
                  >
                    Resume Chat
                  </button>
                  <button
                    onClick={() => handleStartRename(c)}
                    className="p-1.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    title="Rename conversation"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteConversation(c.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete conversation"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
