import React from 'react';
import type { Conversation } from '../types/ai';

interface SidebarConversationsProps {
  conversations: Conversation[];
  activeId: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  activeNav: string;
  onSelectNav: (nav: string) => void;
}

export function SidebarConversations({
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenSettings,
  menuOpen,
  onCloseMenu,
  activeNav,
  onSelectNav,
}: SidebarConversationsProps) {
  const navItems = [
    { label: 'Chat', icon: 'chat' },
    { label: 'History', icon: 'history' },
    { label: 'Library', icon: 'library' },
    { label: 'Paper Editor', icon: 'editor' },
  ];

  return (
    <>
      {/* Dark Backdrop / Scrim */}
      <div
        className={`scrim ${menuOpen ? 'visible' : ''}`}
        onClick={onCloseMenu}
        aria-label="Close navigation"
      />

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        {/* GitHub Style Header */}
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand-mark">
              <img
                src="/assets/slsu-logo.png"
                alt="Southern Leyte State University seal"
              />
            </div>
            <div>
              <div className="brand-name">ChatRipe</div>
              <div className="brand-tag">SLSU AI Research</div>
            </div>
          </div>

          <button
            onClick={onCloseMenu}
            className="p-1 rounded text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sidebar-content">
          {/* New Conversation Button */}
          <button
            className="new-chat"
            onClick={() => {
              onNewConversation();
              onSelectNav('Chat');
              onCloseMenu();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New conversation</span>
          </button>

          {/* Primary Navigation */}
          <nav className="primary-nav" aria-label="Main navigation">
            {navItems.map(({ label, icon }) => (
              <button
                key={label}
                className={activeNav === label ? 'active' : ''}
                onClick={() => {
                  onSelectNav(label);
                  onCloseMenu();
                }}
              >
                {icon === 'chat' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8 8 0 0 1-8.5 8 9.4 9.4 0 0 1-4.2-1L3 20l1.5-4.5A8.4 8.4 0 0 1 4 12a8 8 0 0 1 8.5-8A8.2 8.2 0 0 1 21 11.5Z" />
                  </svg>
                )}

                {icon === 'history' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5M12 7v5l3 2" />
                  </svg>
                )}
                {icon === 'library' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                )}
                {icon === 'editor' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                )}
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Recent Conversations List */}
          <div className="flex flex-col mt-6">
            <span className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8b949e]">
              Recent Chats
            </span>

            <div className="space-y-1">
              {conversations.slice(0, 10).map((conv) => {
                const isActive = conv.id === activeId && activeNav === 'Chat';
                const label = conv.title?.trim() || 'Untitled conversation';

                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition-colors ${
                      isActive
                        ? 'bg-[#21262d] text-[#f0f6fc] font-medium'
                        : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#161b22]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectConversation(conv.id);
                        onSelectNav('Chat');
                        onCloseMenu();
                      }}
                      className="flex-1 min-w-0 text-left text-[13px] flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer"
                      style={{ color: 'inherit' }}
                      title={label}
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          conv.ai_provider === 'ollama' ? 'bg-emerald-400' : 'bg-sky-400'
                        }`}
                      />
                      <span className="truncate block min-w-0">{label}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-[#8b949e] hover:text-rose-400 transition-opacity bg-transparent border-0"
                      title="Delete conversation"
                      aria-label={`Delete ${label}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onCloseMenu();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
            <span>Settings & Security</span>
          </button>

          <div className="profile">
            <div className="avatar">SL</div>
            <div>
              <strong className="text-xs text-[#f0f6fc]">Scholar Researcher</strong>
              <span className="text-[11px] text-[#8b949e]">scholar@slsu.edu.ph</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
