import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { CamoufoxClient } from './camoufoxClient';

describe('CamoufoxClient protocol', () => {
  test('queues commands against fake controller', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-fake-'));
    const script = path.join(dir, 'fake.py');
    fs.writeFileSync(script, `
import sys, json
print(json.dumps({"event":"ready","profile":{"name":"t","path":"/tmp"},"containers":[]}), flush=True)
for line in sys.stdin:
    cmd = json.loads(line)
    op = cmd["op"]
    if op == "quit":
        print(json.dumps({"ok": True, "result": "closing"}), flush=True)
        break
    if op == "navigate":
        print(json.dumps({"ok": True, "result": {"url": cmd["url"], "title": "T", "timedOut": False}}), flush=True)
    elif op == "screenshot":
        print(json.dumps({"ok": True, "result": {"base64": "aaa", "encoding": "base64", "mimeType": "image/png", "width": 10, "height": 10, "dpr": 1}}), flush=True)
    else:
        print(json.dumps({"ok": True, "result": {"op": op}}), flush=True)
`)
    const client = new CamoufoxClient({
      pythonPath: process.env.BLUE_STEEL_PYTHON || '/usr/bin/python3',
      controllerPath: script,
      profileName: 'test',
      readyTimeoutMs: 5000,
      commandTimeoutMs: 5000,
    });
    const ready = await client.start();
    expect(ready.profile.name).toBe('t');
    const nav = await client.navigate('https://example.com');
    expect(nav.url).toBe('https://example.com');
    const shot = await client.screenshotBase64();
    expect(shot.base64).toBe('aaa');
    await client.quit();
  });
});
