/**
 * unstructured-ts - TypeScript DOM cleaning and structuring library
 * 
 * Main entry point for the library
 */

import { DOMPartitioner } from './partitioner.js';

export { DOMPartitioner } from './partitioner.js';
export { DOMCleaner } from './cleaner.js';
export { ElementClassifier } from './classifier.js';
export { ContentHandlers } from './content-handlers.js';
export { MarkdownSerializer, serializeToMarkdown } from './markdown-serializer.js';

export {
  ElementType
} from './types.js';
export type {
  Element,
  TableElement,
  ImageElement,
  ElementMetadata,
  PartitionOptions,
  PartitionResult,
} from './types.js';
export type { MarkdownSerializerOptions } from './markdown-serializer.js';

// Convenience function for quick partitioning
export function partitionHtml(html: string, options?: import('./types.js').PartitionOptions): import('./types.js').PartitionResult {
  const partitioner = new DOMPartitioner(options);
  return partitioner.partition(html);
}

// Re-export for advanced users
export * from './mappings.js';