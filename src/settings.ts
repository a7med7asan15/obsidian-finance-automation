import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import { VAULT_ROOT } from "./constants.ts";
import { RulesEditorModal } from "./ui/components/rules-editor.ts";
import { setUpWorkspace } from "./ui/workspace-setup.ts";
import type FinanceAutomationPlugin from "./main.ts";

export interface FinanceSettings {
  runOnStartup: boolean;
  watchTransactions: boolean;
  applyExclusionRules: boolean;
}

export const DEFAULT_SETTINGS: FinanceSettings = {
  runOnStartup: true,
  watchTransactions: true,
  applyExclusionRules: true,
};

export class FinanceAutomationSettingTab extends PluginSettingTab {
  private readonly plugin: FinanceAutomationPlugin;

  constructor(app: App, plugin: FinanceAutomationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Obsidian already renders the plugin name above this pane, so a heading of
    // our own would only repeat it; the review guidelines ask for none.
    containerEl.createEl("p", {
      text: "The same local engine runs on desktop and mobile, parsing pending notes and keeping the budget view up to date.",
    });

    new Setting(containerEl)
      .setName("Budget folders")
      .setDesc(
        `Write the ${VAULT_ROOT} tree — inbox, transactions, settings notes, two accounts ` +
          "and a starting set of categories. Every file it writes is reset to its default, " +
          "so budgets, colours, card endings and learned keywords on those notes are " +
          "replaced — it lists them and asks first. Your transactions are never touched.",
      )
      .addButton((button) =>
        button.setButtonText("Create folders").onClick(async () => {
          button.setDisabled(true);
          try {
            await setUpWorkspace(this.app);
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Process when Obsidian starts")
      .setDesc("Parse pending notes shortly after opening the vault.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.runOnStartup).onChange(async (value) => {
          this.plugin.settings.runOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Watch transaction notes")
      .setDesc("Run automatically shortly after a transaction note is created or changed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.watchTransactions).onChange(async (value) => {
          this.plugin.settings.watchTransactions = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Exclusion rules")
      .setDesc("Rules that automatically exclude matching transactions from calculations.")
      .addButton((button) =>
        button.setButtonText("Edit rules").onClick(() => {
          new RulesEditorModal(this.app, this.plugin).open();
        }),
      );

    new Setting(containerEl)
      .setName("Apply exclusion rules automatically")
      .setDesc("Run the exclusion rules whenever a transaction note is created or changed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.applyExclusionRules).onChange(async (value) => {
          this.plugin.settings.applyExclusionRules = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
