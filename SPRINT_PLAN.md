# Blue Steel — Sprint Plan

Evidence-based plan to port [Magnitude](../magnitude/) into **Blue Steel**: a vision browser agent driven by a **new Camoufox agent skill** (not modifications to the existing `cloverlabs-camoufox` skill).

**Constraints (confirmed)**
- Do **not** modify `/home/bitnom/.agents/skills/cloverlabs-camoufox`.
- Ship a **new agent skill** that owns Blue Steel’s Camoufox controller + agent workflow.
- Develop under `./blue-steel`.
- No calendar dates or time estimates in this plan.

---

## 1. Evidence base

### 1.1 Magnitude architecture (source)

| Surface | Path | Role |
|--------|------|------|
| Monorepo root | `magnitude/package.json` | Turbo workspaces: `packages/*` |
| Core agent | `magnitude/packages/magnitude-core` | Vision loop, actions, connectors, memory |
| Browser launch | `…/src/web/browserProvider.ts` | Playwright/patchright `chromium.launch` / CDP / context reuse |
| Connector | `…/src/connectors/browserConnector.ts` | Starts context → `WebHarness`, screenshots + tab observations |
| Action executor | `…/src/web/harness.ts` | Pixel click/drag/scroll/type/tabs/nav on Playwright `Page` |
| Action space | `…/src/actions/webActions.ts` | `mouse:*`, `keyboard:*`, `browser:tab:*`, `browser:nav*` |
| Tabs / stability / visuals | `…/src/web/{tabs,stability,visualizer,transformer}.ts` | Playwright event listeners, network idle, cursor overlay |
| Agent API | `…/src/agent/browserAgent.ts` | `startBrowserAgent`, `act` / `extract` / `nav` |
| Test runner | `magnitude/packages/magnitude-test` | Discovery, worker, CLI |
| MCP | `magnitude/packages/magnitude-mcp` | Patchright-based MCP browser server |
| Scaffold | `magnitude/packages/create-magnitude-app` | Project generator |
| Extract | `magnitude/packages/magnitude-extract` | DOM → structured content (mostly browser-agnostic) |

**Critical coupling:** Magnitude is **vision-first and coordinate-driven**. The LLM returns pixel coordinates; `WebHarness` executes them via Playwright mouse/keyboard APIs (`page.mouse.click`, `page.keyboard.type`, etc.). Playwright types (`Page`, `BrowserContext`, `Browser`) appear throughout core, test, and MCP packages.

**Default Magnitude web actions (must remain implementable):**
- `mouse:click`, `mouse:double_click`, `mouse:right_click`, `mouse:drag`, `mouse:scroll`
- `keyboard:type`, `keyboard:enter`, `keyboard:tab`, `keyboard:backspace`, `keyboard:select_all`
- `browser:tab:switch`, `browser:tab:new`, `browser:nav`, `browser:nav:back`
- `wait`

### 1.2 Existing Camoufox skill (reference only — do not edit)

| Surface | Path | Role |
|--------|------|------|
| Skill docs | `~/.agents/skills/cloverlabs-camoufox/SKILL.md` | Operating rules, JSON-lines protocol |
| Interactive controller | `…/scripts/interactive_camoufox.py` | stdin JSON ops → Selenium/GeckoDriver |
| Browser + containers | `…/scripts/camoufox_containers.py` | Profile, containers, proxy, CF Turnstile, extensions |
| Runtime pins | bootstrap | `cloverlabs-camoufox==0.6.0`, `playwright==1.51.0`, `selenium>=4.45,<5` |

**Existing interactive ops (selector/DOM oriented):**  
`open`, `navigate`, `click` (CSS/xpath), `type` (selector), `eval`, `find`, `html`, `screenshot` (file path), `status`, `switch`, containers/tabs/proxy/accounts, `cf_status` / `cf_click` / `cf_solve`, extensions, `quit`.

