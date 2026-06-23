# Ruflo Usage Guide — VinRecordHub

Short, practical guide for using **Ruflo** (`ruflo@3.12.4`, the rebrand of `claude-flow`,
by `ruvnet`) on this repo. Written during the SEO/Ruflo setup on 2026-06-22.

---

## 1. What got installed

| Item | Location | Notes |
|------|----------|-------|
| Ruflo CLI | run via `npx -y ruflo@latest <cmd>` | Not installed globally (intentional) |
| Claude Code MCP server `ruflo` | `~/.claude.json` (project-local scope) | Status: **Connected** |
| Project MCP entry `claude-flow` | `.mcp.json` (committed) | Auto-added by `ruflo init`; needs in-app approval |
| Runtime config/state | `.claude-flow/` | Logs/sessions/data are **git-ignored** |
| Claude Code integration | `.claude/` | 17 agents, 30 skills, 16 commands, helpers, 7 hook types |

> `ruflo init` **appended** to the existing `.claude/settings.json` (permissions + an `env`
> block). It did **not** remove your original permissions, hooks, or `deny` rules. Your
> repo `CLAUDE.md` was left untouched.

### First-run downloads
The first `ruflo` command downloads an ONNX embedding model (`all-MiniLM-L6-v2`, ~23 MB,
384-dim) used for vector memory / semantic search. After that it is disk-cached.

---

## 2. Everyday commands

```bash
# Health + status
npx -y ruflo@latest doctor          # diagnostics / health check
npx -y ruflo@latest status          # system status

# Agents & swarms
npx -y ruflo@latest agent           # agent management
npx -y ruflo@latest swarm           # swarm coordination
npx -y ruflo@latest hive-mind       # queen-led consensus multi-agent

# Memory & retrieval (RAG)
npx -y ruflo@latest memory          # memory management (init/store/query)
npx -y ruflo@latest embeddings      # vector embeddings / semantic search

# Code & repo analysis
npx -y ruflo@latest analyze         # code analysis, change-risk, graph boundaries
npx -y ruflo@latest security        # security scan / CVE / threat model
npx -y ruflo@latest performance     # profiling / benchmarking

# Tasks & workflow
npx -y ruflo@latest task
npx -y ruflo@latest workflow
npx -y ruflo@latest autopilot       # keep a swarm running until all tasks complete
```

Optional one-time bootstrap (creates memory DB + a swarm + background daemon):

```bash
npx -y ruflo@latest init --start-all
# or individually:
npx -y ruflo@latest memory init
npx -y ruflo@latest swarm init
npx -y ruflo@latest daemon start
```

---

## 3. Capability check (verified 2026-06-22)

| Capability | Available? | How it shows up here |
|------------|:---------:|----------------------|
| Agent orchestration | ✅ | 17 agents in `.claude/agents/` (planner, reviewers, sparc, swarm, testing) |
| Swarm coordination | ✅ | `swarm/` hierarchical, mesh, adaptive coordinators |
| Memory | ✅ | `ruflo memory`, hybrid backend |
| RAG / vector search | ✅ | ONNX embeddings (384d) + `embeddings` cmd; AgentDB vector-search skills |
| Docs | ✅ | doc-generation skills/agents |
| Browser / testing | ✅ | `browser` skill + `testing/` agents (production-validator, tdd-london) |
| Code analysis | ✅ | `analyze` cmd + reviewer agents |
| **SEO** | ⚠️ partial | **No dedicated SEO agent.** Do SEO with the general/planner agents + memory/RAG, guided by `seo/SEO_TOPIC_PLAN.md` |

---

## 4. Recommended workflow for the SEO project on this repo

This repo is **static HTML + Vercel serverless** (no framework, no build step). Ruflo is
useful here as an *orchestration + memory layer*, not a page generator. Suggested loop:

1. **Load context into memory** so agents share an understanding of the site:
   ```bash
   npx -y ruflo@latest memory store --key site/understanding --file WEBSITE_UNDERSTANDING_REPORT.md
   npx -y ruflo@latest memory store --key seo/plan --file seo/SEO_TOPIC_PLAN.md
   ```
   *(Flag names can vary by version — run `ruflo memory --help` to confirm.)*
2. **Draft a content page** with an agent, using a Tier-1 topic from the plan as the brief.
3. **Review** the draft with `code-reviewer` / `security-reviewer` agents (checks the
   trademark-safe wording rules below) before it ships.
4. **Analyze** before deploy: `ruflo analyze` for change-risk on touched files.

---

## 5. Guardrails (must-follow for this brand)

When using any Ruflo agent to write marketing/content copy for VinRecordHub:

- ❌ Do **not** claim VinRecordHub *is* Carfax/AutoCheck or an official partner/reseller.
- ❌ Do **not** say "real Carfax reports" / "same data" as a guarantee.
- ✅ Use: "Carfax **alternative**", "affordable vehicle history report", "cheaper report
  option", "compare your options".
- 🔒 Never let an agent print/commit secrets. `deny` rules already block `.env`, `*.key`,
  `*.pem`. Keep them.

See `WEBSITE_UNDERSTANDING_REPORT.md` §"Trademark risk" for the full rationale.

---

## 6. Removing Ruflo (clean rollback)

```bash
claude mcp remove ruflo                       # unregister MCP server
rm -rf .claude-flow .mcp.json                 # runtime + project MCP
git checkout .claude/settings.json            # restore original settings
# then review/delete the ruflo-added .claude/agents|skills|commands|helpers if unwanted
```
