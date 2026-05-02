import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyInstallPlan,
  createInstallPlan,
  detectMarkdownCandidates,
  mergeInstructionFile,
  type CommandRunner,
} from "../install/installer.js";
import { MemoryService } from "../services/memoryService.js";
import { resetDatabase } from "../db/database.js";
import { checkInstructionsInstalled } from "../server/instructionCheck.js";

const createTempProject = (): { cwd: string; cleanup: () => void } => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-install-"));
  return {
    cwd,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
  };
};

test("detectMarkdownCandidates only picks knowledge-style markdown files", () => {
  const { cwd, cleanup } = createTempProject();

  try {
    fs.mkdirSync(path.join(cwd, "docs"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Agent instructions\n");
    fs.writeFileSync(path.join(cwd, "CLAUDE.md"), "# Claude instructions\n");
    fs.writeFileSync(path.join(cwd, "ARCHITECTURE.md"), "# Architecture\n");
    fs.writeFileSync(path.join(cwd, "PRD.md"), "# Product Requirements\n");
    fs.writeFileSync(path.join(cwd, "README.md"), "# Ignore me\n");
    fs.writeFileSync(path.join(cwd, "docs", "notes.md"), "# General notes\n");

    const candidates = detectMarkdownCandidates(cwd).map((filePath) => path.relative(cwd, filePath));

    assert.deepEqual(candidates, ["ARCHITECTURE.md", "PRD.md"]);
  } finally {
    cleanup();
  }
});

test("install plan prefers the current instruction-file conventions when files already exist", () => {
  const { cwd, cleanup } = createTempProject();

  try {
    fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".claude", "CLAUDE.md"), "existing claude instructions\n");
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "existing agents instructions\n");

    const plan = createInstallPlan({
      clients: ["claude", "codex"],
      scope: "project",
      sourceProvider: "local",
      migrateMarkdown: false,
      markdownPaths: [],
      repo: "knowit",
      cwd,
    });

    const claudeTarget = plan.instructionTargets.find((target) => target.client === "claude");
    const codexTarget = plan.instructionTargets.find((target) => target.client === "codex");

    assert.equal(claudeTarget?.path, path.join(cwd, ".claude", "CLAUDE.md"));
    assert.equal(codexTarget?.path, path.join(cwd, "AGENTS.md"));
  } finally {
    cleanup();
  }
});

