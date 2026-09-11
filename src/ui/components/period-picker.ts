import { Menu, setIcon } from "obsidian";
import { periodLabel, cairoToday } from "../../domain/dates.ts";
import type { FilterStore } from "../../store/filter-store.ts";
import type { PeriodUnit } from "../../data/types.ts";

const QUICK_CHIPS: Array<{ label: string; build: (today: string) => Parameters<FilterStore["setPeriod"]>[0] }> = [
  { label: "This month", build: (today) => ({ unit: "month", anchor: today.slice(0, 7), from: null, to: null }) },
  {
    label: "Last month",
    build: (today) => {
      const [year, month] = today.slice(0, 7).split("-").map(Number);
      const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
      return { unit: "month", anchor: previous, from: null, to: null };
    },
  },
  { label: "This year", build: (today) => ({ unit: "year", anchor: today.slice(0, 4), from: null, to: null }) },
  { label: "All", build: () => ({ unit: "all", anchor: "", from: null, to: null }) },
];

export class PeriodPicker {
  constructor(private readonly store: FilterStore) {}

  render(container: HTMLElement): void {
    const today = cairoToday();
    const period = this.store.get().period;
    const wrapper = container.createDiv({ cls: "fin-period" });

    const stepper = wrapper.createDiv({ cls: "fin-period-stepper" });

    const back = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Previous period" } });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => this.store.step(-1));

    const label = stepper.createEl("button", { cls: "fin-period-label", text: periodLabel(period) });
    label.addEventListener("click", (event) => this.openUnitMenu(event, today));

    const forward = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Next period" } });
    setIcon(forward, "chevron-right");
    forward.addEventListener("click", () => this.store.step(1));

    // Stepping is meaningless for all-time and a custom range.
    const steppable = period.unit === "month" || period.unit === "year";
    back.toggleClass("is-hidden", !steppable);
    forward.toggleClass("is-hidden", !steppable);

    const chips = wrapper.createDiv({ cls: "fin-chip-row" });
    for (const chip of QUICK_CHIPS) {
      const target = chip.build(today);
      const button = chips.createEl("button", { cls: "fin-chip", text: chip.label });
      const isActive = target.unit === period.unit && target.anchor === period.anchor;
      button.toggleClass("is-active", isActive);
      button.addEventListener("click", () => this.store.setPeriod(target));
    }
  }

  private openUnitMenu(event: MouseEvent, today: string): void {
    const menu = new Menu();
    const current = this.store.get().period;

    const units: Array<{ unit: PeriodUnit; label: string }> = [
      { unit: "month", label: "Month" },
      { unit: "year", label: "Year" },
      { unit: "all", label: "All time" },
    ];

    for (const { unit, label } of units) {
      menu.addItem((item) =>
        item.setTitle(label).setChecked(current.unit === unit).onClick(() => {
          const anchor = unit === "month" ? today.slice(0, 7) : unit === "year" ? today.slice(0, 4) : "";
          this.store.setPeriod({ unit, anchor, from: null, to: null });
        }),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("Custom range…").setChecked(current.unit === "custom").onClick(() => {
        this.store.setPeriod({
          unit: "custom", anchor: "",
          from: current.from ?? `${today.slice(0, 7)}-01`,
          to: current.to ?? today,
        });
      }),
    );

    menu.showAtMouseEvent(event);
  }
}
