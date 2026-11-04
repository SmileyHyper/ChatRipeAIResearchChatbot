import React, { useState, useEffect } from 'react';
import type { AIProviderId, ProviderStatus, UserProviderSettings } from '../types/ai';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSettings: UserProviderSettings;
  providers: Record<AIProviderId, ProviderStatus>;
  onSave: (settings: UserProviderSettings) => void;
  onRefreshHealth: () => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialSettings,
  providers,
  onSave,
  onRefreshHealth,
}: SettingsModalProps) {
  const [settings, setSettings] = useState<UserProviderSettings>(initialSettings);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(settings);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 800);
  };

  const handleTestConnections = async () => {
    setIsTesting(true);
    setTestResult(null);
    onSave(settings);
    try {
      await onRefreshHealth();
      setTestResult('Connectivity checked successfully!');
    } catch (err: any) {
      setTestResult(`Test failed: ${err.message || 'Network error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#082b5c] text-white">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8fd0f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
            <h2 id="settings-title" className="font-bold text-sm tracking-wide">
              AI Provider Settings & Security
            </h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Provider Status Summary Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
              <span>LIVE CONNECTION STATUS</span>
              <button
                type="button"
                onClick={handleTestConnections}
                disabled={isTesting}
                className="text-[#0a58ca] hover:underline flex items-center gap-1 font-semibold text-[11px]"
              >
                {isTesting ? 'Testing...' : 'Test & Ping All'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {(['ollama', 'gemini', 'claude'] as AIProviderId[]).map((pId) => {
                const status = providers[pId];
                return (
                  <div key={pId} className="p-2 rounded-lg bg-white border border-slate-200/80 shadow-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                      <span className={`w-2 h-2 rounded-full ${
                        status?.isConnected
                          ? 'bg-emerald-500'
                          : status?.isConfigured === false
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                      }`} />
                      <span className="capitalize">{pId}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-1">
                      {status?.isConnected ? 'Online' : status?.isConfigured ? 'Offline' : 'Key needed'}
                    </p>
                  </div>
                );
              })}
            </div>
            {testResult && (
              <p className="text-[11px] font-medium text-emerald-700 pt-1">
                ✓ {testResult}
              </p>
            )}
          </div>

          {/* Section 1: Ollama Settings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="ollamaUrl" className="font-bold text-[#082b5c] text-xs flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold uppercase text-[9px]">Local</span>
                Ollama Endpoint URL
              </label>
              <span className="text-[10px] text-slate-500">Default: http://localhost:11434</span>
            </div>
            <input
              id="ollamaUrl"
              type="text"
              value={settings.ollamaBaseUrl || ''}
              onChange={(e) => setSettings({ ...settings, ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] focus:ring-1 focus:ring-[#69b7e6] font-mono text-xs bg-white text-slate-900"
            />
            <p className="text-[11px] text-slate-500 leading-normal">
              Ollama runs models locally on your GPU/CPU. Ensure the Ollama background service is running on your machine (<code className="px-1 bg-slate-100 rounded">ollama serve</code>).
            </p>
          </div>

          {/* Section 2: Google Gemini Settings */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="geminiKey" className="font-bold text-[#082b5c] text-xs flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-bold uppercase text-[9px]">Cloud</span>
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#0a58ca] hover:underline font-medium"
              >
                Get Gemini Key ↗
              </a>
            </div>
            <div className="relative">
              <input
                id="geminiKey"
                type={showGeminiKey ? 'text' : 'password'}
                value={settings.geminiApiKey || ''}
                onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                placeholder="AIzaSy... (or configure GEMINI_API_KEY in .env)"
                className="w-full pl-3 pr-16 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] focus:ring-1 focus:ring-[#69b7e6] font-mono text-xs bg-white text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-800 font-medium"
              >
                {showGeminiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Your key is securely stored in your browser session and forwarded only to your local Vite server proxy. It is never logged or committed to git.
            </p>
          </div>

          {/* Section 3: Anthropic Claude Settings */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="claudeKey" className="font-bold text-[#082b5c] text-xs flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-bold uppercase text-[9px]">Optional</span>
                Anthropic Claude API Key
              </label>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#0a58ca] hover:underline font-medium"
              >
                Get Claude Key ↗
              </a>
            </div>
            <div className="relative">
              <input
                id="claudeKey"
                type={showClaudeKey ? 'text' : 'password'}
                value={settings.claudeApiKey || ''}
                onChange={(e) => setSettings({ ...settings, claudeApiKey: e.target.value })}
                placeholder="sk-ant-... (or configure ANTHROPIC_API_KEY in .env)"
                className="w-full pl-3 pr-16 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] focus:ring-1 focus:ring-[#69b7e6] font-mono text-xs bg-white text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-800 font-medium"
              >
                {showClaudeKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setSettings({});
                onSave({});
              }}
              className="text-slate-500 hover:text-rose-600 text-xs font-medium"
            >
              Clear Custom Keys
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-[#082f66] hover:bg-[#0d4b91] text-white text-xs font-bold shadow-sm transition-all"
              >
                {saveSuccess ? 'Saved ✓' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