test("project MCP config uses latest npx command when npx mode is selected", async () => {
  const { cwd, cleanup } = createTempProject();
  const originalCwd = process.cwd();

  try {
    const plan = createInstallPlan({
      clients: ["claude"],
      scope: "project",
      sourceProvider: "local",
      migrateMarkdown: false,
      markdownPaths: [],
      repo: "knowit",
      cwd,
      useNpxForMcp: true,
    });

    await applyInstallPlan(plan, {
      cwd,
      runner: { run() {} },
    });

    const projectMcpConfig = JSON.parse(fs.readFileSync(path.join(cwd, ".mcp.json"), "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
    };

    assert.equal(projectMcpConfig.mcpServers?.knowit?.command, "npx");
    assert.deepEqual(projectMcpConfig.mcpServers?.knowit?.args, ["-y", "knowit@latest", "serve"]);
    assert.equal(projectMcpConfig.mcpServers?.knowit?.env, undefined);
  } finally {
    process.chdir(originalCwd);
    resetDatabase();
    cleanup();
  }
});

test("project MCP registrations do not pin KNOWIT_DB_PATH", () => {
  const { cwd, cleanup } = createTempProject();

  try {
    const plan = createInstallPlan({
      clients: ["claude", "codex"],
      scope: "project",
      sourceProvider: "local",
      migrateMarkdown: false,
      markdownPaths: [],
      repo: "knowit",
      cwd,
      useNpxForMcp: true,
    });

    for (const registration of plan.mcpRegistrations) {
      assert.equal(registration.args.includes("KNOWIT_DB_PATH=.knowit/knowit.db"), false);
      assert.equal(registration.args.includes("KNOWIT_DB_PATH"), false);
    }
  } finally {
    cleanup();
  }
});

test("mergeInstructionFile preserves unrelated content and refreshes the managed Knowit block", () => {
  const initial = [
    "# Project Guide",
    "",
    "Custom instructions stay here.",
    "",
    "<!-- knowit:start -->",
    "stale block",
    "<!-- knowit:end -->",
  ].join("\n");

  const merged = mergeInstructionFile(initial, "claude", "notion", "notion");

  assert.match(merged, /# Project Guide/);
  assert.match(merged, /Custom instructions stay here\./);
  assert.match(merged, /The preferred routed source is `notion`/);
  assert.equal((merged.match(/<!-- knowit:start -->/g) ?? []).length, 1);
  assert.equal((merged.match(/<!-- knowit:end -->/g) ?? []).length, 1);
});

test("applyInstallPlan installs instructions, registers clients, imports markdown, and keeps local storage working", async () => {
  const { cwd, cleanup } = createTempProject();
  const originalDbPath = process.env.KNOWIT_DB_PATH;
  const originalStorageScope = process.env.KNOWIT_STORAGE_SCOPE;
  const originalCwd = process.cwd();

  try {
    fs.writeFileSync(path.join(cwd, "ARCHITECTURE.md"), "# Runtime Architecture\nMemoryService is the orchestration boundary.\n");

    const commands: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = {
      run(command, args) {
        commands.push({ command, args });
      },
    };

    const plan = createInstallPlan({
      clients: ["claude", "codex"],
      scope: "project",
      sourceProvider: "notion",
      mcpServerName: "notion",
      migrateMarkdown: true,
      markdownPaths: [path.join(cwd, "ARCHITECTURE.md")],
      repo: "knowit",
      cwd,
    });

    const result = await applyInstallPlan(plan, {
      cwd,
      runner,
    });

    assert.equal(result.importedEntryCount, 1);
    assert.equal(result.registrationOutcomes.length, 2);
    assert.ok(result.registrationOutcomes.every((outcome) => outcome.succeeded));
    assert.equal(commands.length, 2);
    assert.equal(commands[0]?.command, "claude");
    assert.equal(commands[1]?.command, "codex");

    const claudeInstructions = fs.readFileSync(path.join(cwd, ".claude", "CLAUDE.md"), "utf8");
    const codexInstructions = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
    const projectMcpConfig = JSON.parse(fs.readFileSync(path.join(cwd, ".mcp.json"), "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
    };

    assert.match(claudeInstructions, /Knowit Memory/);
    assert.match(codexInstructions, /resolve_source_action/);
    assert.equal(projectMcpConfig.mcpServers?.knowit?.command, "knowit");
    assert.deepEqual(projectMcpConfig.mcpServers?.knowit?.args, ["serve"]);
    assert.equal(projectMcpConfig.mcpServers?.knowit?.env, undefined);

    delete process.env.KNOWIT_DB_PATH;
    process.env.KNOWIT_STORAGE_SCOPE = "project";
    process.chdir(cwd);
    resetDatabase();

    const service = new MemoryService();
    service.init();

    const sources = service.listSources();
    assert.equal(sources.find((source) => source.id === "notion")?.isDefault, true);

    const directEntry = await service.storeKnowledge({
      title: "Offline fallback",
      type: "note",
      content: "Direct stores should still land in local JSONL.",
      scope: "repo",
      repo: "knowit",
      tags: ["install"],
      confidence: 1,
      metadata: {},
    });

    const importedEntries = await service.listKnowledge({ source: "local", repo: "knowit", limit: 10 });

    assert.equal(directEntry.title, "Offline fallback");
    assert.ok(fs.existsSync(path.join(cwd, ".knowit", "knowledge.jsonl")));
    assert.ok(fs.existsSync(path.join(cwd, ".knowit", "sources.json")));
    assert.ok(importedEntries.some((entry) => entry.title === "Runtime Architecture"));
    assert.ok(importedEntries.some((entry) => entry.title === "Offline fallback"));
  } finally {
    process.chdir(originalCwd);
    resetDatabase();
    if (originalDbPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalDbPath;
    }
    if (originalStorageScope === undefined) {
      delete process.env.KNOWIT_STORAGE_SCOPE;
    } else {
      process.env.KNOWIT_STORAGE_SCOPE = originalStorageScope;
    }
    cleanup();
  }
});

test("checkInstructionsInstalled returns true when marker is present in CLAUDE.md", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-check-"));
  try {
    fs.writeFileSync(path.join(cwd, "CLAUDE.md"), "# Guide\n\n<!-- knowit:start -->\nsome block\n<!-- knowit:end -->\n");
    assert.equal(checkInstructionsInstalled(cwd), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("checkInstructionsInstalled returns true when marker is present in AGENTS.md", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-check-"));
  try {
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "<!-- knowit:start -->\nblock\n<!-- knowit:end -->\n");
    assert.equal(checkInstructionsInstalled(cwd), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("checkInstructionsInstalled returns true when marker is in .claude/CLAUDE.md", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-check-"));
  try {
    fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".claude", "CLAUDE.md"), "<!-- knowit:start -->\nblock\n<!-- knowit:end -->\n");
    assert.equal(checkInstructionsInstalled(cwd), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("checkInstructionsInstalled returns false when no candidate file contains the marker", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-check-"));
  try {
    fs.writeFileSync(path.join(cwd, "CLAUDE.md"), "# Normal instructions without the marker\n");
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Also normal\n");
    assert.equal(checkInstructionsInstalled(cwd), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("checkInstructionsInstalled returns false when no candidate files exist", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-check-empty-"));
  try {
    assert.equal(checkInstructionsInstalled(cwd), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