**Gaps vs Magnitude (must be closed in the *new* skill):**
1. **No coordinate mouse API** — no `mouse_click(x,y)`, move, down/up, drag, wheel at pixel position.
2. **No raw keyboard API** without a focused element selector — Magnitude types after coord-click focus.
3. **Screenshot returns path only** — Magnitude needs in-memory PNG bytes + DPR-aware rescale for grounding.
4. **Playwright-only lifecycle assumptions** — context/page events, CDP device metrics, visualizer injection.
5. **Protocol transport** — skill expects a long-lived PTY process + JSON-lines; Magnitude expects in-process Playwright objects.

**Assets to reuse by copy/fork (not in-place edit):** Camoufox launch + fingerprint env, privileged bridge extension pattern, container/proxy/account helpers, closed-shadow Turnstile solve path, profile layout under `~/.camoufox/profiles/`.

### 1.3 Target layout

```text
blue-steel/                          # product monorepo (this repo)
  SPRINT_PLAN.md                     # this document
  packages/
    blue-steel-core/                 # forked magnitude-core
    blue-steel-test/                 # forked magnitude-test (later)
    blue-steel-extract/              # forked or depended extract
    blue-steel-mcp/                  # Camoufox-backed MCP (later)
    create-blue-steel-app/           # scaffold (later)
  …                                  # turbo/workspace config

~/.agents/skills/blue-steel/         # NEW agent skill (separate from product code)
  SKILL.md
  scripts/                           # forked/adapted Camoufox controller
  …                                  # bootstrap, venv, extension bridge
```

Product code lives in `./blue-steel`. The agent skill is installed under the user’s skills root and is the **only** supported browser runtime for Blue Steel agent operation.

---

## 2. Goals and non-goals

### Goals
1. **Blue Steel** = Magnitude-class vision agent + Camoufox stealth/containers/proxy/CF tooling.
2. New **`blue-steel` agent skill** owns browser process lifecycle and extended JSON-lines protocol.
3. Coordinate-accurate click/type/scroll/drag matching Magnitude’s action semantics.
4. Preserve high-level API shape where practical: `startBrowserAgent` → `act` / `extract` / `nav`.
5. Opt-in Camoufox superpowers: containers, account isolation, container proxy, Turnstile solve.
6. Zero required changes to `cloverlabs-camoufox`.

### Non-goals (initial releases)
- Keeping Playwright/patchright as a supported primary backend (optional later if needed).
- Desktop connector parity (`desktopConnector`) unless explicitly prioritized later.
- Perfect 1:1 visualizer/cursor overlays on first vertical slice.
- Publishing to npm under Magnitude’s org or reusing their telemetry endpoints without review.
- Editing the existing Camoufox skill “in place” and depending on it at runtime.

---

## 3. Architecture decisions

### AD-1 — Fork controller into new skill (not wrap-only)
**Decision:** Copy/adapt controller scripts into `~/.agents/skills/blue-steel` (or skill path chosen at install time).  
**Why:** Magnitude needs coordinate I/O and binary screenshot flows the existing skill does not expose; we cannot modify that skill.  
**Implication:** Drift risk vs upstream Camoufox skill — document upstream version pin and a periodic reconcile checklist.

### AD-2 — Browser backend interface inside core
**Decision:** Introduce a narrow `BrowserBackend` / harness interface in `blue-steel-core` so agent, memory, and actions do not import Selenium or Playwright types.  
**Why:** Magnitude’s Playwright types leak into connector, harness, tabs, visualizer, MCP, and tests.  
**Minimum interface (evidence-driven from `WebHarness` + `webActions`):**

```text
start / stop
navigate(url) / goBack()
screenshot() -> { pngBytes, width, height, dpr }
mouse: move, click, doubleClick, rightClick, down, up, drag, scroll(delta)
keyboard: type, press(key), down/up modifiers
tabs: list, switch(index|id), new, close
eval(script) / status (url, title)
optional: openInContainer, ensureContainer, proxy*, account*, cfSolve
```

