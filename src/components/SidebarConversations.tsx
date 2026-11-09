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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  collapsed = false,
  onToggleCollapse,
}: SidebarConversationsProps) {

  const navItems = [
    { label: 'Chat', icon: 'chat' },
    { label: 'History', icon: 'history' },
    { label: 'Research Library', icon: 'library' },
    { label: 'Paper Editor', icon: 'editor' },
  ];

  return (
    <>
      {/* Mobile Scrim */}
      {menuOpen && (
        <button
          className="scrim"
          onClick={onCloseMenu}
          aria-label="Close navigation"
        />
      )}

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        {/* Desktop Collapse Toggle */}
        <button
          className="sidebar-toggle-desktop hidden sm:grid"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Brand Row */}

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
          <button
            className="close-menu"
            onClick={onCloseMenu}
            aria-label="Close navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* New Conversation Button */}
        <button
          className="new-chat"
          onClick={() => {
            onNewConversation();
            onSelectNav('Chat');
            onCloseMenu();
          }}
          title={collapsed ? "New conversation" : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="new-chat-text">New conversation</span>
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
              title={collapsed ? label : undefined}
            >
              {icon === 'chat' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M21 11.5a8 8 0 0 1-8.5 8 9.4 9.4 0 0 1-4.2-1L3 20l1.5-4.5A8.4 8.4 0 0 1 4 12a8 8 0 0 1 8.5-8A8.2 8.2 0 0 1 21 11.5Z" />
                </svg>
              )}

              {icon === 'history' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5M12 7v5l3 2" />
                </svg>
              )}
              {icon === 'library' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              )}
              {icon === 'editor' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              )}
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>

        {/* Recent Conversations List */}
        <div className="recent-chats-section flex flex-col min-h-0 flex-1 mt-4">
          <span className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7f9db8]">
            Recent Chats
          </span>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
            {conversations.slice(0, 10).map((conv) => {
              const isActive = conv.id === activeId && activeNav === 'Chat';
              const label = conv.title?.trim() || 'Untitled conversation';

              return (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between gap-1 rounded-lg px-3 py-2 transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-[#a9c4dc] hover:text-white hover:bg-white/5'
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
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
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
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-opacity bg-transparent border-0"
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

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onCloseMenu();
            }}
            title={collapsed ? "Settings & Security" : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
            <span className="footer-label">Settings & Security</span>
          </button>

          <div className="profile" title={collapsed ? "Scholar Researcher (scholar@slsu.edu.ph)" : undefined}>
            <div className="avatar flex-shrink-0">SL</div>
            <div className="profile-details min-w-0">
              <strong className="truncate block">Scholar Researcher</strong>
              <span className="truncate block">scholar@slsu.edu.ph</span>
            </div>
          </div>
        </div>
      </aside>

    </>
  );
}