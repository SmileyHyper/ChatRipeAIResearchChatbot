import React, { useState, useRef } from 'react';
import type { ResearchFolder } from '../types/ai';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: ResearchFolder[];
  onUploadSuccess: () => void;
}

export function DocumentUploadModal({
  isOpen,
  onClose,
  folders,
  onUploadSuccess,
}: DocumentUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publicationYear, setPublicationYear] = useState(new Date().getFullYear());
  const [category, setCategory] = useState('General');
  const [folderId, setFolderId] = useState('');
  const [abstract, setAbstract] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['pdf', 'docx', 'doc', 'txt', 'md'];

    if (!ext || !validExts.includes(ext)) {
      setError(`Unsupported file format (.${ext}). Please upload PDF, DOCX, DOC, TXT, or Markdown.`);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError('File size exceeds the 25MB limit.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setTitle(cleanTitle);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
      });

      reader.readAsDataURL(selectedFile);
      const fileBase64 = await base64Promise;

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileFormat: selectedFile.name.split('.').pop()?.toLowerCase(),
          fileBase64,
          title: title.trim() || selectedFile.name,
          authors: authors.trim() || 'SLSU Researcher',
          publicationYear: Number(publicationYear) || new Date().getFullYear(),
          category,
          folderId: folderId || undefined,
          abstract: abstract.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with status ${res.status}`);
      }

      onUploadSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error uploading research document');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#082b5c] text-white">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8fd0f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <h2 className="font-bold text-sm tracking-wide">Upload Research Document</h2>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* File Picker Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              selectedFile ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-300 hover:border-[#69b7e6] bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex flex-col items-center">
                <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-xs uppercase mb-1">
                  {selectedFile.name.split('.').pop()}
                </span>
                <span className="font-semibold text-slate-800 text-xs">{selectedFile.name}</span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Click to choose another
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="font-semibold text-slate-700 text-xs">
                  Click to choose a research document, or drag and drop
                </span>
                <span className="text-[11px] text-slate-400 mt-1">
                  Supports DOCX, PDF, DOC, TXT, Markdown (Max 25MB)
                </span>
              </div>
            )}
          </div>

          {/* Document Title */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Document Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Climate-Smart Farming Framework"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs"
            />
          </div>

          {/* Grid: Authors & Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Authors / Researchers</label>
              <input
                type="text"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="e.g. Dr. A. Santos, Engr. M. Reyes"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Publication Year</label>
              <input
                type="number"
                value={publicationYear}
                onChange={(e) => setPublicationYear(Number(e.target.value))}
                min={1950}
                max={2030}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs"
              />
            </div>
          </div>

          {/* Grid: Category & Folder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Research Field / Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs bg-white"
              >
                <option value="General">General Research</option>
                <option value="Agricultural Sciences">Agricultural Sciences</option>
                <option value="Computer Science & AI">Computer Science & AI</option>
                <option value="Environmental Studies">Environmental Studies</option>
                <option value="Education & Social Sciences">Education & Social Sciences</option>
                <option value="Engineering & Technology">Engineering & Technology</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Save to Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs bg-white"
              >
                <option value="">(Root / No folder)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.folder_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Abstract */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Abstract / Executive Summary (Optional)</label>
            <textarea
              rows={3}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Brief summary of research background, methodology, and key findings..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[#69b7e6] text-xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-5 py-2 rounded-lg bg-[#082f66] hover:bg-[#0d4b91] text-white font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                  </svg>
                  <span>Processing & Indexing...</span>
                </>
              ) : (
                <span>Upload & Index</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

