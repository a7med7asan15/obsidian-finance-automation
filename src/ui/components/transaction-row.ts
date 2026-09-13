import { setIcon } from "obsidian";
import { categoryColor, categoryIcon } from "../colors.ts";
import { directionOf, formatSignedMoney, formatTime } from "../format.ts";
import type { CategoryRecord, TransactionRecord } from "../../data/types.ts";

export interface RowHandlers {
  onOpen(record: TransactionRecord): void;
  onQuickMenu(record: TransactionRecord, event: MouseEvent): void;
}

export class TransactionRow {
  constructor(
    private readonly record: TransactionRecord,
    private readonly categories: Map<string, CategoryRecord>,
    private readonly handlers: RowHandlers,
  ) {}

  render(container: HTMLElement): HTMLElement {
    const record = this.record;
    const row = container.createDiv({ cls: "fin-row" });
    row.toggleClass("is-excluded", record.excluded);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    // --- category glyph ---
    const color = categoryColor(record.category, this.categories);
    const glyph = row.createDiv({ cls: "fin-row-glyph" });
    glyph.style.setProperty("--fin-cat-color", color);
    setIcon(glyph, categoryIcon(record.category, this.categories));

    // --- text ---
    const text = row.createDiv({ cls: "fin-row-text" });
    const primary = record.counterparty || record.category || record.type || "Transaction";
    text.createDiv({ cls: "fin-row-primary", text: primary });

    const secondaryParts = [
      record.fromAccount || record.toAccount,
      formatTime(record.time),
    ].filter(Boolean);
    text.createDiv({ cls: "fin-row-secondary", text: secondaryParts.join(" · ") });

    // --- badges, only when the state is not normal ---
    if (record.excluded) {
      text.createSpan({
        cls: "fin-badge fin-badge-excluded",
        text: record.excludeReason || "Excluded",
      });
    }

    // --- amount ---
    const amount = row.createDiv({ cls: "fin-row-amount" });
    const direction = directionOf(record);
    const value = amount.createDiv({
      cls: `fin-amount fin-${direction}`,
      text: record.amount === null ? "—" : formatSignedMoney(record),
    });
    value.toggleClass("is-struck", record.excluded);
    amount.createDiv({ cls: "fin-row-currency", text: record.currency });

    // --- interaction ---
    row.addEventListener("click", () => this.handlers.onOpen(record));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handlers.onOpen(record);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.handlers.onQuickMenu(record, event);
    });

    // Long-press opens the quick menu on touch, where there is no right-click.
    let pressTimer: number | null = null;
    row.addEventListener("touchstart", (event) => {
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        const touch = event.touches[0];
        this.handlers.onQuickMenu(record, new MouseEvent("contextmenu", {
          clientX: touch.clientX, clientY: touch.clientY,
        }));
      }, 500);
    }, { passive: true });
    const cancelPress = () => {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
    };
    row.addEventListener("touchend", cancelPress);
    row.addEventListener("touchmove", cancelPress);

    return row;
  }
}
