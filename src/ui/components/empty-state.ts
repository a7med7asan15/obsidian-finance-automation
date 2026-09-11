import { setIcon } from "obsidian";

export function renderEmptyState(
  container: HTMLElement,
  icon: string,
  title: string,
  body: string,
): void {
  const wrapper = container.createDiv({ cls: "fin-empty" });
  const iconEl = wrapper.createDiv({ cls: "fin-empty-icon" });
  setIcon(iconEl, icon);
  wrapper.createEl("h3", { text: title });
  wrapper.createEl("p", { text: body });
}
