import type { App } from "obsidian";
import { CATEGORY_RULES_PATH } from "../constants.ts";
import { loadVaultJson, saveVaultJson } from "./vault-json.ts";
import type { CategoryRules } from "../domain/categorize.ts";

export async function loadCategoryRules(app: App): Promise<CategoryRules> {
  return loadVaultJson<CategoryRules>(app, CATEGORY_RULES_PATH, { rules: [] });
}

/** Written back with the same shape the file already has, so it stays editable. */
export async function saveCategoryRules(app: App, rules: CategoryRules): Promise<void> {
  await saveVaultJson(app, CATEGORY_RULES_PATH, { rules: rules.rules ?? [] });
}
