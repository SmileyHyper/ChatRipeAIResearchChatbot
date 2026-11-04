import React, { useState, useEffect, useRef } from 'react';
import type { AIProviderId, DocumentVersion, ResearchDocument, WritingAssistantAction } from '../types/ai';
import { RESEARCH_TEMPLATES, type ResearchTemplate } from '../data/research-templates';
import { aiService } from '../services/ai';

interface ResearchEditorProps {
  initialDocument?: ResearchDocument | null;
  onBackToLibrary: () => void;
}

// US Letter at 96 dpi
const PAGE_W = 816;
const PAGE_H = 1056;
const PAGE_GAP = 32; // visual gap between sheets
const PAGE_PERIOD = PAGE_H + PAGE_GAP;
const MARGINS = { normal: 96, moderate: 72, narrow: 48 } as const;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inlineMd = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

/**
 * Converts template markdown into flat, top-level blocks (h1/h2/h3/p/ul/table)
 * so the paginator can move each block onto the next page when it doesn't fit.
 */
function markdownToHtml(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inlineMd).join('<br/>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((l) => !/^\|?[\s:|-]+\|?$/.test(l));
      let html = '<table style="width:100%; border-collapse: collapse; margin: 16px 0;" border="1">';
      rows.forEach((line, r) => {
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        html += '<tr>';
        cells.forEach((c) => {
          const tag = r === 0 ? 'th' : 'td';
          const bg = r === 0 ? 'background-color: #f1f5f9; font-weight: bold;' : '';
          html += `<${tag} style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; ${bg}">${inlineMd(c)}</${tag}>`;
        });
        html += '</tr>';
      });
      out.push(html + '</table>');
    }
    table = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      flushTable();
      list.push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (line.trim().startsWith('|')) {
      flushPara();
      flushList();
      table.push(line);
    } else {
      flushList();
      flushTable();
      para.push(line);
    }
  }
  flushAll();
  return out.join('');
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function ResearchEditor({ initialDocument, onBackToLibrary }: ResearchEditorProps) {
  const [docId, setDocId] = useState<string | null>(initialDocument?.id || null);
  const [title, setTitle] = useState(initialDocument?.title || 'Untitled Research Paper');
  const [authors, setAuthors] = useState(initialDocument?.authors || 'SLSU Researcher');
  const [category, setCategory] = useState(initialDocument?.research_category || 'General');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [wordCount, setWordCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // Editor Formatting States
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [fontSize, setFontSize] = useState('3'); // 3 = 12pt in execCommand
  const [lineSpacing, setLineSpacing] = useState('1.5');
  const [marginSize, setMarginSize] = useState<'normal' | 'narrow' | 'moderate'>('normal');

  // Modals & Drawers
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(true);

  // AI Assistant States
  const [selectedText, setSelectedText] = useState('');
  const [aiPromptContext, setAiPromptContext] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<{ original: string; generated: string; action: string } | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProviderId>('ollama');

  const editorRef = useRef<HTMLDivElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const paginateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const margin = MARGINS[marginSize];
  const marginRef = useRef(margin);
  marginRef.current = margin;

  // ---------- Pagination ----------
  // The editor is one continuous contentEditable laid over a stack of page sheets.
  // Any top-level block that would cross a page's bottom margin is pushed down
  // (via margin-top) to the top of the next page. The pushes are tagged with
  // data-pg attributes and stripped again before saving.
  const paginate = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const contentH = PAGE_H - 2 * marginRef.current;
    const kids = Array.from(ed.children) as HTMLElement[];

    // 1. undo previous pushes
    for (const el of kids) {
      if (el.dataset.pg) {
        el.style.marginTop = el.dataset.pgOrig || '';
        if (!el.getAttribute('style')) el.removeAttribute('style');
        delete el.dataset.pg;
        delete el.dataset.pgOrig;
      }
    }

    const pushTo = (el: HTMLElement, target: number) => {
      const diff = target - el.offsetTop;
      if (diff === 0) return;
      if (!el.dataset.pg) {
        el.dataset.pg = '1';
        el.dataset.pgOrig = el.style.marginTop || '';
      }
      const cur = parseFloat(getComputedStyle(el).marginTop) || 0;
      el.style.marginTop = `${Math.max(0, cur + diff)}px`;
    };

    // 2. walk blocks in order, pushing the ones that don't fit
    for (const el of kids) {
      const top = el.offsetTop;
      const h = el.offsetHeight;
      const k = Math.floor(top / PAGE_PERIOD);
      const contentEnd = k * PAGE_PERIOD + contentH;
      const nextStart = (k + 1) * PAGE_PERIOD;
      const startsInMargin = top >= contentEnd;
      const crossesBottom = top + h > contentEnd && h <= contentH;
      if (startsInMargin || crossesBottom) {
        pushTo(el, nextStart);
        pushTo(el, nextStart); // second pass corrects margin-collapse differences
      }
    }

    // 3. page count from the bottom of the last block
    const last = kids[kids.length - 1];
    const bottom = last ? last.offsetTop + last.offsetHeight : 0;
    setPageCount(Math.max(1, Math.floor(Math.max(0, bottom - 1) / PAGE_PERIOD) + 1));
  };

  const schedulePaginate = () => {
    if (paginateTimer.current) clearTimeout(paginateTimer.current);
    paginateTimer.current = setTimeout(paginate, 60);
  };

  const getCleanHtml = () => {
    const ed = editorRef.current;
    if (!ed) return '';
    const clone = ed.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-pg]').forEach((n) => {
      const e = n as HTMLElement;
      e.style.marginTop = e.dataset.pgOrig || '';
      delete e.dataset.pg;
      delete e.dataset.pgOrig;
      if (!e.getAttribute('style')) e.removeAttribute('style');
    });
    return clone.innerHTML;
  };
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'DIV']);
const NO_SPLIT = new Set(['UL', 'OL', 'TABLE', 'HR', 'BLOCKQUOTE', 'PRE']);

