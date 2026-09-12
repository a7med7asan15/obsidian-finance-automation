import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");

/**
 * The repo lives outside the vault — a vault is for notes, not for a 50 MB
 * toolchain — so the vault path has to be told to us: through OBSIDIAN_VAULT,
 * or through a gitignored `.vaultpath` file holding the one line. A directory
 * is only written into once it is known to be a vault, so a stale or mistyped
 * path is skipped rather than seeding a plugin folder somewhere it does not
 * belong.
 */
async function resolveVaultRoot() {
  const fromEnv = process.env.OBSIDIAN_VAULT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const file = path.join(process.cwd(), ".vaultpath");
  if (!existsSync(file)) return null;
  const configured = (await readFile(file, "utf8")).trim();
  return configured ? path.resolve(configured) : null;
}

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      const vaultRoot = await resolveVaultRoot();
      if (!vaultRoot) {
        console.log("no vault configured; set OBSIDIAN_VAULT or write .vaultpath to auto-install");
        return;
      }
      if (!existsSync(path.join(vaultRoot, ".obsidian"))) {
        console.log(`skipped install: ${vaultRoot} is not an Obsidian vault`);
        return;
      }
      const installDir = path.join(vaultRoot, ".obsidian", "plugins", "finance-automation");
      await mkdir(installDir, { recursive: true });
      for (const file of ["main.js", "manifest.json", "styles.css"]) {
        await copyFile(path.join(process.cwd(), file), path.join(installDir, file));
      }
      console.log(`copied build to ${installDir}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "browser",
  target: "es2020",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  minify: false,
  external: ["obsidian", "electron", ...builtins],
  // CI builds the release bundle only; there is no vault to copy into.
  plugins: process.env.CI ? [] : [copyToVault],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
