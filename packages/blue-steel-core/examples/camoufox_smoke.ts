/**
 * Smoke test: launch Camoufox via Blue Steel skill, navigate, screenshot, click.
 * Does not require an LLM.
 *
 *   bun examples/camoufox_smoke.ts
 *   BLUE_STEEL_HEADLESS=1 bun examples/camoufox_smoke.ts
 */
import { CamoufoxClient, WebHarness } from '../src/index';
import path from 'node:path';

async function main() {
    const skillDir =
        process.env.BLUE_STEEL_SKILL_DIR ||
        path.resolve(import.meta.dir, '../../../../skill');

    const client = new CamoufoxClient({
        skillDir,
        profileName: process.env.BLUE_STEEL_PROFILE_NAME || 'blue-steel',
        headless: process.env.BLUE_STEEL_HEADLESS === '1' || !process.env.DISPLAY,
    });

    console.log('Starting Camoufox...', { skillDir });
    const ready = await client.start();
    console.log('Ready:', ready.profile);

    const harness = new WebHarness(client, {
        virtualScreenDimensions: { width: 1024, height: 768 },
    });
    await harness.start();

    await harness.navigate('https://example.com');
    const status = await client.status();
    console.log('Status:', { url: status.url, title: status.title });

    const shot = await harness.screenshot();
    const dims = await shot.getDimensions();
    console.log('Screenshot CSS dims:', dims);

    const tabs = await harness.retrieveTabState();
    console.log('Tabs:', tabs);

    // Soft click center of viewport (harmless on example.com)
    const vp = await client.viewport();
    await harness.click(
        { x: Math.floor((vp.innerWidth || 800) / 2), y: Math.floor((vp.innerHeight || 600) / 2) },
        { transform: false }
    );
    console.log('Clicked viewport center');

    await harness.stop();
    await client.quit();
    console.log('OK — camoufox smoke complete');
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