### AD-3 — Transport: child process JSON-lines
**Decision:** TypeScript client spawns the skill’s Python controller (PTY or piped stdio with line protocol), one request → one response, same pattern as the Camoufox skill.  
**Why:** Proven with Camoufox containers/bridge; keeps GeckoDriver/fingerprint logic in Python next to Camoufox.  
**Risk:** Must handle navigate `timedOut` the same way Camoufox docs describe (status-check, don’t blind-retry).

### AD-4 — Profiles
**Decision:** Default profile `~/.camoufox/profiles/blue-steel` (or `blue-steel/default`) — **not** the Camoufox skill’s `default` profile while both may run.  
**Why:** Firefox profile lock is exclusive; skill docs forbid sharing an open profile.

### AD-5 — Branding
**Decision:** Package///public names use `blue-steel` / `Blue Steel`. Internal forks may keep Magnitude algorithm structure but rename exports, bins, env vars (`BLUE_STEEL_*`), and global singletons (`__blue_steel__`).

### AD-6 — Cloudflare
**Decision:** Expose `cf_solve` as both a skill op and a first-class agent action/tool for protected flows.  
**Why:** Camoufox skill already has a working closed-shadow Turnstile path; Magnitude has no equivalent.

---

## 4. Workstreams overview

```text
WS0  Foundations (repo + skill skeleton)
WS1  Camoufox controller fork (coordinate + screenshot protocol)
WS2  TS client + BrowserBackend
WS3  Core port (agent loop on new backend)
WS4  Camoufox-native capabilities
WS5  Test runner / MCP / scaffold
WS6  Skill packaging, docs, hardening
```

Sprints below are **dependency-ordered**. A sprint is done only when its exit criteria pass.

---

## 5. Sprints

### Sprint 0 — Repository and skill skeleton

**Objective:** Empty product tree and skill shell ready for implementation; no browser automation yet.

**Work**
- Initialize `blue-steel` monorepo workspace (Turbo/bun or npm workspaces mirroring Magnitude layout).
- Add package stubs: `blue-steel-core` (primary), optional empty stubs for test/mcp/extract/create-app.
- Create new skill directory (target: `~/.agents/skills/blue-steel` or repo-linked skill path) with:
  - `SKILL.md` (purpose, hard rules, paths, command protocol stub)
  - `scripts/bootstrap.sh` skeleton
  - LICENSE/NOTICE noting Magnitude Apache-2.0 origin and Camoufox-derived controller heritage
- Document non-modification rule for `cloverlabs-camoufox` in skill + root README.
- Copy Magnitude `LICENSE` obligations; set Blue Steel copyright/authors as appropriate.

**Exit criteria**
- [ ] `./blue-steel` builds an empty/hello package.
- [ ] New skill is discoverable and states “do not edit cloverlabs-camoufox”.
- [ ] Profile path convention documented.

---

### Sprint 1 — Controller fork: protocol parity + coordinate primitives

**Objective:** New skill’s Python controller can launch Camoufox and execute Magnitude-grade input ops.

**Work**
- Vendor/copy from Camoufox skill into Blue Steel skill (read-only source → write into new skill only):
  - `camoufox_containers.py` patterns (launch, bridge, containers, proxy, CF)
  - `interactive_camoufox.py` REPL loop
  - extension bridge + Container Proxy XPI handling as needed
  - bootstrap pins compatible with Camoufox 135 / Selenium stack
- Keep existing selector ops for debugging (`click`/`type` by selector, `eval`, `find`, …).
- **Add coordinate protocol** (names illustrative — lock in skill spec):

```json
{"op":"mouse_move","x":100,"y":200}
{"op":"mouse_click","x":100,"y":200,"button":"left","count":1}
{"op":"mouse_down","button":"left"}
{"op":"mouse_up","button":"left"}
{"op":"mouse_drag","x1":10,"y1":10,"x2":200,"y2":300}
{"op":"mouse_scroll","x":100,"y":200,"deltaX":0,"deltaY":400}
{"op":"keys_type","text":"hello","delay_ms":20}
{"op":"keys_press","key":"Enter"}
{"op":"screenshot","encoding":"base64"} 
{"op":"viewport"}
{"op":"quit"}
```

