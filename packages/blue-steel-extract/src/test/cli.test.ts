/**
 * Tests for the CLI functionality
 */

import { describe, test as it, expect } from 'bun:test';
import { parseArguments, fetchHTML } from '../cli.js';

describe('CLI', () => {
  describe('Argument parsing', () => {
    it('should parse basic URL argument', () => {
      const args = ['https://example.com'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.includeMetadata).toBe(false);
      expect(options.verbose).toBe(false);
    });

    it('should parse help flag', () => {
      const args = ['--help'];
      const options = parseArguments(args);
      
      expect(options.help).toBe(true);
    });

    it('should parse output option', () => {
      const args = ['https://example.com', '--output', 'test.md'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.output).toBe('test.md');
    });

    it('should parse verbose flag', () => {
      const args = ['https://example.com', '--verbose'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.verbose).toBe(true);
    });

    it('should parse content options', () => {
      const args = [
        'https://example.com',
        '--include-metadata',
        '--include-page-numbers',
        '--no-images',
        '--no-forms',
        '--no-links'
      ];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.includeMetadata).toBe(true);
      expect(options.includePageNumbers).toBe(true);
      expect(options.includeImages).toBe(false);
      expect(options.includeForms).toBe(false);
      expect(options.includeLinks).toBe(false);
    });

    it('should parse min text length option', () => {
      const args = ['https://example.com', '--min-text-length', '50'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.minTextLength).toBe(50);
    });

    it('should parse navigation option', () => {
      const args = ['https://example.com', '--include-navigation'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.skipNavigation).toBe(false);
    });

    it('should throw error for unknown option', () => {
      const args = ['https://example.com', '--unknown-option'];
      
      expect(() => parseArguments(args)).toThrow('Unknown option: --unknown-option');
    });

    it('should throw error for invalid min-text-length', () => {
      const args = ['https://example.com', '--min-text-length', 'invalid'];
      
      expect(() => parseArguments(args)).toThrow('--min-text-length must be a number');
    });

    it('should throw error for multiple URLs', () => {
      const args = ['https://example.com', 'https://another.com'];
      
      expect(() => parseArguments(args)).toThrow('Unexpected argument: https://another.com');
    });

    it('should parse short flags', () => {
      const args = ['https://example.com', '-h', '-v', '-o', 'output.md'];
      const options = parseArguments(args);
      
      expect(options.url).toBe('https://example.com');
      expect(options.help).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.output).toBe('output.md');
    });
  });

  describe('URL fetching', () => {
    it('should handle successful fetch', async () => {
      // Mock a simple HTML response
      const mockHTML = '<html><head><title>Test</title></head><body><h1>Hello World</h1></body></html>';
      
      // Create a mock server response
      (global as any).fetch = async (url: string) => {
        if (url === 'https://example.com') {
          return new Response(mockHTML, {
            status: 200,
            headers: { 'content-type': 'text/html' }
          });
        }
        throw new Error('Not found');
      };

      const html = await fetchHTML('https://example.com');
      expect(html).toBe(mockHTML);
    });

    it('should handle HTTP errors', async () => {
      (global as any).fetch = async () => {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      };

      expect(fetchHTML('https://example.com')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      (global as any).fetch = async () => {
        throw new Error('Network error');
      };

      expect(fetchHTML('https://example.com')).rejects.toThrow('Failed to fetch URL: Network error');
    });

    it('should handle non-HTML content with warning', async () => {
      const mockJSON = '{"message": "Hello World"}';
      
      // Capture console.warn calls
      const originalWarn = console.warn;
      let warnMessage = '';
      console.warn = (message: string) => {
        warnMessage = message;
      };

      (global as any).fetch = async () => {
        return new Response(mockJSON, {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      };

      const content = await fetchHTML('https://example.com');
      expect(content).toBe(mockJSON);
      expect(warnMessage).toContain('Content-Type is "application/json", expected HTML');

      // Restore console.warn
      console.warn = originalWarn;
    });
  });
});