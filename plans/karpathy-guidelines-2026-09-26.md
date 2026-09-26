# Karpathy guidelines in the my-tech-team pipeline

## Context

The plugin had parts of Karpathy's four coding principles spread across `agents/plan-challenger.md`
and `agents/implementer.md`. The lead (which often writes the code itself), `commons-owner` and
`code-reviewer` had none. This change imports the user's existing `karpathy-guidelines` skill as the
single source, wires it into the lead and the agents that write or judge code, and has preflight
run `grill-me` when a feature is clear but its plan is not.

## Decisions ledger

1. Import `monrovia-v2/.claude/skills/karpathy-guidelines/SKILL.md` into this plugin verbatim.
2. Scope: Karpathy guidelines only — no change to PR-description guidance.
3. Preflight split: nothing to build → ask; a feature but no clear plan → the lead invokes
   `my-tech-team:grill-me` before step 2.
4. Skip test: if the lead can write the ledger and a plan without inventing a user-owned decision,
   skip grill-me.
5. `skills/grill-me/SKILL.md` stays unchanged — no exit/hand-off section.
6. The approved plan (this file, as settled after the plan challenge) is the plan to execute.

## Project profile

1. **Ownership units.** One unit — the whole repo (no workspaces or manifests). The lead writes all of it.
2. **Per-unit checks.** `claude plugin validate .`; `node --check scripts/watch-agents.mjs`. No lint,
   typecheck or tests exist.
3. **Repo gate.** The same two commands, serial. No CI config exists (default).
4. **Base branch and PR tool.** `main` (from `origin/HEAD`); `gh`, authenticated, GitHub remote.
5. **Hazards.** None; no lockfile.
6. **Plans location.** `plans/` (default).
7. **Definition of done and review mandates** (from `README.md`):
   - The README Contents table lists every component.
   - The plugin stays project-agnostic.
   - `plugin.json` pins no `version`.
   - Every agent keeps `model: inherit` and pins only `effort`.

## Plan

1. **Import** `skills/karpathy-guidelines/SKILL.md` byte-for-byte (MIT, attribution intact), model-invocable.
2. **Preload** it with `skills: [my-tech-team:karpathy-guidelines]` (plugin-qualified — the bare name
   can resolve to a repo's own copy first) in `implementer`, `commons-owner`, `plan-challenger`,
   `code-reviewer`. Not `review-challenger`.
3. **One mapping line per role**:
   - Writers (implementer, commons-owner): "the user's request" is the plan file. Halt to the lead
     only when the plan does not answer a question that changes what you build; otherwise take the
     simpler reading and list it as an assumption. Never ask the user directly.
   - plan-challenger: the request is the user's request plus the ledger; the plan is what you judge
     against it; "ask" / "present interpretations" means raise an objection.
   - code-reviewer: the request is the plan file; the skill is the standard you judge the diff by —
     you do not edit files or write tests.
4. **Role hooks**:
   - implementer: "Stay in scope" points at the skill; report lists every assumption.
   - commons-owner: "the whole contract the plan names, and nothing beyond it"; report lists every assumption.
   - code-reviewer: no new bullet (it would clash with the bar for a finding). Extend "Conformance to
     the plan" with changed lines that trace to nothing in the plan; extend "Reuse, simplification"
     with unrequested options/configurability and single-caller abstractions.
   - plan-challenger: an "unstated assumptions" check; flag when the silently picked reading is user-owned.
5. **Lead (`skills/code/SKILL.md`)**:
   - Step 1: repo stops first, then the grill-me split with the skip test; answers feed the step 3 ledger.
   - Step 5, gate 1: an objection that the plan settles a user-owned question the ledger leaves open
     halts like a disagreement, even when the lead agrees.
   - Step 7 opens with: invoke `my-tech-team:karpathy-guidelines` before writing any code yourself
     this run (step 7, step 8, or a step 10 fix).
   - `## The team`: note that four agents preload the skill.
6. **README**: add a Contents row `/my-tech-team:karpathy-guidelines`; note on the grill-me row that
   preflight also runs it.

## Verification

- `diff` source vs imported skill: identical.
- Repo gate: `claude plugin validate .` and `node --check scripts/watch-agents.mjs`.
- Spawn a writer and a judge agent under `claude --plugin-dir . --debug-file <f>`; grep `<f>` for
  `Preloaded skill 'my-tech-team:karpathy-guidelines'` per agent type, and for the absence of
  `specified in frontmatter was not found`.
