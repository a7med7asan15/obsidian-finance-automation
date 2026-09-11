// The pieces of the Obsidian API that src/data/ touches, enough to run in Node.

export class TFile {
  constructor(path) {
    this.path = path;
    this.extension = String(path).split(".").pop() ?? "";
  }
}

export class TFolder {
  constructor(path) {
    this.path = path;
  }
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}

export function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}
