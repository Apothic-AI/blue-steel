/**
 * Tests for the markdown serializer
 */

import { describe, test as it, expect } from 'bun:test';
import { MarkdownSerializer, serializeToMarkdown } from '../markdown-serializer.js';
import { ElementType } from '../types.js';
import type { 
  Element, 
  TableElement, 
  ImageElement, 
  FormElement, 
  CheckBoxElement,
  RadioButtonElement,
  LinkElement,
  // AddressElement and EmailAddressElement removed
  CodeElement,
  FormulaElement,
  CompositeElement,
  PartitionResult 
} from '../types.js';

describe('MarkdownSerializer', () => {
  const createBaseElement = (type: ElementType, text: string, id = 'test-id'): Element => ({
    id,
    type,
    text,
    metadata: {}
  });

  describe('Basic text elements', () => {
    it('should serialize titles with proper heading levels', () => {
      const serializer = new MarkdownSerializer();
      
      const title = createBaseElement(ElementType.TITLE, 'Main Title');
      expect(serializer.serializeElements([title])).toBe('# Main Title');
      
      const titleWithDepth = {
        ...title,
        metadata: { categoryDepth: 2 }
      };
      expect(serializer.serializeElements([titleWithDepth])).toBe('### Main Title');
    });

    it('should serialize headers and subheaders', () => {
      const serializer = new MarkdownSerializer();
      
      const header = createBaseElement(ElementType.HEADER, 'Section Header');
      expect(serializer.serializeElements([header])).toBe('## Section Header');
      
      const headline = createBaseElement(ElementType.HEADLINE, 'Headline');
      expect(serializer.serializeElements([headline])).toBe('### Headline');
      
      const subheadline = createBaseElement(ElementType.SUB_HEADLINE, 'Sub Headline');
      expect(serializer.serializeElements([subheadline])).toBe('#### Sub Headline');
    });

    it('should serialize narrative text and paragraphs', () => {
      const serializer = new MarkdownSerializer();
      
      const narrative = createBaseElement(ElementType.NARRATIVE_TEXT, 'This is narrative text.');
      expect(serializer.serializeElements([narrative])).toBe('This is narrative text.');
      
      const paragraph = createBaseElement(ElementType.PARAGRAPH, 'This is a paragraph.');
      expect(serializer.serializeElements([paragraph])).toBe('This is a paragraph.');
    });

    it('should serialize list items', () => {
      const serializer = new MarkdownSerializer();
      
      const listItem = createBaseElement(ElementType.LIST_ITEM, 'First item');
      expect(serializer.serializeElements([listItem])).toBe('- First item');
      
      const bulletedText = createBaseElement(ElementType.BULLETED_TEXT, 'Bulleted item');
      expect(serializer.serializeElements([bulletedText])).toBe('- Bulleted item');
    });
  });

  describe('Table serialization', () => {
    it('should serialize tables with headers and rows', () => {
      const serializer = new MarkdownSerializer();
      
      const table: TableElement = {
        id: 'table-1',
        type: ElementType.TABLE,
        text: 'Sample table',
        metadata: {},
        rows: [
          ['Cell 1', 'Cell 2'],
          ['Cell 3', 'Cell 4']
        ],
        headers: ['Header 1', 'Header 2']
      };
      
      const expected = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| Cell 1 | Cell 2 |',
        '| Cell 3 | Cell 4 |'
      ].join('\n');
      
      expect(serializer.serializeElements([table])).toBe(expected);
    });

    it('should serialize tables without headers', () => {
      const serializer = new MarkdownSerializer();
      
      const table: TableElement = {
        id: 'table-1',
        type: ElementType.TABLE,
        text: 'Sample table',
        metadata: {},
        rows: [
          ['Cell 1', 'Cell 2'],
          ['Cell 3', 'Cell 4']
        ]
      };
      
      const expected = [
        '| Cell 1 | Cell 2 |',
        '| Cell 3 | Cell 4 |'
      ].join('\n');
      
      expect(serializer.serializeElements([table])).toBe(expected);
    });

    it('should handle empty tables', () => {
      const serializer = new MarkdownSerializer();
      
      const table: TableElement = {
        id: 'table-1',
        type: ElementType.TABLE,
        text: 'Empty table',
        metadata: {},
        rows: []
      };
      
      expect(serializer.serializeElements([table])).toBe('**Table:** Empty table');
    });
  });

  describe('Image serialization', () => {
    it('should serialize images with alt text and src', () => {
      const serializer = new MarkdownSerializer();
      
      const image: ImageElement = {
        id: 'img-1',
        type: ElementType.IMAGE,
        text: 'Image description',
        metadata: {},
        src: 'https://example.com/image.jpg',
        alt: 'Sample image',
        width: 800,
        height: 600
      };
      
      const result = serializer.serializeElements([image]);
      expect(result).toContain('![Sample image](https://example.com/image.jpg)');
      expect(result).toContain('Width: 800px, Height: 600px');
    });

    it('should handle images without metadata when includeImageMetadata is false', () => {
      const serializer = new MarkdownSerializer({ includeImageMetadata: false });
      
      const image: ImageElement = {
        id: 'img-1',
        type: ElementType.IMAGE,
        text: 'Image description',
        metadata: {},
        src: 'https://example.com/image.jpg',
        alt: 'Sample image'
      };
      
      expect(serializer.serializeElements([image])).toBe('![Sample image](https://example.com/image.jpg)');
    });
  });

  describe('Form elements', () => {
    it('should serialize forms with fields', () => {
      const serializer = new MarkdownSerializer();
      
      const form: FormElement = {
        id: 'form-1',
        type: ElementType.FORM,
        text: 'Contact form',
        metadata: {},
        fields: [
          { fieldName: 'Name', fieldValue: 'John Doe' },
          { fieldName: 'Email', fieldValue: 'john@example.com' }
        ]
      };
      
      const expected = [
        '**Form:**',
        '- **Name:** John Doe',
        '- **Email:** john@example.com'
      ].join('\n');
      
      expect(serializer.serializeElements([form])).toBe(expected);
    });

    it('should serialize checkboxes', () => {
      const serializer = new MarkdownSerializer();
      
      const checkedBox: CheckBoxElement = {
        id: 'cb-1',
        type: ElementType.CHECK_BOX_CHECKED,
        text: 'Checked option',
        metadata: {},
        checked: true,
        value: 'Option 1'
      };
      
      const uncheckedBox: CheckBoxElement = {
        id: 'cb-2',
        type: ElementType.CHECK_BOX_UNCHECKED,
        text: 'Unchecked option',
        metadata: {},
        checked: false,
        value: 'Option 2'
      };
      
      expect(serializer.serializeElements([checkedBox])).toBe('[x] Option 1');
      expect(serializer.serializeElements([uncheckedBox])).toBe('[ ] Option 2');
    });

    it('should serialize radio buttons', () => {
      const serializer = new MarkdownSerializer();
      
      const selectedRadio: RadioButtonElement = {
        id: 'rb-1',
        type: ElementType.RADIO_BUTTON_CHECKED,
        text: 'Selected option',
        metadata: {},
        checked: true,
        value: 'Option A',
        groupName: 'choices'
      };
      
      const unselectedRadio: RadioButtonElement = {
        id: 'rb-2',
        type: ElementType.RADIO_BUTTON_UNCHECKED,
        text: 'Unselected option',
        metadata: {},
        checked: false,
        value: 'Option B',
        groupName: 'choices'
      };
      
      expect(serializer.serializeElements([selectedRadio])).toBe('(•) Option A [choices]');
      expect(serializer.serializeElements([unselectedRadio])).toBe('( ) Option B [choices]');
    });
  });

  describe('Link and contact elements', () => {
    it('should serialize links', () => {
      const serializer = new MarkdownSerializer();
      
      const link: LinkElement = {
        id: 'link-1',
        type: ElementType.LINK,
        text: 'Click here',
        metadata: {},
        url: 'https://example.com',
        linkText: 'Example Link'
      };
      
      expect(serializer.serializeElements([link])).toBe('[Example Link](https://example.com)');
    });

    // Address and email test cases removed - types no longer supported
  });

  describe('Code and formula elements', () => {
    it('should serialize code snippets', () => {
      const serializer = new MarkdownSerializer();
      
      const code: CodeElement = {
        id: 'code-1',
        type: ElementType.CODE_SNIPPET,
        text: 'console.log("Hello");',
        metadata: {},
        language: 'javascript',
        codeBlock: 'console.log("Hello, World!");'
      };
      
      const expected = '```javascript\nconsole.log("Hello, World!");\n```';
      expect(serializer.serializeElements([code])).toBe(expected);
    });

    it('should serialize formulas', () => {
      const serializer = new MarkdownSerializer();
      
      const latexFormula: FormulaElement = {
        id: 'formula-1',
        type: ElementType.FORMULA,
        text: 'E = mc²',
        metadata: {},
        formula: 'E = mc^2',
        formulaType: 'latex'
      };
      
      const textFormula: FormulaElement = {
        id: 'formula-2',
        type: ElementType.FORMULA,
        text: 'a + b = c',
        metadata: {},
        formula: 'a + b = c',
        formulaType: 'text'
      };
      
      expect(serializer.serializeElements([latexFormula])).toBe('$$E = mc^2$$');
      expect(serializer.serializeElements([textFormula])).toBe('**Formula:** `a + b = c`');
    });
  });

  describe('Special elements', () => {
    it('should serialize captions and footnotes', () => {
      const serializer = new MarkdownSerializer();
      
      const caption = createBaseElement(ElementType.CAPTION, 'Figure 1: Sample chart');
      expect(serializer.serializeElements([caption])).toBe('*Figure 1: Sample chart*');
      
      const footnote = createBaseElement(ElementType.FOOTNOTE, 'This is a footnote');
      expect(serializer.serializeElements([footnote])).toBe('> This is a footnote');
    });

    it('should serialize abstracts', () => {
      const serializer = new MarkdownSerializer();
      
      const abstract = createBaseElement(ElementType.ABSTRACT, 'This paper discusses...');
      expect(serializer.serializeElements([abstract])).toBe('**Abstract:** This paper discusses...');
    });

    it('should serialize page breaks', () => {
      const serializer = new MarkdownSerializer();
      
      const pageBreak = createBaseElement(ElementType.PAGE_BREAK, '');
      expect(serializer.serializeElements([pageBreak])).toBe('---');
    });

    it('should serialize field names and values', () => {
      const serializer = new MarkdownSerializer();
      
      const fieldName = createBaseElement(ElementType.FIELD_NAME, 'First Name');
      expect(serializer.serializeElements([fieldName])).toBe('**First Name:**');
      
      const value = createBaseElement(ElementType.VALUE, 'John');
      expect(serializer.serializeElements([value])).toBe('John');
    });
  });

  describe('Composite elements', () => {
    it('should serialize composite elements with nested elements', () => {
      const serializer = new MarkdownSerializer();
      
      const composite: CompositeElement = {
        id: 'comp-1',
        type: ElementType.COMPOSITE_ELEMENT,
        text: 'Composite element',
        metadata: {},
        elements: [
          createBaseElement(ElementType.TITLE, 'Nested Title'),
          createBaseElement(ElementType.NARRATIVE_TEXT, 'Nested text content')
        ]
      };
      
      const result = serializer.serializeElements([composite]);
      expect(result).toContain('**Composite Element:**');
      expect(result).toContain('# Nested Title');
      expect(result).toContain('Nested text content');
    });
  });

  describe('Options and configuration', () => {
    it('should include element IDs when configured', () => {
      const serializer = new MarkdownSerializer({ includeElementIds: true });
      
      const element = createBaseElement(ElementType.TEXT, 'Sample text', 'test-123');
      const result = serializer.serializeElements([element]);
      
      expect(result).toContain('<!-- id: test-123 -->');
    });

    it('should include coordinates when configured', () => {
      const serializer = new MarkdownSerializer({ includeCoordinates: true });
      
      const element = {
        ...createBaseElement(ElementType.TEXT, 'Sample text'),
        metadata: {
          coordinates: {
            points: [{ x: 100, y: 200 }]
          }
        }
      };
      
      const result = serializer.serializeElements([element]);
      expect(result).toContain('<!-- coords: (100,200) -->');
    });

    it('should include page numbers when configured', () => {
      const serializer = new MarkdownSerializer({ includePageNumbers: true });
      
      const elements = [
        { ...createBaseElement(ElementType.TEXT, 'Page 1 content'), metadata: { pageNumber: 1 } },
        { ...createBaseElement(ElementType.TEXT, 'Page 2 content'), metadata: { pageNumber: 2 } }
      ];
      
      const result = serializer.serializeElements(elements);
      expect(result).toContain('**Page 1**');
      expect(result).toContain('**Page 2**');
    });

    it('should escape special characters when configured', () => {
      const serializer = new MarkdownSerializer({ escapeSpecialChars: true });
      
      const element = createBaseElement(ElementType.TEXT, 'Text with *bold* and _italic_');
      const result = serializer.serializeElements([element]);
      
      expect(result).toBe('Text with \\*bold\\* and \\_italic\\_');
    });

    it('should not escape special characters when disabled', () => {
      const serializer = new MarkdownSerializer({ escapeSpecialChars: false });
      
      const element = createBaseElement(ElementType.TEXT, 'Text with *bold* and _italic_');
      const result = serializer.serializeElements([element]);
      
      expect(result).toBe('Text with *bold* and _italic_');
    });

    it('should use custom element handlers when provided', () => {
      const serializer = new MarkdownSerializer({
        customElementHandlers: {
          [ElementType.TITLE]: (element) => `🎯 ${element.text} 🎯`
        }
      });
      
      const title = createBaseElement(ElementType.TITLE, 'Custom Title');
      expect(serializer.serializeElements([title])).toBe('🎯 Custom Title 🎯');
    });
  });

  describe('Document metadata serialization', () => {
    it('should serialize document metadata when included', () => {
      const serializer = new MarkdownSerializer({ includeMetadata: true });
      
      const result: PartitionResult = {
        elements: [createBaseElement(ElementType.TEXT, 'Sample content')],
        metadata: {
          totalElements: 1,
          filename: 'test.html',
          filetype: 'text/html',
          pageCount: 1,
          processingTime: 150,
          elementTypeCounts: {
            [ElementType.TEXT]: 1
          } as Record<ElementType, number>
        }
      };
      
      const output = serializer.serialize(result);
      expect(output).toContain('# Document Metadata');
      expect(output).toContain('**Filename:** test.html');
      expect(output).toContain('**File Type:** text/html');
      expect(output).toContain('**Pages:** 1');
      expect(output).toContain('**Total Elements:** 1');
      expect(output).toContain('**Processing Time:** 150ms');
      expect(output).toContain('- Text: 1');
    });
  });

  describe('Convenience function', () => {
    it('should work with the convenience function', () => {
      const result: PartitionResult = {
        elements: [
          createBaseElement(ElementType.TITLE, 'Test Document'),
          createBaseElement(ElementType.NARRATIVE_TEXT, 'This is test content.')
        ],
        metadata: {
          totalElements: 2
        }
      };
      
      const markdown = serializeToMarkdown(result);
      expect(markdown).toContain('# Test Document');
      expect(markdown).toContain('This is test content.');
    });
  });
});