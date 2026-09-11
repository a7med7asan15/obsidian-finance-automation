import { TFile, TFolder } from "obsidian";

// The real TFile takes no constructor arguments; the stub does.
const makeFile = (path: string) => new (TFile as unknown as new (path: string) => TFile)(path);
const makeFolder = (path: string) => new (TFolder as unknown as new (path: string) => TFolder)(path);
import type { App } from "obsidian";

/** An in-memory vault: enough of `app.vault` for the create and write paths. */
export class FakeVault {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    if (this.files.has(path)) return makeFile(path);
    if (this.folders.has(path)) return makeFolder(path);
    return null;
  }

  async create(path: string, content: string): Promise<TFile> {
    this.files.set(path, content);
    return makeFile(path);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async process(file: TFile, edit: (content: string) => string): Promise<string> {
    const next = edit(this.files.get(file.path) ?? "");
    this.files.set(file.path, next);
    return next;
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.files.get(file.path) ?? "";
  }
}

export function fakeApp(): App & { vault: FakeVault } {
  return { vault: new FakeVault() } as unknown as App & { vault: FakeVault };
}
