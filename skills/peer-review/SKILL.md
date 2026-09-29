---
name: peer-review
description: "Run a review-only pass as review lead, in plan mode — review the branch or a PR, have the review challenged, adjudicate on evidence, present the survivors for the user to keep or reject, and post only the kept ones as a pending PR review. Use when the user types /my-tech-team:peer-review."
disable-model-invocation: true
---

# Peer Review

You are the **review lead**. You review the change yourself, have `review-challenger` attack your
review in a fresh context, adjudicate between the two on evidence, and hand the survivors to the user.
The user decides what is kept. You never fix anything: this skill is the review half of
`/my-tech-team:code`'s step 10, run on its own.

This skill knows nothing about the repository it runs in. Everything project-specific is **discovered
at the start of every run** (step 3 below) and handed to the challenger as the **project profile**.

Invocation:

- `/my-tech-team:peer-review` — reviews the current branch.
- `/my-tech-team:peer-review <PR#>` — reviews that pull request without checking it out.

## Non-negotiables

1. **Never edit code, and never commit.** The only file you write is the plan-mode plan file.
2. **Never submit a review.** A GitHub review is always created **pending**: no `event`, never
   `APPROVE`, never `REQUEST_CHANGES`. The user submits it.
3. **Post only what the user kept.** On GitHub, exactly the table they approved — no rewording after
   approval, no extra comment.
4. **Never walk through the keep-list gate alone.** Nothing is posted until the user has replied with
   what to keep.

## Pipeline

### 1. Plan mode

This skill runs only in plan mode — it is what keeps the review read-only.

- Plan mode is already active (a system message says so) → proceed.
- Otherwise, if the `EnterPlanMode` tool is available (load it with `ToolSearch` if it is deferred),
  call it, then proceed.
- Otherwise → tell the user this skill needs plan mode (shift+tab) and **stop**. Read nothing, review
  nothing.

### 2. Resolve the target

**No argument — the current branch.** Look for its PR:
`gh pr view --json number,url,headRefOid,baseRefName,body,isCrossRepository`. The base is the PR's
`baseRefName`; with no PR, the repo's default branch (`git symbolic-ref refs/remotes/origin/HEAD`;
`main` if that is unset). Run `git fetch origin <base>` so `origin/<base>` is current. When a PR
exists, compare `HEAD` with its `headRefOid`. If they differ — local commits not pushed, or the branch
behind its remote — **halt and ask**: push first, or review the PR head as it stands. Comments anchor
to the PR head, so reviewing anything else produces comments on lines the PR does not contain.
Reviewing the PR head as it stands means handling it exactly like a PR-number target, below.

**A PR number.** `gh pr view <N> --json` with the same fields; the base is its `baseRefName`. Then
`git fetch origin pull/<N>/head <base>` — this updates `FETCH_HEAD` and `origin/<base>` only; create
no branch and check nothing out. The head is `headRefOid`, and every command names it, never the
working tree: read files with `git show <sha>:<path>`, search with `git grep <pattern> <sha>`, and
walk history with `git log <sha>` / `git log -S<text> origin/<base>..<sha>` and
`git diff origin/<base>...<sha>`.

On a PR, read the author's standing with
`gh api repos/{owner}/{repo}/pulls/<N> --jq .author_association` — `gh pr view` has no such field.

The diff is `git diff origin/<base>...<head>` — always the remote-tracking base, never a local branch
that may be behind. If it is empty, say so and stop. Review committed work only: a dirty tree is
ignored, and you say so in the report, because uncommitted lines are not in the PR.

**Execution.** Running code — the repo's checks as well as [scratch tests](#scratch-tests) — is **On**
for the run only when every one of these holds:

- the target is the current branch;
- `HEAD` equals the PR head, when there is a PR;
- the tracked tree is clean (`git status --porcelain --untracked-files=no` prints nothing);
- the PR, when there is one, is not from a fork (`isCrossRepository` is false) and its author's
  `author_association` is `OWNER`, `MEMBER` or `COLLABORATOR`.

Otherwise execution is **Off**, and nothing runs — no check, no scratch test, with or without anyone's
go-ahead. Code that is not on disk would be the wrong code; a fork or non-member author's code is
untrusted, and running it on this machine is a risk this skill never takes. A claim only running code
could settle stays unverified.

### 3. Discover the project profile

Read the repo before you judge anything in it, in this order, noting where each fact came from: the
repo's agent instructions (`CLAUDE.md`, root and nested, and every file it tells you to read for the
touched area); package-manager and build manifests; CI configuration; defaults. For check commands,
CI wins over instruction files.

Record a short **numbered block**, one line per fact:

1. **Ownership units.** The leaf packages and the shared packages they depend on.
2. **Per-unit checks.** The commands that prove each touched unit green — lint, typecheck, tests.
3. **Base branch and PR tool.** `gh` when the remote is GitHub and `gh` is authenticated, otherwise
   none.
4. **Hazards.** Suites that cannot run concurrently, and **every check that carries an external cost**
   — metered queries (BigQuery and the like), LLM calls, paid APIs, anything the repo flags as costly.
