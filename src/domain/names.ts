/**
 * The characters Obsidian refuses in a file name, plus the ones that would
 * break a link to the note. A category and an account are both named by their
 * note, so a name that cannot be a file name cannot be either of them.
 */
const ILLEGAL_IN_NAME = /[\\/:*?"<>|#^[\]]/;

/** Names are compared the way they are matched: case does not matter. */
export function sameName(left: string, right: string): boolean {
  return String(left ?? "").trim().toLocaleLowerCase() === String(right ?? "").trim().toLocaleLowerCase();
}

/**
 * The reason `name` cannot be used, or null when it can. `existing` holds the
 * names already taken; something being renamed passes its own name as `current`
 * so keeping it is not read as a clash. `noun` names the thing in the messages,
 * because they are shown to whoever typed the name.
 */
export function noteNameProblem(
  name: string,
  existing: string[],
  current = "",
  noun = "category",
): string | null {
  // "an account", "a category": the noun is shown to whoever typed the name.
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  const wanted = String(name ?? "").trim();
  if (!wanted) return `${article === "an" ? "An" : "A"} ${noun} needs a name.`;
  if (wanted.startsWith(".")) return "A name cannot start with a dot.";
  const illegal = ILLEGAL_IN_NAME.exec(wanted);
  if (illegal) return `A name cannot contain ${illegal[0]}`;
  const clash = (existing ?? []).some(
    (other) => sameName(other, wanted) && !sameName(other, current),
  );
  if (clash) return `There is already ${article} ${noun} called ${wanted}.`;
  return null;
}
