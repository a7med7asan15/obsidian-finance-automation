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

/**
 * The slice of `vault.adapter` the inbox reads through. Backed by the same file
 * map as FakeVault, so a file written by either side is visible to both.
 */
export class FakeAdapter {
  private readonly vault: FakeVault;

  constructor(vault: FakeVault) {
    this.vault = vault;
  }

  async exists(path: string): Promise<boolean> {
    if (this.vault.files.has(path) || this.vault.folders.has(path)) return true;
    return [...this.vault.files.keys()].some((known) => known.startsWith(`${path}/`));
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = `${path}/`;
    const files = [...this.vault.files.keys()].filter(
      (known) => known.startsWith(prefix) && !known.slice(prefix.length).includes("/"),
    );
    return { files, folders: [] };
  }

  async read(path: string): Promise<string> {
    const content = this.vault.files.get(path);
    if (content === undefined) throw new Error(`${path} does not exist`);
    return content;
  }

  async remove(path: string): Promise<void> {
    this.vault.files.delete(path);
  }
}

/**
 * The slice of `app.fileManager` the category writes go through. Frontmatter is
 * treated as flat `key: value` lines, which is all a category note has.
 */
export class FakeFileManager {
  private readonly vault: FakeVault;

  constructor(vault: FakeVault) {
    this.vault = vault;
  }

  async renameFile(file: TFile, newPath: string): Promise<void> {
    const content = this.vault.files.get(file.path) ?? "";
    this.vault.files.delete(file.path);
    this.vault.files.set(newPath, content);
  }

  async trashFile(file: TFile): Promise<void> {
    this.vault.files.delete(file.path);
  }

  async processFrontMatter(
    file: TFile,
    edit: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const content = this.vault.files.get(file.path) ?? "";
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
    const frontmatter: Record<string, unknown> = {};
    for (const line of (match?.[1] ?? "").split("\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) frontmatter[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    edit(frontmatter);
    const body = match ? content.slice(match[0].length) : content;
    const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value ?? ""}`);
    this.vault.files.set(file.path, `---\n${lines.join("\n")}\n---\n${body}`);
  }
}

export function fakeApp(): App & {
  vault: FakeVault & { adapter: FakeAdapter };
  fileManager: FakeFileManager;
} {
  const vault = new FakeVault() as FakeVault & { adapter: FakeAdapter };
  vault.adapter = new FakeAdapter(vault);
  const fileManager = new FakeFileManager(vault);
  return { vault, fileManager } as unknown as App & {
    vault: FakeVault & { adapter: FakeAdapter };
    fileManager: FakeFileManager;
  };
}
