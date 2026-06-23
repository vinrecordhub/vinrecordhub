# SEO + Ruflo Setup Report — VinRecordHub

**Date:** 2026-06-22 → 2026-06-23
**Branch:** `seo/ruflo-setup` (created off `main` @ `c221fb2` before any edits)
**Operator:** Claude Code (senior full-stack / SEO / Ruflo setup)

This report documents everything done in this session: system checks, Ruflo install + MCP
registration, repo analysis, the SEO topic plan, files created, the one issue encountered
(diagnosed), and the safe next steps. **No live marketing copy or app code was changed.**

---

## 1. System inspection
| Tool | Result |
|------|--------|
| Node.js | v24.14.0 ✅ |
| npm | 11.9.0 ✅ |
| Git | 2.39.5 ✅ |
| Claude Code | 2.1.185 ✅ (global at `/Users/mr63/.npm-global/bin/claude`) |
| Ruflo (pre-existing) | Not installed globally / not registered ❌ → now installed (npx) + MCP registered ✅ |
| Existing MCP servers | Google Drive ✅, Calendar/Gmail (need auth), Hugging Face (failed) |

## 2. Ruflo install & MCP registration
- **Package verified real:** `ruflo@3.12.4`, published 2026-06-18 by `ruvnet` (rebrand of `claude-flow`).
- **Install method:** ran via `npx -y ruflo@latest` (not installed globally — intentional, keeps the system clean).
  Used non-interactive **`ruflo init`** instead of `init wizard` (the wizard is interactive and
  would hang in an automated shell — documented deviation, same outcome).
- **`ruflo init` result:** 9 directories, **105 files** created inside the repo:
  - `.claude/` integration: **17 agents, 30 skills, 16 commands**, helpers, **7 hook types**.
  - `.claude-flow/` runtime: `config.yaml`, `data/`, `logs/`, `sessions/`.
  - `.mcp.json`: project-scoped MCP server entry named `claude-flow` (autostart off).
  - **Modified `.claude/settings.json`**: *additive only* — appended permissions + an `env`
    block. Original permissions, hooks, and `deny` rules (`Read(**/.env)`, `*.key`, …) preserved.
  - `CLAUDE.md`: **left untouched** (skipped — already existed).
- **MCP server added (as requested):** `claude mcp add ruflo -- npx -y ruflo@latest mcp start`
  → written to `~/.claude.json` (project-local scope). **Verified `ruflo: ✔ Connected`.**
- **`.gitignore`:** appended a marked section ignoring Ruflo **runtime state**
  (`.claude-flow/data|logs|sessions`, `.swarm/`, `.hive-mind/`) so runtime files aren't committed.

### Capability verification
`ruflo --help` + scaffold inspection + `ruflo doctor` (10 passed / 8 warnings / 1 failed — all
core green; warnings are optional extras). Confirmed available:

| Capability | Status |
|------------|:------:|
| Agent orchestration (17 agents) | ✅ |
| Swarm coordination (hierarchical/mesh/adaptive) | ✅ |
| Memory + RAG / vector (ONNX all-MiniLM-L6-v2, 384d) | ✅ |
| Docs / Browser / Testing | ✅ |
| Code analysis (`analyze`) + reviewers | ✅ |
| Security / Performance / Neural / Hive-mind | ✅ |
| **SEO (dedicated agent)** | ⚠️ none — SEO is driven manually via general agents + the plan |

Usage guide written: **`RUFLO_USAGE_FOR_VINRECORDHUB.md`**.

## 3. Repo analysis
Full findings in **`WEBSITE_UNDERSTANDING_REPORT.md`**. Summary:
- **Stack:** static HTML + Vercel serverless (`api/`), `lib/` logic, Supabase, undici. No build step, no framework, **no blog/content system**.
- **Flows:** Paddle webhook (+ legacy PayPal) → CheapVHR API (via Fixie proxy) → Resend email → Supabase orders; redemption codes; token-gated admin; **no customer auth**.
- **Conversion goal:** single VIN purchase on `/checkout`.
- **SEO baseline:** good homepage `<head>` + schema; but sitemap has only 3 URLs, only the homepage has structured data, and there is no content layer for long-tail/comparison intent.

### ⚠️ Key risk surfaced (not changed — for owner/legal)
The live site **overclaims a Carfax/AutoCheck relationship** ("real Carfax®… same data", offers
named "Carfax® Report", a 1 MB `sample-report.html` reproducing a CARFAX-branded report). This
conflicts with the project's own brand rules. The SEO plan is built on **trademark-safe
"alternative / affordable" positioning** instead, and recommends the owner/legal review the
existing copy. See `WEBSITE_UNDERSTANDING_REPORT.md` §8.

