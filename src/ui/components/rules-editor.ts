import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { loadRules, saveRules } from "../../data/vault-json.ts";
import { RULE_FIELDS, RULE_OPS, matchesRule, validateRule } from "../../domain/exclusion.ts";
import type { ExclusionRule, RuleField, RuleOp } from "../../domain/exclusion.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import { on } from "../events.ts";

const FIELD_LABELS: Record<RuleField, string> = {
  sms_message: "SMS text",
  merchant: "Merchant, recipient or sender",
  from_account: "From account",
  to_account: "To account",
  category: "Category",
  transaction_type: "Type",
  amount: "Amount",
  timestamp: "Timestamp",
};

const OP_LABELS: Record<RuleOp, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is exactly",
  not_equals: "is not",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches regex",
  gt: "is greater than",
  lt: "is less than",
  between: "is between",
};

export class RulesEditorModal extends Modal {
  private rules: ExclusionRule[] = [];
  private loadError: string | null = null;

  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.modalEl.addClass("fin-sheet");
    const loaded = await loadRules(this.app);
    this.rules = loaded.rules;
    this.loadError = loaded.error;
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Exclusion rules" });
    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "A matching transaction is excluded from every calculation but stays in the list. A transaction you excluded by hand is never touched by a rule.",
    });

    if (this.loadError) {
      const problem = contentEl.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "Some rules could not be read:" });
      problem.createEl("pre", { text: this.loadError });
      problem.createEl("p", { text: "Fix Budget/Settings/exclusion_rules.json, then reopen this window. Saving from here would discard the rules that failed to load." });
      return;
    }

    const records = this.plugin.index.transactions();

    if (!this.rules.length) {
      contentEl.createEl("p", { text: "No rules yet." });
    }

    for (const rule of this.rules) {
      const matches = records.filter((record) => matchesRule(record, { ...rule, enabled: true })).length;
      const setting = new Setting(contentEl)
        .setName(rule.name)
        .setDesc(`${this.describe(rule)} — matches ${matches} transaction${matches === 1 ? "" : "s"}`);

      setting.addToggle((toggle) =>
        toggle.setValue(rule.enabled).onChange(async (value) => {
          rule.enabled = value;
          await this.persist();
        }),
      );

      setting.addButton((button) =>
        button.setIcon("pencil").setTooltip("Edit").onClick(() => {
          new RuleEditModal(this.app, this.plugin, rule, async (updated) => {
            const position = this.rules.findIndex((item) => item.id === rule.id);
            this.rules[position] = updated;
            await this.persist();
            this.draw();
          }).open();
        }),
      );

      setting.addButton((button) =>
        button.setIcon("trash").setTooltip("Delete").setWarning().onClick(async () => {
          this.rules = this.rules.filter((item) => item.id !== rule.id);
          await this.persist();
          this.draw();
        }),
      );
    }

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });

    const add = actions.createEl("button", { text: "New rule" });
    add.addEventListener("click", () => {
      new RuleEditModal(this.app, this.plugin, null, async (created) => {
        this.rules.push(created);
        await this.persist();
        this.draw();
      }).open();
    });

    const apply = actions.createEl("button", { cls: "mod-cta", text: "Apply to all transactions" });
    on(apply, "click", async () => {
      const updated = await this.plugin.applyRulesToAll();
      new Notice(`Updated ${updated} transaction${updated === 1 ? "" : "s"}.`);
      this.draw();
    });
  }

  private describe(rule: ExclusionRule): string {
    const joiner = rule.match === "all" ? " and " : " or ";
    return rule.conditions
      .map((condition) => `${FIELD_LABELS[condition.field]} ${OP_LABELS[condition.op]} "${condition.value}"`)
      .join(joiner);
  }

  private async persist(): Promise<void> {
    try {
      await saveRules(this.app, this.rules);
    } catch (error) {
      new Notice(`Could not save the rules: ${(error as Error).message}`);
    }
  }
}

