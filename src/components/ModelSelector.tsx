import React, { useState, useRef, useEffect } from 'react';
import type { AIModel, AIProviderId, ProviderStatus } from '../types/ai';

interface ModelSelectorProps {
  currentProvider: AIProviderId;
  currentModel: string;
  providers: Record<AIProviderId, ProviderStatus>;
  models: AIModel[];
  onSelectProviderAndModel: (provider: AIProviderId, modelId: string) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function ModelSelector({
  currentProvider,
  currentModel,
  providers,
  models,
  onSelectProviderAndModel,
  onOpenSettings,
  onRefresh,
  isRefreshing = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AIProviderId>(currentProvider);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(currentProvider);
  }, [currentProvider]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeProviderStatus = providers[activeTab];
  const activeTabModels = models.filter((m) => m.provider === activeTab && m.id !== 'qwen3-vl:8b');

  const getStatusColor = (status?: ProviderStatus) => {
    if (!status) return 'bg-slate-400';
    if (status.isConnected) return 'bg-emerald-500 shadow-[0_0_8px_#10b981]';
    if (status.isConfigured === false) return 'bg-amber-400';
    return 'bg-rose-500';
  };

  const currentProviderStatus = providers[currentProvider];
  const currentModelObj = models.find((m) => m.provider === currentProvider && m.id === currentModel);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white border border-[#cbd8e5] hover:border-[#69b7e6] text-slate-800 text-xs font-medium shadow-sm transition-all hover:shadow hover:bg-slate-50/80 cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Change AI Provider or Model"
      >
        <span className={`w-2 h-2 rounded-full transition-colors ${getStatusColor(currentProviderStatus)}`} />
        
        <span className="font-semibold text-[#082b5c]">
          {currentProvider === 'ollama' ? 'Ollama' : 'Claude'}
        </span>
        
        <span className="text-slate-400 font-light">/</span>
        
        <span className="text-slate-600 max-w-[140px] truncate font-mono text-[11px]">
          {currentModelObj ? currentModelObj.name : currentModel}
        </span>

        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
          currentProvider === 'ollama' 
            ? 'bg-emerald-100 text-emerald-800' 
            : 'bg-sky-100 text-sky-800'
        }`}>
          {currentProvider === 'ollama' ? 'Local' : 'Cloud'}
        </span>

        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 w-[340px] sm:w-[410px] rounded-xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#082b5c] text-white">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8fd0f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <h3 className="font-semibold text-xs tracking-wide">AI MODEL SELECTOR</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1 rounded text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh models and provider connectivity"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-1 rounded text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
                title="Configure API Keys & Settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Provider Selection Tabs */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200 text-xs font-medium">
            {(['ollama', 'claude'] as AIProviderId[]).map((pId) => {
              const status = providers[pId];
              const isActive = activeTab === pId;
              const isSelectedProvider = currentProvider === pId;

              return (
                <button
                  key={pId}
                  type="button"
                  onClick={() => setActiveTab(pId)}
                  className={`flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
                    isActive
                      ? 'bg-white text-[#082b5c] shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                    <span>{pId === 'ollama' ? 'Ollama' : 'Claude'}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-slate-500 font-normal">
                      {pId === 'ollama' ? 'Local' : 'Cloud'}
                    </span>
                    {isSelectedProvider && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#69b7e6]" title="Currently active" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Provider Connection Banner */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className={`w-2 h-2 flex-shrink-0 rounded-full ${getStatusColor(activeProviderStatus)}`} />
              <span className="truncate text-slate-700">
                {activeProviderStatus?.message || 'Status pending...'}
              </span>
            </div>
            {!activeProviderStatus?.isConnected && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[10px] text-sky-700 hover:text-sky-900 font-semibold underline flex-shrink-0 ml-2"
              >
                Configure
              </button>
            )}
          </div>

          {/* Models List */}
          <div className="max-h-[260px] overflow-y-auto p-2 space-y-1">
            {activeTabModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                {activeTab === 'ollama' ? (
                  <div>
                    <p className="font-semibold text-slate-700">No Ollama models detected</p>
                    <p className="mt-1 text-[11px]">Make sure Ollama is running, then run:</p>
                    <code className="inline-block mt-2 px-2 py-1 bg-slate-100 rounded text-slate-800 font-mono text-[10px]">
                      ollama pull llama3.2:3b
                    </code>
                  </div>
                ) : (
                  <p>No models available for {activeTab}. Check API configuration.</p>
                )}
              </div>
            ) : (
              activeTabModels.map((m) => {
                const isCurrent = currentProvider === activeTab && currentModel === m.id;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectProviderAndModel(activeTab, m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                      isCurrent
                        ? 'bg-sky-50/80 border border-[#69b7e6]/50 text-[#082b5c]'
                        : 'hover:bg-slate-100 border border-transparent text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {m.name}
                        </span>
                        {m.parameterSize && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-600 font-mono text-[9px]">
                            {m.parameterSize}
                          </span>
                        )}
                        <span className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase ${
                          m.isLocal ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                        }`}>
                          {m.isLocal ? 'Local' : 'Cloud'}
                        </span>
                      </div>
                      {m.description && (
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {m.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCurrent && (
                        <svg className="w-4 h-4 text-[#0a3d78]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer info */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Provider: <strong className="text-slate-700 capitalize">{activeTab}</strong>
            </span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-[#0a58ca] hover:underline font-medium text-[11px]"
            >
              Provider Settings →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
