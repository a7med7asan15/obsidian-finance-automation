import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(full)));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

test("nothing under src/domain imports from obsidian", async () => {
  const offenders: string[] = [];
  for (const file of await filesUnder("src/domain")) {
    const source = await readFile(file, "utf8");
    if (/from\s+["']obsidian["']/.test(source)) offenders.push(file);
  }
  assert.deepEqual(
    offenders, [],
    "domain/ must stay pure so every money calculation is testable in Node",
  );
});

test("nothing under src/domain imports from src/ui", async () => {
  const offenders: string[] = [];
  for (const file of await filesUnder("src/domain")) {
    const source = await readFile(file, "utf8");
    if (/from\s+["'][^"']*\/ui\//.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("the bundle declares no runtime dependencies", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
});