- Implement via Selenium `ActionChains` / `wheel` / `send_keys` (same stack Camoufox skill already imports).
- Screenshot: return base64 PNG **and** metadata `{width, height, dpr}` (via JS `window.devicePixelRatio`, `innerWidth`/`innerHeight`).
- Viewport / window sizing ops sufficient for stable grounding dimensions.
- Integration smoke (manual or scripted): launch → navigate example.com → coord click → type → screenshot round-trip.

**Exit criteria**
- [ ] Headed session reaches `ready` event on Blue Steel profile.
- [ ] Coordinate click hits a known target (e.g. positioned test element).
- [ ] Base64 screenshot decodes; dimensions match expected CSS pixels after DPR handling.
- [ ] `quit` releases profile lock cleanly.
- [ ] No files under `cloverlabs-camoufox` modified.

---

### Sprint 2 — TypeScript Camoufox client + harness adapter

**Objective:** `blue-steel-core` talks to the skill controller without Playwright.

**Work**
- Implement `CamoufoxClient`:
  - spawn skill Python with `-u`, line-buffered JSON
  - request id / serial queue (one in-flight command unless explicitly pipelined later)
  - timeout + crash detection + stderr logging (no secrets)
- Implement `CamoufoxWebHarness` satisfying the backend interface from AD-2.
- Port coordinate transform logic from Magnitude `WebHarness.transformCoordinates` (virtual screen dims).
- Port screenshot rescale semantics from Magnitude (`width/dpr`, `height/dpr`) using `sharp` or existing Image helpers.
- Tab state mapping: controller `tabs` / `tabId` / `handle` → Magnitude-like `TabState` observation text.
- Replace `BrowserProvider` with `CamoufoxSessionProvider` (profile name, headless flag, display).
- Unit tests for client protocol framing with a fake controller process.

**Exit criteria**
- [ ] TS integration test: start session, nav, screenshot, click, type, stop — no Playwright import in the path.
- [ ] Tab list observation format usable by existing agent prompts.
- [ ] Virtual screen coordinate transform covered by tests.

---

### Sprint 3 — Core agent port (vertical slice)

**Objective:** End-to-end `act()` on a simple site through Camoufox.

**Work**
- Copy Magnitude `magnitude-core` sources into `blue-steel-core` with renames:
  - package name, bins (`magnus` → chosen Blue Steel bin), logger names, globals
  - env: `MAGNITUDE_*` → `BLUE_STEEL_*` (document mapping)
- Keep BAML / model harness / memory / action registry structure unless blocked.
- Rewire:
  - `BrowserConnector` → Camoufox harness
  - `webActions` resolvers → backend methods
  - remove or stub Playwright visualizer (optional no-op visualizer first)
  - stability: replace Playwright network listeners with pragmatic waits (load + quiet period + optional `eval` readiness); iterate using Magnitude `PageStabilityAnalyzer` intent, not its Playwright APIs
- DOM transformer / shadow input adapter: port only if extract/act paths require; else defer.
- `startBrowserAgent` public API smoke example under `packages/blue-steel-core/examples/`.
- Dependency audit: drop `playwright`/`patchright` from core if unused; keep `magnitude-extract` or fork as `blue-steel-extract`.

**Exit criteria**
- [ ] Example: agent navigates a static page and completes a multi-step click/type task via vision model.
- [ ] `extract()` works on a simple schema against live DOM/HTML path chosen for Camoufox.
- [ ] `onStop` closes controller and browser; profile reusable on next run.
- [ ] Core package typechecks and builds.

---

### Sprint 4 — Camoufox-native agent capabilities

**Objective:** Expose stealth multi-account features as Blue Steel actions/options.

