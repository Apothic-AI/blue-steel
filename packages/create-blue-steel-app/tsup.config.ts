import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/cli.ts'],
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    target: 'node18',
    // Clean the output directory before building.
    clean: true,
    // Don't split code into chunks. Creates a single output file.
    splitting: false,
    // Generate source maps for debugging.
    sourcemap: true,
    // Add the shebang `#!/usr/bin/env node` to the top of the output file.
    banner: {
        js: '#!/usr/bin/env node',
    },
});