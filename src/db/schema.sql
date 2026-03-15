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
