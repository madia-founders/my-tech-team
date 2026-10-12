# my-tech-team

A Claude Code plugin. See `README.md` for what it does and how it is laid out.

## The repo is public and read-only to outsiders

Everything committed here, including the PR descriptions, is public. Keep it that way:

- **No internal names.** Don't name other repos, companies, clients, or how their deploys work,
  in files, plans, commit messages, or PR descriptions. Write "another repo" instead.
- **The plugin stays project-agnostic.** Anything repo-specific is read from the target repo at run
  time, never written into the plugin.

Outsiders get read access only. These GitHub settings enforce it and must not drift:

| Setting | Value |
|---|---|
| Write access | `cideck` only. Other collaborators have `read`. |
| Issues, Projects, Wiki, Discussions | Off |
| `pull_request_creation_policy` | `collaborators_only` |
| Interaction limit | `collaborators_only` |
| PRs #1–8 | Locked |

Check them with:

```
gh api repos/madia-founders/my-tech-team --jq '{has_issues,has_projects,has_wiki,has_discussions,pull_request_creation_policy}'
gh api repos/madia-founders/my-tech-team/interaction-limits
gh api repos/madia-founders/my-tech-team/collaborators --jq '.[]|"\(.login) \(.role_name)"'
```

## Renew the interaction limit

GitHub caps the interaction limit at six months. The current limit **expires on 2027-04-12**. Once
it lapses, anyone can comment and open PRs again. If today is 2027-03-29 or later, tell the user
before doing anything else, then renew it and update the date above:

```
gh api -X PUT repos/madia-founders/my-tech-team/interaction-limits -f limit=collaborators_only -f expiry=six_months
```
