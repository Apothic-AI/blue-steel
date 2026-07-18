export default {
    external: [
      // Core Node.js modules
      'node:fs', 'node:path', 'node:os', 'node:util', 'node:events', 'node:stream', 'node:assert', 'node:url', 'node:crypto',
      // Mark esbuild as external - this is the critical part
      'esbuild',
      'playwright'
    ]
  };