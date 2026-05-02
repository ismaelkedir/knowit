import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const removePath = (targetPath) => {
  fs.rmSync(targetPath, { force: true, recursive: true });
};

removePath(path.join(dist, "tests"));
removePath(path.join(dist, "benchmark"));

const commandDir = path.join(dist, "cli", "commands");
if (fs.existsSync(commandDir)) {
  for (const entry of fs.readdirSync(commandDir)) {
    if (entry.startsWith("benchmark")) {
      removePath(path.join(commandDir, entry));
    }
  }
}