## 4. SEO deliverables
- **`seo/SEO_TOPIC_PLAN.md`** — 20 topics (fields A–O each), keyword clusters, prioritized
  Tier 1/2/3 roadmap, and content strategy (hub-and-spoke).
- **`seo/SEO_KEYWORD_MAP.csv`** — 20 rows: number, title, primary/secondary keywords, intent,
  page type, slug, tier, difficulty, conversion value.
- **`seo/SEO_IMPLEMENTATION_CHECKLIST.md`** — technical + on-page fixes, content order,
  internal-linking plan, schema, sitemap/robots, analytics/Search Console, and a recommended
  blog/content folder structure.

### Top 5 to build first (Tier 1 lead)
1. `/carfax-alternative` 2. `/cheaper-than-carfax` 3. `/cheap-vehicle-history-report`
4. `/vin-check` 5. `/affordable-vehicle-history-report`

## 5. Blog/content audit
The site has **no content/blog system today**. Because it's static HTML on Vercel, the cleanest
addition is a flat `/guides/` (or `/blog/`) folder rendered from **one reusable template**
(shared header/footer + VIN CTA + per-page `<head>`/schema slots), with routes via `cleanUrls`
and sitemap updates per page. **No content pages were created — awaiting approval** (per the brief).

## 6. Issue encountered & diagnosis
**Symptom:** git-touching commands print
`Error: claude native binary not installed … node_modules/@anthropic-ai/claude-code/install.cjs`.

**Diagnosis:** Not a failure of the underlying command — files and git state are intact
(`git -c core.fsmonitor= status` and `ls` confirm all deliverables present). The message comes
from **Ruflo's self-learning hooks** (`CLAUDE_FLOW_HOOKS_ENABLED=true`, added to
`.claude/settings.json`) shelling out to a `claude-flow`/`claude-code` binary whose **native
build isn't present in the npx cache**, so it errors to stderr and that stderr is prepended to
tool output. The global `claude` CLI itself works (it performed the MCP registration).

**Impact:** Cosmetic only. No data loss, no corrupted commands.

**Fixes (pick one, optional):**
- Disable Ruflo hooks if the noise is unwanted: remove the `hooks` additions / set
  `CLAUDE_FLOW_HOOKS_ENABLED=false`, or `git checkout .claude/settings.json` to restore the original.
- Or complete the bundled binary: `node <npx-cache>/.../@anthropic-ai/claude-code/install.cjs`
  (re-run after a clean `npx ruflo@latest` fetch without `--ignore-scripts`/`--omit=optional`).

## 7. Git state (nothing committed)
On branch `seo/ruflo-setup`. **No commits made** (per "ask before destructive / no auto-commit"):
- **New (untracked):** `RUFLO_USAGE_FOR_VINRECORDHUB.md`, `WEBSITE_UNDERSTANDING_REPORT.md`,
  `SEO_RUFLO_SETUP_REPORT.md`, `seo/` (3 files), Ruflo's `.claude-flow/`, `.mcp.json`,
  and new `.claude/agents|skills|commands|helpers`.
- **Modified:** `.gitignore` (runtime-ignore section), `.claude/settings.json` (Ruflo additive),
  and the **pre-existing** `lib/report-service.js` change (was already modified before I started — untouched by me).

## 8. Warnings & risks
1. **Trademark (highest):** existing "real Carfax / same data" copy + branded sample report —
   needs owner/legal review before scaling SEO. Plan avoids it entirely.
2. **Ruflo footprint:** 105 files + settings/`.gitignore` edits now in the working tree. Review
   before committing; decide whether Ruflo's `.claude/*` artifacts belong in the repo.
3. **Ruflo hook noise:** see §6 — harmless but fixable.
4. **MCP `claude-flow` (project) shows "pending approval"** — approve in the `claude` TUI if you
   want the project-scoped server in addition to the `ruflo` one already connected.

## 9. Recommended next commands
```bash
cd ~/Documents/vinrecordhub
git status                                   # review everything on the seo/ruflo-setup branch

# (optional) silence Ruflo hook noise:
git checkout .claude/settings.json           # restore original Claude Code settings
# or keep them and fix the bundled binary per §6

# When ready to keep the docs (review first — Ruflo added 105 files):
git add SEO_RUFLO_SETUP_REPORT.md WEBSITE_UNDERSTANDING_REPORT.md \
        RUFLO_USAGE_FOR_VINRECORDHUB.md seo/ .gitignore
git commit -m "Add SEO topic plan, website analysis, and Ruflo setup docs"

# Verify Ruflo any time:
npx -y ruflo@latest doctor
claude mcp list                              # expect: ruflo  ✔ Connected
```
> Decide separately whether to commit Ruflo's `.claude-flow/`, `.mcp.json`, and `.claude/*`
> scaffolding — these are tooling, not website content.
