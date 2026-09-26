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

Nothing in the plugin is specific to one project. Everything repo-specific is read from the repo at
the start of each run, in this order: `CLAUDE.md` and its required reads, then the package manifests,
then the CI config, then defaults (`main`, `gh`). The gate is the exception: it is taken from CI first.
The more your `CLAUDE.md` states explicitly (workspaces, per-workspace check commands, which suites
cannot run concurrently, doc/version mandates), the better the discovery step does.

## Contents

| Component | Invoke as | Purpose |
|---|---|---|
| `skills/code` | `/my-tech-team:code` | The pipeline (tech-lead instructions) |
| `skills/grill-me` | `/my-tech-team:grill-me` | Interrogate a plan before running the pipeline |
| `agents/plan-challenger` | `my-tech-team:plan-challenger` | Attacks the plan (`xhigh` effort) |
| `agents/commons-owner` | `my-tech-team:commons-owner` | Lands large shared-package changes |
| `agents/implementer` | `my-tech-team:implementer` | Builds one unit's slice |
| `agents/code-reviewer` | `my-tech-team:code-reviewer` | Reviews the branch diff (`xhigh` effort) |
| `agents/review-challenger` | `my-tech-team:review-challenger` | Attacks the review |
| `scripts/watch-agents.mjs` | `node …/scripts/watch-agents.mjs` | Live view of a run's agent tree |

Every agent uses `model: inherit`, so it runs on the lead session's model. Only the effort level is
pinned per role.

## Install

This repository is both a marketplace and the plugin. It is private, so you need read access.

**For yourself, in every project:**

```
/plugin marketplace add cideck/my-tech-team
/plugin install my-tech-team@my-tech-team
```

**For everyone working in a repository**, commit this to that repo's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "my-tech-team": {
      "source": { "source": "github", "repo": "cideck/my-tech-team" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": { "my-tech-team@my-tech-team": true }
}
```

Repository-level marketplaces apply only after you accept the workspace trust dialog for that folder.

`plugin.json` pins no `version`, so the installed copy tracks commits. With `autoUpdate` on, new
commits arrive in the background, and you apply them with `/reload-plugins`.

## Develop

Load the working copy for one session, without installing:

```
claude --plugin-dir /path/to/my-tech-team
```

A `--plugin-dir` copy takes precedence over an installed plugin of the same name.

## Watch a run

From the root of the project the pipeline is working in:

```
node ~/.claude/plugins/marketplaces/my-tech-team/scripts/watch-agents.mjs
```

It is read-only. It tails the session transcripts under `~/.claude/projects/` and shows each agent
as working, quiet, or done.
