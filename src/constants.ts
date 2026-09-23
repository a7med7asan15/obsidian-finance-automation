export const VAULT_ROOT = "Budget/";
export const TRANSACTIONS_DIR = `${VAULT_ROOT}Transactions`;
export const ACCOUNTS_DIR = `${VAULT_ROOT}Accounts`;
export const SETTINGS_DIR = `${VAULT_ROOT}Settings`;
export const CATEGORIES_DIR = `${SETTINGS_DIR}/Categories`;
/**
 * Every settings file is a note, so it opens in Obsidian like anything else in
 * the vault: prose explaining what it is, then one ```json block holding the
 * data. A vault written by an older release still has the same files with a
 * `.json` extension, and those keep being read and written where they are —
 * see `resolveSettingsPath`.
 */
export const RULES_PATH = `${SETTINGS_DIR}/exclusion_rules.md`;
export const TYPE_RULES_PATH = `${SETTINGS_DIR}/type_rules.md`;
export const CONFIG_PATH = `${SETTINGS_DIR}/config.md`;
export const ACCOUNTS_CONFIG_PATH = `${SETTINGS_DIR}/accounts.md`;
export const SMS_PATTERNS_PATH = `${SETTINGS_DIR}/sms_patterns.md`;
export const CATEGORY_RULES_PATH = `${CATEGORIES_DIR}/rules.md`;
export const TIMEZONE = "Africa/Cairo";
/**
 * Where an iPhone Shortcut drops a bank SMS as a plain file. Capture through a
 * file has no length ceiling and needs no running app, unlike an `obsidian://`
 * link — see docs/iphone-shortcuts.md.
 */
export const INBOX_DIR = `${VAULT_ROOT}Inbox`;
