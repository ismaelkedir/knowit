import { MemoryService } from "../../services/memoryService.js";

interface MigrateCommandOptions {
  from: string;
  to: string;
  yes?: boolean;
  dryRun?: boolean;
}

export const migrateCommand = async (options: MigrateCommandOptions): Promise<void> => {
  const service = new MemoryService();
  service.init();

  console.log(`Reading entries from "${options.from}"...`);
  const entries = await service.listKnowledge({ source: options.from, limit: 10000 });

  if (entries.length === 0) {
    console.log("No entries found in source. Nothing to migrate.");
    return;
  }

  console.log(`Found ${entries.length} entries.`);

  if (options.dryRun) {
    for (const entry of entries) {
      console.log(`  [dry-run] ${entry.type} | ${entry.scope} | ${entry.title}`);
    }
    return;
  }

  if (!options.yes) {
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) =>
      rl.question(`Migrate ${entries.length} entries from "${options.from}" to "${options.to}"? [y/N] `, resolve)
    );
    rl.close();
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      return;
    }
  }

  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await service.storeKnowledge({
        source: options.to,
        type: entry.type,
        title: entry.title,
        content: entry.content,
        scope: entry.scope,
        repo: entry.repo ?? undefined,
        domain: entry.domain ?? undefined,
        tags: entry.tags,
        confidence: entry.confidence,
        url: entry.url ?? undefined,
        metadata: entry.metadata ?? {},
      });
      console.log(`  ✓ ${entry.title}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${entry.title}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} migrated, ${failed} failed.`);
};
