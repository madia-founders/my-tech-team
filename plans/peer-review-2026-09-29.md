# peer-review: a review-only subset of the `code` pipeline

## Context

`/my-tech-team:code` reviews only its own work, at step 10, and fixes whatever survives. We want a
standalone **review-only** skill, `/my-tech-team:peer-review`, that runs in plan mode. The main agent
acts as the **review lead**: it does the first review itself, has `review-challenger` attack it,
adjudicates on evidence, and presents the survivors as a numbered list. The user decides what to
keep, and only the kept findings are posted, as a **pending** GitHub review or as Conductor diff
comments.

## Decisions ledger

1. **Target.** No arg → current branch vs base, plus its PR if one exists. `/peer-review <PR#>` → that
   PR's head, read without checkout (`git fetch origin pull/N/head` + `git show`/`git grep <sha>`).
2. **Plan mode.** Already in it → proceed. `EnterPlanMode` tool present → call it first. Absent →
   refuse and stop.
3. **From /code-review, take only its finding bar and format.** Single context. No finder fan-out, no
   effort levels.
4. **Checks/tests as evidence** only when they settle a claim **and** carry no external cost
   (BigQuery, LLM calls, paid APIs, any known cost). Cost unclear → don't run.
5. **Severity:** Blocker / Major / Minor / Nit.
6. **Likelihood:** one word — Certain / Likely / Possible / Rare.
7. After the kept list, a short **Dropped** tail: one line per rejected finding + its evidence.
8. The finding bar is unchanged. **Nit appears only in the Dropped tail.**
9. The user picks by free-text reply ("keep 1,3,5", optionally with edits).
10. GitHub posting = **one pending (draft) review** via `gh api`. The user submits it in GitHub.
11. After the keep-list: a 2-column summary table (`file:line` | comment body) → `ExitPlanMode` → the
    user approves → post exactly that table.
12. No PR, or gh missing/unauthenticated/non-GitHub → Conductor `DiffComment` if the tool exists
    (current-branch target only). Otherwise stop at the numbered list, with no table.
13. Findings on lines outside the diff hunks go in the pending review's top-level body.
14. Current-branch target with local HEAD ≠ PR head → halt and ask (push first, or review the PR head
    as-is).
15. Dedupe against existing review threads. Duplicates go to Dropped as "already raised by @x".
16. **Comment body = issue + fix only.** No title, severity, or likelihood.
17. **Neutralize the shared `review-challenger`** so it fits both skills (one agent).
18. **Intent** = PR body + any plan file the diff adds or the PR body links. Neither → skip the
    conformance check and say so.
