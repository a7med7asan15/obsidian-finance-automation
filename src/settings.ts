import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import { RulesEditorModal } from "./ui/components/rules-editor.ts";
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
