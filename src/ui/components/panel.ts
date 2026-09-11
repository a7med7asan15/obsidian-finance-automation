export function renderPanel(
  container: HTMLElement,
  title: string,
  subtitle?: string,
): HTMLElement {
  const panel = container.createDiv({ cls: "fin-panel" });
  const head = panel.createDiv({ cls: "fin-panel-head" });
  head.createEl("h3", { cls: "fin-panel-title", text: title });
  if (subtitle) head.createSpan({ cls: "fin-panel-subtitle", text: subtitle });
  return panel.createDiv({ cls: "fin-panel-body" });
}
