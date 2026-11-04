import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DB_PATH = path.join(DATA_DIR, 'chatripe.db');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export { UPLOADS_DIR, DATA_DIR };

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency & performance
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('[DB] PRAGMA configuration warning:', e);
}

/**
 * Initialize all database tables and indexes
 */
export function initDatabase() {
  db.exec(`
    -- 1. USERS
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 2. CONVERSATIONS
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      ai_provider TEXT NOT NULL,
      ai_model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 3. MESSAGES
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      ai_provider TEXT,
      ai_model TEXT,
      token_usage INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- 4. CONVERSATION MEMORY
    CREATE TABLE IF NOT EXISTS conversation_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      memory_type TEXT NOT NULL,
      memory_content TEXT NOT NULL,
      importance INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 5. RESEARCH CONTEXT
    CREATE TABLE IF NOT EXISTS research_context (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      context_content TEXT NOT NULL,
      source_conversation_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 6. RESEARCH FOLDERS
    CREATE TABLE IF NOT EXISTS research_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      parent_folder_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 7. RESEARCH DOCUMENTS
    CREATE TABLE IF NOT EXISTS research_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      document_type TEXT NOT NULL,
      content TEXT,
      html_content TEXT,
      file_path TEXT,
      file_format TEXT NOT NULL,
      authors TEXT,
      publication_year INTEGER,
      abstract TEXT,
      keywords TEXT,
      research_category TEXT,
      publication_source TEXT,
      doi TEXT,
      file_size INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES research_folders(id) ON DELETE SET NULL
    );

    -- 8. RESEARCH TAGS
    CREATE TABLE IF NOT EXISTS research_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, tag_name)
    );

    -- 9. DOCUMENT TAGS
    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (document_id, tag_id),
      FOREIGN KEY (document_id) REFERENCES research_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES research_tags(id) ON DELETE CASCADE
    );

    -- 10. RESEARCH REFERENCES
    CREATE TABLE IF NOT EXISTS research_references (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      author TEXT NOT NULL,
      publication_year INTEGER,
      title TEXT NOT NULL,
      publication_source TEXT,
      doi TEXT,
      citation_format TEXT,
      FOREIGN KEY (document_id) REFERENCES research_documents(id) ON DELETE CASCADE
    );

    -- 11. DOCUMENT VERSIONS
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content_snapshot TEXT NOT NULL,
      html_snapshot TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES research_documents(id) ON DELETE CASCADE
    );

    -- 12. DOCUMENT CHUNKS (For RAG & Semantic Retrieval)
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT,
      FOREIGN KEY (document_id) REFERENCES research_documents(id) ON DELETE CASCADE
    );

    -- INDEXES
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_user ON conversation_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_user ON research_documents(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id, version_number);
  `);

  seedDefaultData();
}

/**
 * Hash password securely using PBKDF2
 */
export function hashPassword(password: string, salt: string = 'chatripe_salt_2026'): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

/**
 * Seed initial scholar user and research folders
 */
