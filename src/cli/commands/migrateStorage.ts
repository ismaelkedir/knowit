import {
  getDatabasePath,
  getJsonlKnowledgePath,
  getJsonlSourcesPath,
} from "../../db/database.js";
import { migrateSqliteToJsonl } from "../../storage/sqliteToJsonlMigration.js";

interface MigrateStorageCommandOptions {
  sqlitePath?: string;
  jsonlPath?: string;
  sourcesPath?: string;
  force?: boolean;
  dryRun?: boolean;
}

export const migrateStorageCommand = (options: MigrateStorageCommandOptions): void => {
  const sqlitePath = options.sqlitePath ?? getDatabasePath();
  const knowledgePath = options.jsonlPath ?? getJsonlKnowledgePath();
  const sourcesPath = options.sourcesPath ?? getJsonlSourcesPath();

  const result = migrateSqliteToJsonl({
    sqlitePath,
    knowledgePath,
    sourcesPath,
    force: options.force,
    dryRun: options.dryRun,
  });

  console.log(`SQLite source: ${result.sqlitePath}`);
  console.log(`JSONL target: ${result.knowledgePath}`);
  console.log(`Sources target: ${result.sourcesPath}`);
  console.log(`Entries: ${result.entryCount}`);
  console.log(`Sources: ${result.sourceCount}`);

  if (options.dryRun) {
    console.log("Dry run only. No files were written.");
    return;
  }

  console.log("Storage migration complete.");
};
