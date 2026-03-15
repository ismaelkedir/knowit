import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.resolve(process.cwd(), "knowit.db");

const schemaSql = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL,
  repo TEXT,
  domain TEXT,
  tags TEXT NOT NULL DEFAULT '',
  embedding TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  config TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_repo ON knowledge_entries(repo);
CREATE INDEX IF NOT EXISTS idx_knowledge_domain ON knowledge_entries(domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge_entries(scope);
CREATE INDEX IF NOT EXISTS idx_source_default ON knowledge_sources(is_default);
`;

const resolveSchemaFile = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), "src/db/schema.sql"),
    path.resolve(__dirname, "schema.sql"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const loadSchema = (): string => {
  const schemaPath = resolveSchemaFile();
  return schemaPath ? fs.readFileSync(schemaPath, "utf8") : schemaSql;
};

interface TableInfoRow {
  name: string;
}

const hasColumn = (database: Database.Database, tableName: string, columnName: string): boolean => {
  const rows = database.pragma(`table_info(${tableName})`, { simple: false }) as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
};

const applyCompatibilityMigrations = (database: Database.Database): void => {
  if (hasColumn(database, "knowledge_entries", "url") === false) {
    database.exec("ALTER TABLE knowledge_entries ADD COLUMN url TEXT");
  }

  if (hasColumn(database, "knowledge_entries", "metadata") === false) {
    database.exec("ALTER TABLE knowledge_entries ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  }
};

export const getDatabasePath = (): string =>
  path.resolve(process.cwd(), process.env.KNOWIT_DB_PATH ?? defaultDbPath);

let databaseInstance: Database.Database | null = null;

export const getDatabase = (): Database.Database => {
  if (databaseInstance) {
    return databaseInstance;
  }

  databaseInstance = new Database(getDatabasePath());
  databaseInstance.pragma("journal_mode = WAL");
  databaseInstance.pragma("foreign_keys = ON");

  return databaseInstance;
};

export const initializeDatabase = (
  database: Database.Database = getDatabase(),
): Database.Database => {
  const db = database;
  db.exec(loadSchema());
  applyCompatibilityMigrations(db);
  return db;
};
