#!/usr/bin/env node

/**
 * CLI tool for extracting and converting web content to markdown
 * Usage: unstructured-ts <url> [options]
 */

import { partitionHtml, serializeToMarkdown } from './index.js';
import type { PartitionOptions, MarkdownSerializerOptions } from './index.js';

interface CLIOptions {
  url: string;
  output?: string;
  includeMetadata?: boolean;
  includePageNumbers?: boolean;
  includeImages?: boolean;
  includeForms?: boolean;
  includeLinks?: boolean;
  skipNavigation?: boolean;
  minTextLength?: number;
  noTables?: boolean;
  verbose?: boolean;
  help?: boolean;
}

async function fetchHTML(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.warn(`Warning: Content-Type is "${contentType}", expected HTML`);
    }
    
    return await response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
    throw new Error('Failed to fetch URL: Unknown error');
  }
}

function parseArguments(args: string[]): CLIOptions {
  const options: CLIOptions = {
    url: '',
    includeMetadata: false,
    includePageNumbers: false,
    includeImages: true,
    includeForms: true,
    includeLinks: true,
    skipNavigation: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--include-metadata':
        options.includeMetadata = true;
        break;
      case '--include-page-numbers':
        options.includePageNumbers = true;
        break;
      case '--no-images':
        options.includeImages = false;
        break;
      case '--no-forms':
        options.includeForms = false;
        break;
      case '--no-links':
        options.includeLinks = false;
        break;
      case '--include-navigation':
        options.skipNavigation = false;
        break;
      case '--no-tables':
        options.noTables = true;
        break;
      case '--min-text-length':
        const minLength = parseInt(args[++i]);
        if (isNaN(minLength)) {
          throw new Error('--min-text-length must be a number');
        }
        options.minTextLength = minLength;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (!options.url) {
          options.url = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
unstructured-ts - Extract and convert web content to markdown

USAGE:
  unstructured-ts <url> [options]

ARGUMENTS:
  <url>                    URL to fetch and convert

OPTIONS:
  -h, --help              Show this help message
  -o, --output <file>     Write output to file instead of stdout
  -v, --verbose           Enable verbose logging
  
  Content Options:
  --include-metadata      Include document metadata in output
  --include-page-numbers  Include page number indicators
  --no-images            Skip image extraction
  --no-forms             Skip form extraction  
  --no-links             Skip link extraction
  --include-navigation   Include navigation elements (skipped by default)
  --min-text-length <n>  Minimum text length for elements (default: varies)

EXAMPLES:
  unstructured-ts https://example.com
  unstructured-ts https://example.com --include-metadata -o output.md
  unstructured-ts https://example.com --no-images --min-text-length 10
`);
}

async function writeOutput(content: string, outputPath?: string): Promise<void> {
  if (outputPath) {
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, content, 'utf-8');
    console.error(`Output written to: ${outputPath}`);
  } else {
    console.log(content);
  }
}

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.error('Error: URL is required');
      console.error('Use --help for usage information');
      process.exit(1);
    }

    const options = parseArguments(args);

    if (options.help) {
      printHelp();
      return;
    }

    if (!options.url) {
      console.error('Error: URL is required');
      process.exit(1);
    }

    // Validate URL
    try {
      new URL(options.url);
    } catch {
      console.error(`Error: Invalid URL: ${options.url}`);
      process.exit(1);
    }

    if (options.verbose) {
      console.error(`Fetching: ${options.url}`);
    }

    // Fetch HTML content
    const html = await fetchHTML(options.url);
    
    if (options.verbose) {
      console.error(`Fetched ${html.length} characters`);
      console.error('Processing content...');
    }

    // Configure partition options
    const partitionOptions: PartitionOptions = {
      extractImages: options.includeImages,
      extractForms: options.includeForms,
      extractLinks: options.includeLinks,
      skipNavigation: options.skipNavigation,
      minTextLength: options.minTextLength ?? 3, // Use default if not specified
      includeOriginalHtml: false,
      includeMetadata: true
    };

    // Process HTML
    const result = partitionHtml(html, partitionOptions);
    
    if (options.verbose) {
      console.error(`Extracted ${result.elements.length} elements`);
      console.error('Converting to markdown...');
    }

    // Configure markdown serializer options
    const markdownOptions: MarkdownSerializerOptions = {
      includeMetadata: options.includeMetadata,
      includePageNumbers: options.includePageNumbers,
      includeElementIds: false,
      includeCoordinates: false,
      preserveHierarchy: true,
      escapeSpecialChars: true,
      includeFormFields: options.includeForms,
      includeImageMetadata: options.includeImages
    };

    // Convert to markdown
    const markdown = serializeToMarkdown(result, markdownOptions);

    if (options.verbose) {
      console.error(`Generated ${markdown.length} characters of markdown`);
    }

    // Output result
    await writeOutput(markdown, options.output);

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
// Note: Bun handles this differently, so we check multiple conditions
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('cli.ts') ||
                     import.meta.url.includes('[eval]');

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main, parseArguments, fetchHTML };