**Work**
- Connector options:
  - `profileName`, `headless`, `container`, `url`
  - optional `proxy` assignment at session/container scope
  - `account` isolation helpers mirroring Camoufox account registry (store metadata without secrets)
- New actions (agent-level and/or explicit API):
  - `browser:container:ensure` / open URL in container
  - `browser:account:isolate` / `open_account` (opt-in only)
  - `browser:cf:solve` wrapping skill `cf_solve`
- Skill `SKILL.md` workflows: when to isolate accounts, when to run `cf_solve` after login POSTs, secret handling (prefer Bitwarden CLI skill; never log proxy passwords).
- Verification: two containers, distinct cookies on same origin (pattern from Camoufox checklist).

**Exit criteria**
- [ ] Documented API for container-scoped browsing.
- [ ] CF challenge page solvable via action in headed mode on a known challenge fixture/site.
- [ ] Account isolation opt-in path verified; default path remains single default container.

---

### Sprint 5 — Test runner, MCP, and app scaffold

**Objective:** Developer surfaces beyond the core library.

**Work (prioritize in order)**
1. **blue-steel-test** — fork `magnitude-test`; point workers at Camoufox backend; update `magnitude.config.ts` → `blue-steel.config.ts` conventions.
2. **blue-steel-mcp** — replace patchright session in `magnitude-mcp` with shared `CamoufoxClient` (persistent sessions, tools aligned with act/nav/extract + CF/container tools).
3. **create-blue-steel-app** — fork scaffold; install skill bootstrap instructions; example script.
4. Evals: port or thin-wrap Magnitude basic scroll/shadow evals only after harness parity; WebVoyager later.

**Exit criteria**
- [ ] `npx`-style init produces a runnable example against Blue Steel skill.
- [ ] At least one mag-style test file runs via blue-steel-test.
- [ ] MCP server can open browser and return tab state without Playwright.

---

### Sprint 6 — Skill UX, docs, and hardening

**Objective:** Operable by agents and humans without reading source.

**Work**
- Complete `SKILL.md`: hard rules, bootstrap, profiles, protocol reference, CF procedure, account isolation, shutdown, verification checklist (mirror Camoufox structure, Blue Steel–specific ops).
- Failure modes runbook: profile lock, missing DISPLAY, GeckoDriver fetch, navigate timedOut, controller crash orphans.
- Observability: structured logs, action traces; ban secret logging.
- Reconcile doc: “Upstream Camoufox skill version last synced: …”
- License/NOTICE final pass; remove Magnitude telemetry or gate behind explicit opt-in with Blue Steel endpoints.
- Optional: CI job that runs controller protocol tests with headless Camoufox.

**Exit criteria**
- [ ] New contributor can bootstrap skill + run example from docs alone.
- [ ] Verification checklist fully checked on a clean machine profile.
- [ ] Explicit statement and CI/grep guard: cloverlabs-camoufox tree not modified by Blue Steel tooling.

---

## 6. Cross-cutting technical risks

| Risk | Evidence | Mitigation |
|------|----------|------------|
| Coordinate space mismatch (DPR, viewport chrome, Firefox layout) | Magnitude rescales screenshots by DPR; Camoufox screenshots are viewport bitmaps | Return DPR + CSS size from controller; reuse Magnitude rescale; add click calibration test page |
| Stability waits weaker without Playwright network events | `PageStabilityAnalyzer` ties to Playwright Request/Response | Quiet-window + document ready + optional mutation observer via `eval` |
| Visualizer/overlays inject into page | Magnitude uses Playwright `addInitScript` / locators | Defer overlays; optional later via extension or `eval` injection |
| Profile lock conflicts | Camoufox skill hard rule | Dedicated `blue-steel` profile; detect lock and fail clearly |
| Controller drift from upstream Camoufox skill | Forked scripts | Pin upstream commit/version; sprint-end reconcile notes |
| Selenium ActionChains vs real OS input for some sites | CF skill already prefers element-origin actions for Turnstile | Coord path for agent; keep CF closed-shadow path separate |
| BAML / model stack weight | Core build runs `baml-cli generate` | Keep build pipeline; document model requirements (visually grounded) |
| Extract package Playwright assumptions | Mostly DOM string based in `magnitude-extract` | Prefer `page_source` / `eval` HTML into extract; avoid browser coupling |

