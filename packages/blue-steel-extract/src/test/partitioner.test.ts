/**
 * Tests for the DOMPartitioner class
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';

describe('DOMPartitioner', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner();
  });

  describe('basic partitioning', () => {
    test('should extract title elements', () => {
      const html = '<h1>Main Title</h1><h2>Subtitle</h2>';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].type).toBe(ElementType.TITLE);
      expect(result.elements[0].text).toBe('Main Title');
      expect(result.elements[1].type).toBe(ElementType.TITLE);
      expect(result.elements[1].text).toBe('Subtitle');
    });

    test('should extract paragraph elements', () => {
      const html = '<p>This is a paragraph.</p>';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe(ElementType.NARRATIVE_TEXT);
      expect(result.elements[0].text).toBe('This is a paragraph.');
    });

    test('should extract list items', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].type).toBe(ElementType.LIST_ITEM);
      expect(result.elements[0].text).toBe('Item 1');
      expect(result.elements[1].type).toBe(ElementType.LIST_ITEM);
      expect(result.elements[1].text).toBe('Item 2');
    });
  });

  describe('table extraction', () => {
     test('should extract table with headers', () => {      const html = `
        <table>
          <thead>
            <tr><th>Name</th><th>Age</th></tr>
          </thead>
          <tbody>
            <tr><td>John</td><td>30</td></tr>
            <tr><td>Jane</td><td>25</td></tr>
          </tbody>
        </table>
      `;
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      const table = result.elements[0];
      expect(table.type).toBe(ElementType.TABLE);
      
      if (table.type === ElementType.TABLE) {
        const tableElement = table as any;
        expect(tableElement.headers).toEqual(['Name', 'Age']);
        expect(tableElement.rows).toEqual([['John', '30'], ['Jane', '25']]);
      }
    });

    test('should extract table without explicit headers', () => {
      const html = `
        <table>
          <tr><td>Name</td><td>Age</td></tr>
          <tr><td>John</td><td>30</td></tr>
        </table>
      `;
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      const table = result.elements[0];
      expect(table.type).toBe(ElementType.TABLE);
      
      if (table.type === ElementType.TABLE) {
        const tableElement = table as any;
        expect(tableElement.rows).toEqual([['John', '30']]);
        expect(tableElement.headers).toEqual(['Name', 'Age']);
      }
    });
  });

  describe('image extraction', () => {
    test('should extract image elements', () => {
      const html = '<img src="test.jpg" alt="Test image" width="100" height="200">';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      const image = result.elements[0];
      expect(image.type).toBe(ElementType.IMAGE);
      
      if (image.type === ElementType.IMAGE) {
        const imageElement = image as any;
        expect(imageElement.src).toBe('test.jpg');
        expect(imageElement.alt).toBe('Test image');
        expect(imageElement.width).toBe(100);
        expect(imageElement.height).toBe(200);
        expect(imageElement.text).toBe('Test image');
      }
    });
  });

  describe('content filtering', () => {
    test('should remove navigation elements by default', () => {
      const html = `
        <nav>Navigation menu</nav>
        <h1>Title</h1>
        <p>Content</p>
      `;
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].type).toBe(ElementType.TITLE);
      expect(result.elements[1].type).toBe(ElementType.NARRATIVE_TEXT);
    });

    test('should remove script and style elements', () => {
      const html = `
        <script>alert('test');</script>
        <style>body { color: red; }</style>
        <h1>Title</h1>
      `;
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe(ElementType.TITLE);
    });

    test('should respect minTextLength option', () => {
      const partitionerWithMinLength = new DOMPartitioner({ minTextLength: 20 });
      const html = '<p>Short</p><p>This is a longer paragraph with more content</p>';
      const result = partitionerWithMinLength.partition(html);
      
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].text).toBe('This is a longer paragraph with more content');
    });
  });

  describe('metadata extraction', () => {
    test('should extract element metadata', () => {
      const html = '<h1 id="main-title" class="title primary">Main Title</h1>';
      const result = partitioner.partition(html);
      
      expect(result.elements).toHaveLength(1);
      const element = result.elements[0];
      expect(element.metadata.tagName).toBe('h1');
      expect(element.metadata.elementId).toBe('main-title');
      expect(element.metadata.cssClasses).toEqual(['title', 'primary']);
      expect(element.metadata.textLength).toBe(10);
    });
  });

  describe('complex documents', () => {
    test('should handle a complete HTML document', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <style>body { margin: 0; }</style>
        </head>
        <body>
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
          </nav>
          <header>
            <h1>Welcome to Our Site</h1>
          </header>
          <main>
            <article>
              <h2>Article Title</h2>
              <p>This is the first paragraph of the article.</p>
              <p>This is the second paragraph with more content.</p>
              <ul>
                <li>First point</li>
                <li>Second point</li>
              </ul>
              <table>
                <tr><th>Feature</th><th>Status</th></tr>
                <tr><td>Fast</td><td>✓</td></tr>
                <tr><td>Reliable</td><td>✓</td></tr>
              </table>
            </article>
          </main>
          <footer>
            <p>© 2024 Test Company</p>
          </footer>
        </body>
        </html>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract meaningful content elements
      expect(result.elements.length).toBeGreaterThan(5);
      
      // Check for expected element types
      const elementTypes = result.elements.map(el => el.type);
      expect(elementTypes).toContain(ElementType.TITLE);
      expect(elementTypes).toContain(ElementType.NARRATIVE_TEXT);
      expect(elementTypes).toContain(ElementType.LIST_ITEM);
      expect(elementTypes).toContain(ElementType.TABLE);
      
      // Navigation should be filtered out
      const navElements = result.elements.filter(el => 
        el.text.includes('Home') || el.text.includes('About')
      );
      expect(navElements).toHaveLength(0);
    });
  });
});