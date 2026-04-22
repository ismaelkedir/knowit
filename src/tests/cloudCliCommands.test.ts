import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import { registerLoginCommand } from "../cli/commands/login.js";
import { registerLogoutCommand } from "../cli/commands/logout.js";
import { registerWhoamiCommand } from "../cli/commands/whoami.js";

const buildProgram = (): Command => {
  const program = new Command();
  program.name("knowit");

  const cloudProgram = program.command("cloud").description("Manage Knowit Cloud access");
  registerLoginCommand(cloudProgram);
  registerLogoutCommand(cloudProgram);
  registerWhoamiCommand(cloudProgram);

  return program;
};

test("cloud commands are grouped under knowit cloud", () => {
  const program = buildProgram();
  const cloudProgram = program.commands.find((command) => command.name() === "cloud");

  assert.ok(cloudProgram);
  assert.deepEqual(
    cloudProgram.commands.map((command) => command.name()).sort(),
    ["login", "logout", "whoami"],
  );
});

test("top-level cloud auth commands are not registered", () => {
  const program = buildProgram();
  const topLevelCommands = program.commands.map((command) => command.name()).sort();

  assert.deepEqual(topLevelCommands, ["cloud"]);
});
