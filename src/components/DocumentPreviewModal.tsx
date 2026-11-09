import React, { useState } from 'react';
import type { ResearchDocument } from '../types/ai';

interface DocumentPreviewModalProps {
  document: ResearchDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenInEditor: (doc: ResearchDocument) => void;
  onQueryWithAI: (doc: ResearchDocument) => void;
}

export function DocumentPreviewModal({
  document,
  isOpen,
  onClose,
  onOpenInEditor,
  onQueryWithAI,
}: DocumentPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'metadata' | 'raw'>('preview');

  if (!isOpen || !document) return null;

  const isPdf = document.file_format?.toLowerCase() === 'pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[85vh] text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#082b5c] text-white">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="px-2 py-0.5 rounded bg-white/20 text-sky-200 font-bold uppercase text-[10px] tracking-wider">
              {document.file_format || 'DOCX'}
            </span>
            <h2 className="font-bold text-sm tracking-wide truncate max-w-lg">
              {document.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Action Bar & Tabs */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-100 border-b border-slate-200 text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'preview' ? 'bg-white text-[#082b5c] shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Document Preview
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'metadata' ? 'bg-white text-[#082b5c] shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Scholarly Metadata
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'raw' ? 'bg-white text-[#082b5c] shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Extracted Raw Text
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onQueryWithAI(document);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-semibold flex items-center gap-1.5 transition-colors"
              title="Chat and ask research questions about this document"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z" />
              </svg>
              <span>Ask AI</span>
            </button>
            <button
              onClick={() => {
                onOpenInEditor(document);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-[#082f66] hover:bg-[#0d4b91] text-white font-bold flex items-center gap-1.5 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Open in Editor</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div
          className={`flex-1 ${
            activeTab === 'preview' && isPdf
              ? 'min-h-0 overflow-hidden bg-slate-100'
              : 'overflow-y-auto p-6 bg-slate-50/50'
          }`}
        >
          {activeTab === 'preview' && (
            isPdf ? (
              <iframe
                src={`/api/documents/${encodeURIComponent(document.id)}/file`}
                title={`PDF preview: ${document.title}`}
                className="block h-full min-h-[65vh] w-full border-0"
              />
            ) : (
              <div className="max-w-2xl mx-auto p-8 bg-white border border-slate-200 rounded-xl shadow-xs text-slate-800 leading-relaxed text-xs">
                <h1 className="text-xl font-bold text-[#082b5c] mb-2">{document.title}</h1>
                {document.authors && (
                  <p className="text-slate-600 font-medium mb-1">
                    <strong>Authors:</strong> {document.authors} ({document.publication_year || 'N/A'})
                  </p>
                )}
                {document.research_category && (
                  <p className="text-[11px] text-slate-500 mb-4">
                    <strong>Field:</strong> {document.research_category}
                  </p>
                )}

                {document.abstract && (
                  <div className="my-4 p-4 rounded-lg bg-sky-50/60 border-l-4 border-[#69b7e6]">
                    <strong className="block text-[#082b5c] text-[11px] uppercase tracking-wider mb-1">
                      Abstract
                    </strong>
                    <p className="italic text-slate-700 leading-normal">{document.abstract}</p>
                  </div>
                )}

                {document.html_content ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-800 space-y-3 mt-4"
                    dangerouslySetInnerHTML={{ __html: document.html_content }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed mt-4">
                    {document.content || 'No text extracted yet.'}
                  </pre>
                )}
              </div>
            )
          )}

          {activeTab === 'metadata' && (
            <div className="max-w-xl mx-auto p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3 text-xs">
              <h3 className="font-bold text-sm text-[#082b5c] border-b pb-2">Academic Citation Details</h3>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Document ID:</span>
                <span className="col-span-2 font-mono text-slate-700">{document.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Title:</span>
                <span className="col-span-2 font-semibold text-slate-900">{document.title}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Authors:</span>
                <span className="col-span-2 text-slate-800">{document.authors || 'None listed'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Year:</span>
                <span className="col-span-2 text-slate-800">{document.publication_year || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Category:</span>
                <span className="col-span-2 text-slate-800">{document.research_category || 'General'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Source / Journal:</span>
                <span className="col-span-2 text-slate-800">{document.publication_source || 'SLSU Research Depository'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">DOI:</span>
                <span className="col-span-2 font-mono text-sky-700">{document.doi || 'Not assigned'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">File Format / Size:</span>
                <span className="col-span-2 text-slate-800 uppercase font-mono">
                  {document.file_format} • {document.file_size ? `${(document.file_size / 1024).toFixed(1)} KB` : 'Embedded'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-slate-500 font-medium">Uploaded Date:</span>
                <span className="col-span-2 text-slate-700">
                  {new Date(document.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="max-w-3xl mx-auto p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto">
                {document.content || 'No text extracted.'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