// Break big wrapper/<br> blocks into separate top-level paragraphs so they can paginate
const normalizeBlocks = () => {
  const ed = editorRef.current;
  if (!ed) return;

  // 1. unwrap wrapper divs (e.g. old <div class="doc-body">)
  let found: boolean;
  do {
    found = false;
    Array.from(ed.children).forEach((el) => {
      if (
        el.tagName === 'DIV' &&
        el.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol, :scope > table, :scope > div')
      ) {
        while (el.firstChild) ed.insertBefore(el.firstChild, el);
        el.remove();
        found = true;
      }
    });
  } while (found);

  // 2. wrap loose text / inline nodes in <p>
  let run: Node[] = [];
  const flush = () => {
    if (!run.length) return;
    const hasContent = run.some(
      (n) => (n.textContent || '').trim() || (n.nodeType === 1 && (n as Element).tagName !== 'BR')
    );
    if (hasContent) {
      const p = document.createElement('p');
      ed.insertBefore(p, run[0]);
      run.forEach((n) => p.appendChild(n));
    } else {
      run.forEach((n) => n.parentNode?.removeChild(n));
    }
    run = [];
  };
  Array.from(ed.childNodes).forEach((n) => {
    const isBlock = n.nodeType === 1 && BLOCK_TAGS.has((n as Element).tagName);
    if (isBlock) flush();
    else run.push(n);
  });
  flush();

  // 3. split paragraphs at <br> into separate paragraphs
  Array.from(ed.children).forEach((el) => {
    if (NO_SPLIT.has(el.tagName) || /^H\d$/.test(el.tagName)) return;
    if (!el.querySelector(':scope > br')) return;
    const segments: Node[][] = [[]];
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeName === 'BR') segments.push([]);
      else segments[segments.length - 1].push(n);
    });
    segments.forEach((seg) => {
      const hasContent = seg.some((n) => (n.textContent || '').trim() || (n as Element).tagName === 'IMG');
      if (!hasContent) return;
      const p = document.createElement('p');
      const style = el.getAttribute('style');
      if (style) p.setAttribute('style', style);
      seg.forEach((n) => p.appendChild(n));
      ed.insertBefore(p, el);
    });
    el.remove();
  });

  // 4. literal **bold** from AI text -> real bold
  Array.from(ed.children).forEach((el) => {
    if (el.tagName === 'P' && (el.textContent || '').includes('**')) {
      el.innerHTML = el.innerHTML.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }
  });

  if (!ed.children.length) ed.innerHTML = '<p><br></p>';
};

  const updateCurrentPage = () => {
    try {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!ed || !sel || !sel.rangeCount || !ed.contains(sel.anchorNode)) return;
      const range = sel.getRangeAt(0);
      let rect: DOMRect | undefined = range.getClientRects()[0];
      if (!rect) {
        const node = sel.anchorNode;
        const el = node instanceof Element ? node : node?.parentElement;
        rect = el?.getBoundingClientRect();
      }
      if (!rect) return;
      const y = rect.top - ed.getBoundingClientRect().top;
      setCurrentPage(Math.max(1, Math.floor(Math.max(0, y) / PAGE_PERIOD) + 1));
    } catch {
      /* ignore */
    }
  };

  // Load initial document content into editor
  useEffect(() => {
    if (editorRef.current) {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      if (initialDocument?.html_content) {
        editorRef.current.innerHTML = initialDocument.html_content;
      } else if (initialDocument?.content) {
        editorRef.current.innerHTML = plainTextToHtml(initialDocument.content);
      } else {
        editorRef.current.innerHTML = ``;
      }
      updateCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocument]);

  // Re-paginate whenever layout-affecting settings change
  useEffect(() => {
    schedulePaginate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marginSize, fontFamily, fontSize, lineSpacing]);

  useEffect(() => {
    (document as any).fonts?.ready?.then(() => schedulePaginate());
    return () => {
      if (paginateTimer.current) clearTimeout(paginateTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCounts = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
    }
    schedulePaginate();
  };

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    setSaveStatus('unsaved');
    updateCounts();
  };

  const handleSelectionChange = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      setSelectedText(sel.toString().trim());
    }
    updateCurrentPage();
  };

  // Insert Table into WYSIWYG Editor
  const handleInsertTable = () => {
    const rowsInput = prompt('Enter number of rows (e.g. 3):', '3');
    if (rowsInput === null) return;
    const colsInput = prompt('Enter number of columns (e.g. 3):', '3');
    if (colsInput === null) return;
    const rows = parseInt(rowsInput || '3', 10);
    const cols = parseInt(colsInput || '3', 10);
    if (!rows || !cols) return;

    let html = '<table style="width:100%; border-collapse: collapse; margin: 16px 0;" border="1">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const isHeader = r === 0;
        const tag = isHeader ? 'th' : 'td';
        const bg = isHeader ? 'background-color: #f1f5f9; font-weight: bold;' : '';
        html += `<${tag} style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; ${bg}">${isHeader ? `Header ${c + 1}` : '&nbsp;'}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table><p></p>';
    executeCommand('insertHTML', html);
  };

  // Load Template
  const handleApplyTemplate = (tpl: ResearchTemplate) => {
    if (confirm(`Load template "${tpl.title}"? This will populate your editor with the template framework.`)) {
      setTitle(tpl.title);
      if (editorRef.current) {
        // Flat top-level blocks so each one can flow onto the next page
        editorRef.current.innerHTML = markdownToHtml(tpl.content);
        setSaveStatus('unsaved');
        updateCounts();
        setTemplatesOpen(false);
      }
    }
  };

  // Save Document to Database
  const handleSaveDocument = async () => {
    if (!editorRef.current) return;
    setSaveStatus('saving');

    const htmlContent = getCleanHtml();
    const plainText = editorRef.current.innerText;

    try {
      if (docId) {
        // Update existing document
        const res = await fetch(`/api/documents/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            authors,
            research_category: category,
            content: plainText,
            html_content: htmlContent,
          }),
        });
        setSaveStatus(res.ok ? 'saved' : 'unsaved');
      } else {
        // Create new document
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            authors,
            research_category: category,
            content: plainText,
            html_content: htmlContent,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setDocId(data.document.id);
          setSaveStatus('saved');
        } else {
          setSaveStatus('unsaved');
        }
      }
    } catch {
      setSaveStatus('unsaved');
    }
  };

  // Import existing DOCX file
  const handleImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileFormat: 'docx',
          fileBase64: base64,
          title: file.name.replace(/\.[^/.]+$/, ''),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const doc = data.document;
        setDocId(doc.id);
        setTitle(doc.title);
        if (editorRef.current && doc.html_content) {
          editorRef.current.innerHTML = doc.html_content;
          updateCounts();
        }
        setSaveStatus('saved');
      }
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  // Load Version History
  const handleOpenVersions = async () => {
    if (!docId) {
      alert('Save this paper first to track version history.');
      return;
    }
    setVersionsOpen(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {}
  };

  const handleRestoreVersion = async (verNum: number) => {
    if (!docId || !confirm(`Restore version ${verNum}?`)) return;

    try {
      const res = await fetch(`/api/documents/${docId}/restore-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_number: verNum }),
      });
      if (res.ok) {
        const data = await res.json();
        if (editorRef.current && data.document.html_content) {
          editorRef.current.innerHTML = data.document.html_content;
          updateCounts();
        }
        setVersionsOpen(false);
      }
    } catch {}
  };

  // AI Assistant Action
  const handleRunAiAction = async (action: WritingAssistantAction) => {
    const textToProcess = selectedText || editorRef.current?.innerText || '';
    if (!textToProcess.trim()) {
      alert('Select text in your paper or draft content first.');
      return;
    }

    setIsAiGenerating(true);
    setAiResult(null);

    try {
      const result = await aiService.runWritingAssistant({
        action,
        text: textToProcess,
        context: `${title} (${category})`,
        provider: aiProvider,
      });
      setAiResult(result);
    } catch (err: any) {
      alert(`AI Assistant Error: ${err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Replace selected text with AI generated revision
  const handleApplyAiResult = () => {
    if (!aiResult) return;
    executeCommand('insertHTML', `<span class="ai-revised">${aiResult.generated.replace(/\n/g, '<br/>')}</span>`);
    setAiResult(null);
  };

  const handleInsertBelow = () => {
    if (!aiResult) return;
    executeCommand('insertHTML', `<br/><p>${aiResult.generated.replace(/\n/g, '<br/>')}</p>`);
    setAiResult(null);
  };

  const stackHeight = pageCount * PAGE_PERIOD - PAGE_GAP;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] min-h-[700px] bg-slate-100 rounded-2xl border border-slate-300 shadow-lg overflow-hidden animate-in fade-in duration-200">
      {/* Top Application Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#082b5c] text-white border-b border-[#0f3b75]">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onBackToLibrary}
            className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
            title="Back to Research Library"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

          <div className="flex flex-col flex-1 max-w-md">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveStatus('unsaved');
              }}
              placeholder="Paper Title..."
              className="bg-transparent font-bold text-sm text-white focus:bg-white/10 px-2 py-0.5 rounded outline-none border border-transparent focus:border-sky-400"
            />
            <span className="text-[10px] text-sky-200 pl-2">
              Microsoft Word-Style Research Editor • SLSU Format
            </span>
          </div>

          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            saveStatus === 'saved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'
          }`}>
            {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved Changes'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTemplatesOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sky-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Templates</span>
          </button>

          <input
            ref={importFileInputRef}
            type="file"
            accept=".docx"
            onChange={handleImportDocx}
            className="hidden"
          />
          <button
            onClick={() => importFileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sky-100 text-xs font-semibold transition-colors"
            title="Import an existing .docx file"
          >
            Import DOCX
          </button>

          {docId && (
            <a
              href={`/api/documents/${docId}/download-docx`}
              download
              className="px-3 py-1.5 rounded-lg bg-[#69b7e6] hover:bg-[#8fd0f3] text-[#082b5c] text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Download as valid Microsoft Word .docx"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download DOCX</span>
            </a>
          )}

          <button
            onClick={handleSaveDocument}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all"
          >
            Save
          </button>

          <button
            onClick={handleOpenVersions}
            className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
            title="Document version history"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5M12 7v5l3 2" />
            </svg>
          </button>

          <button
            onClick={() => setAiAssistantOpen(!aiAssistantOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              aiAssistantOpen ? 'bg-sky-400 text-[#082b5c]' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z" />
            </svg>
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Word-Style Ribbon / Formatting Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-200 border-b border-slate-300 text-slate-700 text-xs flex-wrap">
        {/* Undo / Redo */}
        <button onClick={() => executeCommand('undo')} className="p-1.5 rounded hover:bg-slate-300" title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6M3 13a9 9 0 0 1 15-6.7L21 9" /></svg>
        </button>
        <button onClick={() => executeCommand('redo')} className="p-1.5 rounded hover:bg-slate-300" title="Redo (Ctrl+Y)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6M21 13a9 9 0 0 0-15-6.7L3 9" /></svg>
        </button>

        <span className="w-px h-5 bg-slate-300 mx-1" />

        {/* Font Family Selector */}
        <select
          value={fontFamily}
          onChange={(e) => {
            setFontFamily(e.target.value);
            executeCommand('fontName', e.target.value);
          }}
          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium"
        >
          <option value="Times New Roman">Times New Roman (APA)</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Calibri">Calibri</option>
          <option value="Montserrat">Montserrat</option>
        </select>

        {/* Font Size Selector */}
        <select
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value);
            executeCommand('fontSize', e.target.value);
          }}
          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium w-16"
        >
          <option value="1">10 pt</option>
          <option value="2">11 pt</option>
          <option value="3">12 pt</option>
          <option value="4">14 pt</option>
          <option value="5">18 pt</option>
          <option value="6">24 pt</option>
        </select>

        {/* Line Spacing */}
        <select
          value={lineSpacing}
          onChange={(e) => setLineSpacing(e.target.value)}
          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium"
          title="Line spacing"
        >
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2.0">Double</option>
        </select>

        <span className="w-px h-5 bg-slate-300 mx-1" />

        {/* Styles: Bold, Italic, Underline, Strike */}
        <button onClick={() => executeCommand('bold')} className="p-1.5 rounded hover:bg-slate-300 font-bold" title="Bold (Ctrl+B)">B</button>
        <button onClick={() => executeCommand('italic')} className="p-1.5 rounded hover:bg-slate-300 italic" title="Italic (Ctrl+I)">I</button>
        <button onClick={() => executeCommand('underline')} className="p-1.5 rounded hover:bg-slate-300 underline" title="Underline (Ctrl+U)">U</button>
        <button onClick={() => executeCommand('strikeThrough')} className="p-1.5 rounded hover:bg-slate-300 line-through" title="Strikethrough">S</button>

        <span className="w-px h-5 bg-slate-300 mx-1" />

        {/* Headings */}
        <button onClick={() => executeCommand('formatBlock', '<h1>')} className="px-2 py-1 rounded hover:bg-slate-300 font-bold" title="Heading 1">H1</button>
        <button onClick={() => executeCommand('formatBlock', '<h2>')} className="px-2 py-1 rounded hover:bg-slate-300 font-bold" title="Heading 2">H2</button>
        <button onClick={() => executeCommand('formatBlock', '<h3>')} className="px-2 py-1 rounded hover:bg-slate-300 font-bold" title="Heading 3">H3</button>
        <button onClick={() => executeCommand('formatBlock', '<p>')} className="px-2 py-1 rounded hover:bg-slate-300 text-[11px]" title="Normal Paragraph">¶</button>

        <span className="w-px h-5 bg-slate-300 mx-1" />

        {/* Alignments */}
        <button onClick={() => executeCommand('justifyLeft')} className="p-1.5 rounded hover:bg-slate-300" title="Align Left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg>
        </button>
        <button onClick={() => executeCommand('justifyCenter')} className="p-1.5 rounded hover:bg-slate-300" title="Align Center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" /></svg>
        </button>
        <button onClick={() => executeCommand('justifyRight')} className="p-1.5 rounded hover:bg-slate-300" title="Align Right">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></svg>
        </button>
        <button onClick={() => executeCommand('justifyFull')} className="p-1.5 rounded hover:bg-slate-300" title="Justify">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></svg>
        </button>

        <span className="w-px h-5 bg-slate-300 mx-1" />

        {/* Lists & Table */}
        <button onClick={() => executeCommand('insertUnorderedList')} className="p-1.5 rounded hover:bg-slate-300" title="Bulleted List">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
        </button>
        <button onClick={() => executeCommand('insertOrderedList')} className="p-1.5 rounded hover:bg-slate-300" title="Numbered List">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
        </button>
        <button onClick={handleInsertTable} className="px-2 py-1 rounded hover:bg-slate-300 text-xs font-semibold flex items-center gap-1" title="Insert Academic Table">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
          <span>Table</span>
        </button>

        {/* Margins */}
        <select
          value={marginSize}
          onChange={(e) => setMarginSize(e.target.value as any)}
          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium ml-auto"
        >
          <option value="normal">Normal (1" Margins)</option>
          <option value="moderate">Moderate (0.75")</option>
          <option value="narrow">Narrow (0.5")</option>
        </select>
      </div>

      {/* Editor Body: Canvas on Left + AI Assistant on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Writing Canvas: stack of Letter-size pages */}
        <div className="flex-1 overflow-auto px-8 pt-8 pb-16 bg-slate-300/60">
          <div
            className="relative mx-auto shrink-0"
            style={{ width: PAGE_W, height: stackHeight }}
            onMouseDown={(e) => {
              if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
                e.preventDefault();
                editorRef.current.focus();
              }
            }}
          >
            {/* Page sheets */}
            {Array.from({ length: pageCount }).map((_, i) => (
              <div
                key={i}
                className="absolute bg-white shadow-2xl border border-slate-300 rounded-sm select-none pointer-events-none"
                style={{ left: 0, top: i * PAGE_PERIOD, width: PAGE_W, height: PAGE_H }}
              >
                <div
                  className="absolute text-right text-[11px] text-slate-400 font-mono border-b border-slate-100 pb-1"
                  style={{ left: margin, right: margin, top: Math.max(12, margin / 2 - 14) }}
                >
                  • Page {i + 1}
                </div>
                <div
                  className="absolute text-center text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1"
                  style={{ left: margin, right: margin, bottom: Math.max(12, margin / 2 - 14) }}
                >
                  Southern Leyte State University — Center for Research &amp; Innovation
                </div>
              </div>
            ))}

            {/* Editable flow, laid over the sheets */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                setSaveStatus('unsaved');
                updateCounts();
                updateCurrentPage();
              }}
              onMouseUp={handleSelectionChange}
              onKeyUp={handleSelectionChange}
              className="outline-none focus:outline-none select-text prose max-w-none text-slate-900"
              style={{
                position: 'absolute',
                top: margin,
                left: margin,
                width: PAGE_W - 2 * margin,
                minHeight: stackHeight - 2 * margin,
                fontSize: '16px',
                textAlign: 'justify',
                fontFamily: fontFamily === 'Times New Roman' ? '"Times New Roman", Times, serif' : fontFamily,
                lineHeight: lineSpacing === '2.0' ? '2.0' : lineSpacing === '1.5' ? '1.5' : '1.15',
              }}
            />
          </div>
        </div>

        {/* AI Research Writing Assistant Panel */}
        {aiAssistantOpen && (
          <div className="w-[360px] bg-white border-l border-slate-300 flex flex-col h-full shadow-lg z-10 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between px-4 py-3 bg-[#082b5c] text-white">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8fd0f3" strokeWidth="2.2">
                  <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z" />
                </svg>
                <h3 className="font-bold text-xs">AI Writing Assistant</h3>
              </div>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as AIProviderId)}
                className="px-2 py-0.5 rounded bg-white/20 text-white font-mono text-[10px] border border-white/20 outline-none"
              >
                <option value="ollama" className="text-slate-800">Ollama (Local)</option>
                <option value="gemini" className="text-slate-800">Gemini (Cloud)</option>
                <option value="claude" className="text-slate-800">Claude (Cloud)</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-700">
              {/* Selected Text Preview */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-[10px] text-slate-500 uppercase block mb-1">
                  Selected Target Text:
                </span>
                <p className="text-[11px] text-slate-800 italic line-clamp-3">
                  {selectedText ? `"${selectedText}"` : '(Highlight any paragraph in your document to target it)'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-1.5">
                <span className="font-bold text-[11px] text-[#082b5c] block mb-1">
                  Academic Writing Enhancements
                </span>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleRunAiAction('improve')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#082b5c] font-semibold text-left border border-sky-200 transition-colors"
                  >
                    ✨ Polish Academic Tone
                  </button>
                  <button
                    onClick={() => handleRunAiAction('grammar')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-left transition-colors"
                  >
                    🔍 Fix Grammar & Syntax
                  </button>
                  <button
                    onClick={() => handleRunAiAction('paraphrase')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-left transition-colors"
                  >
                    🔄 Scholarly Paraphrase
                  </button>
                  <button
                    onClick={() => handleRunAiAction('summarize')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-left transition-colors"
                  >
                    📋 Summarize Section
                  </button>
                  <button
                    onClick={() => handleRunAiAction('expand')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-left transition-colors"
                  >
                    📖 Expand Paragraph
                  </button>
                  <button
                    onClick={() => handleRunAiAction('shorten')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-left transition-colors"
                  >
                    ✂️ Make Concise
                  </button>
                </div>

                <span className="font-bold text-[11px] text-[#082b5c] block pt-3 mb-1">
                  Section Drafting Generators
                </span>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleRunAiAction('objectives')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold text-left border border-emerald-200 transition-colors"
                  >
                    🎯 Research Objectives
                  </button>
                  <button
                    onClick={() => handleRunAiAction('methodology')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold text-left border border-emerald-200 transition-colors"
                  >
                    🔬 Draft Methodology
                  </button>
                  <button
                    onClick={() => handleRunAiAction('conclusion')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold text-left border border-emerald-200 transition-colors"
                  >
                    🏁 Conclusion & Recs
                  </button>
                  <button
                    onClick={() => handleRunAiAction('abstract')}
                    disabled={isAiGenerating}
                    className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold text-left border border-emerald-200 transition-colors"
                  >
                    📝 Draft Abstract
                  </button>
                </div>
              </div>

              {/* Generation Progress Indicator */}
              {isAiGenerating && (
                <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-center space-y-2 animate-pulse">
                  <span className="font-bold text-xs text-[#082b5c]">Generating academic draft...</span>
                  <p className="text-[11px] text-slate-500">
                    Applying scholarly syntax with {aiProvider}...
                  </p>
                </div>
              )}

              {/* AI Revision Result Comparison Card */}
              {aiResult && (
                <div className="p-3.5 rounded-xl bg-white border border-[#69b7e6] shadow-md space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="font-bold text-xs text-[#082b5c] uppercase">
                      AI Generated Revision
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold uppercase">
                      Ready to Apply
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 max-h-48 overflow-y-auto text-xs leading-relaxed font-sans">
                    {aiResult.generated}
                  </div>

                  {/* Actions: Replace, Insert, Discard */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={handleApplyAiResult}
                      className="flex-1 py-1.5 rounded-lg bg-[#082f66] hover:bg-[#0d4b91] text-white font-bold text-xs transition-colors"
                    >
                      Replace Selected
                    </button>
                    <button
                      onClick={handleInsertBelow}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors"
                      title="Insert as new paragraph below selection"
                    >
                      Insert Below
                    </button>
                    <button
                      onClick={() => setAiResult(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Discard revision"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Editor Status Bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-slate-200 border-t border-slate-300 text-[11px] text-slate-600">
        <div className="flex items-center gap-4">
          <span>Page <strong>{Math.min(currentPage, pageCount)}</strong> of <strong>{pageCount}</strong></span>
          <span>Words: <strong>{wordCount}</strong></span>
          <span>Characters: <strong>{(editorRef.current?.innerText || '').length}</strong></span>
          <span>Standard Font: <strong>{fontFamily}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span>Document ID: <strong className="font-mono">{docId || 'Draft'}</strong></span>
        </div>
      </div>

      {/* Templates Selector Modal */}
      {templatesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-[#082b5c] text-white">
              <h3 className="font-bold text-sm">Choose Academic Research Template</h3>
              <button onClick={() => setTemplatesOpen(false)} className="text-white/80 hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 flex-1 text-xs">
              <p className="text-slate-600 mb-2">
                Select an institutional SLSU scholarly research template to pre-populate your paper with standard academic headings, tables, and methodology guidelines.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RESEARCH_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleApplyTemplate(tpl)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-[#69b7e6] hover:bg-sky-50/50 cursor-pointer transition-all space-y-1 shadow-xs"
                  >
                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold uppercase text-[9px]">
                      {tpl.category}
                    </span>
                    <h4 className="font-bold text-[#082b5c] text-xs pt-1">{tpl.title}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {versionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-[#082b5c] text-white">
              <h3 className="font-bold text-sm">Version History & Snapshots</h3>
              <button onClick={() => setVersionsOpen(false)} className="text-white/80 hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-2.5 text-xs flex-1">
              {versions.length === 0 ? (
                <p className="text-slate-500 text-center py-6">No previous versions captured yet.</p>
              ) : (
                versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between hover:bg-slate-50"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">Version {ver.version_number}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ver.created_at).toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRestoreVersion(ver.version_number)}
                      className="px-3 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold text-xs"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}