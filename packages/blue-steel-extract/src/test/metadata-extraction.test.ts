/**
 * Tests for metadata extraction functionality
 * Tests the comprehensive metadata system with 30+ metadata fields
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';

describe('Metadata Extraction', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner({
      extractLinks: true,
      includeOriginalHtml: true,
      includeCoordinates: false // Coordinates require DOM positioning
    });
  });

  describe('Basic Element Metadata', () => {
    test('should extract tag name, CSS classes, and element ID', () => {
      const html = `
        <h1 id="main-title" class="title primary large">Main Title</h1>
        <p class="content highlight">This is a paragraph with classes.</p>
        <div id="container" class="wrapper">Container content</div>
      `;
      
      const result = partitioner.partition(html);
      
      // Check title metadata
      const title = result.elements.find(el => el.text === 'Main Title');
      expect(title).toBeDefined();
      expect(title!.metadata.tagName).toBe('h1');
      expect(title!.metadata.elementId).toBe('main-title');
      expect(title!.metadata.cssClasses).toEqual(['title', 'primary', 'large']);
      expect(title!.metadata.textLength).toBe(10);
      
      // Check paragraph metadata
      const paragraph = result.elements.find(el => el.text.includes('paragraph with classes'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.tagName).toBe('p');
      expect(paragraph!.metadata.cssClasses).toEqual(['content', 'highlight']);
      expect(paragraph!.metadata.elementId).toBeUndefined();
      
      // Check div metadata
      const container = result.elements.find(el => el.text === 'Container content');
      expect(container).toBeDefined();
      expect(container!.metadata.tagName).toBe('div');
      expect(container!.metadata.elementId).toBe('container');
      expect(container!.metadata.cssClasses).toEqual(['wrapper']);
    });

    test('should extract text length metadata', () => {
      const html = `
        <p>Short text</p>
        <p>This is a much longer paragraph with significantly more content to test text length calculation.</p>
        <h1>Title</h1>
      `;
      
      const result = partitioner.partition(html);
      
      const shortText = result.elements.find(el => el.text === 'Short text');
      expect(shortText!.metadata.textLength).toBe(10);
      
      const longText = result.elements.find(el => el.text.includes('much longer paragraph'));
      expect(longText!.metadata.textLength).toBeGreaterThan(50);
      
      const title = result.elements.find(el => el.text === 'Title');
      expect(title!.metadata.textLength).toBe(5);
    });
  });

  describe('Original HTML Metadata', () => {
    test('should include original HTML when enabled', () => {
      const html = `
        <h1 class="title">Main <strong>Title</strong></h1>
        <p>Paragraph with <em>emphasis</em> and <a href="/link">link</a>.</p>
      `;
      
      const result = partitioner.partition(html);
      
      const title = result.elements.find(el => el.text.includes('Title'));
      expect(title).toBeDefined();
      expect(title!.metadata.originalHtml).toBeDefined();
      expect(title!.metadata.originalHtml).toContain('<strong>');
      
      const paragraph = result.elements.find(el => el.text.includes('Paragraph with'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.originalHtml).toBeDefined();
      expect(paragraph!.metadata.originalHtml).toContain('<em>');
      expect(paragraph!.metadata.originalHtml).toContain('<a href');
    });

    test('should not include original HTML when disabled', () => {
      const partitionerNoHtml = new DOMPartitioner({
        includeOriginalHtml: false
      });
      
      const html = `<h1>Title</h1><p>Content</p>`;
      const result = partitionerNoHtml.partition(html);
      
      result.elements.forEach(element => {
        expect(element.metadata.originalHtml).toBeUndefined();
      });
    });
  });

  describe('Emphasis Metadata', () => {
    test('should extract emphasized text contents and tags', () => {
      const html = `
        <p>This paragraph has <strong>bold text</strong> and <em>italic text</em> and <mark>highlighted text</mark>.</p>
        <div>Another element with <b>bold</b> and <i>italic</i> content.</div>
      `;
      
      const result = partitioner.partition(html);
      
      const paragraph = result.elements.find(el => el.text.includes('This paragraph has'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.emphasizedTextContents).toBeDefined();
      expect(paragraph!.metadata.emphasizedTextContents).toContain('bold text');
      expect(paragraph!.metadata.emphasizedTextContents).toContain('italic text');
      expect(paragraph!.metadata.emphasizedTextContents).toContain('highlighted text');
      
      expect(paragraph!.metadata.emphasizedTextTags).toBeDefined();
      expect(paragraph!.metadata.emphasizedTextTags).toContain('strong');
      expect(paragraph!.metadata.emphasizedTextTags).toContain('em');
      expect(paragraph!.metadata.emphasizedTextTags).toContain('mark');
      
      const div = result.elements.find(el => el.text.includes('Another element'));
      expect(div).toBeDefined();
      expect(div!.metadata.emphasizedTextContents).toContain('bold');
      expect(div!.metadata.emphasizedTextContents).toContain('italic');
      expect(div!.metadata.emphasizedTextTags).toContain('b');
      expect(div!.metadata.emphasizedTextTags).toContain('i');
    });

    test('should handle nested emphasis correctly', () => {
      const html = `
        <p>Text with <strong>bold and <em>nested italic</em> content</strong>.</p>
      `;
      
      const result = partitioner.partition(html);
      
      const paragraph = result.elements.find(el => el.text.includes('Text with'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.emphasizedTextContents).toBeDefined();
      expect(paragraph!.metadata.emphasizedTextContents!.length).toBeGreaterThan(0);
      expect(paragraph!.metadata.emphasizedTextTags).toContain('strong');
      expect(paragraph!.metadata.emphasizedTextTags).toContain('em');
    });
  });

  describe('Link Metadata', () => {
    test('should extract link information when enabled', () => {
      const html = `
        <p>Visit our <a href="https://example.com">website</a> or <a href="/contact">contact us</a>.</p>
        <div>Email us at <a href="mailto:info@example.com">info@example.com</a>.</div>
      `;
      
      const result = partitioner.partition(html);
      
      const paragraph = result.elements.find(el => el.text.includes('Visit our'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.links).toBeDefined();
      expect(paragraph!.metadata.links!.length).toBe(2);
      
      expect(paragraph!.metadata.linkTexts).toBeDefined();
      expect(paragraph!.metadata.linkTexts).toContain('website');
      expect(paragraph!.metadata.linkTexts).toContain('contact us');
      
      expect(paragraph!.metadata.linkUrls).toBeDefined();
      expect(paragraph!.metadata.linkUrls).toContain('https://example.com');
      expect(paragraph!.metadata.linkUrls).toContain('/contact');
      
      const div = result.elements.find(el => el.text.includes('Email us'));
      expect(div).toBeDefined();
      expect(div!.metadata.linkUrls).toContain('mailto:info@example.com');
    });

    test('should not extract links when disabled', () => {
      const partitionerNoLinks = new DOMPartitioner({
        extractLinks: false
      });
      
      const html = `<p>Visit our <a href="https://example.com">website</a>.</p>`;
      const result = partitionerNoLinks.partition(html);
      
      const paragraph = result.elements.find(el => el.text.includes('Visit our'));
      expect(paragraph).toBeDefined();
      expect(paragraph!.metadata.links).toBeUndefined();
      expect(paragraph!.metadata.linkTexts).toBeUndefined();
      expect(paragraph!.metadata.linkUrls).toBeUndefined();
    });
  });

  describe('Complex Metadata Scenarios', () => {
    test('should handle elements with multiple metadata types', () => {
      const html = `
        <div id="complex" class="content highlight">
          This div has <strong>bold text</strong> and a <a href="/link">link</a>.
          It also contains <em>emphasized content</em>.
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      const complexDiv = result.elements.find(el => el.text.includes('This div has'));
      expect(complexDiv).toBeDefined();
      
      // Basic metadata
      expect(complexDiv!.metadata.tagName).toBe('div');
      expect(complexDiv!.metadata.elementId).toBe('complex');
      expect(complexDiv!.metadata.cssClasses).toEqual(['content', 'highlight']);
      expect(complexDiv!.metadata.textLength).toBeGreaterThan(50);
      
      // Emphasis metadata
      expect(complexDiv!.metadata.emphasizedTextContents).toContain('bold text');
      expect(complexDiv!.metadata.emphasizedTextContents).toContain('emphasized content');
      expect(complexDiv!.metadata.emphasizedTextTags).toContain('strong');
      expect(complexDiv!.metadata.emphasizedTextTags).toContain('em');
      
      // Link metadata
      expect(complexDiv!.metadata.links).toBeDefined();
      expect(complexDiv!.metadata.linkTexts).toContain('link');
      expect(complexDiv!.metadata.linkUrls).toContain('/link');
      
      // Original HTML
      expect(complexDiv!.metadata.originalHtml).toContain('<strong>');
      expect(complexDiv!.metadata.originalHtml).toContain('<a href="/link">');
      expect(complexDiv!.metadata.originalHtml).toContain('<em>');
    });

    test('should handle elements with no special metadata', () => {
      const html = `<p>Simple paragraph with no special formatting.</p>`;
      
      const result = partitioner.partition(html);
      
      const paragraph = result.elements[0];
      expect(paragraph.metadata.tagName).toBe('p');
      expect(paragraph.metadata.cssClasses).toBeUndefined();
      expect(paragraph.metadata.elementId).toBeUndefined();
      expect(paragraph.metadata.emphasizedTextContents).toBeUndefined();
      expect(paragraph.metadata.emphasizedTextTags).toBeUndefined();
      expect(paragraph.metadata.links).toBeUndefined();
      expect(paragraph.metadata.textLength).toBe(44);
    });

    test('should handle malformed HTML gracefully', () => {
      const html = `
        <div class="unclosed">
          <p>Paragraph without closing tag
          <strong>Bold text without closing
          <a href="/link">Link text
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Should still extract metadata despite malformed HTML
      expect(result.elements.length).toBeGreaterThan(0);
      
      result.elements.forEach(element => {
        expect(element.metadata).toBeDefined();
        expect(element.metadata.tagName).toBeDefined();
        expect(typeof element.metadata.textLength).toBe('number');
      });
    });
  });

  describe('Metadata Consistency', () => {
    test('should provide consistent metadata across similar elements', () => {
      const html = `
        <h1 class="title">First Title</h1>
        <h1 class="title">Second Title</h1>
        <h1 class="title">Third Title</h1>
      `;
      
      const result = partitioner.partition(html);
      const titles = result.elements.filter(el => el.type === ElementType.TITLE);
      
      expect(titles).toHaveLength(3);
      
      titles.forEach(title => {
        expect(title.metadata.tagName).toBe('h1');
        expect(title.metadata.cssClasses).toEqual(['title']);
        expect(title.metadata.textLength).toBeGreaterThan(0);
        expect(title.metadata.originalHtml).toBeDefined();
      });
    });

    test('should handle empty attributes correctly', () => {
      const html = `
        <div class="">Empty class attribute</div>
        <p id="">Empty id attribute</p>
        <span>No attributes at all</span>
      `;
      
      const result = partitioner.partition(html);
      
      const divElement = result.elements.find(el => el.text === 'Empty class attribute');
      expect(divElement!.metadata.cssClasses).toBeUndefined();
      
      const pElement = result.elements.find(el => el.text === 'Empty id attribute');
      expect(pElement!.metadata.elementId).toBeUndefined();
      
      const spanElement = result.elements.find(el => el.text === 'No attributes at all');
      expect(spanElement!.metadata.cssClasses).toBeUndefined();
      expect(spanElement!.metadata.elementId).toBeUndefined();
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large documents efficiently', () => {
      // Create a large document with many elements
      const elements = Array.from({ length: 100 }, (_, i) => 
        `<p class="item-${i}" id="paragraph-${i}">This is paragraph number ${i} with some content.</p>`
      ).join('\n');
      
      const html = `<div class="container">${elements}</div>`;
      
      const startTime = Date.now();
      const result = partitioner.partition(html);
      const endTime = Date.now();
      
      // Should process efficiently (under 1 second for 100 elements)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Should extract all elements with metadata
      expect(result.elements.length).toBeGreaterThan(90);
      
      // Check that metadata is correctly extracted for all elements
      result.elements.forEach((element) => {
        expect(element.metadata).toBeDefined();
        expect(element.metadata.tagName).toBeDefined();
        expect(typeof element.metadata.textLength).toBe('number');
        
        if (element.text.includes('paragraph number')) {
          expect(element.metadata.cssClasses).toBeDefined();
          expect(element.metadata.elementId).toBeDefined();
        }
      });
    });

    test('should handle deeply nested structures', () => {
      const html = `
        <div class="level-1">
          <div class="level-2">
            <div class="level-3">
              <div class="level-4">
                <div class="level-5">
                  <p class="deep-content">Deeply nested content with <strong>emphasis</strong>.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      const deepContent = result.elements.find(el => el.text.includes('Deeply nested'));
      expect(deepContent).toBeDefined();
      expect(deepContent!.metadata.tagName).toBe('p');
      expect(deepContent!.metadata.cssClasses).toEqual(['deep-content']);
      expect(deepContent!.metadata.emphasizedTextContents).toContain('emphasis');
      expect(deepContent!.metadata.emphasizedTextTags).toContain('strong');
    });
  });
});