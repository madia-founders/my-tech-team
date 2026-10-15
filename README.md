# my-tech-team

**Align first, then delegate.** A Claude Code plugin that takes you from a fuzzy idea to a reviewed
PR with a tech team inside Claude Code.

LLM coding goes wrong in two places:

- **Before the code: misalignment.** The model fills the gaps with its own assumptions and never
  asks. You get the right code for the wrong feature, an architecture you didn't choose, and an
  endless review-redo loop.
- **During the code: self-validation.** The same agent writes, tests and reviews its own work, so its
  blind spots become yours. You get bugs that reach the PR, overengineered code, and the false
  confidence of "all tests pass".

`/my-tech-team:grill-me` fixes the first. `/my-tech-team:code` fixes the second.

## Install

This repository is both a marketplace and the plugin.

```
/plugin marketplace add madia-founders/my-tech-team
/plugin install my-tech-team@my-tech-team
```

The install asks for a scope: just you, or everyone working in the current repository.
To auto-update: `/plugin` → **Marketplaces** → **my-tech-team** → **Enable auto-update**.

## How to use

```
/my-tech-team:grill-me
/my-tech-team:code
```

Use it for features with real decisions in them, changes across several packages, anything you'd
want a second pair of eyes on. Skip it for one-line fixes: both skills run longer and use more tokens.

Nothing in the plugin is specific to one project. Everything repo-specific is read from the repo at
the start of each run (`CLAUDE.md` and the files it requires, package manifests, CI config). The more
your `CLAUDE.md` states explicitly, the better it works.

### 1. `/my-tech-team:grill-me`: align

Describe what you want, then get interviewed. The whole skill, word for word:

> Read the relevant docs and code first. Read the repo's `CLAUDE.md` and every file it requires you
> to read for the touched area. Never ask from ignorance — every question must be informed by what
> the code and docs actually say today.
>
> Interview me relentlessly about every aspect of this plan until we reach a shared understanding.
> Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

It surfaces your unspoken constraints, expected output and real outcome, plus the bugs and edge
cases you never mentioned. You end with a detailed plan built on your numbered decisions (D1, D2,
D3…): the feature you meant, the architecture you chose. In one real session, a 25-word request
became 30 questions and a 3,540-word plan. Because the code follows the plan, there is far less to
review, fix and redo.

### 2. `/my-tech-team:code`: delegate

The main session becomes the tech lead and runs five specialist agents against your plan. Every
artifact is attacked by a second agent in a fresh context before it is trusted.

| Agent | Effort | Job |
|---|---|---|
| `plan-challenger` | xhigh | Attacks the plan before any code exists |
| `commons-owner` | high | Lands shared packages and contracts first |
| `implementer` | high | Builds one unit's slice, one folder only |
| `code-reviewer` | xhigh | Reviews the whole branch diff |
| `review-challenger` | high | Attacks the review itself |

1. **Challenge the plan.** The plan-challenger checks the plan against the code. Objections
   compatible with your decisions are adopted; anything that is yours to decide stops the run and
   comes back to you as a question.
2. **Implement.** Shared packages land first, then one implementer per package, in parallel only
   when it helps.
3. **Gate.** The repo's own CI suite, run locally. Red halts the run; it never pushes on red.
4. **Review, challenge, adjudicate.** The code-reviewer reviews, the review-challenger hunts false
   positives, wrong fixes and missed bugs, and the lead decides on evidence. Fixes are re-verified.
5. **Open the PR**, ready for review, with a **"What's left for you"** list: the merge, local files
   not to commit, known bugs left out of scope, trade-offs you accepted.

Guardrails: it **never merges**, not when CI is green, not when asked mid-run, not when it looks
trivial. Every agent that writes or reviews code follows the
[Karpathy guidelines](skills/karpathy-guidelines/SKILL.md): think before coding, simplicity first,
surgical changes, goal-driven execution. If no clear plan exists, `code` runs `grill-me` first.

### Work in progress: `/my-tech-team:peer-review [PR#]`

The review half of `code` on its own, for the current branch or a PR. It reviews, has the review
challenged, and puts the verified findings up for your approval. Approved findings become a
**pending** PR review that you submit yourself. It never fixes code.

## Watch a run

From the root of the project the pipeline is working in:

```
node ~/.claude/plugins/marketplaces/my-tech-team/scripts/watch-agents.mjs
```

It is read-only. It tails the session transcripts under `~/.claude/projects/` and shows each agent as
working, quiet, or done.

## License

MIT. See [LICENSE](LICENSE). `skills/karpathy-guidelines` is MIT-licensed by its own authors.
