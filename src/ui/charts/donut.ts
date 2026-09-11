import { arcPath, createChart, svgEl } from "./svg.ts";
import { formatAmount } from "../format.ts";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function renderDonut(
  container: HTMLElement,
  data: DonutDatum[],
  options: { total: number; currency: string; onSelect?: (label: string) => void },
): void {
  const positive = data.filter((item) => item.value > 0);
  if (!positive.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const size = 200;
  const centre = size / 2;
  const radius = 88;
  const inner = 58;
  const total = positive.reduce((sum, item) => sum + item.value, 0);

  const svg = createChart(size, size, `Spending by category, total ${formatAmount(options.total)} ${options.currency}`);
  svg.addClass("fin-donut");

  let angle = 0;
  for (const item of positive) {
    const sweep = (item.value / total) * Math.PI * 2;
    const path = svgEl("path", {
      d: arcPath(centre, centre, radius, inner, angle, angle + sweep),
      fill: item.color,
    });
    path.addClass("fin-donut-slice");

    const share = ((item.value / total) * 100).toFixed(1);
    svg.appendChild(path).appendChild(svgEl("title")).textContent =
      `${item.label}: ${formatAmount(item.value)} ${options.currency} (${share}%)`;

    if (options.onSelect) {
      path.addClass("is-clickable");
      path.addEventListener("click", () => options.onSelect!(item.label));
    }
    angle += sweep;
  }

  const centreValue = svgEl("text", {
    x: centre, y: centre - 2, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  centreValue.addClass("fin-donut-total");
  centreValue.textContent = formatAmount(options.total);
  svg.appendChild(centreValue);

  const centreLabel = svgEl("text", {
    x: centre, y: centre + 18, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  centreLabel.addClass("fin-donut-currency");
  centreLabel.textContent = options.currency;
  svg.appendChild(centreLabel);

  container.appendChild(svg);

  // The legend is not decoration: it is the text alternative that makes every
  // value readable without relying on colour or on hovering a slice.
  const legend = container.createEl("ul", { cls: "fin-legend" });
  for (const item of positive) {
    const row = legend.createEl("li", { cls: "fin-legend-row" });
    const swatch = row.createSpan({ cls: "fin-legend-swatch" });
    swatch.style.background = item.color;
    row.createSpan({ cls: "fin-legend-label", text: item.label });
    row.createSpan({
      cls: "fin-legend-value fin-amount",
      text: `${formatAmount(item.value)} · ${((item.value / total) * 100).toFixed(0)}%`,
    });
    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect!(item.label));
    }
  }
}
