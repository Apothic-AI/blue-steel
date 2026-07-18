# Skill: blue-steel

# Blue Steel Camoufox

Drive Blue Steel vision browser agents through a Camoufox/Selenium controller.
This skill is a **fork** of patterns from `cloverlabs-camoufox`. Do **not** modify
the upstream `cloverlabs-camoufox` skill; all Blue Steel changes live here.

## Hard Rules

1. Use this skill’s vendored scripts under `scripts/`. Never edit `cloverlabs-camoufox`.
2. Use Selenium (via the controller) for container tabs and coordinate input.
3. Keep the controller process alive and send JSON-lines commands on stdin.
4. Default profile: `~/.camoufox/profiles/blue-steel` (`--profile-name blue-steel`).
   Do not share a profile with another live Firefox/Camoufox process.
5. Never disable or uninstall `camoufox-containers@ailb.local`.
6. Container Proxy is installed by default; use `--no-container-proxy` only for diagnostics.
7. Account isolation is opt-in. One container per account when requested.
8. Do not log proxy passwords, cookies, tokens, or other secrets.
9. For website login credentials prefer the Bitwarden CLI skill when available.

## Paths

```text
SKILL_DIR=~/.agents/skills/blue-steel
# Dev monorepo copy:
#   <repo>/skill
PYTHON=$SKILL_DIR/.venv/bin/python
CONTROLLER=$SKILL_DIR/scripts/interactive_camoufox.py
DEFAULT_PROFILE=~/.camoufox/profiles/blue-steel
```

Environment overrides used by `blue-steel-core`:

```text
BLUE_STEEL_SKILL_DIR
BLUE_STEEL_PYTHON
BLUE_STEEL_PROFILE_NAME
BLUE_STEEL_NARRATE
```

## Bootstrap

```bash
bash ~/.agents/skills/blue-steel/scripts/bootstrap.sh
# or from monorepo:
bash skill/scripts/bootstrap.sh
```

Runtime pins (same family as Camoufox skill):

```text
cloverlabs-camoufox==0.6.0
playwright==1.51.0
selenium>=4.45,<5
```

## Start Interactive Session

```bash
$PYTHON -u $CONTROLLER
# or
$PYTHON -u $CONTROLLER --profile-name blue-steel
$PYTHON -u $CONTROLLER --headless
```

Wait for:

```json
{"event":"ready","profile":{"name":"blue-steel","path":"..."},"containers":[...],"product":"blue-steel"}
```

## Protocol

Send one JSON object + newline. Wait for one response before the next state-dependent command.

### Core DOM / debug (selector)

```json
{"op":"navigate","url":"https://example.com"}
{"op":"click","selector":"button[type=submit]"}
{"op":"type","selector":"input[name=q]","text":"hello","clear":true}
{"op":"eval","script":"return document.title"}
{"op":"find","selector":"a","limit":10}
{"op":"html"}
{"op":"status"}
{"op":"quit"}
```

### Coordinate input (vision agent)

```json
{"op":"mouse_move","x":100,"y":200}
{"op":"mouse_click","x":100,"y":200,"button":"left","count":1}
{"op":"mouse_down","button":"left"}
{"op":"mouse_up","button":"left"}
{"op":"mouse_drag","x1":10,"y1":10,"x2":200,"y2":300}
{"op":"mouse_scroll","x":100,"y":200,"deltaX":0,"deltaY":400}
{"op":"keys_type","text":"hello","delay_ms":20}
{"op":"keys_press","key":"Enter"}
{"op":"keys_chord","keys":["Control","a"]}
{"op":"go_back"}
{"op":"viewport"}
{"op":"screenshot","encoding":"base64"}
{"op":"screenshot","path":"/tmp/bs.png"}
```

Screenshot base64 response includes `width`, `height`, `dpr`, `mimeType`.

### Tabs / containers / proxy / accounts / CF

Same ops as Camoufox skill:

`open`, `switch`, `tabs`, `tab_info`, `close_tab`, `containers`, `ensure_container`,
`update_container`, `remove_container`, `proxy_list`, `proxy_assign`, `proxy_disable`,
`list_accounts`, `get_account`, `isolate_account`, `open_account`, `clear_account_proxy`,
`cf_status`, `cf_click`, `cf_solve`, extensions ops.

### Cloudflare

```json
{"op":"cf_status"}
{"op":"cf_click","method":"actions"}
{"op":"cf_solve","timeout":30,"attempts":3}
```

Closed-shadow Turnstile checkbox path (frame → body.shadow_root → checkbox).

## TypeScript client

`blue-steel-core` spawns this controller via `CamoufoxClient` and exposes
`WebHarness` / `startBrowserAgent` without Playwright.

```ts
import { startBrowserAgent, CamoufoxClient, WebHarness } from 'blue-steel-core';

const agent = await startBrowserAgent({
  url: 'https://example.com',
  browser: { profileName: 'blue-steel', headless: false },
  narrate: true,
});
await agent.act('Click the more information link');
await agent.stop();
```

## Shutdown

```json
{"op":"quit"}
```

## Verification Checklist

1. `ready` event with profile `blue-steel`
2. `navigate` → `status` URL matches
3. `screenshot` encoding base64 returns dpr/width/height
4. `mouse_click` hits a known element on a test page
5. `keys_type` after click focuses and types
6. `tabs` / container open isolation
7. `cf_solve` on a challenge page when applicable
8. `quit` releases profile lock

## Upstream

Last synced conceptually from `cloverlabs-camoufox` skill scripts (controller + containers + bridge).
Coordinate ops and default profile are Blue Steel additions.
