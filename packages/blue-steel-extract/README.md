# unstructured-ts

A TypeScript library for cleaning and structuring DOM content, inspired by [Unstructured](https://github.com/Unstructured-IO/unstructured). Built with Cheerio for fast, server-side HTML processing.

## Features

- 🧹 **DOM Cleaning**: Remove scripts, styles, navigation, and other unwanted elements
- 🏗️ **Semantic Structure**: Classify elements as titles, paragraphs, lists, tables, etc.
- 📊 **Table Extraction**: Extract tables with headers and structured data
- 🖼️ **Image Handling**: Extract images with metadata and alt text
- ⚡ **Fast Processing**: Built on Cheerio for efficient server-side HTML parsing
- 🎯 **Configurable**: Flexible options for different use cases
- 📝 **TypeScript**: Full type safety and excellent IDE support

## Installation

```bash
npm install unstructured-ts
```

## Quick Start

```typescript
import { partitionHtml } from 'unstructured-ts';

const html = `
<html>
  <body>
    <nav>Skip this navigation</nav>
    <h1>Main Title</h1>
    <p>This is a paragraph with some content.</p>
    <ul>
      <li>First item</li>
      <li>Second item</li>
    </ul>
    <table>
      <tr><th>Name</th><th>Age</th></tr>
      <tr><td>John</td><td>30</td></tr>
    </table>
  </body>
</html>
`;

const result = partitionHtml(html);

console.log(result.elements);
// [
//   { type: 'Title', text: 'Main Title', ... },
//   { type: 'NarrativeText', text: 'This is a paragraph with some content.', ... },
//   { type: 'ListItem', text: 'First item', ... },
//   { type: 'ListItem', text: 'Second item', ... },
//   { type: 'Table', text: 'Name | Age\\n--- | ---\\nJohn | 30', rows: [['John', '30']], headers: ['Name', 'Age'], ... }
// ]
```

## Advanced Usage

### Custom Options

```typescript
import { DOMPartitioner } from 'unstructured-ts';

const partitioner = new DOMPartitioner({
  skipNavigation: true,      // Remove navigation elements
  skipHeaders: false,        // Keep header elements
  skipFooters: true,         // Remove footer elements
  skipForms: true,           // Remove form elements
  minTextLength: 15,         // Minimum text length to include
  extractTables: true,       // Extract table structure
  extractImages: true,       // Extract image elements
  includeImageAlt: true,     // Include alt text in image elements
  includeOriginalHtml: false // Include original HTML in metadata
});

const result = partitioner.partition(html);
```

### Working with Elements

```typescript
import { ElementType } from 'unstructured-ts';

const result = partitionHtml(html);

// Filter by element type
const titles = result.elements.filter(el => el.type === ElementType.TITLE);
const paragraphs = result.elements.filter(el => el.type === ElementType.NARRATIVE_TEXT);
const tables = result.elements.filter(el => el.type === ElementType.TABLE);

// Access table data
tables.forEach(table => {
  if (table.type === ElementType.TABLE) {
    console.log('Headers:', table.headers);
    console.log('Rows:', table.rows);
  }
});

// Access metadata
result.elements.forEach(element => {
  console.log(`${element.type}: ${element.text}`);
  console.log('Metadata:', element.metadata);
});
```

## Element Types

The library classifies DOM elements into semantic types:

- **Title**: Headings (h1-h6) and title-like content
- **NarrativeText**: Paragraphs and article content
- **ListItem**: List items and bullet points
- **Text**: Generic text content
- **Table**: Structured tabular data
- **Image**: Images with metadata
- **Header/Footer**: Page headers and footers
- **Navigation**: Navigation menus and links
- **Form**: Form elements and inputs

## API Reference

### `partitionHtml(html: string, options?: PartitionOptions): PartitionResult`

Convenience function to partition HTML content.

### `DOMPartitioner`

Main class for partitioning DOM content.

#### Constructor
```typescript
new DOMPartitioner(options?: PartitionOptions)
```

#### Methods
- `partition(html: string): PartitionResult` - Partition HTML content

### `PartitionOptions`

Configuration options for partitioning:

```typescript
interface PartitionOptions {
  skipNavigation?: boolean;     // Default: true
  skipHeaders?: boolean;        // Default: false
  skipFooters?: boolean;        // Default: false
  skipForms?: boolean;          // Default: true
  minTextLength?: number;       // Default: 10
  preserveWhitespace?: boolean; // Default: false
  extractTables?: boolean;      // Default: true
  extractImages?: boolean;      // Default: true
  includeImageAlt?: boolean;    // Default: true
  includeOriginalHtml?: boolean;// Default: false
}
```

### `Element`

Base element interface:

```typescript
interface Element {
  id: string;
  type: ElementType;
  text: string;
  metadata: ElementMetadata;
}
```

### `TableElement`

Extended element for tables:

```typescript
interface TableElement extends Element {
  type: ElementType.TABLE;
  rows: string[][];
  headers?: string[];
}
```

### `ImageElement`

Extended element for images:

```typescript
interface ImageElement extends Element {
  type: ElementType.IMAGE;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
}
```

## Comparison with Unstructured Python Library

This library is inspired by the Python Unstructured library but is designed specifically for TypeScript/JavaScript environments:

| Feature | unstructured-ts | Unstructured Python |
|---------|----------------|-------------------|
| DOM Processing | ✅ Cheerio-based | ✅ BeautifulSoup-based |
| Element Classification | ✅ Simplified | ✅ Comprehensive |
| Table Extraction | ✅ Basic structure | ✅ Advanced analysis |
| Multiple File Formats | ❌ HTML only | ✅ PDF, DOCX, etc. |
| OCR Support | ❌ | ✅ |
| Language | TypeScript | Python |
| Performance | ⚡ Fast | 🐌 Slower |
| Dependencies | Minimal | Heavy |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT