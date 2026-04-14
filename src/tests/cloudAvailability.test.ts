import test from "node:test";
import assert from "node:assert/strict";
import { isKnowitCloudEnabled } from "../utils/cloudAvailability.js";

test("cloud availability defaults to disabled", () => {
  const original = process.env.KNOWIT_CLOUD_ENABLED;
  delete process.env.KNOWIT_CLOUD_ENABLED;

  try {
    assert.equal(isKnowitCloudEnabled(), false);
  } finally {
    process.env.KNOWIT_CLOUD_ENABLED = original;
  }
});

test("cloud availability can be enabled explicitly", () => {
  const original = process.env.KNOWIT_CLOUD_ENABLED;
  process.env.KNOWIT_CLOUD_ENABLED = "true";

  try {
    assert.equal(isKnowitCloudEnabled(), true);
  } finally {
    process.env.KNOWIT_CLOUD_ENABLED = original;
  }
});
