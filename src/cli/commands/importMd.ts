import path from "node:path";
import fs from "node:fs";
import { buildMarkdownImportPlan, detectMarkdownCandidates } from "../../install/installer.js";
import { MemoryService } from "../../services/memoryService.js";

interface ImportMdOptions {
  source?: string;
  path?: string[];
  repo?: string;
  yes?: boolean;
  dryRun?: boolean;
}

export const importMdCommand = async (options: ImportMdOptions): Promise<void> => {
  const cwd = process.cwd();
  const repo = options.repo ?? path.basename(cwd);
  const source = options.source ?? "local";

  const filePaths =
    options.path && options.path.length > 0
      ? options.path.map((p) => path.resolve(cwd, p))
      : detectMarkdownCandidates(cwd);

  if (filePaths.length === 0) {
    console.log("No importable markdown files detected.");
    return;
  }

  const plans = filePaths.map((filePath) => buildMarkdownImportPlan(filePath, cwd));

  console.log(`Found ${plans.length} file(s):`);
  for (const plan of plans) {
    console.log(`  ${path.relative(cwd, plan.path)} -> ${plan.title} (${plan.type})`);
  }

  if (options.dryRun) return;

  if (!options.yes) {
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) =>
      rl.question(`Import ${plans.length} file(s) into "${source}"? [y/N] `, resolve)
    );
    rl.close();
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      return;
    }
  }

  const service = new MemoryService();
  service.init();

  let succeeded = 0;
  let failed = 0;

  for (const plan of plans) {
    const contents = fs.readFileSync(plan.path, "utf8").trim();
    if (!contents) {
      console.log(`  - skipped (empty): ${path.relative(cwd, plan.path)}`);
      continue;
    }

    try {
      await service.storeKnowledge({
        source,
        title: plan.title,
        type: plan.type,
        content: contents,
        scope: "repo",
        repo,
        tags: plan.tags,
        confidence: 0.95,
        metadata: {
          importedFromPath: path.relative(cwd, plan.path),
          importedBy: "knowit-import-md",
        },
      });
      console.log(`  ✓ ${plan.title}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${plan.title}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} imported, ${failed} failed.`);
};