export class RuleEditModal extends Modal {
  private rule: ExclusionRule;

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    existing: ExclusionRule | null,
    private readonly onSave: (rule: ExclusionRule) => Promise<void>,
  ) {
    super(app);
    this.rule = existing
      ? structuredClone(existing)
      : {
          id: `rule-${Date.now().toString(36)}`,
          name: "",
          enabled: true,
          reason: "",
          match: "all",
          conditions: [{ field: "sms_message", op: "contains", value: "" }],
        };
  }

  override onOpen(): void {
    this.modalEl.addClass("fin-sheet");
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.rule.name || "New rule" });

    new Setting(contentEl).setName("Name").addText((text) =>
      text.setPlaceholder("Transfer to my own account").setValue(this.rule.name)
        .onChange((value) => { this.rule.name = value; }),
    );

    new Setting(contentEl).setName("Reason")
      .setDesc("Shown on every transaction this rule excludes.")
      .addText((text) =>
        text.setPlaceholder("Transfer between my own accounts").setValue(this.rule.reason)
          .onChange((value) => { this.rule.reason = value; }),
      );

    new Setting(contentEl).setName("Match").addDropdown((dropdown) => {
      dropdown.addOption("all", "All conditions");
      dropdown.addOption("any", "Any condition");
      dropdown.setValue(this.rule.match).onChange((value) => {
        this.rule.match = value as "all" | "any";
        this.refreshPreview();
      });
    });

    contentEl.createEl("h3", { text: "Conditions" });

    this.rule.conditions.forEach((condition, position) => {
      const row = contentEl.createDiv({ cls: "fin-condition" });

      const field = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_FIELDS) field.createEl("option", { value: name, text: FIELD_LABELS[name] });
      field.value = condition.field;
      field.addEventListener("change", () => {
        condition.field = field.value as RuleField;
        this.refreshPreview();
      });

      const op = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_OPS) op.createEl("option", { value: name, text: OP_LABELS[name] });
      op.value = condition.op;
      op.addEventListener("change", () => {
        condition.op = op.value as RuleOp;
        this.draw();
      });

      const value = row.createEl("input", {
        cls: "fin-condition-part",
        attr: { type: "text", placeholder: "value", value: String(condition.value ?? "") },
      });
      value.addEventListener("input", () => {
        condition.value = value.value;
        this.refreshPreview();
      });

      if (condition.op === "between") {
        const second = row.createEl("input", {
          cls: "fin-condition-part",
          attr: { type: "text", placeholder: "and", value: String(condition.value2 ?? "") },
        });
        second.addEventListener("input", () => {
          condition.value2 = second.value;
          this.refreshPreview();
        });
      }

      const remove = row.createEl("button", { cls: "fin-condition-remove", text: "×" });
      remove.setAttribute("aria-label", "Remove condition");
      remove.addEventListener("click", () => {
        this.rule.conditions.splice(position, 1);
        this.draw();
      });
    });

    const add = contentEl.createEl("button", { cls: "fin-more", text: "Add condition" });
    add.addEventListener("click", () => {
      this.rule.conditions.push({ field: "sms_message", op: "contains", value: "" });
      this.draw();
    });

    this.previewEl = contentEl.createDiv({ cls: "fin-rule-preview" });
    this.refreshPreview();

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save rule" });
    save.addEventListener("click", () => void this.save());
  }

  private previewEl!: HTMLElement;

  /** Shows what the rule would catch before it is saved. */
  private refreshPreview(): void {
    this.previewEl.empty();
    const errors = validateRule(this.rule);
    if (errors.length) {
      this.previewEl.createEl("p", { cls: "fin-rule-error-text", text: errors[0] });
      return;
    }

    const records = this.plugin.index.transactions();
    const matches = records.filter((record) => matchesRule(record, { ...this.rule, enabled: true }));
    this.previewEl.createEl("p", {
      text: `Matches ${matches.length} of ${records.length} transactions.`,
    });

    const manual = matches.filter((record) => record.excluded && record.excludeSource === "manual").length;
    if (manual) {
      this.previewEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `${manual} of those were excluded by hand and will not be changed.`,
      });
    }

    const list = this.previewEl.createEl("ul", { cls: "fin-rule-preview-list" });
    for (const record of matches.slice(0, 5)) {
      list.createEl("li", {
        text: `${record.date ?? "?"} · ${record.counterparty || record.category} · ${record.amount ?? "?"} ${record.currency}`,
      });
    }
  }

  private async save(): Promise<void> {
    const errors = validateRule(this.rule);
    if (errors.length) {
      new Notice(errors.join("\n"));
      return;
    }
    if (!this.rule.reason) this.rule.reason = this.rule.name;
    await this.onSave(this.rule);
    this.close();
  }
}
