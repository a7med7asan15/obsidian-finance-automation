export const VAULT_ROOT = "Budget/";
export const TRANSACTIONS_DIR = `${VAULT_ROOT}Transactions`;
export const ACCOUNTS_DIR = `${VAULT_ROOT}Accounts`;
export const SETTINGS_DIR = `${VAULT_ROOT}Settings`;
export const CATEGORIES_DIR = `${SETTINGS_DIR}/Categories`;
export const RULES_PATH = `${SETTINGS_DIR}/exclusion_rules.json`;
export const CONFIG_PATH = `${SETTINGS_DIR}/config.json`;
export const ACCOUNTS_JSON_PATH = `${SETTINGS_DIR}/accounts.json`;
export const CATEGORY_RULES_PATH = `${CATEGORIES_DIR}/rules.json`;
export const TIMEZONE = "Africa/Cairo";
/**
 * Where an iPhone Shortcut drops a bank SMS as a plain file. Capture through a
 * file has no length ceiling and needs no running app, unlike an `obsidian://`
 * link — see docs/iphone-shortcuts.md.
 */
export const INBOX_DIR = `${VAULT_ROOT}Inbox`;
