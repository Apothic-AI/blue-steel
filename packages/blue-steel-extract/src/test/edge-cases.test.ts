/**
 * Tests for edge cases and error handling
 * Tests robustness with malformed HTML, empty content, and unusual scenarios
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';

describe('Edge Cases and Error Handling', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner({
      extractForms: true,
      extractImages: true,
      extractLinks: true,
      extractTables: true
    });
  });

  describe('Empty and Minimal Content', () => {
    test('should handle empty HTML string', () => {
      const html = '';
      const result = partitioner.partition(html);
      
      expect(result.elements).toEqual([]);
      expect(result.metadata.totalElements).toBe(0);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    test('should handle whitespace-only HTML', () => {
      const html = '   \n\t   \n   ';
      const result = partitioner.partition(html);
      
      expect(result.elements).toEqual([]);
      expect(result.metadata.totalElements).toBe(0);
    });

    test('should handle HTML with only comments', () => {
      const html = '<!-- This is a comment --><!-- Another comment -->';
      const result = partitioner.partition(html);
      
      expect(result.elements).toEqual([]);
      expect(result.metadata.totalElements).toBe(0);
    });

    test('should handle minimal valid HTML', () => {
      const html = '<p>Hello</p>';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].text).toBe('Hello');
      expect(result.elements[0].type).toBe(ElementType.NARRATIVE_TEXT);
    });
  });

  describe('Malformed HTML', () => {
    test('should handle unclosed tags', () => {
      const html = `
        <div>
          <p>Paragraph without closing tag
          <h1>Header without closing tag
          <span>Span content
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should still extract content despite malformed HTML
      expect(result.elements.length).toBeGreaterThan(0);
      
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('Paragraph without'))).toBe(true);
      expect(texts.some(text => text.includes('Header without'))).toBe(true);
    });

    test('should handle mismatched tags', () => {
      const html = `
        <div>
          <p>Start paragraph</span>
          <h1>Header</p>
          <strong>Bold text</em>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should handle gracefully and extract what it can
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.metadata.totalElements).toBeGreaterThan(0);
    });

    test('should handle invalid attributes', () => {
      const html = `
        <div class="valid" invalid-attr="test" 123invalid="bad">
          <p id="good" class=>Content with invalid attributes</p>
          <span class="multiple classes" id="spaces in id">More content</span>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract content and handle valid attributes
      expect(result.elements.length).toBeGreaterThan(0);
      
      const divElement = result.elements.find(el => el.text.includes('Content with invalid'));
      expect(divElement).toBeDefined();
      expect(divElement!.metadata.tagName).toBe('p');
    });

    test('should handle deeply nested malformed HTML', () => {
      const html = `
        <div>
          <p>
            <span>
              <strong>
                <em>
                  Deeply nested content without proper closing
              </strong>
            </span>
          </p>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract content despite nesting issues
      expect(result.elements.length).toBeGreaterThan(0);
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('Deeply nested'))).toBe(true);
    });
  });

  describe('Special Characters and Encoding', () => {
    test('should handle Unicode characters', () => {
      const html = `
        <h1>Título en Español 🇪🇸</h1>
        <p>Content with émojis 😀 and spëcial chàracters</p>
        <div>Chinese: 你好世界</div>
        <span>Arabic: مرحبا بالعالم</span>
        <p>Math symbols: ∑ ∫ ∞ ≠ ≤ ≥</p>
      `;
      
      const result = partitioner.partition(html);
      
      expect(result.elements.length).toBeGreaterThan(4);
      
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('Título'))).toBe(true);
      expect(texts.some(text => text.includes('😀'))).toBe(true);
      expect(texts.some(text => text.includes('你好世界'))).toBe(true);
      expect(texts.some(text => text.includes('مرحبا'))).toBe(true);
      expect(texts.some(text => text.includes('∑'))).toBe(true);
    });

    test('should handle HTML entities', () => {
      const html = `
        <p>&lt;HTML&gt; entities &amp; special chars</p>
        <div>&quot;Quoted text&quot; with &apos;apostrophes&apos;</div>
        <span>&copy; 2024 &reg; &trade;</span>
        <p>&nbsp;&mdash;&ndash;&hellip;</p>
      `;
      
      const result = partitioner.partition(html);
      
      expect(result.elements.length).toBeGreaterThan(3);
      
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('<HTML>'))).toBe(true);
      expect(texts.some(text => text.includes('&'))).toBe(true);
      expect(texts.some(text => text.includes('"Quoted text"'))).toBe(true);
      expect(texts.some(text => text.includes('©'))).toBe(true);
    });

    test('should handle mixed encoding and special characters', () => {
      const html = `
        <div>Mixed content: ASCII, UTF-8 🌟, entities &amp;, and symbols ∞</div>
      `;
      
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].text).toContain('🌟');
      expect(result.elements[0].text).toContain('&');
      expect(result.elements[0].text).toContain('∞');
    });
  });

  describe('Large and Complex Documents', () => {
    test('should handle very large text content', () => {
      const largeText = 'A'.repeat(10000);
      const html = `<p>${largeText}</p>`;
      
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].text).toHaveLength(10000);
      expect(result.elements[0].metadata.textLength).toBe(10000);
    });

    test('should handle many sibling elements', () => {
      const elements = Array.from({ length: 500 }, (_, i) => 
        `<p>Paragraph ${i}</p>`
      ).join('');
      
      const html = `<div>${elements}</div>`;
      
      const startTime = Date.now();
      const result = partitioner.partition(html);
      const endTime = Date.now();
      
      // Should process efficiently
      expect(endTime - startTime).toBeLessThan(2000);
      expect(result.elements.length).toBeGreaterThan(400);
      expect(result.metadata.totalElements).toBeGreaterThan(400);
    });

    test('should handle deeply nested structures', () => {
      // Create 20 levels of nesting
      let html = '<div>Content';
      for (let i = 0; i < 20; i++) {
        html += `<div class="level-${i}">Level ${i}`;
      }
      for (let i = 0; i < 20; i++) {
        html += '</div>';
      }
      html += '</div>';
      
      const result = partitioner.partition(html);
      
      // Should handle deep nesting without stack overflow
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.metadata.totalElements).toBeGreaterThan(0);
    });
  });

  describe('Unusual HTML Structures', () => {
    test('should handle self-closing tags', () => {
      const html = `
        <div>
          <img src="test.jpg" alt="Test" />
          <br />
          <hr />
          <input type="text" name="test" />
          <meta charset="utf-8" />
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract images and handle self-closing tags
      const images = result.elements.filter(el => el.type === ElementType.IMAGE);
      expect(images.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle mixed content models', () => {
      const html = `
        <div>
          Text before
          <span>inline element</span>
          more text
          <p>block element</p>
          final text
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract meaningful content
      expect(result.elements.length).toBeGreaterThan(0);
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('inline element'))).toBe(true);
      expect(texts.some(text => text.includes('block element'))).toBe(true);
    });

    test('should handle CDATA sections', () => {
      const html = `
        <div>
          <script><![CDATA[
            function test() {
              return "CDATA content";
            }
          ]]></script>
          <p>Regular content</p>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should filter out script content but keep regular content
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('Regular content'))).toBe(true);
      expect(texts.some(text => text.includes('CDATA content'))).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    test('should handle processing errors gracefully', () => {
      // HTML that might cause parsing issues
      const html = `
        <div>
          <p>Valid content</p>
          <invalid-tag>Invalid but parseable</invalid-tag>
          <p>More valid content</p>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should continue processing despite errors
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.metadata.totalElements).toBeGreaterThan(0);
      
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('Valid content'))).toBe(true);
      expect(texts.some(text => text.includes('More valid content'))).toBe(true);
    });

    test('should provide meaningful metadata even with errors', () => {
      const html = '<div><p>Content</p><invalid></div>';
      
      const result = partitioner.partition(html);
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalElements).toBeGreaterThanOrEqual(0);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.elementTypeCounts).toBeDefined();
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle extreme minTextLength values', () => {
      const partitionerHighMin = new DOMPartitioner({ minTextLength: 1000 });
      const partitionerZeroMin = new DOMPartitioner({ minTextLength: 0 });
      
      const html = `
        <p>Short text</p>
        <p>This is a much longer paragraph with significantly more content that might meet high minimum length requirements.</p>
      `;
      
      const resultHigh = partitionerHighMin.partition(html);
      const resultZero = partitionerZeroMin.partition(html);
      
      // High minimum should filter out most content
      expect(resultHigh.elements.length).toBeLessThan(resultZero.elements.length);
      
      // Zero minimum should include everything
      expect(resultZero.elements.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle all extraction options disabled', () => {
      const minimalPartitioner = new DOMPartitioner({
        extractForms: false,
        extractImages: false,
        extractLinks: false,
        extractTables: false,
        includeOriginalHtml: false
      });
      
      const html = `
        <div>
          <h1>Title</h1>
          <p>Paragraph</p>
          <form><input type="text"></form>
          <img src="test.jpg" alt="Image">
          <a href="/link">Link</a>
          <table><tr><td>Cell</td></tr></table>
        </div>
      `;
      
      const result = minimalPartitioner.partition(html);
      
      // Should still extract basic text elements
      expect(result.elements.length).toBeGreaterThan(0);
      
      const texts = result.elements.map(el => el.text);
      expect(texts).toContain('Title');
      expect(texts).toContain('Paragraph');
      
      // Should not extract specialized elements
      const types = result.elements.map(el => el.type);
      expect(types).not.toContain(ElementType.FORM);
      expect(types).not.toContain(ElementType.IMAGE);
      expect(types).not.toContain(ElementType.LINK);
      expect(types).not.toContain(ElementType.TABLE);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    test('should handle circular references in DOM gracefully', () => {
      // While we can't create true circular references in HTML,
      // we can test with complex cross-references
      const html = `
        <div id="container">
          <p>Reference to <a href="#section1">Section 1</a></p>
          <div id="section1">
            <p>Back to <a href="#container">Container</a></p>
            <p>Also see <a href="#section2">Section 2</a></p>
          </div>
          <div id="section2">
            <p>Return to <a href="#section1">Section 1</a></p>
          </div>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should handle cross-references without infinite loops
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThan(1000);
    });

    test('should handle repeated processing of same content', () => {
      const html = '<h1>Test Title</h1><p>Test content</p>';
      
      // Process the same content multiple times
      const results = Array.from({ length: 10 }, () => partitioner.partition(html));
      
      // Results should be consistent
      results.forEach(result => {
        expect(result.elements).toHaveLength(2);
        expect(result.elements[0].text).toBe('Test Title');
        expect(result.elements[1].text).toBe('Test content');
      });
    });
  });
});