function seedDefaultData() {
  const checkUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const existing = checkUser.get('scholar@slsu.edu.ph') as { id: string } | undefined;

  const now = Date.now();
  let defaultUserId = 'user_default_scholar';

  if (!existing) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const passwordHash = hashPassword('scholar123');
    insertUser.run(defaultUserId, 'SLSU Researcher', 'scholar@slsu.edu.ph', passwordHash, now, now);
  } else {
    defaultUserId = existing.id;
  }

  // Seed default folders for this user
  const checkFolders = db.prepare('SELECT COUNT(*) as count FROM research_folders WHERE user_id = ?');
  const folderCount = (checkFolders.get(defaultUserId) as any)?.count || 0;

  if (folderCount === 0) {
    const insertFolder = db.prepare(`
      INSERT INTO research_folders (id, user_id, folder_name, parent_folder_id, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `);
    insertFolder.run('folder_literature', defaultUserId, 'Literature Reviews', now);
    insertFolder.run('folder_proposals', defaultUserId, 'Proposals & Theses', now);
    insertFolder.run('folder_methodologies', defaultUserId, 'Methodologies & Data', now);
  }

  // Seed default sample research document if none exist
  const checkDocs = db.prepare('SELECT COUNT(*) as count FROM research_documents WHERE user_id = ?');
  const docCount = (checkDocs.get(defaultUserId) as any)?.count || 0;

  if (docCount === 0) {
    const sampleDocId = 'doc_sample_farming';
    const sampleTitle = 'Climate-Smart Farming Framework for Rural Agriculture';
    const sampleAbstract = 'This study investigates climate-resilient farming interventions across rural Southeast Asian agricultural communities, measuring soil moisture retention, adaptive crop yields, and farmer adoption rates under monsoon irregularities.';
    const sampleContent = `# Climate-Smart Farming Framework for Rural Agriculture

## Abstract
${sampleAbstract}

## 1. Introduction
Agricultural vulnerabilities to climate variability require localized technological interventions that combine renewable irrigation, moisture sensors, and resilient seed varieties. This study explores adaptive methodologies for coastal and upland farming zones.

## 2. Research Objectives
- Determine the correlation between real-time moisture monitoring and yield stability.
- Formulate a community-led deployment model for smallholder farmers.
- Assess economic viability over a 3-year multi-seasonal cycle.

## 3. Methodology
A randomized control trial was conducted across 45 farming clusters in Southern Leyte, utilizing mixed-methods data capture. Soil metrics were recorded bi-weekly while household economic indicators were surveyed across planting seasons.

## 4. Key Findings
- Yield retention increased by 31.4% during unseasonal dry spells.
- Water efficiency improved by 42% through sensor-guided scheduling.
- Farmer cooperative satisfaction reached 88%.

## 5. Conclusion & Recommendations
Implementing community sensor hubs backed by local extension workers significantly bolsters agricultural resilience. Immediate policy recommendation is to subsidize solar-powered sensor arrays for regional farm cooperatives.`;

    const insertDoc = db.prepare(`
      INSERT INTO research_documents (
        id, user_id, folder_id, title, description, document_type, content, html_content,
        file_path, file_format, authors, publication_year, abstract, keywords,
        research_category, publication_source, doi, file_size, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDoc.run(
      sampleDocId,
      defaultUserId,
      'folder_literature',
      sampleTitle,
      'Empirical evaluation of climate-smart farming methodologies in Southern Leyte.',
      'paper',
      sampleContent,
      `<div class="doc-body"><h1>${sampleTitle}</h1><p><strong>Abstract:</strong> ${sampleAbstract}</p></div>`,
      null,
      'md',
      'Dr. A. Santos, Engr. M. Reyes',
      2025,
      sampleAbstract,
      'climate-smart agriculture, soil sensors, yield resilience, rural farming',
      'Agricultural Sciences',
      'SLSU Journal of Applied Research & Innovation',
      '10.1016/j.agrisci.2025.04.012',
      sampleContent.length,
      now,
      now
    );

    // Seed document chunks for RAG testing
    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (id, document_id, chunk_index, content, keywords)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertChunk.run('chunk_1', sampleDocId, 0, `Introduction and Objectives: ${sampleTitle}. Objectives: Determine correlation between moisture monitoring and yield stability. Formulate community-led deployment model.`, 'objectives, moisture, yield stability');
    insertChunk.run('chunk_2', sampleDocId, 1, `Methodology: Randomized control trial across 45 farming clusters in Southern Leyte. Soil metrics recorded bi-weekly with household surveys.`, 'methodology, control trial, Southern Leyte');
    insertChunk.run('chunk_3', sampleDocId, 2, `Findings and Conclusion: Yield retention increased by 31.4% during unseasonal dry spells. Water efficiency improved by 42%. Sensor hubs bolster resilience.`, 'findings, 31.4%, water efficiency, conclusion');
  }
}

// Auto initialize on load
initDatabase();

