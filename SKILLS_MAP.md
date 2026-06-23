# VinRecordHub — Skills Map & Ruflo Assignment

How the **217 installed skills** in `.claude/skills/` are grouped into task domains and wired
to work **with Ruflo and Claude Code interchangeably**. Generated 2026-06-23.

## How skills, Ruflo, and Claude Code work together

- **Skills** are auto-triggering instruction modules (`.claude/skills/<name>/SKILL.md`). Claude
  Code loads a skill automatically when a request matches its `description`. They are not code
  that runs on its own — they steer whichever agent is working.
- **Ruflo agents** (`.claude/agents/` — planner, frontend-designer, reviewers, sparc/*, swarm/*,
  testing/*) and the **amg agents** (`.claude/agents/amg/` — architect, backend, frontend, qa,
  reviewer, gitkeeper) both run inside this same `.claude/` context — so **any agent can use any
  skill**. This map assigns *primary ownership* so work routes cleanly.
- **Interchangeable invocation** — three equivalent ways to apply a skill:
  1. **Directly (Claude Code):** just describe the task; the matching skill auto-loads.
  2. **Via Ruflo agent:** `npx -y ruflo@latest agent run <agent> "<task>"` — the agent inherits
     the same skills.
  3. **Via Ruflo swarm:** `npx -y ruflo@latest swarm "<goal>"` — the coordinator routes subtasks
     to the agents below, each carrying its domain skills.

---

## Task domains → skills → agents

### 1. Design & UI Polish
- **Skills:** `refactoring-ui`, `high-end-visual-design`, `modern-web-design`, `minimalist-ui`,
  `industrial-brutalist-ui`, `web-typography`, `top-design`, `steve-jobs-design-review`,
  `design-taste-frontend`, `stitch-design-taste`, `ios-hig-design`, `design-everyday-things`
- **Ruflo agent:** `frontend-designer` · **amg agent:** `frontend` · **Review:** `reviewer`
- **Use for:** visual hierarchy, spacing/type scales, polishing pages before launch.

### 2. 3D & Motion
- **Skills:** `gsap-scrolltrigger`, `threejs-webgl`, `react-three-fiber`, `lightweight-3d-effects`,
  `web3d-integration-patterns`, `aframe-webxr`, `lottie-animations`, `motion-framer`,
  `locomotive-scroll`, `scroll-reveal-libraries`, `animated-component-libraries`,
  `blender-web-pipeline`, `substance-3d-texturing`
- **Ruflo agent:** `frontend-designer` · **amg agent:** `frontend`
- **Use for:** the blog/homepage 3D hero, scroll-reveal animations, future scroll-telling.
  *(Already applied: `blog/blog-3d.js` + `blog/blog-anim.js`.)*

### 3. Frontend Build
- **Skills:** `design-taste-frontend`, `imagegen-frontend-web`, `imagegen-frontend-mobile`,
  `animated-component-libraries`, `web-typography`
- **Ruflo agent:** `frontend-designer` + `sparc/architecture` · **amg agent:** `frontend` + `backend`
- **Use for:** building new components/pages (e.g., the blog template), wiring UI to the `api/`.

### 4. UX & Conversion (CRO)
- **Skills:** `ux-heuristics`, `oiloil-ui-ux-guide`, `hooked-ux`, `lean-ux`, `jobs-to-be-done`,
  `mom-test`, `design-sprint`, plus the `wondelai/*` UX/marketing/CRO set
- **Ruflo agent:** `core/planner` · **amg agent:** `architect` / `frontend`
- **Use for:** improving the VIN-purchase funnel, landing-page copy, comparison pages.

### 5. Testing & QA
- **Skills:** `webapp-testing` (Playwright), `test-driven-development`, `tdd`, `test-writer`,
  `mutation-testing`, `property-based-testing`, `testing-handbook-generator`
- **Ruflo agent:** `testing/production-validator`, `testing/tdd-london-swarm` · **amg agent:** `qa`
- **Use for:** validating the checkout/report/webhook flows and any new pages.

### 6. Debugging
- **Skills:** `systematic-debugging`, `debug-fix`, `debug-buttercup`
- **Ruflo agent:** `code-reviewer` · **amg agent:** `qa` / `reviewer`
- **Use for:** any bug, test failure, or unexpected behavior — before proposing fixes.

### 7. Security & Secrets
- **Skills:** `owasp-security`, `varlock` (secrets), `secure-workflow-guide`, `insecure-defaults`,
  `supply-chain-risk-auditor`, `semgrep` / `semgrep-rule-creator`, `audit-prep-assistant`,
  (The Trail of Bits blockchain/crypto scanners — `solana-`/`cairo-`/`cosmos-`/`ton-`/
  `substrate-`/`algorand-vulnerability-scanner`, `token-integration-analyzer`, `zeroize-audit`,
  `constant-time-*` — were **pruned** as irrelevant to a static vehicle-history site.)
- **Ruflo agent:** `security-reviewer` · **amg agent:** `reviewer`
- **Use for:** protecting the Paddle/Supabase/CheapVHR keys, webhook signature handling, CSP,
  pre-deploy audits. **`varlock` directly supports the project rule of never exposing secrets.**

### 8. Workflow & Meta
- **Skills:** `brainstorming`, `system-design`, `design-sprint`, `using-git-worktrees`,
  `finishing-a-development-branch`, `gh-cli`, `guidelines-advisor`, `second-opinion`, `skill-builder`
- **Ruflo agent:** `core/planner` + `swarm/*` coordinators · **amg agent:** `gitkeeper`
- **Use for:** planning multi-step work, safe git, second-opinion reviews, authoring new skills.

---

## Recommended Ruflo recipes for this repo

```bash
# Design pass on the blog posts (uses domains 1 + 2)
npx -y ruflo@latest agent run frontend-designer "Polish blog/*.html per refactoring-ui and high-end-visual-design"

# Build a new SEO landing page (domains 3 + 4)
npx -y ruflo@latest swarm "Create /carfax-alternative landing page using the blog template and ux-heuristics"

# Pre-deploy security + QA gate (domains 5 + 7)
npx -y ruflo@latest agent run security-reviewer "Audit api/ and CSP with owasp-security and varlock"
npx -y ruflo@latest agent run testing/production-validator "Smoke-test checkout + redeem with webapp-testing"
```

> **Note on volume:** the 10 Trail of Bits blockchain/crypto skills were pruned (217 → 207).
> Some Ruflo `v3-*` framework internals remain (left intact — they belong to Ruflo's own runtime).
> The design/3D/UX/security/testing groups above are the relevant working set.
