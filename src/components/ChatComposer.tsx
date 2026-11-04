import React, { FormEvent, useRef, useEffect } from 'react';
import type { AIProviderId, ResearchDocument } from '../types/ai';

interface ChatComposerProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  isStreaming: boolean;
  currentProvider: AIProviderId;
  currentModel: string;
  hasMessages: boolean;
  attachedDocument?: ResearchDocument | null;
  onRemoveAttachment?: () => void;
}

export function ChatComposer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  onClear,
  isStreaming,
  currentProvider,
  currentModel,
  hasMessages,
  attachedDocument,
  onRemoveAttachment,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }
    if (!prompt.trim()) return;
    onSend();
  };

  return (
    <section className="composer-section">
      <form className="composer relative" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between pb-1 text-slate-500 text-[11px]">
          <label htmlFor="prompt" className="font-bold text-[#315574]">
            Ask ChatRipe anything
          </label>
          {hasMessages && (
            <button
              type="button"
              onClick={onClear}
              className="text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 text-[10px]"
              title="Clear current messages"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear chat
            </button>
          )}
        </div>

        {/* Attached Research Document Badge */}
        {attachedDocument && (
          <div className="mb-2 p-2 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-between text-xs text-[#082b5c]">
            <div className="flex items-center gap-2 truncate">
              <span className="px-1.5 py-0.2 rounded bg-sky-200 text-[#082b5c] font-bold text-[9px] uppercase">
                {attachedDocument.file_format || 'RAG'}
              </span>
              <span className="font-semibold truncate">
                Grounding Document: {attachedDocument.title}
              </span>
            </div>
            {onRemoveAttachment && (
              <button
                type="button"
                onClick={onRemoveAttachment}
                className="text-slate-400 hover:text-rose-600 p-0.5 ml-2"
                title="Remove document grounding"
              >
                ✕
              </button>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          id="prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming && prompt.trim()) {
                onSend();
              }
            }
          }}
          placeholder="Describe your research question, methodology, literature review, or data analysis..."
          rows={2}
          disabled={isStreaming}
          className="disabled:opacity-70 disabled:cursor-not-allowed"
        />

        <div className="composer-actions mt-2">
          {/* Provider / Model status tag */}
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${currentProvider === 'ollama' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
            <strong className="capitalize text-slate-700">{currentProvider}</strong>
            <i>•</i>
            <span className="font-mono text-slate-600">{currentModel}</span>
          </span>

          {/* Action Buttons */}
          <div className="ml-auto flex items-center gap-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all animate-pulse"
                title="Stop response generation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                className="send cursor-pointer"
                disabled={!prompt.trim()}
                aria-label="Send message"
                title="Send message (Enter)"
              >
                <svg
                  width={19}
                  height={19}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </form>

      <p className="disclaimer">
        ChatRipe can make mistakes. Verify critical citations, methodology, and scholarly claims.
      </p>
    </section>
  );
}
