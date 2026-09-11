import { App, Plugin, TFile } from "obsidian";
import { ACCOUNTS_DIR, CATEGORIES_DIR } from "../constants.ts";
import { buildAccount, buildCategory, buildTransaction, isTransactionPath } from "./records.ts";
import type { AccountRecord, CategoryRecord, TransactionRecord } from "./types.ts";

/**
 * Holds every transaction, account and category in memory.
 *
 * Records are built from metadataCache, which Obsidian has already parsed, so a
 * full rebuild performs no file reads. Single-file changes update one entry
 * rather than rebuilding, which keeps typing in the search box free of I/O.
 */
export class TransactionIndex {
  private readonly app: App;
  private readonly transactionMap = new Map<string, TransactionRecord>();
  private readonly accountMap = new Map<string, AccountRecord>();
  private readonly categoryMap = new Map<string, CategoryRecord>();
  private readonly listeners = new Set<() => void>();
  private notifyHandle: number | null = null;

  constructor(app: App) {
    this.app = app;
  }

  build(): void {
    this.transactionMap.clear();
    this.accountMap.clear();
    this.categoryMap.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.ingest(file);
    this.notify();
  }

  registerEvents(plugin: Plugin): void {
    plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.ingest(file);
        this.notify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.forget(file.path);
        this.notify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.forget(oldPath);
        if (file instanceof TFile) this.ingest(file);
        this.notify();
      }),
    );
  }

  refreshPath(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) this.ingest(file);
    this.notify();
  }

  private forget(path: string): void {
    this.transactionMap.delete(path);
    this.accountMap.delete(path);
    this.categoryMap.delete(path);
  }

  private ingest(file: TFile): void {
    if (file.extension !== "md") return;
    this.forget(file.path);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return;
    const type = String(frontmatter.type ?? "");

    if (type === "transaction" && isTransactionPath(file.path)) {
      this.transactionMap.set(file.path, buildTransaction(frontmatter, file.path));
    } else if (type === "account" && file.path.startsWith(`${ACCOUNTS_DIR}/`)) {
      this.accountMap.set(file.path, buildAccount(frontmatter, file.path));
    } else if (type === "category" && file.path.startsWith(`${CATEGORIES_DIR}/`)) {
      this.categoryMap.set(file.path, buildCategory(frontmatter, file.path));
    }
  }

  /** Coalesces bursts of vault events into one notification per frame. */
  private notify(): void {
    if (this.notifyHandle !== null) return;
    this.notifyHandle = window.setTimeout(() => {
      this.notifyHandle = null;
      for (const listener of this.listeners) listener();
    }, 50);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  transactions(): TransactionRecord[] {
    return [...this.transactionMap.values()];
  }

  accounts(): AccountRecord[] {
    return [...this.accountMap.values()];
  }

  categories(): CategoryRecord[] {
    return [...this.categoryMap.values()];
  }
}
