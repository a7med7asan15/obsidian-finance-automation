import type { App } from "obsidian";
import { ensureFolder } from "../data/vault-json.ts";
import { VAULT_ROOT } from "../constants.ts";
import type { TransactionRecord } from "../data/types.ts";

const COLUMNS = [
  "date", "time", "amount", "currency", "type", "from_account", "to_account",
  "merchant", "category", "status", "excluded", "exclude_reason", "transaction_id", "file",
] as const;

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(records: TransactionRecord[]): string {
  const lines = [COLUMNS.join(",")];
  for (const record of records) {
    lines.push([
      record.date ?? "",
      record.time ?? "",
      record.amount ?? "",
      record.currency,
      record.type,
      record.fromAccount,
      record.toAccount,
      record.merchant,
      record.category,
      record.status,
      record.excluded,
      record.excludeReason,
      record.transactionId,
      record.path,
    ].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Writes into the vault rather than offering a download: Obsidian on iPhone has
 * no download, and a file in the vault syncs to wherever you want to open it.
 */
export async function exportCsv(
  app: App,
  records: TransactionRecord[],
  label: string,
): Promise<string> {
  const folder = `${VAULT_ROOT}Exports`;
  await ensureFolder(app, folder);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  const path = `${folder}/transactions-${slug}.csv`;
  const content = toCsv(records);

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.adapter.write(path, content);
  else await app.vault.create(path, content);

  return path;
}
