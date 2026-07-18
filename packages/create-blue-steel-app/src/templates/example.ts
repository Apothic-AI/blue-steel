import { startBrowserAgent } from 'blue-steel-core';
import { z } from 'zod';

async function main() {
    const agent = await startBrowserAgent({
        url: 'https://example.com',
        browser: {
            profileName: 'blue-steel',
            headless: false,
        },
        narrate: true,
    });

    await agent.act('Read the main heading on the page');

    const data = await agent.extract(
        'Extract the page title and main paragraph',
        z.object({
            title: z.string(),
            paragraph: z.string(),
        })
    );
    console.log(data);

    await agent.stop();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
