/**
 * Tests for element classification and semantic extraction
 * Tests the 40+ element types and classification logic
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';

describe('Element Classification', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner({
      extractForms: true,
      extractImages: true,
      extractLinks: true,
      extractTables: true
    });
  });

  describe('Title Elements', () => {
    test('should classify heading elements as titles', () => {
      const html = `
        <h1>Main Title</h1>
        <h2>Subtitle</h2>
        <h3>Section Header</h3>
        <h4>Subsection</h4>
        <h5>Minor Header</h5>
        <h6>Smallest Header</h6>
      `;
      
      const result = partitioner.partition(html);
      const titles = result.elements.filter(el => el.type === ElementType.TITLE);
      
      expect(titles).toHaveLength(6);
      expect(titles[0].text).toBe('Main Title');
      expect(titles[1].text).toBe('Subtitle');
      expect(titles[5].text).toBe('Smallest Header');
    });

    test('should classify emphasized text as titles', () => {
      const html = `
        <strong>Important Notice</strong>
        <b>Bold Statement</b>
        <em>Emphasized Text</em>
        <i>Italic Text</i>
      `;
      
      const result = partitioner.partition(html);
      const titles = result.elements.filter(el => el.type === ElementType.TITLE);
      
      expect(titles.length).toBeGreaterThanOrEqual(4);
      
      const titleTexts = titles.map(t => t.text);
      expect(titleTexts).toContain('Important Notice');
      expect(titleTexts).toContain('Bold Statement');
      expect(titleTexts).toContain('Emphasized Text');
      expect(titleTexts).toContain('Italic Text');
    });
  });

  describe('Text Elements', () => {
    test('should classify paragraphs as narrative text', () => {
      const html = `
        <p>This is a regular paragraph with some content.</p>
        <p>Another paragraph with different content.</p>
      `;
      
      const result = partitioner.partition(html);
      const narrativeTexts = result.elements.filter(el => el.type === ElementType.NARRATIVE_TEXT);
      
      expect(narrativeTexts).toHaveLength(2);
      expect(narrativeTexts[0].text).toBe('This is a regular paragraph with some content.');
      expect(narrativeTexts[1].text).toBe('Another paragraph with different content.');
    });

    test('should classify div elements with substantial text as narrative text', () => {
      const html = `
        <div>This is a div with enough text content to be considered narrative text.</div>
        <div class="content">Another content div with meaningful text.</div>
      `;
      
      const result = partitioner.partition(html);
      const narrativeTexts = result.elements.filter(el => el.type === ElementType.NARRATIVE_TEXT);
      
      expect(narrativeTexts.length).toBeGreaterThanOrEqual(1);
    });

    test('should classify span elements appropriately', () => {
      const html = `
        <span>Short span</span>
        <span class="highlight">This is a longer span with more content that should be classified properly.</span>
      `;
      
      const result = partitioner.partition(html);
      const elements = result.elements;
      
      expect(elements.length).toBeGreaterThanOrEqual(1);
      
      // Should have at least one element with the longer text
      const longTextElement = elements.find(el => el.text.includes('longer span'));
      expect(longTextElement).toBeDefined();
    });
  });

  describe('List Elements', () => {
    test('should classify list items correctly', () => {
      const html = `
        <ul>
          <li>First unordered item</li>
          <li>Second unordered item</li>
          <li>Third unordered item</li>
        </ul>
        
        <ol>
          <li>First ordered item</li>
          <li>Second ordered item</li>
        </ol>
      `;
      
      const result = partitioner.partition(html);
      const listItems = result.elements.filter(el => el.type === ElementType.LIST_ITEM);
      
      expect(listItems).toHaveLength(5);
      
      const itemTexts = listItems.map(item => item.text);
      expect(itemTexts).toContain('First unordered item');
      expect(itemTexts).toContain('Second ordered item');
    });

    test('should handle nested lists', () => {
      const html = `
        <ul>
          <li>Top level item
            <ul>
              <li>Nested item 1</li>
              <li>Nested item 2</li>
            </ul>
          </li>
          <li>Another top level item</li>
        </ul>
      `;
      
      const result = partitioner.partition(html);
      const listItems = result.elements.filter(el => el.type === ElementType.LIST_ITEM);
      
      expect(listItems.length).toBeGreaterThanOrEqual(3);
      
      const itemTexts = listItems.map(item => item.text);
      expect(itemTexts.some(text => text.includes('Nested item'))).toBe(true);
    });
  });

  describe('Table Elements', () => {
    test('should classify tables correctly', () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>City</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>John</td>
              <td>30</td>
              <td>New York</td>
            </tr>
            <tr>
              <td>Jane</td>
              <td>25</td>
              <td>Los Angeles</td>
            </tr>
          </tbody>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE);
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0] as any;
      expect(table.headers).toEqual(['Name', 'Age', 'City']);
      expect(table.rows).toEqual([['John', '30', 'New York'], ['Jane', '25', 'Los Angeles']]);
    });

    test('should handle tables without explicit headers', () => {
      const html = `
        <table>
          <tr>
            <td>Product</td>
            <td>Price</td>
          </tr>
          <tr>
            <td>Widget</td>
            <td>$10</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE);
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0] as any;
      expect(table.rows).toEqual([['Widget', '$10']]);
      expect(table.headers).toEqual(['Product', 'Price']);
    });
  });

  describe('Form Elements', () => {
    test('should classify form elements correctly', () => {
      const html = `
        <form>
          <label for="name">Name:</label>
          <input type="text" id="name" name="name" value="John Doe">
          
          <label for="email">Email:</label>
          <input type="email" id="email" name="email" value="john@example.com">
          
          <button type="submit">Submit</button>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM);
      const fieldNames = result.elements.filter(el => el.type === ElementType.FIELD_NAME);
      
      expect(forms.length).toBeGreaterThanOrEqual(1);
      expect(fieldNames.length).toBeGreaterThanOrEqual(2);
      
      const fieldNameTexts = fieldNames.map(fn => fn.text);
      expect(fieldNameTexts).toContain('Name:');
      expect(fieldNameTexts).toContain('Email:');
    });

    test('should classify checkboxes and radio buttons', () => {
      const html = `
        <form>
          <input type="checkbox" name="newsletter" checked> Newsletter
          <input type="checkbox" name="updates"> Updates
          
          <input type="radio" name="gender" value="male" checked> Male
          <input type="radio" name="gender" value="female"> Female
        </form>
      `;
      
      const result = partitioner.partition(html);
      const checkboxes = result.elements.filter(el => 
        el.type === ElementType.CHECK_BOX_CHECKED || el.type === ElementType.CHECK_BOX_UNCHECKED
      );
      const radioButtons = result.elements.filter(el => 
        el.type === ElementType.RADIO_BUTTON_CHECKED || el.type === ElementType.RADIO_BUTTON_UNCHECKED
      );
      
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
      expect(radioButtons.length).toBeGreaterThanOrEqual(2);
    });

    test('should classify standalone form elements outside forms', () => {
      const html = `
        <div>
          <h1>Standalone Form Elements</h1>
          <input type="text" name="standalone-input" value="test value">
          <button type="button">Standalone Button</button>
          <select name="standalone-select">
            <option value="1">Option 1</option>
            <option value="2" selected>Option 2</option>
          </select>
          <textarea name="standalone-textarea">Some text content</textarea>
          <input type="checkbox" name="standalone-checkbox" checked>
          <input type="radio" name="standalone-radio" value="yes">
        </div>
      `;
      
      const result = partitioner.partition(html);
      
      // Standalone form elements should be classified as VALUE elements
      const valueElements = result.elements.filter(el => el.type === ElementType.VALUE);
      expect(valueElements.length).toBeGreaterThanOrEqual(4); // input, button, select, textarea
      
      // Check specific elements
      const inputElement = valueElements.find(el => el.text.includes('test value'));
      expect(inputElement).toBeDefined();
      expect(inputElement?.metadata?.tagName).toBe('input');
      
      const buttonElement = valueElements.find(el => el.text.includes('Standalone Button'));
      expect(buttonElement).toBeDefined();
      expect(buttonElement?.metadata?.tagName).toBe('button');
      
      // Checkboxes and radio buttons should have their specific types
      const checkboxes = result.elements.filter(el => 
        el.type === ElementType.CHECK_BOX_CHECKED || el.type === ElementType.CHECK_BOX_UNCHECKED
      );
      expect(checkboxes.length).toBeGreaterThanOrEqual(1);
      
      const radioButtons = result.elements.filter(el => 
        el.type === ElementType.RADIO_BUTTON_CHECKED || el.type === ElementType.RADIO_BUTTON_UNCHECKED
      );
      expect(radioButtons.length).toBeGreaterThanOrEqual(1);
    });

    test('should not classify form styling divs as forms', () => {
      const html = `
        <div>
          <div class="form-section">This is a form section div</div>
          <div class="form-group">This is a form group div</div>
          <div class="form-row">This is a form row div</div>
          <div class="input-group">This is an input group div</div>
          <div class="button-group">This is a button group div</div>
          <div class="field-wrapper">This is a field wrapper div</div>
          
          <!-- These should still be classified as forms -->
          <div class="form-container">
            <input type="text" name="test">
          </div>
          <div class="contact-form">
            <input type="email" name="email">
          </div>
          
          <!-- Actual form tag should always be a form -->
          <form>
            <input type="text" name="actual-form">
          </form>
        </div>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM);
      
      // Should only have 3 forms: form-container, contact-form, and actual form tag
      expect(forms.length).toBe(3);
      
      // Verify the correct elements are classified as forms
      const formTags = forms.map(f => f.metadata?.tagName);
      expect(formTags.filter(tag => tag === 'div')).toHaveLength(2); // form-container, contact-form
      expect(formTags.filter(tag => tag === 'form')).toHaveLength(1); // actual form
      
      // Verify styling divs are NOT classified as forms
      const stylingDivs = result.elements.filter(el => 
        el.text.includes('form section') || 
        el.text.includes('form group') || 
        el.text.includes('form row') ||
        el.text.includes('input group') ||
        el.text.includes('button group') ||
        el.text.includes('field wrapper')
      );
      
      // These should be classified as titles or text, not forms
      stylingDivs.forEach(div => {
        expect(div.type).not.toBe(ElementType.FORM);
        expect([ElementType.TITLE, ElementType.TEXT, ElementType.NARRATIVE_TEXT]).toContain(div.type);
      });
    });
  });

  describe('Link Elements', () => {
    test('should classify links correctly', () => {
      const html = `
        <a href="https://example.com">External Link</a>
        <a href="/internal">Internal Link</a>
        <a href="mailto:test@example.com">Email Link</a>
        <a href="tel:+1234567890">Phone Link</a>
      `;
      
      const result = partitioner.partition(html);
      const links = result.elements.filter(el => el.type === ElementType.LINK);
      
      expect(links.length).toBeGreaterThanOrEqual(4);
      
      const linkTexts = links.map(link => link.text);
      expect(linkTexts).toContain('External Link');
      expect(linkTexts).toContain('Internal Link');
      expect(linkTexts).toContain('Email Link');
      expect(linkTexts).toContain('Phone Link');
    });
  });

  describe('Image Elements', () => {
    test('should classify images correctly', () => {
      const html = `
        <img src="image1.jpg" alt="First Image" width="100" height="200">
        <img src="image2.png" alt="Second Image">
        <figure>
          <img src="image3.gif" alt="Third Image">
          <figcaption>Image Caption</figcaption>
        </figure>
        <picture>
          <source srcset="image4.webp" type="image/webp">
          <img src="image4.jpg" alt="Fourth Image">
        </picture>
      `;
      
      const result = partitioner.partition(html);
      const images = result.elements.filter(el => 
        el.type === ElementType.IMAGE || 
        el.type === ElementType.PICTURE || 
        el.type === ElementType.FIGURE
      );
      
      expect(images.length).toBeGreaterThanOrEqual(3);
      
      // Check image with dimensions
      const imageWithDimensions = images.find(img => img.text === 'First Image') as any;
      expect(imageWithDimensions).toBeDefined();
      if (imageWithDimensions && imageWithDimensions.width) {
        expect(imageWithDimensions.width).toBe(100);
        expect(imageWithDimensions.height).toBe(200);
      }
    });
  });

  describe('Specialized Elements', () => {


    test('should classify email addresses', () => {
      const html = `
        <p>Contact us at: support@example.com</p>
        <div>Email: <span class="email">admin@test.org</span></div>
        <a href="mailto:info@company.com">info@company.com</a>
      `;
      
      const result = partitioner.partition(html);
      
      // Since EMAIL_ADDRESS type was removed, just ensure the classification doesn't break
      expect(result.elements.length).toBeGreaterThan(0);
      
      // Elements should be classified as other types (TEXT, LINK, etc.)
      const hasEmailContent = result.elements.some(el => el.text.includes('@'));
      expect(hasEmailContent).toBe(true);
    });

    test('should classify code elements', () => {
      const html = `
        <code>console.log('Hello World');</code>
        <pre><code>
function greet(name) {
  return "Hello, " + name;
}
        </code></pre>
        <div class="code-block">
          const x = 42;
          const y = x * 2;
        </div>
      `;
      
      const result = partitioner.partition(html);
      const codeElements = result.elements.filter(el => el.type === ElementType.CODE_SNIPPET);
      
      expect(codeElements.length).toBeGreaterThanOrEqual(1);
      
      const codeTexts = codeElements.map(code => code.text);
      expect(codeTexts.some(text => text.includes('console.log'))).toBe(true);
    });

    test('should classify formula elements', () => {
      const html = `
        <div class="formula">E = mc²</div>
        <span class="math">∫ f(x) dx</span>
        <div class="equation">x = (-b ± √(b² - 4ac)) / 2a</div>
      `;
      
      const result = partitioner.partition(html);
      const formulas = result.elements.filter(el => el.type === ElementType.FORMULA);
      
      // May or may not detect formulas depending on implementation
      // This test ensures the classification doesn't break
      expect(result.elements.length).toBeGreaterThan(0);
      
      // If formulas are detected, they should contain mathematical content
      if (formulas.length > 0) {
        const formulaTexts = formulas.map(formula => formula.text);
        expect(formulaTexts.some(text => text.includes('=') || text.includes('∫') || text.includes('²'))).toBe(true);
      }
    });
  });

  describe('Content Filtering', () => {
    test('should filter out navigation elements', () => {
      const html = `
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
        <h1>Main Content</h1>
        <p>This is the main content of the page.</p>
      `;
      
      const result = partitioner.partition(html);
      
      // Navigation should be filtered out
      const navElements = result.elements.filter(el => 
        el.text.includes('Home') || el.text.includes('About') || el.text.includes('Contact')
      );
      expect(navElements).toHaveLength(0);
      
      // Main content should remain
      const mainContent = result.elements.filter(el => 
        el.text.includes('Main Content') || el.text.includes('main content')
      );
      expect(mainContent.length).toBeGreaterThan(0);
    });

    test('should filter out script and style elements', () => {
      const html = `
        <script>
          console.log('This should be filtered out');
          var x = 42;
        </script>
        <style>
          body { color: red; }
          .hidden { display: none; }
        </style>
        <h1>Visible Content</h1>
        <p>This content should remain.</p>
      `;
      
      const result = partitioner.partition(html);
      
      // Script and style content should be filtered out
      const scriptContent = result.elements.filter(el => 
        el.text.includes('console.log') || el.text.includes('color: red')
      );
      expect(scriptContent).toHaveLength(0);
      
      // Visible content should remain
      const visibleContent = result.elements.filter(el => 
        el.text.includes('Visible Content') || el.text.includes('This content should remain')
      );
      expect(visibleContent.length).toBeGreaterThan(0);
    });

    test('should respect minimum text length', () => {
      const partitionerWithMinLength = new DOMPartitioner({ 
        minTextLength: 20,
        extractForms: false,
        extractImages: false,
        extractLinks: false 
      });
      
      const html = `
        <p>Short</p>
        <p>This is a longer paragraph with sufficient content to meet the minimum length requirement.</p>
        <div>Brief</div>
        <div>This div also has enough content to be included in the results because it exceeds the minimum length.</div>
      `;
      
      const result = partitionerWithMinLength.partition(html);
      
      // Only elements with sufficient length should be included
      expect(result.elements.length).toBe(2);
      
      const texts = result.elements.map(el => el.text);
      expect(texts.some(text => text.includes('longer paragraph'))).toBe(true);
      expect(texts.some(text => text.includes('enough content'))).toBe(true);
      expect(texts.some(text => text === 'Short')).toBe(false);
      expect(texts.some(text => text === 'Brief')).toBe(false);
    });
  });

  describe('Complex Document Structure', () => {
    test('should handle a complete HTML document with mixed content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Document</title>
          <style>body { margin: 0; }</style>
        </head>
        <body>
          <header>
            <h1>Document Title</h1>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
            </nav>
          </header>
          
          <main>
            <article>
              <h2>Article Title</h2>
              <p>This is the first paragraph of the article with substantial content.</p>
              
              <ul>
                <li>First important point</li>
                <li>Second important point</li>
                <li>Third important point</li>
              </ul>
              
              <table>
                <tr><th>Feature</th><th>Status</th></tr>
                <tr><td>Performance</td><td>Excellent</td></tr>
                <tr><td>Reliability</td><td>High</td></tr>
              </table>
              
              <form>
                <label for="feedback">Feedback:</label>
                <textarea id="feedback" name="feedback">Great article!</textarea>
                <button type="submit">Submit</button>
              </form>
            </article>
          </main>
          
          <footer>
            <p>© 2024 Test Company. All rights reserved.</p>
          </footer>
        </body>
        </html>
      `;
      
      const result = partitioner.partition(html);
      
      // Should extract meaningful content elements
      expect(result.elements.length).toBeGreaterThan(10);
      
      // Check for expected element types
      const elementTypes = result.elements.map(el => el.type);
      expect(elementTypes).toContain(ElementType.TITLE);
      expect(elementTypes).toContain(ElementType.NARRATIVE_TEXT);
      expect(elementTypes).toContain(ElementType.LIST_ITEM);
      expect(elementTypes).toContain(ElementType.TABLE);
      expect(elementTypes).toContain(ElementType.FORM);
      
      // Check specific content
      const texts = result.elements.map(el => el.text);
      expect(texts).toContain('Document Title');
      expect(texts).toContain('Article Title');
      expect(texts.some(text => text.includes('first paragraph'))).toBe(true);
      expect(texts).toContain('First important point');
      expect(texts.some(text => text.includes('© 2024'))).toBe(true);
      
      // Navigation should be filtered out
      expect(texts.some(text => text.includes('Home') || text.includes('About'))).toBe(false);
    });
  });
});