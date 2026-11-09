import React, { useState, useEffect } from 'react';
import type { ResearchDocument, ResearchFolder } from '../types/ai';
import { DocumentUploadModal } from './DocumentUploadModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';

interface ResearchLibraryProps {
  onOpenInEditor: (doc: ResearchDocument) => void;
  onQueryWithAI: (doc: ResearchDocument) => void;
  onCreateNewDoc: () => void;
}

export function ResearchLibrary({
  onOpenInEditor,
  onQueryWithAI,
  onCreateNewDoc,
}: ResearchLibraryProps) {
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [folders, setFolders] = useState<ResearchFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ResearchDocument | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);

  useEffect(() => {
    fetchLibraryData();
  }, [selectedFolderId]);

  const fetchLibraryData = async () => {
    setIsLoading(true);
    try {
      let docUrl = '/api/documents';
      if (selectedFolderId) {
        docUrl += `?folderId=${selectedFolderId}`;
      }

      const [docsRes, foldersRes] = await Promise.all([
        fetch(docUrl),
        fetch('/api/folders'),
      ]);

      if (docsRes.ok) {
        const dData = await docsRes.json();
        setDocuments(dData.documents || []);
      }
      if (foldersRes.ok) {
        const fData = await foldersRes.json();
        setFolders(fData.folders || []);
      }
    } catch (err) {
      console.warn('Error fetching library data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_name: newFolderName.trim() }),
      });
      if (res.ok) {
        setNewFolderName('');
        setShowFolderInput(false);
        fetchLibraryData();
      }
    } catch {}
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {}
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.abstract || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.authors || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.keywords || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || doc.research_category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Stats */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#06244f] to-[#0a3d78] text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-200 text-xs font-bold uppercase tracking-wider mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>SLSU Scholarly Depository</span>
            </div>
            <h1 className="text-2xl font-bold font-['Montserrat']">Library & Materials</h1>
            <p className="text-xs text-sky-100 max-w-xl mt-1">
              Upload, organize, annotate, and index peer-reviewed articles, dissertations, and project proposals for real-time AI citation grounding and synthesis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setUploadModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-white text-[#082b5c] hover:bg-sky-50 font-bold text-xs flex items-center gap-2 shadow-sm transition-all hover:scale-102"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload Document</span>
            </button>
            <button
              onClick={onCreateNewDoc}
              className="px-4 py-2.5 rounded-xl bg-[#69b7e6] text-[#082b5c] hover:bg-[#8fd0f3] font-bold text-xs flex items-center gap-2 shadow-sm transition-all hover:scale-102"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Write Paper</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="relative z-10 flex items-center gap-6 mt-6 pt-4 border-t border-white/10 text-xs">
          <div>
            <span className="text-sky-300 block text-[10px] uppercase font-bold">Total Papers</span>
            <strong className="text-base">{documents.length}</strong>
          </div>
          <div>
            <span className="text-sky-300 block text-[10px] uppercase font-bold">Research Folders</span>
            <strong className="text-base">{folders.length}</strong>
          </div>
          <div>
            <span className="text-sky-300 block text-[10px] uppercase font-bold">RAG Indexed</span>
            <strong className="text-base text-emerald-400">Active</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Folders on Left + Documents on Right */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Folders Sidebar */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="font-bold text-xs text-[#082b5c] tracking-wide uppercase">Folders</span>
            <button
              onClick={() => setShowFolderInput(!showFolderInput)}
              className="text-[#0a58ca] hover:text-[#063b82] text-xs font-semibold"
              title="Add new research folder"
            >
              + Add
            </button>
          </div>

          {showFolderInput && (
            <form onSubmit={handleCreateFolder} className="flex items-center gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                autoFocus
              />
              <button
                type="submit"
                className="px-2 py-1 bg-[#082f66] text-white rounded text-xs font-bold"
              >
                ✓
              </button>
            </form>
          )}

          <div className="space-y-1">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedFolderId === null
                  ? 'bg-sky-50 text-[#082b5c] font-bold border border-sky-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>All Documents</span>
              </div>
              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px]">
                {documents.length}
              </span>
            </button>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              return (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-sky-50 text-[#082b5c] font-bold border border-sky-200'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">{folder.folder_name}</span>
                  </div>
                  {folder.doc_count !== undefined && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px]">
                      {folder.doc_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Documents Content Area (3 Cols) */}
        <div className="md:col-span-3 space-y-4">
          {/* Search & Category Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, author, abstract, or keyword..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 focus:border-[#69b7e6] text-xs text-slate-800 shadow-xs"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-medium shadow-xs"
            >
              <option value="all">All Categories</option>
              <option value="General">General</option>
              <option value="Agricultural Sciences">Agricultural Sciences</option>
              <option value="Computer Science & AI">Computer Science & AI</option>
              <option value="Environmental Studies">Environmental Studies</option>
              <option value="Education & Social Sciences">Education & Social Sciences</option>
              <option value="Engineering & Technology">Engineering & Technology</option>
            </select>
          </div>

          {/* Documents List */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading research papers...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-slate-200 text-center space-y-3">
              <svg className="w-12 h-12 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-semibold text-slate-700 text-sm">No research documents found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Upload your research papers in PDF or DOCX format to read, query with AI, and integrate into your writing.
              </p>
              <button
                onClick={() => setUploadModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-[#082f66] text-white font-bold text-xs"
              >
                Upload First Paper
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold uppercase text-[9px]">
                        {doc.file_format || 'DOCX'}
                      </span>
                      {doc.research_category && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                          {doc.research_category}
                        </span>
                      )}
                      {doc.publication_year && (
                        <span className="text-slate-400 text-[11px] font-mono">
                          ({doc.publication_year})
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-[#082b5c] hover:text-[#0a58ca] cursor-pointer" onClick={() => setPreviewDoc(doc)}>
                      {doc.title}
                    </h3>

                    {doc.authors && (
                      <p className="text-[11px] text-slate-600">
                        <strong>Authors:</strong> {doc.authors}
                      </p>
                    )}

                    {doc.abstract && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed pt-0.5">
                        {doc.abstract}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-1.5 flex-shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                        title="Preview document and details"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => onQueryWithAI(doc)}
                        className="px-2.5 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-900 text-xs font-semibold transition-colors flex items-center gap-1"
                        title="Ask questions about this paper in AI Chat"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z" />
                        </svg>
                        <span>Query</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenInEditor(doc)}
                        className="px-2.5 py-1 rounded bg-[#082f66] hover:bg-[#0d4b91] text-white text-xs font-bold transition-colors"
                        title="Edit research paper in Microsoft Word-style Editor"
                      >
                        Edit
                      </button>
                      <a
                        href={`/api/documents/${doc.id}/download-docx`}
                        download
                        className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                        title="Download as valid Microsoft Word .docx"
                      >
                        DOCX ↓
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id, doc.title)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete paper"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        folders={folders}
        onUploadSuccess={fetchLibraryData}
      />

      {/* Preview Modal */}
      <DocumentPreviewModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        onOpenInEditor={onOpenInEditor}
        onQueryWithAI={onQueryWithAI}
      />
    </div>
  );
}
