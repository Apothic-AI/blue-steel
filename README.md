# Blue Steel

Vision browser agent ported from [Magnitude](https://github.com/magnitudedev/magnitude), backed by **Camoufox** (Selenium) instead of Playwright/Chromium.

Blue Steel uses a dedicated agent skill (`blue-steel`) for browser control. It does **not** modify the upstream `cloverlabs-camoufox` skill.

## Packages

| Package | Role |
|---------|------|
| `blue-steel-core` | Vision agent, Camoufox client, harness, actions |
| `blue-steel-extract` | HTML → structured markdown for extract |
| `blue-steel-test` | Test runner (Magnitude-style) |
| `blue-steel-mcp` | MCP server over Camoufox harness |
| `create-blue-steel-app` | Project scaffold |
| `skill/` | Camoufox controller skill (coord mouse, CF, containers) |

## Quick start

```bash
# 1. Bootstrap Camoufox skill runtime
bash skill/scripts/bootstrap.sh
# install skill for agents
rsync -a skill/ ~/.agents/skills/blue-steel/

# 2. Install monorepo
bun install
bun run build

# 3. Set a visually grounded model key (e.g. Anthropic)
export ANTHROPIC_API_KEY=...

# 4. Example (headed; needs DISPLAY)
cd packages/blue-steel-core
bun examples/camoufox_smoke.ts
```

## Architecture

```text
Agent (BAML / vision LLM)
    → webActions (pixel coords)
    → WebHarness
    → CamoufoxClient (JSON-lines)
    → skill/scripts/interactive_camoufox.py
    → Selenium + Camoufox Firefox
```

Default Firefox profile: `~/.camoufox/profiles/blue-steel`

## Environment

| Variable | Purpose |
|----------|---------|
| `BLUE_STEEL_SKILL_DIR` | Skill root override |
| `BLUE_STEEL_PYTHON` | Python with camoufox deps |
| `BLUE_STEEL_PROFILE_NAME` | Profile name (default `blue-steel`) |
| `BLUE_STEEL_NARRATE` | Narrate agent actions |
| `ANTHROPIC_API_KEY` / etc. | LLM credentials |

## License

Apache-2.0 (Magnitude heritage). Extract package MIT. See `LICENSE` and `NOTICE`.

## Sprint plan

See [SPRINT_PLAN.md](./SPRINT_PLAN.md).
