import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { VAULT_ROOT } from "../constants.ts";
import { describeWorkspace, ensureWorkspace, planWorkspace } from "../data/workspace.ts";
import type { WorkspacePlan } from "../data/workspace.ts";

/** How many paths the confirmation lists before it starts counting instead. */
const LISTED = 10;

/**
 * The one way in to `ensureWorkspace`, for the command and the settings button
 * alike.
 *
 * Writing the tree is what a user asks for; resetting a note they have edited
 * is not, and there is no undo for it — so the run stops and says exactly which
 * files would go back to their defaults. A vault with nothing to lose is never
 * asked: on a fresh install, and on any run that would only fill gaps, the
 * files are simply written.
 */
export async function setUpWorkspace(app: App): Promise<void> {
  let plan: WorkspacePlan;
  try {
    plan = await planWorkspace(app);
  } catch (error) {
    new Notice(`Budget: could not read the ${VAULT_ROOT} files — ${(error as Error).message}`, 8000);
    return;
  }

  if (!plan.reset.length) {
    await applyWorkspace(app);
    return;
  }
  new WorkspaceResetModal(app, plan, () => void applyWorkspace(app)).open();
}

async function applyWorkspace(app: App): Promise<void> {
  try {
    new Notice(describeWorkspace(await ensureWorkspace(app)), 8000);
  } catch (error) {
    new Notice(`Budget: could not create the files — ${(error as Error).message}`, 8000);
  }
}

/** Names what would be overwritten, and asks. Cancel is the default. */
class WorkspaceResetModal extends Modal {
  constructor(
    app: App,
    private readonly plan: WorkspacePlan,
    private readonly confirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    const { create, reset, folders } = this.plan;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Reset budget files?" });

    const made = [
      folders.length ? `${folders.length} folder${folders.length === 1 ? "" : "s"}` : "",
      create.length ? `${create.length} file${create.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" and ");
    if (made) contentEl.createEl("p", { text: `This writes ${made} that are not there yet.` });

    contentEl.createEl("p", {
      text: `It also puts ${reset.length} file${reset.length === 1 ? "" : "s"} back to ${
        reset.length === 1 ? "its default" : "their defaults"
      }, replacing what ${reset.length === 1 ? "it holds" : "they hold"} now — including any budget, colour, card ending or keyword on ${
        reset.length === 1 ? "it" : "them"
      }:`,
    });

    const list = contentEl.createEl("ul", { cls: "fin-reset-list" });
    for (const path of reset.slice(0, LISTED)) list.createEl("li", { text: path });
    if (reset.length > LISTED) {
      list.createEl("li", { text: `…and ${reset.length - LISTED} more` });
    }

    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "Your transactions are never touched, and neither is any account or category you added yourself.",
    });

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Reset to defaults")
          // `setDestructive` wants Obsidian 1.13; this plugin still runs on 1.7.
          .setWarning()
          .onClick(() => {
            this.close();
            this.confirm();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
