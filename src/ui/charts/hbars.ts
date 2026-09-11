import { formatAmount } from "../format.ts";

export interface HBarDatum {
  label: string;
  value: number;
  color?: string;
  caption?: string;
  /** 0–1+ when the bar should be measured against something other than the max. */
  ratio?: number;
}

/**
 * Rendered as divs rather than SVG: a ranked list of bars is a layout problem,
 * and HTML wraps long labels and stays selectable, which SVG text does not.
 */
export function renderHBars(
  container: HTMLElement,
  data: HBarDatum[],
  options: { currency: string; onSelect?: (label: string) => void },
): void {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const max = Math.max(...data.map((item) => item.value)) || 1;
  const list = container.createDiv({ cls: "fin-hbars" });

  for (const item of data) {
    const row = list.createDiv({ cls: "fin-hbar-row" });

    const head = row.createDiv({ cls: "fin-hbar-head" });
    head.createSpan({ cls: "fin-hbar-label", text: item.label });
    head.createSpan({
      cls: "fin-hbar-value fin-amount",
      text: `${formatAmount(item.value)}${options.currency ? ` ${options.currency}` : ""}`,
    });

    const track = row.createDiv({ cls: "fin-hbar-track" });
    const fill = track.createDiv({ cls: "fin-hbar-fill" });
    const ratio = item.ratio ?? item.value / max;
    fill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
    if (item.color) fill.style.background = item.color;

    if (item.ratio !== undefined && item.ratio > 1) {
      // Over budget: show the overflow as a separate marker rather than a bar
      // longer than its track, which would read as a rendering bug.
      track.addClass("is-over");
    }

    if (item.caption) row.createDiv({ cls: "fin-hbar-caption", text: item.caption });

    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect!(item.label));
    }
  }
}
