import React, { useState } from 'react';
import type { ChatMessage } from '../types/ai';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageItemProps {
  message: ChatMessage;
  isStreaming?: boolean;
  isLastAssistantMessage?: boolean;
  onRegenerate?: () => void;
  onOpenSettings?: () => void;
}

export function MessageItem({
  message,
  isStreaming = false,
  isLastAssistantMessage = false,
  onRegenerate,
  onOpenSettings,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  // User Message
  if (message.role === 'user') {
    return (
      <div className="flex justify-end my-3 animate-in fade-in duration-200">
        <div className="max-w-[85%] sm:max-w-[76%] px-4 py-3 rounded-2xl rounded-tr-xs bg-[#0a3d78] text-white text-[13px] leading-relaxed shadow-sm">
          <p className="whitespace-pre-wrap select-text">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant Message (or Error)
  const isError = Boolean(message.error);

  return (
    <div className="flex items-start gap-3 my-4 animate-in fade-in duration-200">
      {/* Brand Avatar Mark */}
      <div className="flex-shrink-0 w-7 h-7 rounded-lg rounded-bl-xs bg-[#69b7e6] text-[#082b5c] font-bold text-xs flex items-center justify-center font-['Montserrat'] shadow-xs">
        R
      </div>

      {/* Message Content Container */}
      <div className="flex-1 max-w-[820px] rounded-2xl rounded-tl-xs p-4 bg-[#e7f1f9] border border-[#d6e5f2] shadow-xs text-slate-800">
        {/* Model & Provider Badge */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#cbddec] text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#082b5c]">ChatRipe</span>
            {message.provider && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/70 border border-[#b8d4ea] text-[10px] text-slate-700 font-medium font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${message.provider === 'ollama' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                <span className="capitalize">{message.provider}</span>
                {message.model && <span className="text-slate-400">•</span>}
                {message.model && <span className="text-[#0a3d78]">{message.model}</span>}
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          {!isError && message.content && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors"
                title="Copy entire response"
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-emerald-700 font-semibold text-[10px]">Copied</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span className="text-[10px]">Copy</span>
                  </>
                )}
              </button>

              {isLastAssistantMessage && !isStreaming && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors"
                  title="Regenerate response"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span className="text-[10px]">Retry</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {isError ? (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="flex-1">
                <strong className="font-semibold block">Generation Error</strong>
                <p className="mt-0.5 text-rose-800 leading-relaxed">{message.content}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 pl-6">
              {onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] transition-colors"
                >
                  Try Again
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-2.5 py-1 rounded bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-semibold text-[11px] transition-colors"
                >
                  Configure Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            <MarkdownRenderer content={message.content} />
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-[#082b5c] animate-pulse align-middle" />
            )}

            {/* RAG Research Citations & Source Attribution */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#cbddec] text-[11px] space-y-1.5">
                <span className="font-bold text-[#082b5c] flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <span>Grounding Sources (Research Library):</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {message.sources.map((src, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-white/80 border border-[#b8d4ea] text-slate-700 text-[10px] font-medium"
                      title={src.excerpt}
                    >
                      [{i + 1}] {src.title} {src.authors ? `— ${src.authors}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

