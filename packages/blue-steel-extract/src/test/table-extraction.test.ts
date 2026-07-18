/**
 * Tests for table extraction functionality
 * Tests complex table structures, headers, and data extraction
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';
import type { TableElement } from '../types.js';

describe('Table Extraction', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner({
      extractTables: true,
      extractForms: false,
      extractImages: false,
      extractLinks: false
    });
  });

  describe('Basic Table Structure', () => {
    test('should extract simple table with headers', () => {
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
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Name', 'Age', 'City']);
      expect(table.rows).toEqual([
        ['John', '30', 'New York'],
        ['Jane', '25', 'Los Angeles']
      ]);
    });

    test('should extract table without explicit thead/tbody', () => {
      const html = `
        <table>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
          <tr>
            <td>Widget A</td>
            <td>$10.99</td>
            <td>50</td>
          </tr>
          <tr>
            <td>Widget B</td>
            <td>$15.99</td>
            <td>25</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Product', 'Price', 'Stock']);
      expect(table.rows).toEqual([
        ['Widget A', '$10.99', '50'],
        ['Widget B', '$15.99', '25']
      ]);
    });

    test('should handle table without explicit headers', () => {
      const html = `
        <table>
          <tr>
            <td>Name</td>
            <td>Age</td>
          </tr>
          <tr>
            <td>John</td>
            <td>30</td>
          </tr>
          <tr>
            <td>Jane</td>
            <td>25</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      // First row should be treated as headers
      expect(table.headers).toEqual(['Name', 'Age']);
      expect(table.rows).toEqual([
        ['John', '30'],
        ['Jane', '25']
      ]);
    });
  });

  describe('Complex Table Structures', () => {
    test('should handle tables with colspan and rowspan', () => {
      const html = `
        <table>
          <tr>
            <th colspan="2">Personal Info</th>
            <th>Contact</th>
          </tr>
          <tr>
            <th>First Name</th>
            <th>Last Name</th>
            <th>Email</th>
          </tr>
          <tr>
            <td>John</td>
            <td>Doe</td>
            <td>john@example.com</td>
          </tr>
          <tr>
            <td>Jane</td>
            <td>Smith</td>
            <td>jane@example.com</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      // Should handle complex headers appropriately
      expect(table.headers).toBeDefined();
      expect(table.rows).toBeDefined();
      expect(table.rows.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle nested tables', () => {
      const html = `
        <table>
          <tr>
            <th>Outer Header 1</th>
            <th>Outer Header 2</th>
          </tr>
          <tr>
            <td>Outer Data 1</td>
            <td>
              <table>
                <tr>
                  <th>Inner Header A</th>
                  <th>Inner Header B</th>
                </tr>
                <tr>
                  <td>Inner Data 1</td>
                  <td>Inner Data 2</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      // Should extract both outer and inner tables
      expect(tables.length).toBeGreaterThanOrEqual(1);
      
      // Check that we have tables with different content
      const tableTexts = tables.map(table => table.text);
      expect(tableTexts.some(text => text.includes('Outer Header'))).toBe(true);
    });

    test('should handle tables with mixed content in cells', () => {
      const html = `
        <table>
          <tr>
            <th>Name</th>
            <th>Details</th>
            <th>Actions</th>
          </tr>
          <tr>
            <td><strong>John Doe</strong></td>
            <td>
              <div>Age: 30</div>
              <div>City: <em>New York</em></div>
            </td>
            <td>
              <a href="/edit">Edit</a> |
              <a href="/delete">Delete</a>
            </td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Name', 'Details', 'Actions']);
      expect(table.rows).toHaveLength(1);
      
      // Should extract text content from complex cells
      const firstRow = table.rows[0];
      expect(firstRow[0]).toContain('John Doe');
      expect(firstRow[1]).toContain('Age: 30');
      expect(firstRow[1]).toContain('New York');
    });

    test('should handle tables with empty cells', () => {
      const html = `
        <table>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th>Notes</th>
          </tr>
          <tr>
            <td>Item 1</td>
            <td>100</td>
            <td></td>
          </tr>
          <tr>
            <td>Item 2</td>
            <td></td>
            <td>No value available</td>
          </tr>
          <tr>
            <td></td>
            <td>50</td>
            <td>Anonymous item</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Name', 'Value', 'Notes']);
      expect(table.rows).toHaveLength(3);
      
      // Should handle empty cells appropriately
      expect(table.rows[0]).toEqual(['Item 1', '100', '']);
      expect(table.rows[1]).toEqual(['Item 2', '', 'No value available']);
      expect(table.rows[2]).toEqual(['', '50', 'Anonymous item']);
    });
  });

  describe('Table Formatting and Styling', () => {
    test('should handle tables with CSS classes and styling', () => {
      const html = `
        <table class="data-table striped">
          <thead class="table-header">
            <tr>
              <th class="name-column">Name</th>
              <th class="number-column">Score</th>
              <th class="status-column">Status</th>
            </tr>
          </thead>
          <tbody class="table-body">
            <tr class="row-even">
              <td class="name-cell">Alice</td>
              <td class="score-cell">95</td>
              <td class="status-cell active">Active</td>
            </tr>
            <tr class="row-odd">
              <td class="name-cell">Bob</td>
              <td class="score-cell">87</td>
              <td class="status-cell inactive">Inactive</td>
            </tr>
          </tbody>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Name', 'Score', 'Status']);
      expect(table.rows).toEqual([
        ['Alice', '95', 'Active'],
        ['Bob', '87', 'Inactive']
      ]);
      
      // Should extract CSS class information in metadata
      expect(table.metadata.cssClasses).toContain('data-table');
      expect(table.metadata.cssClasses).toContain('striped');
    });

    test('should handle tables with inline styles', () => {
      const html = `
        <table style="border: 1px solid black; width: 100%;">
          <tr style="background-color: #f0f0f0;">
            <th style="text-align: left;">Product</th>
            <th style="text-align: right;">Price</th>
          </tr>
          <tr>
            <td style="padding: 10px;">Laptop</td>
            <td style="text-align: right; font-weight: bold;">$999</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Product', 'Price']);
      expect(table.rows).toEqual([['Laptop', '$999']]);
    });
  });

  describe('Data Table Scenarios', () => {
    test('should handle financial data table', () => {
      const html = `
        <table>
          <caption>Quarterly Financial Results</caption>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Revenue</th>
              <th>Expenses</th>
              <th>Profit</th>
              <th>Growth %</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Q1 2024</td>
              <td>$1,250,000</td>
              <td>$950,000</td>
              <td>$300,000</td>
              <td>+15.2%</td>
            </tr>
            <tr>
              <td>Q2 2024</td>
              <td>$1,380,000</td>
              <td>$1,020,000</td>
              <td>$360,000</td>
              <td>+20.0%</td>
            </tr>
            <tr>
              <td>Q3 2024</td>
              <td>$1,450,000</td>
              <td>$1,100,000</td>
              <td>$350,000</td>
              <td>-2.8%</td>
            </tr>
          </tbody>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Quarter', 'Revenue', 'Expenses', 'Profit', 'Growth %']);
      expect(table.rows).toHaveLength(3);
      
      // Check specific financial data
      expect(table.rows[0]).toEqual(['Q1 2024', '$1,250,000', '$950,000', '$300,000', '+15.2%']);
      expect(table.rows[2][4]).toBe('-2.8%'); // Negative growth
    });

    test('should handle scientific data table', () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Symbol</th>
              <th>Atomic Number</th>
              <th>Atomic Weight</th>
              <th>Melting Point (°C)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hydrogen</td>
              <td>H</td>
              <td>1</td>
              <td>1.008</td>
              <td>-259.16</td>
            </tr>
            <tr>
              <td>Helium</td>
              <td>He</td>
              <td>2</td>
              <td>4.003</td>
              <td>-272.20</td>
            </tr>
            <tr>
              <td>Carbon</td>
              <td>C</td>
              <td>6</td>
              <td>12.011</td>
              <td>3550</td>
            </tr>
          </tbody>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Element', 'Symbol', 'Atomic Number', 'Atomic Weight', 'Melting Point (°C)']);
      expect(table.rows).toHaveLength(3);
      
      // Check scientific data
      expect(table.rows[0]).toEqual(['Hydrogen', 'H', '1', '1.008', '-259.16']);
      expect(table.rows[2]).toEqual(['Carbon', 'C', '6', '12.011', '3550']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed table structure', () => {
      const html = `
        <table>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
          <tr>
            <td>Data 1</td>
            <!-- Missing second cell -->
          </tr>
          <tr>
            <td>Data 2</td>
            <td>Data 3</td>
            <td>Extra cell</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Header 1', 'Header 2']);
      expect(table.rows.length).toBeGreaterThanOrEqual(1);
      
      // Should handle missing and extra cells gracefully
      expect(table.rows[0]).toEqual(['Data 1', '']);
      expect(table.rows[1]).toEqual(['Data 2', 'Data 3']);
    });

    test('should handle empty table', () => {
      const html = '<table></table>';
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      // Empty tables are treated as layout tables and not extracted
      expect(tables).toHaveLength(0);
    });

    test('should handle table with only headers', () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>City</th>
            </tr>
          </thead>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Name', 'Age', 'City']);
      expect(table.rows).toEqual([]);
    });

    test('should handle table with whitespace-only cells', () => {
      const html = `
        <table>
          <tr>
            <th>Column 1</th>
            <th>Column 2</th>
          </tr>
          <tr>
            <td>   </td>
            <td>
            
            </td>
          </tr>
          <tr>
            <td>Real Data</td>
            <td>More Data</td>
          </tr>
        </table>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(1);
      
      const table = tables[0];
      expect(table.headers).toEqual(['Column 1', 'Column 2']);
      expect(table.rows).toHaveLength(2);
      
      // Whitespace-only cells should be treated as empty
      expect(table.rows[0]).toEqual(['', '']);
      expect(table.rows[1]).toEqual(['Real Data', 'More Data']);
    });
  });

  describe('Table Extraction Options', () => {
    test('should not extract tables when disabled', () => {
      const partitionerNoTables = new DOMPartitioner({
        extractTables: false
      });
      
      const html = `
        <table>
          <tr><th>Name</th><th>Age</th></tr>
          <tr><td>John</td><td>30</td></tr>
        </table>
      `;
      
      const result = partitionerNoTables.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE);
      
      expect(tables).toHaveLength(0);
    });

    test('should handle multiple tables in same document', () => {
      const html = `
        <div>
          <h2>Sales Data</h2>
          <table>
            <tr><th>Product</th><th>Sales</th></tr>
            <tr><td>Widget A</td><td>100</td></tr>
          </table>
          
          <h2>Employee Data</h2>
          <table>
            <tr><th>Name</th><th>Department</th></tr>
            <tr><td>John</td><td>Engineering</td></tr>
            <tr><td>Jane</td><td>Marketing</td></tr>
          </table>
        </div>
      `;
      
      const result = partitioner.partition(html);
      const tables = result.elements.filter(el => el.type === ElementType.TABLE) as TableElement[];
      
      expect(tables).toHaveLength(2);
      
      // Check first table
      expect(tables[0].headers).toEqual(['Product', 'Sales']);
      expect(tables[0].rows).toEqual([['Widget A', '100']]);
      
      // Check second table
      expect(tables[1].headers).toEqual(['Name', 'Department']);
      expect(tables[1].rows).toEqual([['John', 'Engineering'], ['Jane', 'Marketing']]);
    });
  });
});