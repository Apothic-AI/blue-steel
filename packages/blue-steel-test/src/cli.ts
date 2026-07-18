#!/usr/bin/env node
import { Command } from '@commander-js/extra-typings';
import path from 'node:path';
import fs from 'node:fs';
import { glob } from 'glob';
//import { BlueSteel, TestCase } from '..';
//import { LocalTestRunner } from '@/runner';
import { BlueSteelConfig } from '@/discovery/types';
//import chalk from 'chalk';
import { discoverTestFiles, findConfig, findProjectRoot, isProjectRoot, readConfig } from '@/discovery/util';
//import { BaseTestRunner, BaseTestRunnerConfig } from './runner/baseRunner';
import { logger as coreLogger } from 'blue-steel-core';
import logger from '@/logger';
import { describeModel } from './util';
import * as dotenv from 'dotenv';
import { execSync } from 'node:child_process';
// Removed React import
// Removed App import
// Removed render import
import { TestSuiteRunner, TestSuiteRunnerConfig } from './runner/testSuiteRunner'; // Import the new executor and config
import { TermAppRenderer } from '@/term-app'; // Import TermAppRenderer
//import { initializeTestStates } from './term-app/util';
// Removed import { initializeUI, updateUI, cleanupUI } from '@/term-app';
import { startWebServers, stopWebServers } from './webServer';
import { DebugRenderer } from './renderer/debugRenderer';
import chalk from 'chalk';

function getRelativePath(projectRoot: string, absolutePath: string): string {
    // Ensure both paths are absolute and normalized
    const normalizedAbsolutePath = path.normalize(absolutePath);
    const normalizedProjectRoot = path.normalize(projectRoot);

    // Check if the path is inside the project root
    if (!normalizedAbsolutePath.startsWith(normalizedProjectRoot)) {
        // If the path is not within the project root, return the original path
        return absolutePath;
    }

    return path.relative(normalizedProjectRoot, normalizedAbsolutePath);
}

const configTemplate = `import { type BlueSteelConfig } from 'blue-steel-test';

// Learn more about configuring BlueSteel:
// https://docs.blue-steel.run/customizing/configuration

export default {
    url: "http://localhost:5173"
} satisfies BlueSteelConfig;
`;

const exampleTestTemplate = `import { test } from 'blue-steel-test';

// Learn more about building test case:
// https://docs.blue-steel.run/core-concepts/building-test-cases

const sampleTodos = [
    "Take out the trash",
    "Pay AWS bill",
    "Build more test cases with BlueSteel"
];

test('can add and complete todos', { url: 'https://magnitodo.com' }, async (agent) => {
    await agent.act('create 3 todos', { data: sampleTodos.join(', ') });
    await agent.check('should see all 3 todos');
    await agent.act('mark each todo complete');
    await agent.check('says 0 items left');
});
`;

async function initializeProject(force = false, destination = 'tests/blue-steel'): Promise<void> {
    /**
     * Initialize blue-steel test case files in a node project
     */
    const cwd = process.cwd();
    const isNodeProject = await isProjectRoot(cwd);

    if (!isNodeProject && !force) {
        console.error("Couldn't find package.json in current directory, please initialize BlueSteel in a node.js project");
        console.error("To override this check, use --force option");
        process.exit(1);
    }

    console.log(chalk.blueBright(`Initializing BlueSteel tests in ${cwd}`));

    // Create directory structure
    const testsDir = path.join(cwd, destination);

    const configPath = path.join(testsDir, 'blue-steel.config.ts');

    if (fs.existsSync(configPath)) {
        console.error("Already initialized, blue-steel.config.ts already exists!");
        process.exit(1);
    }

    try {
        // Create directories recursively
        await fs.promises.mkdir(testsDir, { recursive: true });

        // Create config file
        await fs.promises.writeFile(configPath, configTemplate);

        // Create example test file
        const examplePath = path.join(testsDir, 'example.bs.ts');
        await fs.promises.writeFile(examplePath, exampleTestTemplate);

        console.log(`${chalk.blueBright('✓')} Created BlueSteel test directory structure:
    - ${path.relative(cwd, configPath)}
    - ${path.relative(cwd, examplePath)}
  `);

    } catch (error) {
        console.error('Error initializing BlueSteel project:', error);
        process.exit(1);
    }

    // Ensure Blue Steel Camoufox skill runtime is available
    console.log(chalk.blueBright('Blue Steel uses Camoufox — ensure skill bootstrap is complete.'));
    console.log(chalk.blueBright('Run: bash skill/scripts/bootstrap.sh  (or ~/.agents/skills/blue-steel/scripts/bootstrap.sh)'));

    console.log(`You can now run tests with: ${chalk.blueBright('npx blue-steel')}`);
    console.log('Docs:', chalk.blueBright('https://docs.blue-steel.run'));
}

