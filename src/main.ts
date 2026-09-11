import { Plugin } from "obsidian";

export default class FinanceAutomationPlugin extends Plugin {
  override async onload(): Promise<void> {
    console.log("Finance Automation loaded");
  }
}
