# my-tech-team

A Claude Code plugin that runs an **adversarial delivery pipeline** on any repository. The main
session acts as the tech lead and runs a team of specialist agents against the work:

1. **Discover** the project: ownership units, per-unit checks, the CI gate, base branch, hazards, and
   the repo's definition of done. The result is echoed to you next to your decisions.
2. **Challenge the plan** before any code is written. If the plan contradicts a decision you already
   made, the run halts until you decide.
3. **Implement**. Work fans out to one implementer per unit only when that buys real concurrency.
4. **Gate** on the repo's own CI suite, run locally.
5. **Review** the full branch diff, **challenge the review**, and adjudicate on command evidence.
6. **Open the PR** and hand back a "What's left for you" list. It never merges.

`/my-tech-team:peer-review` runs only the review half, in plan mode, on the current branch or a PR
number. The main session is the review lead: it reviews, has the review challenged, adjudicates on
evidence, and puts the verified findings up for one approval. Approved findings become a **pending** PR
review that you submit yourself; unverified ones wait for your call. It never fixes code and never submits a review.

Nothing in the plugin is specific to one project. Everything repo-specific is read from the repo at
the start of each run, in this order: `CLAUDE.md` and its required reads, then the package manifests,
then the CI config, then defaults (`main`, `gh`). The gate is the exception: it is taken from CI first.
The more your `CLAUDE.md` states explicitly (workspaces, per-workspace check commands, which suites
cannot run concurrently, doc/version mandates), the better the discovery step does.

## Contents

| Component | Invoke as | Purpose |
|---|---|---|
| `skills/code` | `/my-tech-team:code` | The pipeline (tech-lead instructions) |
| `skills/peer-review` | `/my-tech-team:peer-review [PR#]` | Review-only lead (plan mode): review, challenge, you approve, pending PR review |
| `skills/grill-me` | `/my-tech-team:grill-me` | Interrogate a plan before running the pipeline (preflight also runs it when a feature has no clear plan) |
| `skills/karpathy-guidelines` | `/my-tech-team:karpathy-guidelines` | Coding principles (MIT) the lead follows and the writing/reviewing agents preload |
| `agents/plan-challenger` | `my-tech-team:plan-challenger` | Attacks the plan (`xhigh` effort) |
| `agents/commons-owner` | `my-tech-team:commons-owner` | Lands large shared-package changes |
| `agents/implementer` | `my-tech-team:implementer` | Builds one unit's slice |
| `agents/code-reviewer` | `my-tech-team:code-reviewer` | Reviews the branch diff (`xhigh` effort) |
| `agents/review-challenger` | `my-tech-team:review-challenger` | Attacks the review |
| `scripts/watch-agents.mjs` | `node …/scripts/watch-agents.mjs` | Live view of a run's agent tree |

Every agent uses `model: inherit`, so it runs on the lead session's model. Only the effort level is
pinned per role.

## Install

This repository is both a marketplace and the plugin.

```
/plugin marketplace add madia-founders/my-tech-team
/plugin install my-tech-team@my-tech-team
```

The install asks for a scope: just you, or everyone working in the current repository.

**Auto-update**: Turn it on in `/plugin` → **Marketplaces** → **my-tech-team** → **Enable auto-update**.

## Watch a run

From the root of the project the pipeline is working in:

```
node ~/.claude/plugins/marketplaces/my-tech-team/scripts/watch-agents.mjs
```

It is read-only. It tails the session transcripts under `~/.claude/projects/` and shows each agent
as working, quiet, or done.

## License

MIT. See [LICENSE](LICENSE). `skills/karpathy-guidelines` is MIT-licensed by its own authors.