const program = new Command();

program
    .name('blue-steel')
    .description('Run BlueSteel test cases')
    .argument('[filter]', 'glob pattern for test files (quote if contains spaces or wildcards)')
    .option('-w, --workers <number>', 'number of parallel workers for test execution', '1')
    .option('-p, --plain', 'disable pretty output and print lines instead')
    .option('-d, --debug', 'enable debug logs')
    .option('--no-fail-fast', 'continue running tests even if some fail')
    .action(async (filter, options) => {
        dotenv.config();
        let logLevel: string;

        if (process.env.BLUE_STEEL_LOG_LEVEL) {
            logLevel = process.env.BLUE_STEEL_LOG_LEVEL;
        } else if (options.debug) {
            logLevel = 'trace';
        } else {
            logLevel = 'warn';
        }
        coreLogger.level = logLevel;
        logger.level = logLevel;

        const patterns = [
            '!**/node_modules/**',
            '!**/dist/**'
        ];

        if (filter) {
            patterns.push(filter);
        } else {
            // Default pattern if no filter is provided
            patterns.push('**/*.{mag,blue-steel}.{js,jsx,ts,tsx}');
        }

        const workerCount = options.workers ? parseInt(options.workers as unknown as string, 10) : 1;
        if (isNaN(workerCount) || workerCount < 1) {
            console.error('Invalid worker count. Using default of 1.');
        }

        const absoluteFilePaths = await discoverTestFiles(patterns);

        if (absoluteFilePaths.length === 0) {
            console.error(`No test files found matching patterns: ${patterns.join(', ')}`);
            process.exit(1);
        }
        // only matters to show file names nicely
        const projectRoot = await findProjectRoot() ?? process.cwd();

        const configPath = findConfig(projectRoot);

        //console.log(configPath)

        const config: BlueSteelConfig = configPath ? await readConfig(configPath) : {};

        //console.log(config)

        // // If planner not provided, make a choice based on available environment variables
        // if (!config.planner) {
        //     const planner = tryDeriveEnvironmentPlannerClient();
        //     if (!planner) {
        //         // TODO: Should point to docs on configuration
        //         console.error("No planner client configured. Set an appropriate environment variable or configure planner in blue-steel.config.ts");
        //         process.exit(1);
        //     }
        //     config.planner = planner;
        // }


        // logger.info({ ...config.executor }, "Executor:");
        //console.log(blueSteelBlue(`Using executor: ${config.executor.provider}`));

        let webServerProcesses: (import('node:child_process').ChildProcess | null)[] = [];
        if (config.webServer) {
            try {
                webServerProcesses = await startWebServers(config.webServer);
                const cleanup = () => stopWebServers(webServerProcesses);
                process.on('exit', cleanup);
                process.on('SIGINT', () => { cleanup(); process.exit(1); });
            } catch (err) {
                console.error('Error starting web server(s):', err);
                process.exit(1);
            }
        }


        const showUI = !options.debug && !options.plain;


        const testSuiteRunner = new TestSuiteRunner({
            config,
            workerCount: workerCount,
            failFast: options.failFast === false
                ? false
                : !config.continueAfterFailure,
            createRenderer: (tests) => showUI
                ? new TermAppRenderer(config, tests)
                : new DebugRenderer(options.plain),
        });

        for (const filePath of absoluteFilePaths) {
            await testSuiteRunner.loadTestFile(filePath, getRelativePath(projectRoot, filePath));
        }

        try {
            const overallSuccess = await testSuiteRunner.runTests();
            process.exit(overallSuccess ? 0 : 1);
        } catch (error) {
            logger.error({ err: error }, "Test suite execution failed:");
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Initialize BlueSteel test directory structure')
    .option('-f, --force', 'force initialization even if no package.json is found')
    .option('--dir, --destination <path>', 'destination directory for BlueSteel tests', 'tests/blue-steel')
    .action(async (options) => {
        await initializeProject(options.force, options.destination);
    });

program.parse();