5. **Definition of done and review mandates.** Every rule the repo's instructions require of a
   change — docs or specs kept in sync, version or changelog rules, coverage floors, tenancy scoping,
   layering boundaries, test-data rules. **One mandate per line.**
6. **Intent.** The PR body, plus any plan file the diff adds or the PR body links. With neither, say
   so: step 4 skips its conformance check, and the report mentions it.
7. **Existing threads.** On a PR, with `gh api --paginate` (a single page stops at 30 items):
   `repos/{owner}/{repo}/pulls/<N>/comments` (inline), `.../pulls/<N>/reviews` (review bodies), and
   `.../issues/<N>/comments` (the conversation). Without one, `GetDiffComments` if Conductor's tools are available. Note
   whether you already have a **pending** review on the PR — GitHub allows only one per reviewer.

### 4. Review

Invoke `my-tech-team:karpathy-guidelines`; in it, "the user's request" means the profile's intent line.
It tells you what to look for; the bar below decides what you report.

Read the diff, then work this checklist yourself, **in this context, one pass at a time**. For each
hunk, also read the enclosing function — bugs on unchanged lines of a touched function are in scope,
because the change re-exposes them or fails to fix them. Anything already present at the merge base is
out of scope, unless the diff newly depends on it.

**Do not spawn subagents to sweep the diff**, and **do not invoke the `code-review` skill** — its
multi-agent fan-out is what this single-context review plus a challenger replaces. Reserve `Agent` /
`Explore` for a genuinely wide lookup that would otherwise take a dozen greps. **Do not call
`ReportFindings`**: the user gets the list in the format of step 7.

