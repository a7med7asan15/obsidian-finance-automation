#!/usr/bin/env bash
# Launch an agent on the next unfinished task from the implementation plans.
#
# Walks docs/superpowers/plans/*.md in sorted order (which is execution order:
# a-foundation -> b-transactions -> c-stats) and picks the first "### Task N:"
# section that still has an unchecked "- [ ]" step. A task left half-done is
# still unfinished, so re-running resumes it.
#
# Heredocs live inside functions rather than inside $(...) — bash 3.2, which is
# what macOS ships, mis-parses an apostrophe in a heredoc nested in $(...).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLANS_DIR="$REPO_ROOT/docs/superpowers/plans"
AGENT="claude"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: run-next-task.sh [options]

Finds the next unfinished task across the implementation plans and launches an
interactive agent session on it.

Options:
  --agent <claude|pi>   Agent CLI to launch (default: claude)
  --plans-dir <path>    Directory of plan markdown files
                        (default: <repo>/docs/superpowers/plans)
  --dry-run             Print the resolved task and prompt, launch nothing
  -h, --help            Show this help

Exit codes:
  0  agent launched, or no unfinished tasks remain
  1  bad usage / missing plans directory / agent not on PATH
USAGE
}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)
      [ $# -ge 2 ] || die "--agent needs a value"
      AGENT="$2"; shift 2 ;;
    --agent=*) AGENT="${1#*=}"; shift ;;
    --plans-dir)
      [ $# -ge 2 ] || die "--plans-dir needs a value"
      PLANS_DIR="$2"; shift 2 ;;
    --plans-dir=*) PLANS_DIR="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

case "$AGENT" in
  claude|pi) ;;
  *) die "--agent must be 'claude' or 'pi', got '$AGENT'" ;;
esac

[ -d "$PLANS_DIR" ] || die "plans directory not found: $PLANS_DIR"

# --- find the next unfinished task -------------------------------------------
#
# For the first task section with a pending step, emits:
#   TASK <tab> start_line <tab> end_line <tab> heading <tab> pending <tab> done
# followed by one "PENDING<tab>text" / "DONE<tab>text" line per step.
# Emits nothing if every task in the file is complete.
scan_plan() {
  awk '
    function reset() {
      in_task = 0; pending = 0; done_n = 0; n = 0; start = 0; stop = 0
      split("", steps)
    }

    function emit() {
      emitted = 1
      if (stop == 0) stop = FNR
      printf "TASK\t%d\t%d\t%s\t%d\t%d\n", start, stop, heading, pending, done_n
      for (i = 1; i <= n; i++) print steps[i]
    }

    # Track fenced code blocks so example markdown is never read as a step.
    /^```/ { in_fence = !in_fence; next }

    # A new task heading closes the previous section.
    !in_fence && /^### Task / {
      if (pending > 0) { stop = FNR - 1; emit(); exit }
      reset()
      in_task = 1
      start = FNR
      heading = $0
      sub(/^### /, "", heading)
      next
    }

    # Any other top-level heading, or a horizontal rule, ends the section.
    in_task && !in_fence && (/^## / || /^---[[:space:]]*$/) {
      if (pending > 0) { stop = FNR - 1; emit(); exit }
      reset()
      next
    }

    in_task && !in_fence && /^- \[ \] / {
      step = $0; sub(/^- \[ \] /, "", step)
      steps[++n] = "PENDING\t" step
      pending++
      next
    }

    in_task && !in_fence && /^- \[[xX]\] / {
      step = $0; sub(/^- \[[xX]\] /, "", step)
      steps[++n] = "DONE\t" step
      done_n++
      next
    }

    # awk runs END even after exit, so emit() must not fire a second time.
    END { if (!emitted && pending > 0) emit() }
  ' "$1"
}

shopt -s nullglob
PLANS=("$PLANS_DIR"/*.md)
shopt -u nullglob
[ ${#PLANS[@]} -gt 0 ] || die "no plan files in $PLANS_DIR"

PLAN_FILE=""
SCAN=""
for plan in "${PLANS[@]}"; do
  result="$(scan_plan "$plan")"
  if [ -n "$result" ]; then
    PLAN_FILE="$plan"
    SCAN="$result"
    break
  fi
done

if [ -z "$PLAN_FILE" ]; then
  printf 'All tasks in %s are complete. Nothing left to run.\n' "$PLANS_DIR"
  exit 0
fi

task_line="$(printf '%s\n' "$SCAN" | head -n 1)"
IFS=$'\t' read -r _ START STOP HEADING PENDING DONE_COUNT <<<"$task_line"
PLAN_REL="${PLAN_FILE#"$REPO_ROOT"/}"

pending_list="$(printf '%s\n' "$SCAN" | awk -F'\t' '$1=="PENDING" {print "  - [ ] " $2}')"
done_list="$(printf '%s\n' "$SCAN" | awk -F'\t' '$1=="DONE" {print "  - [x] " $2}')"

# --- build the prompt ---------------------------------------------------------

emit_prompt_head() {
  cat <<EOF
Implement one task from an existing implementation plan.

Repo:  $REPO_ROOT
Plan:  $PLAN_REL
Task:  $HEADING
Lines: $START-$STOP of that file

REQUIRED SUB-SKILL: use superpowers:executing-plans to work through this task.

Start by reading the plan file header and its "Global Constraints" section, then
read lines $START-$STOP for the task itself. The constraints are binding — in
particular the no-runtime-dependencies rule, the no-network rule, and the rule
that nothing under \`src/domain/\` may import from \`obsidian\`.

Work only on this task. Do not start the next task, even if this one finishes
early — a separate run handles that.

Remaining steps ($PENDING):

$pending_list
EOF
}

emit_resume_note() {
  [ "$DONE_COUNT" -gt 0 ] || return 0
  cat <<EOF

This task was started earlier and is partly done. These steps are already
checked off — do NOT redo them:

$done_list
EOF
}

emit_prompt_tail() {
  cat <<EOF

As you finish each step, edit $PLAN_REL to change that step's \`- [ ]\` to
\`- [x]\`. Tick a step only once the verification it states has actually passed —
a green test run, a successful build, the commit made. If a step's verification
fails and you cannot resolve it, stop, leave the box unchecked, and explain what
blocked you.
EOF
}

build_prompt() {
  emit_prompt_head
  emit_resume_note
  emit_prompt_tail
}

PROMPT="$(build_prompt)"

# --- launch -------------------------------------------------------------------

printf '→ %s\n' "$PLAN_REL"
printf '  %s\n' "$HEADING"
printf '  lines %s-%s · %s step(s) remaining' "$START" "$STOP" "$PENDING"
[ "$DONE_COUNT" -gt 0 ] && printf ', %s already done' "$DONE_COUNT"
printf '\n'

if [ "$DRY_RUN" -eq 1 ]; then
  printf '\n--- prompt (dry run, not launching %s) ---\n%s\n' "$AGENT" "$PROMPT"
  exit 0
fi

command -v "$AGENT" >/dev/null 2>&1 || die "$AGENT is not on PATH"

printf '  launching %s (interactive)…\n\n' "$AGENT"
cd "$REPO_ROOT"
exec "$AGENT" "$PROMPT"
