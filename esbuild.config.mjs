import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
// Repo lives at <vault>/Budget/obsidian-finance-automation, so the vault root is two up.
const vaultRoot = path.resolve(process.cwd(), "..", "..");
const installDir = path.join(vaultRoot, ".obsidian", "plugins", "finance-automation");

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
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
