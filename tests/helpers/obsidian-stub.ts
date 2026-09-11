import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const STUB_URL = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "obsidian-stub-module.mjs"),
).href;

let installed = false;

/**
 * `obsidian` only exists inside the app, so anything under `data/` needs it
 * stubbed to run in Node. Registered as a module hook rather than a loader
 * flag, so `node --test tests/` still needs no extra arguments.
 *
 * Call this at the top of a test file, before importing the module under test.
 */
export function stubObsidian(): void {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "obsidian") return { url: STUB_URL, shortCircuit: true };
      return next(specifier, context);
    },
  });
}
