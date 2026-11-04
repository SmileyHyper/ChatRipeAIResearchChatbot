import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Footer,
  PageNumber,
} from 'docx';
import { db, UPLOADS_DIR } from '../database/db.ts';

const require = createRequire(import.meta.url);

export interface ParsedDocumentResult {
  text: string;
  html: string;
  authors?: string;
  year?: number;
  abstract?: string;
  keywords?: string;
}

/**
 * Extract text and formatted preview from various document formats
 */
export async function extractDocumentContent(
  fileBuffer: Buffer,
  fileFormat: string,
  fileName: string
): Promise<ParsedDocumentResult> {
  const format = fileFormat.toLowerCase().replace(/^\./, '');

  if (format === 'docx' || format === 'doc') {
    try {
      const textResult = await mammoth.extractRawText({ buffer: fileBuffer });
      const htmlResult = await mammoth.convertToHtml({ buffer: fileBuffer });
      const text = textResult.value || '';
      const html = htmlResult.value || `<div class="doc-body"><pre>${text}</pre></div>`;

      // Simple heuristic extraction of abstract
      const abstractMatch = text.match(/abstract[:\s\n]+([\s\S]{50,600}?)(?:\n\s*\n|1\.\s+introduction|keywords)/i);
      const abstract = abstractMatch ? abstractMatch[1].trim() : undefined;

      return { text, html, abstract };
    } catch (err: any) {
      console.warn('[DocService] Mammoth failed, falling back to string:', err.message);
      const fallbackText = fileBuffer.toString('utf-8');
      return { text: fallbackText, html: `<pre>${fallbackText}</pre>` };
    }
  }

  if (format === 'pdf') {
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse(fileBuffer);
      await parser.load();
      const text = await parser.getText();
      const cleanText = typeof text === 'string' ? text : String(text || '');
      const html = `<div class="pdf-preview"><pre class="whitespace-pre-wrap">${cleanText.slice(0, 10000)}</pre></div>`;

      const abstractMatch = cleanText.match(/abstract[:\s\n]+([\s\S]{50,600}?)(?:\n\s*\n|1\.\s+introduction|keywords)/i);
      const abstract = abstractMatch ? abstractMatch[1].trim() : undefined;

      return { text: cleanText, html, abstract };
    } catch (err: any) {
      console.warn('[DocService] PDF parse failed:', err.message);
      return {
        text: `[PDF Document: ${fileName} - Preview unavailable]`,
        html: `<p class="italic text-slate-500">PDF text extraction preview not available</p>`,
      };
    }
  }

  // txt, md, or plain formats
  const text = fileBuffer.toString('utf-8');
  const html = `<div class="doc-body"><pre class="whitespace-pre-wrap font-sans text-xs">${text}</pre></div>`;
  return { text, html };
}

/**
 * Split document text into chunks and save to database for RAG search
 */
export function indexDocumentChunks(documentId: string, fullText: string) {
  // Remove existing chunks
  db.prepare('DELETE FROM document_chunks WHERE document_id = ?').run(documentId);

  if (!fullText || !fullText.trim()) return;

  const paragraphs = fullText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length < 1200) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = para;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const insertChunk = db.prepare(`
    INSERT INTO document_chunks (id, document_id, chunk_index, content, keywords)
    VALUES (?, ?, ?, ?, ?)
  `);

  chunks.forEach((content, index) => {
    const chunkId = `chunk_${documentId}_${index}_${Date.now()}`;
    const words = content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const keywords = Array.from(new Set(words)).slice(0, 15).join(', ');
    insertChunk.run(chunkId, documentId, index, content, keywords);
  });
}

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  authors?: string;
  year?: number;
  chunkIndex: number;
  content: string;
  score: number;
}

/**
 * Retrieve most relevant document passages using BM25 / keyword relevance scoring
 */
export function searchRelevantChunks(
  userId: string,
  query: string,
  targetDocIds?: string[],
  topK = 4
): RetrievedChunk[] {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryTokens.length === 0) return [];

  let querySql = `
    SELECT 
      c.id as chunk_id,
      c.document_id,
      c.chunk_index,
      c.content,
      c.keywords,
      d.title as document_title,
      d.authors,
      d.publication_year
    FROM document_chunks c
    JOIN research_documents d ON c.document_id = d.id
    WHERE d.user_id = ?
  `;

  const params: any[] = [userId];

  if (targetDocIds && targetDocIds.length > 0) {
    const placeholders = targetDocIds.map(() => '?').join(',');
    querySql += ` AND d.id IN (${placeholders})`;
    params.push(...targetDocIds);
  }

  const rows = db.prepare(querySql).all(...params) as any[];
  const scoredChunks: RetrievedChunk[] = [];

  for (const row of rows) {
    const textLower = row.content.toLowerCase();
    const keywordsLower = (row.keywords || '').toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      // Frequency match in chunk content
      const regex = new RegExp(`\\b${token}\\b`, 'g');
      const matches = textLower.match(regex);
      if (matches) {
        score += matches.length * 2.5;
      } else if (textLower.includes(token)) {
        score += 1.0;
      }
      if (keywordsLower.includes(token)) {
        score += 1.5;
      }
    }

    if (score > 0) {
      scoredChunks.push({
        documentId: row.document_id,
        documentTitle: row.document_title,
        authors: row.authors || undefined,
        year: row.publication_year || undefined,
        chunkIndex: row.chunk_index,
        content: row.content,
        score,
      });
    }
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK);
}

/**
 * Generate a genuine Microsoft Word (.docx) file buffer from research paper content
 */
export async function generateDocxBuffer(params: {
  title: string;
  content: string;
  authors?: string;
  abstract?: string;
  category?: string;
}): Promise<Buffer> {
  const { title, content, authors, abstract, category } = params;

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title || 'Research Paper',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, before: 100 },
    })
  );

  // Category Badge / Affiliation
  if (category) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Field / Category: ${category}`,
            italics: true,
            size: 20,
            color: '666666',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  }

  // Authors
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: authors || 'Southern Leyte State University Research Community',
          bold: true,
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Abstract Block
  if (abstract) {
    children.push(
      new Paragraph({
        text: 'Abstract',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: abstract, italics: true, size: 21 })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 300 },
      })
    );
  }

  // Parse lines/paragraphs from content
  const lines = (content || '').split('\n');
  let inTable = false;
  let tableRows: TableRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Check for markdown table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Skip separator row like |---|---|
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      inTable = true;
      const isHeaderRow = tableRows.length === 0;

      tableRows.push(
        new TableRow({
          children: cells.map(
            (cellText) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: cellText, bold: isHeaderRow })],
                  }),
                ],
                shading: isHeaderRow ? { fill: 'F2F4F8' } : undefined,
              })
          ),
        })
      );
      continue;
    } else if (inTable) {
      // End of table
      if (tableRows.length > 0) {
        children.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
      }
      tableRows = [];
      inTable = false;
    }

    if (!line) {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.replace('### ', ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
        })
      );
    } else if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.replace('## ', ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        })
      );
    } else if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.replace('# ', ''),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 160 },
        })
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      children.push(
        new Paragraph({
          text: line.substring(2),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    } else if (/^\d+\.\s/.test(line)) {
      children.push(
        new Paragraph({
          text: line.replace(/^\d+\.\s*/, ''),
          numbering: { reference: 'default-numbering', level: 0 },
          spacing: { after: 60 },
        })
      );
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 140, line: 360 }, // 1.5 line spacing
        })
      );
    }
  }

  if (tableRows.length > 0) {
    children.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch (1440 dxa)
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Page ' }),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun({ text: ' of ' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

