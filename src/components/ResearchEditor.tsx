import React, { useState, useEffect, useRef } from 'react';
import type { AIProviderId, DocumentVersion, ResearchDocument } from '../types/ai';
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

type ChatMessage = { role: 'user' | 'assistant'; content: string; error?: boolean };

export function ResearchEditor({ initialDocument, onBackToLibrary }: ResearchEditorProps) {
  const [docId, setDocId] = useState<string | null>(initialDocument?.id || null);
  const [title, setTitle] = useState(initialDocument?.title || 'Untitled Research Paper');
  const [authors, setAuthors] = useState(initialDocument?.authors || 'SLSU Researcher');
  const [category, setCategory] = useState(initialDocument?.research_category || 'General');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [wordCount, setWordCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  // Editor Formatting States
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [fontSize, setFontSize] = useState('3'); // 3 = 12pt in execCommand
  const [lineSpacing, setLineSpacing] = useState('1.5');
  const [marginSize, setMarginSize] = useState<'normal' | 'narrow' | 'moderate'>('normal');
  const [activeTab, setActiveTab] = useState<'Home' | 'Insert' | 'Layout' | 'View'>('Home');

  // Modals & Drawers
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(true);

  // AI Assistant States (chat-to-prompt)
  const [selectedText, setSelectedText] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProviderId>('ollama');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [humanize, setHumanize] = useState(true);
  const [copilotTheme, setCopilotTheme] = useState<'light' | 'dark'>('light');

  // Grammarly-like Diff State
  const [diffs, setDiffs] = useState<Array<{ id: string; oldText: string; newText: string; range: Range }>>([]);
  const [humanScore, setHumanScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const paginateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);

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

  // Unwrap legacy wrapper divs (e.g. <div class="doc-body">) so each block can paginate
  const hasWrapper = Array.from(ed.children).some(
    (el) =>
      el.tagName === 'DIV' &&
      el.querySelector(
        ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol, :scope > table, :scope > div'
      )
  );
  if (hasWrapper) normalizeBlocks();

  const contentH = PAGE_H - 2 * marginRef.current;
  const kids = Array.from(ed.children) as HTMLElement[]; // read AFTER normalizing

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
      normalizeBlocks();
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

  // Keep the chat scrolled to the latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, isAiGenerating]);

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

  // Remember the selection so it survives clicking into the chat box
  const handleSelectionChange = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim() && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
      setSelectedText(sel.toString().trim());
      savedRange.current = sel.getRangeAt(0).cloneRange();
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
        normalizeBlocks();
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
          normalizeBlocks();
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
          normalizeBlocks();
          updateCounts();
        }
        setVersionsOpen(false);
      }
    } catch {}
  };

  // ---------- AI Assistant: chat to prompt ----------
  const handleSendChat = async (override?: string) => {
    const prompt = (override ?? chatInput).trim();
    if (!prompt || isAiGenerating) return;

    const docText = editorRef.current?.innerText || '';
    const history = chat.filter((m) => !m.error).slice(-8).map(({ role, content }) => ({ role, content }));

    setChat((prev) => [...prev, { role: 'user', content: prompt }]);
    setChatInput('');
    setIsAiGenerating(true);

    try {
      const result = await aiService.runWritingAssistant({
        prompt,
        history,
        text: selectedText || docText.slice(0, 6000),
        hasSelection: Boolean(selectedText),
        humanize,
        context: `${title} (${category})`,
        provider: aiProvider,
      });
      setChat((prev) => [...prev, { role: 'assistant', content: result.generated }]);
    } catch (err: any) {
      setChat((prev) => [...prev, { role: 'assistant', content: err.message || 'AI request failed', error: true }]);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const applyDiff = (originalText: string, suggestedText: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const diffId = `diff-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // Create wrapper container for inline visual diff
    const span = document.createElement('span');
    span.id = diffId;
    span.className = 'grammarly-diff-wrapper relative inline-block group cursor-pointer';

    span.innerHTML = `
      <del class="diff-removed bg-rose-100 text-rose-800 line-through px-1 rounded mr-1 select-none">${escapeHtml(originalText || selectedText)}</del>
      <ins class="diff-added bg-emerald-100 text-emerald-800 no-underline px-1 rounded font-semibold">${escapeHtml(suggestedText)}</ins>

      <span class="grammarly-tooltip hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-900 text-white text-[10px] rounded p-1.5 shadow-xl z-30 gap-1 font-sans">
        <button type="button" class="accept-btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-0.5 rounded">Accept</button>
        <button type="button" class="dismiss-btn bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-0.5 rounded">Dismiss</button>
      </span>
    `;

    range.deleteContents();
    range.insertNode(span);

    // Bind local click handlers for inline accept/dismiss
    const acceptBtn = span.querySelector('.accept-btn');
    const dismissBtn = span.querySelector('.dismiss-btn');

    const handleAccept = (e: Event) => {
      e.stopPropagation();
      acceptDiff(diffId, suggestedText);
    };

    const handleDismiss = (e: Event) => {
      e.stopPropagation();
      dismissDiff(diffId, originalText || selectedText);
    };

    acceptBtn?.addEventListener('click', handleAccept);
    dismissBtn?.addEventListener('click', handleDismiss);

    setDiffs((prev) => [...prev, { id: diffId, oldText: originalText || selectedText, newText: suggestedText, range }]);
    setSelectedText('');
    savedRange.current = null;
    updateCounts();
  };

  const acceptDiff = (id: string, newText: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const textNode = document.createTextNode(newText);
    el.parentNode?.replaceChild(textNode, el);
    setDiffs((prev) => prev.filter((d) => d.id !== id));
    updateCounts();
    scoreHuman(editorRef.current?.innerText || '');
  };

  const dismissDiff = (id: string, oldText: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const textNode = document.createTextNode(oldText);
    el.parentNode?.replaceChild(textNode, el);
    setDiffs((prev) => prev.filter((d) => d.id !== id));
    updateCounts();
    scoreHuman(editorRef.current?.innerText || '');
  };

  const handleAcceptAll = () => {
    diffs.forEach((d) => acceptDiff(d.id, d.newText));
    scoreHuman(editorRef.current?.innerText || '');
  };

  const handleDismissAll = () => {
    diffs.forEach((d) => dismissDiff(d.id, d.oldText));
    scoreHuman(editorRef.current?.innerText || '');
  };

  // ---------- Human Score Engine ----------
  const calculateHumanScore = (text: string): number => {
    if (!text || !text.trim()) return 0;
    const words = text.trim().split(/\s+/).length;
    if (words < 10) return 60;

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 3).length || 1;
    const avgSentenceLen = words / sentences;

    const fillerPhrases = [
      'delve into', 'it is important to note', 'in today\'s world', 'plays a crucial role',
      'moreover', 'furthermore', 'in conclusion', 'tapestry', 'landscape', 'underscores',
      'it is worth noting', 'it should be noted', 'a testament to', 'the realm of',
      'it is evident that', 'in light of the fact that'
    ];
    const lowerText = text.toLowerCase();
    const fillerCount = fillerPhrases.filter((p) => lowerText.includes(p)).length;

    const passiveMatches = text.match(/\b(is|are|was|were|been|being)\s+\w+ed\b/gi) || [];
    const passiveRatio = passiveMatches.length / sentences;

    let score = 100;
    score -= fillerCount * 12;
    score -= passiveRatio * 30;
    if (avgSentenceLen < 10) score -= 15;
    if (avgSentenceLen > 30) score -= 10;

    const uniqueWords = new Set(text.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).size;
    const vocabularyDiversity = uniqueWords / words;
    score += (vocabularyDiversity - 0.4) * 25;

    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const scoreHuman = async (text: string) => {
    if (!text || !text.trim()) {
      setHumanScore(0);
      return;
    }
    setIsScoring(true);
    // Simulate async scoring delay for smooth animation
    await new Promise((r) => setTimeout(r, 350));
    const score = calculateHumanScore(text);
    setHumanScore(score);
    setIsScoring(false);
  };

  const getScoreColor = (score: number | null): string => {
    if (score === null) return '#64748b';
    if (score < 40) return '#ef4444';
    if (score <= 70) return '#f59e0b';
    return '#22c55e';
  };

  const stackHeight = pageCount * PAGE_PERIOD - PAGE_GAP;
  const pdfPreviewUrl =
    initialDocument?.file_format?.toLowerCase() === 'pdf' && initialDocument.file_path
      ? `/api/documents/${encodeURIComponent(initialDocument.id)}/file`
      : undefined;
  const isPdfPreview = Boolean(pdfPreviewUrl);

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden animate-in fade-in duration-200">
      {/* Top Application Bar - Integrated with breadcrumbs for a unified look */}
      <div className="flex items-center justify-between px-4 h-14 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onBackToLibrary}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors h-9 w-9 flex items-center justify-center"
            title="Back to Library"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
            <div className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
              {saveStatus === 'saved' ? 'All changes saved' : 'Unsaved changes'}
            </span>
          </div>
        </div>
      </div>

      {/* Editor Context Bar (Previously Dark Header) - Now integrated cleanly */}
      <div className="bg-[#082b5c] text-white px-4 py-3 shrink-0 flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaveStatus('unsaved');
            }}
            readOnly={isPdfPreview}
            className="bg-transparent font-bold text-lg text-white outline-none border-b border-transparent focus:border-sky-400"
          />
          <span className="text-[11px] text-sky-200 mt-0.5">
            {isPdfPreview ? 'PDF Preview' : 'Microsoft Word-Style Paper Editor'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isPdfPreview && (
            <>
              <button
                onClick={() => setTemplatesOpen(true)}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10"
              >
                <span>Templates</span>
              </button>

              <input ref={importFileInputRef} type="file" accept=".docx" onChange={handleImportDocx} className="hidden" />
              <button
                onClick={() => importFileInputRef.current?.click()}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/10"
              >
                Import
              </button>

              <button
                onClick={handleSaveDocument}
                className="h-9 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm transition-all"
              >
                Save
              </button>

              <button
                onClick={handleOpenVersions}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
                title="History"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              </button>
            </>
          )}

          <button
            onClick={() => setAiAssistantOpen(!aiAssistantOpen)}
            className={`h-9 px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
              aiAssistantOpen ? 'bg-sky-400 text-[#082b5c]' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z" /></svg>
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Word-Style Ribbon / Formatting Toolbar */}
      {isPdfPreview ? (
        <div className="px-4 py-2 bg-slate-200 border-b border-slate-300 text-xs text-slate-600">
          Viewing the original PDF. PDF files are read-only in the paper editor.
        </div>
      ) : (
        <div className="bg-slate-50 border-b border-slate-300">
          <div className="flex border-b border-slate-200 px-2">
            {(['Home', 'Insert', 'Layout', 'View'] as const).map((tab) => (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`word-ribbon-tab ${activeTab === tab ? 'active' : ''}`}
              >
                {tab}
              </div>
            ))}
          </div>
          <div className="flex items-start bg-white h-20 px-2 py-1.5 overflow-x-auto gap-2">
            {activeTab === 'Home' && (
              <>
                <div className="word-ribbon-group">
                  <div className="flex gap-1">
                    <button onClick={() => executeCommand('undo')} className="word-tool-button" title="Undo">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6M3 13a9 9 0 0 1 15-6.7L21 9" /></svg>
                      <span className="text-[9px]">Undo</span>
                    </button>
                    <button onClick={() => executeCommand('redo')} className="word-tool-button" title="Redo">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6M21 13a9 9 0 0 0-15-6.7L3 9" /></svg>
                      <span className="text-[9px]">Redo</span>
                    </button>
                  </div>
                  <span className="word-ribbon-group-label">Clipboard</span>
                </div>
                <div className="w-px bg-slate-200 h-16 my-auto" />
                <div className="word-ribbon-group">
                  <div className="flex gap-1 mb-1">
                    <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); executeCommand('fontName', e.target.value); }} className="px-1 text-xs border border-slate-300 rounded">
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Calibri">Calibri</option>
                      <option value="Montserrat">Montserrat</option>
                    </select>
                    <select value={fontSize} onChange={(e) => { setFontSize(e.target.value); executeCommand('fontSize', e.target.value); }} className="px-1 text-xs border border-slate-300 rounded w-14">
                      <option value="1">10 pt</option>
                      <option value="2">11 pt</option>
                      <option value="3">12 pt</option>
                      <option value="4">14 pt</option>
                      <option value="5">18 pt</option>
                      <option value="6">24 pt</option>
                    </select>
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => executeCommand('bold')} className="word-tool-button font-bold" title="Bold">B</button>
                    <button onClick={() => executeCommand('italic')} className="word-tool-button italic" title="Italic">I</button>
                    <button onClick={() => executeCommand('underline')} className="word-tool-button underline" title="Underline">U</button>
                    <button onClick={() => executeCommand('strikeThrough')} className="word-tool-button line-through" title="Strikethrough">S</button>
                    <div className="flex items-center gap-1 ml-1 pl-1 border-l border-slate-200">
                      <label className="text-[10px] text-slate-500" title="Text Color">A</label>
                      <input type="color" onChange={(e) => executeCommand('foreColor', e.target.value)} className="w-4 h-4 cursor-pointer bg-transparent border-0" title="Font Color" />
                      <label className="text-[10px] text-slate-500 ml-1" title="Highlight">H</label>
                      <input type="color" defaultValue="#ffff00" onChange={(e) => executeCommand('hiliteColor', e.target.value)} className="w-4 h-4 cursor-pointer bg-transparent border-0" title="Text Highlight Color" />
                    </div>
                  </div>
                  <span className="word-ribbon-group-label">Font</span>
                </div>
                <div className="w-px bg-slate-200 h-16 my-auto" />
                <div className="word-ribbon-group">
                  <div className="flex gap-0.5 mb-1">
                    <button onClick={() => executeCommand('justifyLeft')} className="word-tool-button" title="Align Left">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg>
                    </button>
                    <button onClick={() => executeCommand('justifyCenter')} className="word-tool-button" title="Align Center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" /></svg>
                    </button>
                    <button onClick={() => executeCommand('justifyRight')} className="word-tool-button" title="Align Right">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></svg>
                    </button>
                    <button onClick={() => executeCommand('justifyFull')} className="word-tool-button" title="Justify">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></svg>
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => executeCommand('insertUnorderedList')} className="word-tool-button" title="Bullet List">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                    </button>
                    <button onClick={() => executeCommand('insertOrderedList')} className="word-tool-button" title="Numbered List">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /></svg>
                    </button>
                    <select
                      value={lineSpacing}
                      onChange={(e) => setLineSpacing(e.target.value)}
                      className="px-1 text-xs border border-slate-300 rounded ml-1"
                      title="Line Spacing"
                    >
                      <option value="1.0">1.0</option>
                      <option value="1.15">1.15</option>
                      <option value="1.5">1.5</option>
                      <option value="2.0">2.0</option>
                    </select>
                  </div>
                  <span className="word-ribbon-group-label">Paragraph</span>
                </div>
                <div className="w-px bg-slate-200 h-16 my-auto" />
                <div className="word-ribbon-group">
                  <div className="flex gap-1 items-center">
                    <button onClick={() => executeCommand('formatBlock', '<h1>')} className="px-2 py-1 border border-slate-200 rounded text-xs font-bold hover:bg-slate-100" title="Heading 1">H1 Heading</button>
                    <button onClick={() => executeCommand('formatBlock', '<h2>')} className="px-2 py-1 border border-slate-200 rounded text-xs font-semibold hover:bg-slate-100" title="Heading 2">H2 Sub</button>
                    <button onClick={() => executeCommand('formatBlock', '<p>')} className="px-2 py-1 border border-slate-200 rounded text-xs hover:bg-slate-100" title="Normal">Normal</button>
                    <button onClick={() => executeCommand('removeFormat')} className="px-2 py-1 border border-slate-200 rounded text-xs hover:bg-slate-100 text-rose-600 font-bold" title="Clear Formatting">Clear</button>
                  </div>
                  <span className="word-ribbon-group-label">Styles Gallery</span>
                </div>
              </>
            )}
            {activeTab === 'Insert' && (
              <>
                <div className="word-ribbon-group">
                  <button onClick={handleInsertTable} className="word-tool-button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
                    <span className="text-[9px]">Table</span>
                  </button>
                  <span className="word-ribbon-group-label">Tables</span>
                </div>
                <div className="word-ribbon-group">
                  <button onClick={() => {
                    const url = prompt('Enter image URL:');
                    if (url) executeCommand('insertImage', url);
                  }} className="word-tool-button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span className="text-[9px]">Picture</span>
                  </button>
                  <span className="word-ribbon-group-label">Illustrations</span>
                </div>
              </>
            )}
            {activeTab === 'Layout' && (
              <>
                <div className="word-ribbon-group">
                  <select
                    value={marginSize}
                    onChange={(e) => setMarginSize(e.target.value as any)}
                    className="px-1 text-xs border border-slate-300 rounded mb-1"
                  >
                    <option value="normal">Normal (1")</option>
                    <option value="moderate">Moderate (0.75")</option>
                    <option value="narrow">Narrow (0.5")</option>
                  </select>
                  <span className="word-ribbon-group-label">Page Setup</span>
                </div>
              </>
            )}
            {activeTab === 'View' && (
              <>
                <div className="word-ribbon-group">
                  <div className="flex gap-1">
                    <button className="word-tool-button active">
                      <span className="text-[9px]">Print Layout</span>
                    </button>
                  </div>
                  <span className="word-ribbon-group-label">Views</span>
                </div>
              </>
            )}
          </div>
        </div>


      )}

      {/* Editor Body: AI Sidebar on Left + Paper on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* AI Research Writing Assistant Panel (Left Sidebar) */}
        {aiAssistantOpen && (
          <div className={`w-[380px] flex-none flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left-4 duration-200 ${copilotTheme === 'dark' ? 'bg-[#1e1e1e] text-[#cccccc] border-r border-[#333333]' : 'bg-slate-50 text-slate-800 border-r border-slate-300'}`}>
            <div className={`flex items-center justify-between px-3 py-2 ${copilotTheme === 'dark' ? 'bg-[#252526] border-b border-[#333333]' : 'bg-slate-100 border-b border-slate-300'}`}>
              <div className="flex items-center gap-2">
                <span className={`${copilotTheme === 'dark' ? 'text-[#007acc]' : 'text-[#082b5c]'} font-mono font-bold text-xs`}>⚡ AI COPILOT</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCopilotTheme(copilotTheme === 'light' ? 'dark' : 'light')}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${copilotTheme === 'dark' ? 'hover:bg-[#3c3c3c]' : 'hover:bg-slate-200'}`}
                  title={`Switch to ${copilotTheme === 'light' ? 'Dark' : 'Light'} Mode`}
                >
                  {copilotTheme === 'light' ? '🌙' : '☀️'}
                </button>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AIProviderId)}
                  className={`${copilotTheme === 'dark' ? 'bg-[#3c3c3c] text-[#cccccc] border-[#555555]' : 'bg-white text-slate-700 border-slate-300'} font-mono text-[10px] border rounded px-1 py-0.5 outline-none`}
                >
                  <option value="ollama">Ollama</option>
                  <option value="claude">Claude</option>
                </select>
                <button
                  onClick={() => setAiAssistantOpen(false)}
                  className="text-[#969696] hover:text-rose-500 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 text-xs font-mono">
              <div className={`flex items-center gap-2 px-3 py-1 ${copilotTheme === 'dark' ? 'bg-[#2d2d2d] text-[#969696]' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-90`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>CONTEXT: {selectedText ? 'SELECTION' : 'FULL FILE'}</span>
              </div>

              <div className={`p-2 ${copilotTheme === 'dark' ? 'bg-[#1e1e1e] border-b border-[#2d2d2d]' : 'bg-white border-b border-slate-200'} text-[11px]`}>
                <div className={`${copilotTheme === 'dark' ? 'text-[#6a9955]' : 'text-emerald-700'} truncate`}>
                  // {title} ({category})
                </div>
                {selectedText && (
                  <div className={`mt-1 p-1.5 rounded border ${copilotTheme === 'dark' ? 'bg-[#252526] border-[#3c3c3c] text-[#ce9178]' : 'bg-slate-100 border-slate-200 text-slate-700'} max-h-16 overflow-y-auto`}>
                    "{selectedText}"
                  </div>
                )}
              </div>

              {/* Human Score Ring */}
              <div className={`flex items-center justify-between px-3 py-2 ${copilotTheme === 'dark' ? 'bg-[#252526]' : 'bg-slate-50'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Human-like Score</span>
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle
                      cx="28" cy="28" r="24"
                      fill="none"
                      stroke={copilotTheme === 'dark' ? '#3c3c3c' : '#e2e8f0'}
                      strokeWidth="5"
                    />
                    <circle
                      cx="28" cy="28" r="24"
                      fill="none"
                      stroke={humanScore === null ? (copilotTheme === 'dark' ? '#569cd6' : '#082b5c') : getScoreColor(humanScore)}
                      strokeWidth="5"
                      strokeDasharray="150.8"
                      strokeDashoffset={150.8 - (150.8 * (humanScore || 0)) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isScoring ? (
                      <span className="text-[10px] font-bold animate-pulse text-slate-400">...</span>
                    ) : humanScore !== null ? (
                      <>
                        <span className="text-base font-bold" style={{ color: getScoreColor(humanScore) }}>{humanScore}%</span>
                        <span className="text-[7px] text-slate-400 font-bold uppercase">Human</span>
                      </>
                    ) : (
                      <span className="text-[7px] text-slate-400 font-bold uppercase">N/A</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => scoreHuman(selectedText || editorRef.current?.innerText || '')}
                  className="text-[9px] px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold"
                >
                  {isScoring ? '...' : 'Score'}
                </button>
              </div>

              <div className={`flex items-center gap-2 px-3 py-1 ${copilotTheme === 'dark' ? 'bg-[#2d2d2d] text-[#969696]' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold uppercase tracking-wider`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                <span>TERMINAL</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
                {chat.length === 0 && (
                  <div className={`text-center py-8 space-y-2 font-mono text-[11px] ${copilotTheme === 'dark' ? 'text-[#6e7681]' : 'text-slate-500'}`}>
                    <p className={copilotTheme === 'dark' ? 'text-[#569cd6]' : 'text-[#082b5c]'}>&gt; Copilot ready.</p>
                    <p>Enter a prompt below to synthesize research.</p>
                  </div>
                )}

                {chat.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-mono text-[#6e7681] mb-1">
                      {m.role === 'user' ? 'USER' : 'AI'}
                    </span>
                    <div
                      className={`rounded-md p-3 text-sm leading-relaxed mb-4 ${
                        m.role === 'user'
                          ? 'bg-[#0e639c] text-white self-end'
                          : m.error
                          ? 'bg-rose-100 border border-rose-300 text-rose-800'
                          : copilotTheme === 'dark'
                            ? 'bg-[#2d2d2d] border border-[#454545] text-[#cccccc]'
                            : 'bg-white border border-slate-300'
                      }`}
                    >
                      {m.content}
                      {m.role === 'assistant' && !m.error && (
                        <div className={`flex items-center gap-2 mt-3 pt-2 border-t ${copilotTheme === 'dark' ? 'border-[#454545]' : 'border-slate-200'}`}>
                          <button
                            onClick={() => applyDiff(selectedText, m.content)}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold"
                          >
                            APPLY
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isAiGenerating && (
                  <div className={`flex items-center gap-2 font-mono text-[11px] animate-pulse ${copilotTheme === 'dark' ? 'text-[#569cd6]' : 'text-sky-700'}`}>
                    <span className="inline-block w-2 h-2 rounded-full bg-current"></span>
                    Generating...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={`p-3 ${copilotTheme === 'dark' ? 'bg-[#252526] border-t border-[#333333]' : 'bg-slate-100 border-t border-slate-200'} space-y-2`}>
                {diffs.length > 0 && (
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-500">{diffs.length} Pending Suggestion(s)</span>
                    <div className="flex gap-1">
                      <button
                        onClick={handleAcceptAll}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[9px] font-bold"
                      >
                        Accept All
                      </button>
                      <button
                        onClick={handleDismissAll}
                        className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white font-mono text-[9px]"
                      >
                        Dismiss All
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat();
                      }
                    }}
                    rows={2}
                    placeholder="Enter command..."
                    className={`w-full font-mono text-xs rounded px-2 py-1.5 focus:outline-none ${copilotTheme === 'dark' ? 'bg-[#3c3c3c] text-white focus:border-[#007acc]' : 'bg-white text-slate-800 border-slate-300 border focus:border-[#082b5c]'}`}
                  />
                  <button
                    onClick={() => handleSendChat()}
                    disabled={isAiGenerating || !chatInput.trim()}
                    className="px-3 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-40 text-white rounded font-bold font-mono text-xs"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Writing Canvas */}
        <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
          <div className="flex flex-col" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
            <div className="ruler-horizontal w-[816px] mb-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex-1 relative">
                  <div className="ruler-tick ruler-tick-major" />
                  <span className="ruler-number">{i * 100}</span>
                </div>
              ))}
            </div>

            {isPdfPreview ? (
              <div className="relative h-[1056px] w-[816px] bg-white shadow-2xl page-shadow">
                <iframe
                  src={pdfPreviewUrl}
                  title={`PDF preview: ${title}`}
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            ) : (
              <div
                className="relative shrink-0"
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
                    className="absolute bg-white shadow-2xl border border-slate-300 rounded-sm select-none pointer-events-none page-shadow"
                    style={{ left: 0, top: i * PAGE_PERIOD, width: PAGE_W, height: PAGE_H }}
                  >
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
            )}
          </div>
        </div>

        {/* AI Research Writing Assistant Panel (No longer needed - moved to left) */}
        {false && (
          <div>
            <div className={`flex items-center justify-between px-3 py-2 ${copilotTheme === 'dark' ? 'bg-[#252526] border-b border-[#333333]' : 'bg-slate-100 border-b border-slate-300'}`}>
              <div className="flex items-center gap-2">
                <span className={`${copilotTheme === 'dark' ? 'text-[#007acc]' : 'text-[#082b5c]'} font-mono font-bold text-xs`}>⚡ AI COPILOT</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCopilotTheme(copilotTheme === 'light' ? 'dark' : 'light')}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${copilotTheme === 'dark' ? 'hover:bg-[#3c3c3c]' : 'hover:bg-slate-200'}`}
                  title={`Switch to ${copilotTheme === 'light' ? 'Dark' : 'Light'} Mode`}
                >
                  {copilotTheme === 'light' ? '🌙' : '☀️'}
                </button>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AIProviderId)}
                  className={`${copilotTheme === 'dark' ? 'bg-[#3c3c3c] text-[#cccccc] border-[#555555]' : 'bg-white text-slate-700 border-slate-300'} font-mono text-[10px] border rounded px-1 py-0.5 outline-none`}
                >
                  <option value="ollama">Ollama</option>
                  <option value="claude">Claude</option>
                </select>
                <button
                  onClick={() => setAiAssistantOpen(false)}
                  className="text-[#969696] hover:text-rose-500 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 text-xs font-mono">
              <div className={`flex items-center gap-2 px-3 py-1 ${copilotTheme === 'dark' ? 'bg-[#2d2d2d] text-[#969696]' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-90`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>CONTEXT: {selectedText ? 'SELECTION' : 'FULL FILE'}</span>
              </div>

              <div className={`p-2 ${copilotTheme === 'dark' ? 'bg-[#1e1e1e] border-b border-[#2d2d2d]' : 'bg-white border-b border-slate-200'} text-[11px]`}>
                <div className={`${copilotTheme === 'dark' ? 'text-[#6a9955]' : 'text-emerald-700'} truncate`}>
                  // {title} ({category})
                </div>
                {selectedText && (
                  <div className={`mt-1 p-1.5 rounded border ${copilotTheme === 'dark' ? 'bg-[#252526] border-[#3c3c3c] text-[#ce9178]' : 'bg-slate-100 border-slate-200 text-slate-700'} max-h-16 overflow-y-auto`}>
                    "{selectedText}"
                  </div>
                )}
              </div>

              {/* Human Score Ring */}
              <div className={`flex items-center justify-between px-3 py-2 ${copilotTheme === 'dark' ? 'bg-[#252526]' : 'bg-slate-50'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Human-like Score</span>
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle
                      cx="28" cy="28" r="24"
                      fill="none"
                      stroke={copilotTheme === 'dark' ? '#3c3c3c' : '#e2e8f0'}
                      strokeWidth="5"
                    />
                    <circle
                      cx="28" cy="28" r="24"
                      fill="none"
                      stroke={humanScore === null ? (copilotTheme === 'dark' ? '#569cd6' : '#082b5c') : getScoreColor(humanScore)}
                      strokeWidth="5"
                      strokeDasharray="150.8"
                      strokeDashoffset={150.8 - (150.8 * (humanScore || 0)) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isScoring ? (
                      <span className="text-[10px] font-bold animate-pulse text-slate-400">...</span>
                    ) : humanScore !== null ? (
                      <>
                        <span className="text-base font-bold" style={{ color: getScoreColor(humanScore) }}>{humanScore}%</span>
                        <span className="text-[7px] text-slate-400 font-bold uppercase">Human</span>
                      </>
                    ) : (
                      <span className="text-[7px] text-slate-400 font-bold uppercase">N/A</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => scoreHuman(selectedText || editorRef.current?.innerText || '')}
                  className="text-[9px] px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold"
                >
                  {isScoring ? '...' : 'Score'}
                </button>
              </div>

              <div className={`flex items-center gap-2 px-3 py-1 ${copilotTheme === 'dark' ? 'bg-[#2d2d2d] text-[#969696]' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold uppercase tracking-wider`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                <span>TERMINAL</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
                {chat.length === 0 && (
                  <div className={`text-center py-8 space-y-2 font-mono text-[11px] ${copilotTheme === 'dark' ? 'text-[#6e7681]' : 'text-slate-500'}`}>
                    <p className={copilotTheme === 'dark' ? 'text-[#569cd6]' : 'text-[#082b5c]'}>&gt; Copilot ready.</p>
                    <p>Enter a prompt below to synthesize research.</p>
                  </div>
                )}

                {chat.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-mono text-[#6e7681] mb-1">
                      {m.role === 'user' ? 'USER' : 'AI'}
                    </span>
                    <div
                      className={`rounded-md p-3 text-sm leading-relaxed mb-4 ${
                        m.role === 'user'
                          ? 'bg-[#0e639c] text-white self-end'
                          : m.error
                          ? 'bg-rose-100 border border-rose-300 text-rose-800'
                          : copilotTheme === 'dark'
                            ? 'bg-[#2d2d2d] border border-[#454545] text-[#cccccc]'
                            : 'bg-white border border-slate-300'
                      }`}
                    >
                      {m.content}
                      {m.role === 'assistant' && !m.error && (
                        <div className={`flex items-center gap-2 mt-3 pt-2 border-t ${copilotTheme === 'dark' ? 'border-[#454545]' : 'border-slate-200'}`}>
                          <button
                            onClick={() => applyDiff(selectedText, m.content)}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold"
                          >
                            APPLY
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isAiGenerating && (
                  <div className={`flex items-center gap-2 font-mono text-[11px] animate-pulse ${copilotTheme === 'dark' ? 'text-[#569cd6]' : 'text-sky-700'}`}>
                    <span className="inline-block w-2 h-2 rounded-full bg-current"></span>
                    Generating...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={`p-3 ${copilotTheme === 'dark' ? 'bg-[#252526] border-t border-[#333333]' : 'bg-slate-100 border-t border-slate-200'} space-y-2`}>
                {diffs.length > 0 && (
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-500">{diffs.length} Pending Suggestion(s)</span>
                    <div className="flex gap-1">
                      <button
                        onClick={handleAcceptAll}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[9px] font-bold"
                      >
                        Accept All
                      </button>
                      <button
                        onClick={handleDismissAll}
                        className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white font-mono text-[9px]"
                      >
                        Dismiss All
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat();
                      }
                    }}
                    rows={2}
                    placeholder="Enter command..."
                    className={`w-full font-mono text-xs rounded px-2 py-1.5 focus:outline-none ${copilotTheme === 'dark' ? 'bg-[#3c3c3c] text-white focus:border-[#007acc]' : 'bg-white text-slate-800 border-slate-300 border focus:border-[#082b5c]'}`}
                  />
                  <button
                    onClick={() => handleSendChat()}
                    disabled={isAiGenerating || !chatInput.trim()}
                    className="px-3 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-40 text-white rounded font-bold font-mono text-xs"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Editor Status Bar */}
      <div className="flex items-center justify-between px-6 h-8 bg-slate-200 border-t border-slate-300 text-[11px] text-slate-600 shrink-0">
        <div className="flex items-center gap-4">
          {isPdfPreview ? (
            <span>Original PDF preview</span>
          ) : (
            <>
              <span>Page <strong>{Math.min(currentPage, pageCount)}</strong> of <strong>{pageCount}</strong></span>
              <span>Words: <strong>{wordCount}</strong></span>
              <span>Characters: <strong>{(editorRef.current?.innerText || '').length}</strong></span>
              <span>Standard Font: <strong>{fontFamily}</strong></span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">Zoom: {zoom}%</span>
            <input
              type="range"
              min={50}
              max={200}
              step={10}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-[#082b5c] cursor-pointer"
            />
          </div>
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