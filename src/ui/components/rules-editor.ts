import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { loadRules, loadTypeRules, saveRules, saveTypeRules } from "../../data/vault-json.ts";
import { RULE_FIELDS, RULE_OPS, matchesRule, validateRule } from "../../domain/exclusion.ts";
import type { BaseRule, ExclusionRule, RuleField, RuleOp } from "../../domain/exclusion.ts";
import { RULE_TYPES, RULE_TYPE_LABELS, validateTypeRule } from "../../domain/type-rules.ts";
import type { RuleType, TypeRule } from "../../domain/type-rules.ts";
import type { TransactionRecord } from "../../data/types.ts";
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

/**
 * What differs between one kind of rule and another. The list, the conditions
 * and the preview are the same for every kind; what a rule *does* is not.
 */
interface RuleKind<R extends BaseRule> {
  title: string;
  intro: string;
  /** The settings note, named when it cannot be read. */
  file: string;
  load(app: App): Promise<{ rules: R[]; error: string | null }>;
  save(app: App, rules: R[]): Promise<void>;
  validate(rule: unknown): string[];
  blank(): R;
  /** What the rule does, after the conditions it matches on. */
  outcome(rule: R): string;
  /** The settings above the conditions that say what the rule does. */
  drawFields(container: HTMLElement, rule: R): void;
  /** A matching transaction the rule will leave alone because a person decided it. */
  decidedByHand(record: TransactionRecord): boolean;
  /** Fills anything left blank before the rule is saved. */
  finish(rule: R): void;
}

const EXCLUSION_RULES: RuleKind<ExclusionRule> = {
  title: "Exclusion rules",
  intro: "A matching transaction is excluded from every calculation but stays in the list. A transaction you excluded by hand is never touched by a rule.",
  file: "Budget/Settings/exclusion_rules.md",
  load: loadRules,
  save: saveRules,
  validate: validateRule,
  blank: () => ({
    id: `rule-${Date.now().toString(36)}`,
    name: "",
    enabled: true,
    reason: "",
    match: "all",
    conditions: [{ field: "sms_message", op: "contains", value: "" }],
  }),
  outcome: () => "",
  drawFields(container, rule) {
    new Setting(container).setName("Reason")
      .setDesc("Shown on every transaction this rule excludes.")
      .addText((text) =>
        text.setPlaceholder("Transfer between my own accounts").setValue(rule.reason)
          .onChange((value) => { rule.reason = value; }),
      );
  },
  decidedByHand: (record) => record.excluded && record.excludeSource === "manual",
  finish(rule) {
    if (!rule.reason) rule.reason = rule.name;
  },
};

const TYPE_RULES: RuleKind<TypeRule> = {
  title: "Spending and income rules",
  intro: "Decides what a message counts as when the keywords read it wrong. The first matching rule wins, and the account moves to the side the new type needs. Only transactions read from a message are changed, and a type you set by hand is never touched by a rule.",
  file: "Budget/Settings/type_rules.md",
  load: loadTypeRules,
  save: saveTypeRules,
  validate: validateTypeRule,
  blank: () => ({
    id: `type-${Date.now().toString(36)}`,
    name: "",
    enabled: true,
    type: "credit",
    match: "all",
    conditions: [{ field: "sms_message", op: "contains", value: "" }],
  }),
  outcome: (rule) => ` → ${RULE_TYPE_LABELS[rule.type]}`,
  drawFields(container, rule) {
    new Setting(container).setName("Counts as")
      .setDesc("What a matching transaction becomes.")
      .addDropdown((dropdown) => {
        for (const type of RULE_TYPES) dropdown.addOption(type, RULE_TYPE_LABELS[type]);
        dropdown.setValue(rule.type).onChange((value) => { rule.type = value as RuleType; });
      });
  },
  decidedByHand: (record) => record.typeSource === "manual" || !record.smsMessage,
  finish: () => {},
};

/** The list of one kind of rule, with a switch, an edit and a delete for each. */
class RuleListModal<R extends BaseRule> extends Modal {
  private rules: R[] = [];
  private loadError: string | null = null;

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    private readonly kind: RuleKind<R>,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.modalEl.addClass("fin-sheet");
    const loaded = await this.kind.load(this.app);
    this.rules = loaded.rules;
    this.loadError = loaded.error;
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.kind.title });
    contentEl.createEl("p", { cls: "fin-sheet-note", text: this.kind.intro });

    if (this.loadError) {
      const problem = contentEl.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "Some rules could not be read:" });
      problem.createEl("pre", { text: this.loadError });
      problem.createEl("p", { text: `Fix ${this.kind.file}, then reopen this window. Saving from here would discard the rules that failed to load.` });
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
          new RuleEditModal(this.app, this.plugin, this.kind, rule, async (updated) => {
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
      new RuleEditModal(this.app, this.plugin, this.kind, null, async (created) => {
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

  private describe(rule: R): string {
    const joiner = rule.match === "all" ? " and " : " or ";
    const conditions = rule.conditions
      .map((condition) => `${FIELD_LABELS[condition.field]} ${OP_LABELS[condition.op]} "${condition.value}"`)
      .join(joiner);
    return `${conditions}${this.kind.outcome(rule)}`;
  }

  private async persist(): Promise<void> {
    try {
      await this.kind.save(this.app, this.rules);
    } catch (error) {
      new Notice(`Could not save the rules: ${(error as Error).message}`);
    }
  }
}

export class RulesEditorModal extends RuleListModal<ExclusionRule> {
  constructor(app: App, plugin: FinanceAutomationPlugin) {
    super(app, plugin, EXCLUSION_RULES);
  }
}

export class TypeRulesEditorModal extends RuleListModal<TypeRule> {
  constructor(app: App, plugin: FinanceAutomationPlugin) {
    super(app, plugin, TYPE_RULES);
  }
}

class RuleEditModal<R extends BaseRule> extends Modal {
  private rule: R;

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    private readonly kind: RuleKind<R>,
    existing: R | null,
    private readonly onSave: (rule: R) => Promise<void>,
  ) {
    super(app);
    this.rule = existing ? structuredClone(existing) : kind.blank();
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

    this.kind.drawFields(contentEl, this.rule);

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
    const errors = this.kind.validate(this.rule);
    if (errors.length) {
      this.previewEl.createEl("p", { cls: "fin-rule-error-text", text: errors[0] });
      return;
    }

    const records = this.plugin.index.transactions();
    const matches = records.filter((record) => matchesRule(record, { ...this.rule, enabled: true }));
    this.previewEl.createEl("p", {
      text: `Matches ${matches.length} of ${records.length} transactions.`,
    });

    const manual = matches.filter((record) => this.kind.decidedByHand(record)).length;
    if (manual) {
      this.previewEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `${manual} of those were decided by hand and will not be changed.`,
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
    const errors = this.kind.validate(this.rule);
    if (errors.length) {
      new Notice(errors.join("\n"));
      return;
    }
    this.kind.finish(this.rule);
    await this.onSave(this.rule);
    this.close();
  }
}