19. **Conductor path posts right after the keep-list.** No table, no ExitPlanMode.
20. **Costly checks are never run unasked** (supersedes decision 4's "don't run"): the finding keeps a
    `Check: <command> — <cost>` line and runs only if the user greenlights it. A free cost-estimating
    dry run (`bq query --dry_run`) is fine. Applies to the challenger and to `code` step 10.3 too.
21. **The `code` profile's hazards line also lists external-cost checks**, so the shared challenger's
    cost rule has something to read in both skills.
22. **Intent and existing threads are profile lines 6 and 7**, and reach the challenger in the block.
23. **Scratch tests** — a heredoc piped to `node`/`python3`, never a file — are allowed in `code`,
    `peer-review`, `code-reviewer` and `review-challenger`, **only when static review cannot settle a
    claim**. Each file has its own `## Scratch tests` section that its other sections refer to. The
    rules: confirm, never hunt; pure logic only; the cost rule holds; two attempts; quote the script
    and output.
24. In peer-review, scratch tests run only when the code on disk is the code under review (current
    branch, `HEAD` = PR head). A fork or a non-member author's PR needs a `Check:` go-ahead per test.
    In `code` they are always on, and a confirmed one becomes the fix's regression test.
25. **Safety trace is a mandatory gate** before any scratch test: trace the script, every transitively
    imported module's top-level code, and the full call path. Run only if every operation is proven
    safe (no DB write, file write/delete, network call, process spawn, credential read). Untraceable
    → no run. No go-ahead waives it. The evidence names what the trace covered.
26. **Peer review of this PR, adjudicated** (all upheld, plus one miss). The base is the PR's
    `baseRefName`, diffed as `origin/<base>` after a fetch. "Review the PR head as it stands" follows the
    PR-number path. `author_association` comes from `gh api`, not `gh pr view`. Existing threads are
    read with `--paginate`, including `issues/<N>/comments`. A single **execution on/off** rule in step 2
    governs the repo's checks and scratch tests alike: on only when the code on disk is the code under
    review, including a clean tracked tree. The fork/non-member go-ahead covers both.
27. **Second peer review, adjudicated** (all three upheld). Execution has three states: **Off** (code on
    disk is not the code under review — nothing runs, no `Check:` line is offered), **Go-ahead** (fork
    or non-member author — each check runs only after the user greenlights it), **On**. The
    challenger is told "on" only for On. On a PR-number target every history command names the head
    SHA (`git log -S<text> origin/<base>..<sha>`, `git diff origin/<base>...<sha>`).
28. **Two execution states, not three** (supersedes the Go-ahead state in 24 and 27). A fork or
    non-member author is **Off**, like code not on disk: no check and no scratch test runs, whoever
    asks. On = current branch, `HEAD` = PR head, clean tracked tree, trusted author. `Check:` lines are
    offered only for costly checks while On.
29. **Third peer review** (supersedes "a dirty tree is ignored"). On the current branch, a PR whose
    `state` is not `OPEN` counts as no PR — `gh pr view` also returns merged and closed ones. A dirty
    tracked tree is reviewed as it stands, uncommitted lines included (`git diff HEAD`), and nothing
    goes to GitHub: kept findings go to Conductor comments, or the list is the deliverable.
30. **A greenlit check re-opens the keep-list gate.** After it runs, the lead shows the finding's new
    verdict and halts again for keep or drop on it, even if the first reply kept it. Posting waits
    until every finding has the user's decision.
31. **A dirty tree is a current-branch notion.** A PR-number target never has one, so uncommitted
    local work never blocks its pending review, reaches the challenger, or shows in the report.
32. **One run card, decided in step 2.** Step 2 detects tools, target, base, tree, head and trust in
    that order, then reads a card off one case table: Code from, Diff, Execution, Profile from,
    Threads from, Output. Steps 3–8 and the challenger read the card; none re-tests `gh`, the tree or
    the PR. The card is shown with the keep-list. Execution rules are unchanged (28, 29).
33. **Checked in step 2, not later.** `gh` usability (`gh repo view`) and Conductor's tools are
    detected first; a PR number without `gh` stops. A pending review of yours is found before the
    review starts, and halts it then (supersedes assumption C's timing); step 8 still halts if one
    appears in between.
34. **A PR-number target that is not `OPEN` stops**, with the reason: its diff against today's base is
    no longer the PR's.
35. **The profile is read from the card's Profile from**: the code's own source, except an untrusted
    (fork or non-member) PR, read against `origin/<base>` so it cannot rewrite its own review's rules.
    "Base branch and PR tool" leaves the profile for the card, so intent and existing threads are now
    profile lines 5 and 6 (supersedes decision 22's numbering).
36. **Fourth peer review** (both upheld). Trust is checked on every run, not only with an open PR: a
    current branch without one is looked up by `HEAD`'s SHA (`gh pr list --state all --search`), so a
    fork PR checked out with plain git, or a closed one, is still untrusted. Without `gh`, the lead
    asks whether the commits are the user's own or a trusted teammate's; unconfirmed is untrusted. An
    untrusted author changes every row of the case table. A branch behind its PR head is pulled, not
    pushed, before re-classifying.
37. **The run card is renamed the review setup, and shown as soon as it is decided.** Step 2 prints
    it, titled `Review setup`, without halting, so the user can steer while the review runs; a
    correction re-classifies from the target. Step 7 keeps only its Output line, as
    `Kept findings go to: …` next to the keep-list (supersedes decision 32's "shown with the
    keep-list").
38. **One gate, `ExitPlanMode`; one list** (supersedes 9, 11, 19 and 30). The keep-list halt and the
    summary table are gone. Step 7 writes a single report into the plan file: **Post** (verified
    findings), **Needs your call** (unverified, or awaiting a costly check) and **Dropped**. It ends
    with `Approved findings go to: …` (supersedes 37's `Kept findings go to`). Each
    finding's quoted issue and fix are the comment, posted word for word; `(review body)` sits in its
    headline. Approval posts **Post** only; feedback ("drop 1", "reword 2", "add 3", "run check 4")
    revises the plan and resubmits it. Conductor comments take the same gate; the list-only path just
    stops. After posting, **Needs your call** is repeated. "add N" then adds to the review this run
    created (GraphQL thread, or appended body) and never recreates it; any other pending review is
    still never touched.
39. **Fifth peer review** (all three upheld). "add N" reads the review's state first: while it is
    `PENDING` the finding is added to it; once the user has submitted it, editing it would publish
    the change, so a new pending review holds the finding and later adds go to that one. After
    posting, "run check N" only reports: a verified finding stays in **Needs your call** until the
    user replies "add N".

Assumptions (mine, not yours — object at approval):
- A. If plan mode blocks `DiffComment` (decision 19), report it and stop. No automatic fallback to
  ExitPlanMode.
- B. Each list item's issue line opens with `file:line`, because the headline format has no slot for it.
- C. If you already have a pending review on the PR (GitHub allows one), halt and ask you to submit or
  delete it. Don't merge into it.

## Project profile (this repo)

1. Units: one, the whole repo. 2–3. Checks/gate: `claude plugin validate .`;
   `node --check scripts/watch-agents.mjs`. No CI. 4. Base `main`, `gh`. 5. Hazards: none.
   6. Plans: `plans/`. 7. Mandates: the README Contents table lists every component; the plugin stays
   project-agnostic; `plugin.json` pins no `version`; every agent keeps `model: inherit` and pins only
   `effort`.

## Changes

### 1. New `skills/peer-review/SKILL.md`

Frontmatter: `name: peer-review`, description ("…Use when the user types /my-tech-team:peer-review"),
`disable-model-invocation: true`. Same pattern as `skills/code/SKILL.md`.

Sections, written in the house voice of `skills/code/SKILL.md`:

- **Role.** You are the review lead. You review, challenge, adjudicate and present. You never fix.
- **Non-negotiables.**
  1. Never edit code or commit. The only file you write is the plan file.
  2. Never submit a review: GitHub output is always pending (no `event`), never APPROVE or
     REQUEST_CHANGES.
  3. Post only what the user kept. On GitHub, exactly the approved table.
  4. Never walk through the keep-list gate alone.
- **1. Plan mode** (decision 2).
- **2. Resolve the target** (1, 14). Current branch: base from `origin/HEAD` (default `main`), then
  `gh pr view --json number,url,headRefOid,baseRefName,body`, then the HEAD-vs-PR-head check. PR#:
  `gh pr view N --json …`, `git fetch origin pull/N/head <base>` (FETCH_HEAD only, no branch or
  checkout). Diff = `git diff <merge-base>...<head>`. An empty diff → say so and stop. A dirty tree is
  ignored and mentioned, because uncommitted lines aren't in the PR.
- **3. Discover a reduced profile.** Adapted from `code` step 2, same source order, CI wins for
  checks. Keep only lines 1 (units), 2 (per-unit checks), 4 (base + PR tool), 5 (hazards, **plus which
  suites carry external cost**, for decision 4), and 7 (mandates). Also gather intent (decision 18)
  and existing threads (decision 15): `gh api repos/{o}/{r}/pulls/N/comments` and `.../reviews`, or
  `GetDiffComments` on the Conductor path.
- **4. First review.** Invoke `my-tech-team:karpathy-guidelines` ("the user's request" = the intent).
  Work the checklist and **bar for a finding** from `agents/code-reviewer.md`, copied and adapted:
  "plan" → intent; keep the repo-mandate carve-out; keep "do not spawn subagents to sweep", "do not
  invoke `code-review`", "do not call `ReportFindings`". Each finding gets `file:line`, a failure
  scenario, severity (5), likelihood (6) and a fix.
- **5. Challenge.** Spawn `my-tech-team:review-challenger` (name `review-challenger`), foreground,
  with the numbered findings, the target (base, head SHA, how to read files at head for a PR#), the
  profile, and the intent.
- **6. Adjudicate.** Take `code` step 10.3's evidence rules verbatim in spirit: a command beats
  reasoning, and when neither side ran the command that would settle it, run it yourself, within
  decision 4. The challenger's misses go through the same gate. When genuinely in doubt, **keep**
  (the user decides) and mark it unverified. Apply dedupe (15). A downgrade to Nit, a REJECT upheld,
  or a duplicate → Dropped.
- **7. Present and halt.** Numbered list, most severe first:
  ```
  #1 <title> — Major · Likely
  `file:line` — <issue/symptom, 1–2 lines>
  Fix: <1–2 lines>
  ```
  Then `Dropped:` one line each (`<title> — Nit/Rejected/Duplicate: <evidence>`). Then a single line
  naming where kept findings will go (pending PR review / Conductor comments / nowhere). **Stop** and
  wait for the keep-list.
- **8. Post.**
  - **PR + gh:** write the summary table into the plan file. Rows are `file:line` | issue + fix
    (decision 16); off-diff rows are marked `(review body)` (13). Call `ExitPlanMode`. On approval:
    `gh api -X POST repos/{o}/{r}/pulls/N/reviews` with `commit_id=<head>`, `body` = the off-diff
    rows, and `comments[]` = `{path, line, side}` (RIGHT for added/context lines, LEFT for deleted).
    Omit `event` so it stays pending. On a 422 "one pending review", apply assumption C. Hand back the
    review URL plus "submit it in GitHub when ready".
  - **No PR/gh, `DiffComment` present, current-branch target:** post the kept findings directly,
    plain text, issue + fix (19, A).
  - **Otherwise:** stop. The list was the deliverable.

### 2. `agents/review-challenger.md` — neutralize (decision 17)

- Line 8: "You are the last adversarial pass before fixes are applied and the PR opens" → "You are
  the last adversarial pass before the lead acts on the review".
- Line 41–43 ("the lead owns the working tree and every commit…") → keep read-only, and drop the
  commit clause: "you never change the working tree".
- Line 35–36, per-unit checks: add "and never a check the profile lists as carrying external cost
  (paid APIs, LLM calls, metered queries); if cost is unclear, don't run it". Harmless for `code`.
- For the PR# target, the lead's prompt tells it how to read files at head. No agent change needed.

### 3. `README.md`

- Contents row: `skills/peer-review` | `/my-tech-team:peer-review` | Review-only lead: review,
  challenge, adjudicate, you pick, pending PR review (plan mode).
- A short paragraph after the pipeline list: what peer-review is, and that it never fixes or submits.

### 4. `.claude-plugin/plugin.json`

Append a peer-review mention to `description`. Add `"peer-review"` to `keywords`. No `version`.

### 5. `plans/peer-review-2026-09-29.md`

This ledger + profile + plan, per the repo's convention.

## Verification

- Repo gate: `claude plugin validate .` and `node --check scripts/watch-agents.mjs`, both green.
- Load check: `claude --plugin-dir . --debug-file <f>`, then confirm `/my-tech-team:peer-review` is
  listed and `review-challenger` still loads (grep `<f>` for load errors).
- Dry run, outside plan mode: confirm it calls `EnterPlanMode` (or refuses when the tool is absent).
- Dry run on a real PR (`/my-tech-team:peer-review 3`) up to the numbered list. Check the headline
  format, the Dropped tail, and the halt. Then reject everything, so nothing is posted.
- Posting path, on a throwaway PR: keep one finding, approve the table, confirm a **pending** review
  with the inline comment on the right line, then delete it.
- `code`'s step 10 wording still reads correctly against the neutralized challenger.
