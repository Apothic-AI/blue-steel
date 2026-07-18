// /**
//  * CLI, mostly for testing purposes
//  */


// import { Command } from 'commander';
// import * as fs from 'node:fs';
// import * as path from 'node:path';
// import { chromium } from 'playwright';
// import { WebHarness } from '@/web/harness';
// import { MicroAgent } from '@/ai/micro';
// import { Recipe } from '@/recipe/recipe';

// interface CliOptions {
//     workers?: number;
// }

// const program = new Command();

// program
//     .name('blue-steel')
//     .description('Debug CLI for BlueSteel Test Case Agent (aka Magnus)')

// program
//     .command('check')
//     .requiredOption('-u --url <url>', 'starting URL')
//     .requiredOption('-c --check <url>', 'Check to evaluate')
//     .action(async (options: { url: string, check: string }) => {
//         const browser = await chromium.launch({ headless: false, slowMo: 0 });
//         const context = await browser.newContext({ viewport: { width: 1280, height: 720 }});
//         const page = await context.newPage();
//         const harness = new WebHarness(page);
//         const micro = new MicroAgent({ moondreamApiKey: process.env.MOONDREAM_API_KEY!, downscaling: 0.75 });
    
//         try {
//             await page.goto(options.url);
//             const screenshot = await harness.screenshot();
//             const result = await micro.evaluateCheck(screenshot, { variant: "check", description: options.check });
//             console.log(result);
//         } catch (error) {
//             console.error('Error:', error);
//             process.exit(1);
//         } finally {
//             await new Promise(resolve => setTimeout(resolve, 2000));
//             await browser.close();
//         }
//     });

// program
//     .command('exec')
//     .description('Execute a recipe JSON file using only the micro agent')
//     .requiredOption('-u --url <url>', 'starting URL')
//     .requiredOption('-r --recipe <path>', 'path to recipe JSON file')
//     .action(async (options: { url: string, recipe: string }) => {

//         const recipePath = path.resolve(options.recipe);

//         console.log(recipePath);

//         const data = JSON.parse(fs.readFileSync(recipePath, 'utf8'));

//         console.log(data);

//         const micro = new MicroAgent({ moondreamApiKey: process.env.MOONDREAM_API_KEY!, downscaling: 0.75 });
        
//         const recipe = new Recipe();

//         for (const item of data) {
//             recipe.add(item);
//         }
    
//         // Playwright init
//         const browser = await chromium.launch({ headless: false, slowMo: 0 });
//         const context = await browser.newContext({ viewport: { width: 1280, height: 720 }});
//         const page = await context.newPage();
    
//         const harness = new WebHarness(page);
    
//         try {
//             await page.goto(options.url);
    
//             for (const ing of recipe.getIngredients()) {
//                 // Capture screenshot
//                 const screenshot = await harness.screenshot();
                
//                 if (ing.variant === 'check') {
//                     const checkPassed = await micro.evaluateCheck(screenshot, ing);

//                     if (checkPassed) {
//                         console.log(`Check passed: "${ing.description}"`);
//                     } else {
//                         console.log(`Check failed: "${ing.description}", exiting`);
//                         process.exit(0);
//                     }
//                 } else {
//                     // Convert "ingredient" to executable web action
//                     const action = await micro.convertAction(screenshot, ing);
        
//                     console.log(action);
                    
//                     // Execute web action
//                     await harness.executeAction(action);
                    
//                     // Fixed wait for now
//                     await new Promise(resolve => setTimeout(resolve, 1000));
//                 }
                
//             }
    
//         } catch (error) {
//             console.error('Error executing recipe:', error);
//             process.exit(1);
//         } finally {
//             await new Promise(resolve => setTimeout(resolve, 2000));
//             await browser.close();
//         }
        
//     });

// program.parse();
