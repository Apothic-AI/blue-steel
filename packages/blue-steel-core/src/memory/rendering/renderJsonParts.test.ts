import { describe, expect, test } from 'bun:test';
import { renderJsonParts } from './renderJsonParts';
import { Image } from '@/memory/image';
import { Image as BamlImage } from '@boundaryml/baml';

// Create a mock Image that will convert to BamlImage
class MockImage extends Image {
    constructor(private id: string) {
        // Pass a dummy Sharp instance
        super(null as any);
    }
    
    async toBaml(): Promise<BamlImage> {
        // Return a mock BamlImage
        return {
            __mockBamlImage: true,
            id: this.id
        } as any as BamlImage;
    }
}

describe('renderJsonParts', () => {
    test('renders primitive types correctly', async () => {
        expect(await renderJsonParts('hello', 0)).toEqual(['hello']);
        expect(await renderJsonParts(42, 0)).toEqual(['42']);
        expect(await renderJsonParts(true, 0)).toEqual(['true']);
        expect(await renderJsonParts(false, 0)).toEqual(['false']);
        expect(await renderJsonParts(null, 0)).toEqual(['null']);
    });

    test('renders root-level strings without quotes', async () => {
        expect(await renderJsonParts('CLICK THE UNICORN', 0)).toEqual(['CLICK THE UNICORN']);
        expect(await renderJsonParts('Hello World', 0)).toEqual(['Hello World']);
        expect(await renderJsonParts('{"already":"json"}', 0)).toEqual(['{"already":"json"}']);
    });

    test('properly quotes strings inside objects and arrays', async () => {
        // Strings in objects should be quoted
        expect(await renderJsonParts({message: 'hello'}, 0)).toEqual(['{"message": "hello"}']);
        expect(await renderJsonParts({name: 'John', city: 'NYC'}, 0)).toEqual(['{"name": "John", "city": "NYC"}']);
        
        // Strings in arrays should be quoted
        expect(await renderJsonParts(['apple', 'banana'], 0)).toEqual(['["apple", "banana"]']);
        expect(await renderJsonParts(['hello', 123, 'world'], 0)).toEqual(['["hello", 123, "world"]']);
        
        // Nested structures
        expect(await renderJsonParts({items: ['a', 'b'], text: 'test'}, 0)).toEqual(['{"items": ["a", "b"], "text": "test"}']);
    });

    test('renders empty structures', async () => {
        expect(await renderJsonParts([], 0)).toEqual(['[]']);
        expect(await renderJsonParts({}, 0)).toEqual(['{}']);
    });

    test('renders simple arrays', async () => {
        expect(await renderJsonParts([1, 2, 3], 0)).toEqual(['[1, 2, 3]']);
        expect(await renderJsonParts(['a', 'b', 'c'], 0)).toEqual(['["a", "b", "c"]']);
        expect(await renderJsonParts([true, false, null], 0)).toEqual(['[true, false, null]']);
    });

    test('renders simple objects', async () => {
        expect(await renderJsonParts({ name: 'John', age: 30 }, 0)).toEqual(['{"name": "John", "age": 30}']);
        expect(await renderJsonParts({ a: 1, b: true, c: null }, 0)).toEqual(['{"a": 1, "b": true, "c": null}']);
    });

    test('handles undefined values correctly', async () => {
        // Undefined at root level returns empty array
        expect(await renderJsonParts(undefined, 0)).toEqual([]);
        
        // Undefined in arrays is skipped
        expect(await renderJsonParts([1, undefined, 3], 0)).toEqual(['[1, 3]']);
        
        // Undefined in objects is omitted
        expect(await renderJsonParts({ a: 1, b: undefined, c: 3 }, 0)).toEqual(['{"a": 1, "c": 3}']);
    });

    test('renders nested structures', async () => {
        const nested = {
            user: {
                name: 'Alice',
                scores: [95, 87, 92],
                active: true
            },
            metadata: {
                created: '2024-01-01',
                tags: ['important', 'verified']
            }
        };
        
        const result = await renderJsonParts(nested, 0);
        expect(result).toEqual(['{"user": {"name": "Alice", "scores": [95, 87, 92], "active": true}, "metadata": {"created": "2024-01-01", "tags": ["important", "verified"]}}']);
    });

    test('splits JSON around BamlImage in object', async () => {
        const mockImage = new MockImage('img1');
        const data = {
            title: 'Product',
            image: mockImage,
            price: 29.99
        };
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(3);
        expect(result[0]).toBe('{"title": "Product", "image": ');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(', "price": 29.99}');
    });

    test('splits JSON around multiple BamlImages in object', async () => {
        const mockImage1 = new MockImage('img1');
        const mockImage2 = new MockImage('img2');
        const data = {
            before: 'text',
            image1: mockImage1,
            middle: 'more text',
            image2: mockImage2,
            after: 'final'
        };
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(5);
        expect(result[0]).toBe('{"before": "text", "image1": ');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(', "middle": "more text", "image2": ');
        expect(result[3]).toHaveProperty('__mockBamlImage', true);
        expect(result[4]).toBe(', "after": "final"}');
    });

    test('splits JSON around BamlImage in array', async () => {
        const mockImage = new MockImage('img1');
        const data = ['start', mockImage, 'end'];
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(3);
        expect(result[0]).toBe('["start", ');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(', "end"]');
    });

    test('handles array with only BamlImages', async () => {
        const mockImage1 = new MockImage('img1');
        const mockImage2 = new MockImage('img2');
        const data = [mockImage1, mockImage2];
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(5);
        expect(result[0]).toBe('[');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(', ');
        expect(result[3]).toHaveProperty('__mockBamlImage', true);
        expect(result[4]).toBe(']');
    });

    test('handles nested structures with images', async () => {
        const mockImage = new MockImage('img1');
        const data = {
            user: {
                name: 'Bob',
                avatar: mockImage,
                settings: {
                    theme: 'dark'
                }
            },
            posts: [
                { id: 1, image: mockImage, text: 'Hello' }
            ]
        };
        
        const result = await renderJsonParts(data, 0);
        // Should have multiple parts due to images
        expect(result.length).toBeGreaterThan(1);
        // First part should start with JSON
        expect(result[0]).toMatch(/^{"user": /);
        // Should contain the mock images
        const imageParts = result.filter(part => part && typeof part === 'object' && '__mockBamlImage' in part);
        expect(imageParts.length).toBe(2);
    });

    test('handles edge case with image as first array element', async () => {
        const mockImage = new MockImage('img1');
        const data = [mockImage, 'text'];
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(3);
        expect(result[0]).toBe('[');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(', "text"]');
    });

    test('handles edge case with image as last array element', async () => {
        const mockImage = new MockImage('img1');
        const data = ['text', mockImage];
        
        const result = await renderJsonParts(data, 0);
        expect(result.length).toBe(3);
        expect(result[0]).toBe('["text", ');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(']');
    });

    test('properly escapes special characters in strings', async () => {
        const data = {
            quote: 'He said "Hello"',
            newline: 'Line 1\nLine 2',
            tab: 'Col1\tCol2',
            backslash: 'C:\\Users\\Path'
        };
        
        const result = await renderJsonParts(data, 0);
        expect(result[0]).toContain('\\"Hello\\"');
        expect(result[0]).toContain('\\n');
        expect(result[0]).toContain('\\t');
        expect(result[0]).toContain('\\\\');
    });

    test('renders with proper indentation when indent is 2', async () => {
        const data = {
            name: 'John',
            age: 30,
            hobbies: ['reading', 'coding']
        };
        
        const result = await renderJsonParts(data, 2);
        expect(result).toEqual(['{\n  "name": "John",\n  "age": 30,\n  "hobbies": [\n    "reading",\n    "coding"\n  ]\n}']);
    });

    test('renders with proper indentation when indent is 4', async () => {
        const data = {
            user: {
                name: 'Alice',
                active: true
            }
        };
        
        const result = await renderJsonParts(data, 4);
        expect(result).toEqual(['{\n    "user": {\n        "name": "Alice",\n        "active": true\n    }\n}']);
    });

    test('handles indentation with images', async () => {
        const mockImage = new MockImage('img1');
        const data = {
            title: 'Product',
            image: mockImage,
            price: 29.99
        };
        
        const result = await renderJsonParts(data, 2);
        expect(result.length).toBe(3);
        expect(result[0]).toBe('{\n  "title": "Product",\n  "image": ');
        expect(result[1]).toHaveProperty('__mockBamlImage', true);
        expect(result[2]).toBe(',\n  "price": 29.99\n}');
    });
});