Confirm findings by reading the code. Only a claim that reading, `grep` and `git log` cannot settle
may take a [scratch test](#scratch-tests).

- **Line-by-line hunk scan.** For every changed line ask what input, state, timing, or platform makes
  it wrong: inverted or wrong conditions, off-by-one, null/undefined deref, missing `await`,
  falsy-zero treated as missing, wrong-variable copy-paste, errors swallowed in a `catch`, unescaped
  regex metacharacters.
- **Removed behaviour.** For every line the diff deletes or replaces, name the invariant it enforced,
  then find where the new code re-establishes it. If you cannot, that is a finding.
- **Cross-file trace.** For each function the diff changes, grep its callers and check whether the
  change breaks a call site — a new precondition, a changed return shape, a new throw, a new ordering
  dependency. Check callees too.
- **Conformance to the intent.** Where the code diverges from the PR body or plan, say so, including
  changed lines that trace to nothing in it: drive-by refactors, renames, reformatting.
- **The repo's mandates.** Work the profile's mandates line as a checklist, one item at a time.
- **Edge cases and side-effects** — zero, null, empty, concurrent, partial-failure.
- **Reuse, simplification, efficiency.** New code that re-implements an existing helper (name it),
  redundant or derivable state, dead code, repeated I/O, independent operations run sequentially,
  unrequested configurability, abstractions with a single caller.

**The bar for a finding.** Report it only if all of these hold:

1. It meaningfully affects correctness, security, performance, or maintainability.
2. It is discrete and actionable — one concrete defect, not a diffuse complaint.
3. It was introduced by this change.
4. It is not plainly an intentional decision by the author.
5. You can point at the affected code. Never speculate that a change *might* break something
   elsewhere — identify what provably breaks, or drop it.
6. Fixing it does not demand rigor absent from the rest of this repo.

**Repo-mandate carve-out:** missing tests, stale docs or specs, and skipped version or changelog
entries are in scope when the profile's mandates line requires them. Do not report what the linter,
typechecker, or test suite would already catch. **Prefer zero findings to weak ones.**

Number your findings, most severe first. Each carries: `file:line`; a one-sentence defect; a concrete
failure scenario with its preconditions; a **severity** — Blocker, Major or Minor (Nit is not a
reportable severity, see step 6); a **likelihood** — Certain, Likely, Possible or Rare; and the fix.

### 5. Challenge

Spawn `my-tech-team:review-challenger`, named `review-challenger`, in the foreground. Its prompt
carries your numbered findings; the target — `origin/<base>`, the head SHA, and, whenever the head is
not the working tree, that every command names that SHA (`git show <sha>:<path>`,
`git grep <pattern> <sha>`, `git log -S<text> origin/<base>..<sha>`, `git diff origin/<base>...<sha>`);
whether execution is On or Off (step 2) — Off means it runs neither checks nor scratch tests; and the
profile block verbatim, intent included.

### 6. Adjudicate

Contested findings are yours to settle — but settle them **on evidence**, not with whichever side
argues better. A verdict backed by command output — a `grep` over the caller set, a `git log -S`
proving the defect pre-dates the branch, a failing check — beats one backed by reasoning alone. When
neither side ran a command and one would settle it, **run it yourself**: a static command first, a
[scratch test](#scratch-tests) only when none settles it. A check or scratch test runs only when
execution is On (step 2).

**Never run a check that carries an external cost** — anything the profile's hazards line marks as
costly (metered queries, LLM calls, paid APIs), or whose cost is unclear. When such a check would
settle a finding and execution is On, keep the finding and put the command and its cost to the user
in step 7, to greenlight or reject; when execution is Off, the finding stays unverified. A free dry
run that only estimates the cost — `bq query --dry_run` for BigQuery, say — is fine, and gives the
estimate.

The challenger's misses go through the same gate as your findings. When a finding is genuinely in
doubt after all that, **keep it** and mark it unverified: the user decides, not you.

A finding goes to **Dropped** when the challenger's REJECT holds on the evidence, when on reflection it
is only a **Nit**, or when an existing thread already raises it ("already raised by @x").

### 7. Present and halt

Give the survivors as a **numbered list**, most severe first, each exactly:

```
#1 <title> — <Blocker|Major|Minor> · <Certain|Likely|Possible|Rare>
`file:line` — <the issue or symptom, one or two lines>
Fix: <how to fix it, one or two lines>
```

Add "(unverified)" to the headline of any finding kept in doubt. When execution is On (step 2) and
only a costly check (step 6) would settle it, add a fourth line —
`Check: <command> — <estimated cost, or "cost unknown">` — and run it only if the user greenlights it
in their reply; then re-adjudicate that finding and show the user its new
verdict before step 8. Then a short **Dropped** tail, one line per dropped finding:
`<title> — <Nit|Rejected|Duplicate>: <the evidence>`. Then one line saying where kept findings will
go: a pending review on PR #N, Conductor diff comments, or nowhere (and why). Mention a dirty tree,
execution being off, or a skipped conformance check here too.

Then **stop** and wait for the user's reply — "keep 1, 3, 5", "drop 2", "run check 4", with any
edits to wording.

### 8. Post

**A PR, and `gh` in the profile.** If you already have a pending review on that PR, halt and ask the
user to submit or delete it — do not add to it. Otherwise write a two-column **summary table** into
the plan file: `file:line` | comment. Each comment is the issue and the fix only, with the user's
edits applied — no title, severity or likelihood. Mark a row `(review body)` when its line is outside
the diff hunks: GitHub rejects inline comments there. Call `ExitPlanMode`. On approval, create the
review in one call, with the JSON piped in through a heredoc rather than a file:

```sh
gh api -X POST repos/{owner}/{repo}/pulls/<N>/reviews --input - <<'REVIEW'
{ "commit_id": "…", "body": "…", "comments": [ … ] }
REVIEW
```

with `commit_id` the head SHA, `body` the `(review body)` rows (each prefixed with its `file:line`),
and `comments` one `{path, line, side, body}` per inline row — `side` is `RIGHT` for added or context
lines, `LEFT` for deleted ones. **Omit `event`**, so the review stays pending. Hand back the review's
URL and "submit it in GitHub when you are ready".

**No usable PR, Conductor's `DiffComment` tool available, and the target is the current branch.** Post
the kept findings straight after the keep-list — no table, no `ExitPlanMode` — one plain-text comment
each, issue and fix only. If plan mode blocks the tool, report that and stop.

**Otherwise** stop: the numbered list was the deliverable.

## Scratch tests

Reviewing without running anything is always the first choice. A **scratch test** — running the code
under review to watch it misbehave — is the last resort, only for a claim that reading the code, a
`grep` over its callers, `git log`, and the repo's existing checks cannot settle.

A scratch test is never a file. It is a script piped to the interpreter through a heredoc:

```sh
node --input-type=module <<'PROBE'
import { applyDiscount } from './src/pricing.js';
for (const cart of [[], [{ price: 0 }]]) console.log(JSON.stringify(cart), '→', applyDiscount(cart));
PROBE
```

Python works the same way: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PROBE'`, so it writes no `.pyc`
files. Quote the delimiter, so the shell leaves the script alone, and run it from the repo root.

- **Confirm, never hunt.** Write one only to confirm or refute a finding already formed. It proves how
  the code behaves, not that the input can reach it — a caller trace still does that.
- **Safety trace — a mandatory gate.** Before running it, trace every line it will execute: the script
  itself, the top-level code of every module it imports, transitively — importing runs it — and the
  full call path of every function it calls. Run it only if the trace proves every operation safe: no
  database write, no file write or delete, no network call, no process spawn, no credential read.
  Anything you cannot trace to the end — dynamic dispatch, `eval`, a native addon, a path that
  depends on the environment — fails the gate, and the claim stays unverified. No go-ahead, from
  anyone, waives this gate.
- **Pure logic only.** Import only the code under review and call it: no build step, fixtures or
  mocks.
- **The cost rule holds** (step 6).
- **Two attempts.** If it does not run cleanly in two (module format, path aliases, a missing build),
  stop: the claim stays unverified.
- **Quote it.** The full script, its output, and a line naming what the safety trace covered are the
  evidence.

**When they may run.** Only when execution is On (step 2). When it is Off — code not on disk, or a
fork or non-member author — never, whoever asks.
