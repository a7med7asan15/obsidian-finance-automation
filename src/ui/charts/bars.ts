import { createChart, linearScale, niceMax, svgEl } from "./svg.ts";
import { formatAmount } from "../format.ts";

export interface BarDatum {
  label: string;
  value: number;
  sublabel?: string;
}

export function renderBars(
  container: HTMLElement,
  data: BarDatum[],
  options: { currency: string; highlightLast?: boolean },
): void {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const width = 320;
  const height = 140;
  const padBottom = 20;
  const plotHeight = height - padBottom;
  const max = niceMax(Math.max(...data.map((item) => item.value)));
  const scale = linearScale(max, plotHeight - 4);
  const slot = width / data.length;
  const barWidth = Math.max(2, Math.min(slot - 2, 22));

  const svg = createChart(width, height, `Spending over time, peak ${formatAmount(max)} ${options.currency}`);
  svg.addClass("fin-bars");

  const baseline = svgEl("line", { x1: 0, y1: plotHeight, x2: width, y2: plotHeight });
  baseline.addClass("fin-axis");
  svg.appendChild(baseline);

  data.forEach((item, index) => {
    const barHeight = scale(item.value);
    const x = index * slot + (slot - barWidth) / 2;
    const bar = svgEl("rect", {
      x: x.toFixed(2), y: (plotHeight - barHeight).toFixed(2),
      width: barWidth, height: Math.max(barHeight, item.value > 0 ? 1 : 0).toFixed(2),
      rx: 2,
    });
    bar.addClass("fin-bar");
    if (options.highlightLast && index === data.length - 1) bar.addClass("is-current");
    svg.appendChild(bar).appendChild(svgEl("title")).textContent =
      `${item.sublabel ?? item.label}: ${formatAmount(item.value)} ${options.currency}`;
  });

  // Label only the first, middle and last slot, so a 31-day month stays readable.
  for (const index of new Set([0, Math.floor(data.length / 2), data.length - 1])) {
    const label = svgEl("text", {
      x: (index * slot + slot / 2).toFixed(2), y: height - 6, "text-anchor": "middle",
    });
    label.addClass("fin-axis-label");
    label.textContent = data[index].label;
    svg.appendChild(label);
  }

  container.appendChild(svg);
  container.createEl("p", {
    cls: "fin-chart-caption",
    text: `Peak ${formatAmount(max)} ${options.currency} · ${data.length} buckets`,
  });
}
