const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * A chart is always given a <title> so a screen reader announces something
 * meaningful, and viewBox rather than fixed width so it scales to the card.
 */
export function createChart(width: number, height: number, title: string): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": title,
    preserveAspectRatio: "xMidYMid meet",
  });
  svg.appendChild(svgEl("title")).textContent = title;
  return svg;
}

export function linearScale(domainMax: number, rangeMax: number): (value: number) => number {
  if (domainMax <= 0) return () => 0;
  return (value: number) => (value / domainMax) * rangeMax;
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number): [number, number] {
  // Angles start at 12 o'clock and run clockwise, which is how people read a pie.
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

export function arcPath(
  cx: number, cy: number,
  radius: number, innerRadius: number,
  startAngle: number, endAngle: number,
): string {
  // A full circle drawn as one arc collapses, because the start and end points
  // coincide. Nudging the end keeps the segment visible.
  const sweep = Math.min(endAngle - startAngle, Math.PI * 2 - 0.0001);
  const end = startAngle + sweep;
  const largeArc = sweep > Math.PI ? 1 : 0;

  const [outerStartX, outerStartY] = pointOnCircle(cx, cy, radius, startAngle);
  const [outerEndX, outerEndY] = pointOnCircle(cx, cy, radius, end);
  const [innerEndX, innerEndY] = pointOnCircle(cx, cy, innerRadius, end);
  const [innerStartX, innerStartY] = pointOnCircle(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStartX.toFixed(2)} ${outerStartY.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX.toFixed(2)} ${outerEndY.toFixed(2)}`,
    `L ${innerEndX.toFixed(2)} ${innerEndY.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX.toFixed(2)} ${innerStartY.toFixed(2)}`,
    "Z",
  ].join(" ");
}
