import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import {
  clearCommandStart,
  formatElapsedMs,
  getElapsedMs,
  getTotalElapsedMs,
  markCommandStart,
  shouldTimeCommand,
} from "../cli/timing.js";

test("shouldTimeCommand skips serve and times normal commands", () => {
  assert.equal(shouldTimeCommand(new Command("search")), true);
  assert.equal(shouldTimeCommand(new Command("list")), true);
  assert.equal(shouldTimeCommand(new Command("serve")), false);
});

test("formatElapsedMs renders milliseconds and seconds clearly", () => {
  assert.equal(formatElapsedMs(12.345), "12.3ms");
  assert.equal(formatElapsedMs(1532), "1.53s");
});

test("markCommandStart and getElapsedMs record elapsed time", async () => {
  const command = new Command("search");

  markCommandStart(command);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const elapsedMs = getElapsedMs(command);
  assert.ok(elapsedMs !== null);
  assert.ok(elapsedMs! >= 1);

  clearCommandStart(command);
  assert.equal(getElapsedMs(command), null);
});

test("getTotalElapsedMs reflects process lifetime", () => {
  const elapsedMs = getTotalElapsedMs();
  assert.ok(elapsedMs >= 0);
});