---

## 7. Definition of done (product MVP)

MVP is complete when all of the following hold:

1. **New skill** launches Camoufox with Blue Steel profile and extended protocol (coords + base64 screenshot + CF + containers).
2. **`blue-steel-core`** runs vision `act` / `extract` / `nav` without Playwright.
3. **Existing cloverlabs-camoufox skill** is byte-identical to pre-project state (no edits).
4. **Example project** in-repo demonstrates a real multi-step browser task.
5. **Docs/skill** describe bootstrap, protocol, isolation, and shutdown.
6. **License** attribution for Magnitude and any vendored Camoufox-derived code is correct.

---

## 8. Suggested implementation order (summary)

```text
Sprint 0  skeleton
    ↓
Sprint 1  Python controller (coords + screenshot)     ← critical path
    ↓
Sprint 2  TS client + harness
    ↓
Sprint 3  agent vertical slice                        ← first demoable agent
    ↓
Sprint 4  containers / proxy / CF actions
    ↓
Sprint 5  test + MCP + scaffold
    ↓
Sprint 6  polish / docs / harden
```

---

## 9. Open decisions (resolve before or during Sprint 0–1)

1. **Skill install path:** only `~/.agents/skills/blue-steel` vs also vendored under `blue-steel/skill` for monorepo dev symlinking.
2. **Package manager:** keep Magnitude’s bun+turbo vs npm/pnpm.
3. **Extract package:** depend on published `magnitude-extract` vs full fork rename.
4. **Telemetry:** strip PostHog vs opt-in.
5. **Visualizer:** permanent no-op vs reimplement with extension.
6. **Headless default for CI** vs headed-first for agent skill use.
7. **Public bin name** (`blue-steel`, `bs`, other).

Record decisions in this file’s appendix as they are made.

---

## 10. Appendix — Decision log

| ID | Decision | Status |
|----|----------|--------|
| C-1 | Do not modify `cloverlabs-camoufox` | Accepted |
| C-2 | New agent skill for Blue Steel Camoufox mode | Accepted |
| C-3 | Develop under `./blue-steel` | Accepted |
| AD-1 | Fork controller into new skill | Accepted (plan) |
| AD-2 | BrowserBackend interface in core | Accepted (plan) |
| AD-3 | JSON-lines child process transport | Accepted (plan) |
| AD-4 | Dedicated Blue Steel Firefox profile | Accepted (plan) |
| AD-5 | Blue Steel branding/renames | Accepted (plan) |
| AD-6 | First-class CF solve action | Accepted (plan) |

---

## 11. Appendix — Key file map (Magnitude → Blue Steel intent)

| Magnitude | Blue Steel intent |
|-----------|-------------------|
| `packages/magnitude-core/src/web/browserProvider.ts` | `CamoufoxSessionProvider` |
| `packages/magnitude-core/src/web/harness.ts` | `CamoufoxWebHarness` + client |
| `packages/magnitude-core/src/connectors/browserConnector.ts` | Same role, new backend |
| `packages/magnitude-core/src/actions/webActions.ts` | Keep names; rebind resolvers |
| `packages/magnitude-core/src/web/tabs.ts` | Map controller tab list |
| `packages/magnitude-core/src/web/stability.ts` | Rewrite waits |
| `packages/magnitude-core/src/web/visualizer/**` | No-op or defer |
| `packages/magnitude-mcp` | CamoufoxClient sessions |
| *(new)* | `~/.agents/skills/blue-steel/**` controller + SKILL.md |

---

*Generated from inspection of `magnitude/` and `cloverlabs-camoufox` skill sources. Update this plan when open decisions close or sprint exit criteria change.*
