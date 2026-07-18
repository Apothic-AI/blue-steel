/**
 * Comprehensive tests for form field matching strategies
 * Tests form field extraction with various HTML structures
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { DOMPartitioner, ElementType } from '../index.js';
import type { FormElement } from '../types.js';

describe('Form Field Matching', () => {
  let partitioner: DOMPartitioner;

  beforeEach(() => {
    partitioner = new DOMPartitioner({
      extractForms: true,
      extractLinks: false,
      includeOriginalHtml: false
    });
  });

  describe('Basic Form Field Extraction', () => {
    test('should extract fields with explicit label-for associations', () => {
      const html = `
        <form>
          <label for="email">Email Address:</label>
          <input type="email" id="email" name="email" value="test@example.com">
          
          <label for="password">Password:</label>
          <input type="password" id="password" name="password" value="secret123">
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      
      // Check that we have fields with expected names/values
      const fieldNames = form.fields!.map(f => f.fieldName);
      const fieldValues = form.fields!.map(f => f.fieldValue);
      
      expect(fieldNames.some(name => name.includes('email') || name.includes('Email'))).toBe(true);
      expect(fieldValues).toContain('test@example.com');
    });

    test('should extract fields wrapped in labels', () => {
      const html = `
        <form>
          <label>
            First Name:
            <input type="text" name="firstName" value="John">
          </label>
          
          <label>
            <span>Last Name:</span>
            <input type="text" name="lastName" value="Doe">
          </label>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('John');
    });

    test('should extract select field values', () => {
      const html = `
        <form>
          <label for="experience">Experience Level:</label>
          <select id="experience" name="experience">
            <option value="junior">Junior</option>
            <option value="mid" selected>Mid-level</option>
            <option value="senior">Senior</option>
          </select>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      
      // Should extract the selected option text
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues.some(value => value.includes('Mid-level') || value.includes('mid'))).toBe(true);
    });

    test('should extract checkbox and radio button states', () => {
      const html = `
        <form>
          <label>
            <input type="checkbox" name="newsletter" checked> Subscribe to newsletter
          </label>
          
          <label>
            <input type="radio" name="gender" value="male" checked> Male
          </label>
          <label>
            <input type="radio" name="gender" value="female"> Female
          </label>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(2);
      
      // Check field types
      const fieldTypes = form.fields!.map(f => f.fieldType);
      expect(fieldTypes).toContain('checkbox');
      expect(fieldTypes).toContain('radio');
    });

    test('should extract textarea content', () => {
      const html = `
        <form>
          <label for="comments">Comments:</label>
          <textarea id="comments" name="comments">Great service!</textarea>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('Great service!');
      
      const fieldTypes = form.fields!.map(f => f.fieldType);
      expect(fieldTypes).toContain('textarea');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty forms', () => {
      const html = '<form></form>';
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      
      expect(forms).toHaveLength(1);
      expect(forms[0].fields).toEqual([]);
    });

    test('should handle forms with no field values', () => {
      const html = `
        <form>
          <label for="empty">Empty Field:</label>
          <input type="text" id="empty" name="empty">
          
          <label for="placeholder">Placeholder Only:</label>
          <input type="text" id="placeholder" name="placeholder" placeholder="Enter text">
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      
      // Should still extract fields even with empty values
      const fieldNames = form.fields!.map(f => f.fieldName);
      expect(fieldNames.some(name => name.includes('empty') || name.includes('Empty'))).toBe(true);
    });

    test('should handle disabled and hidden fields', () => {
      const html = `
        <form>
          <label for="visible">Visible Field:</label>
          <input type="text" id="visible" name="visible" value="visible">
          
          <label for="disabled">Disabled Field:</label>
          <input type="text" id="disabled" name="disabled" value="disabled" disabled>
          
          <input type="hidden" name="hidden" value="hidden-value">
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(2);
      
      // Should extract all fields including disabled/hidden
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('visible');
      expect(fieldValues).toContain('hidden-value');
    });

    test('should handle multiple forms separately', () => {
      const html = `
        <form id="form1">
          <label for="field1">Field 1:</label>
          <input type="text" id="field1" name="field1" value="form1-value">
        </form>
        
        <form id="form2">
          <label for="field2">Field 2:</label>
          <input type="text" id="field2" name="field2" value="form2-value">
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(2);
      
      // Each form should have at least one field
      formsWithFields.forEach(form => {
        expect(form.fields).toBeDefined();
        expect(form.fields!.length).toBeGreaterThanOrEqual(1);
      });
      
      // Check field values are correct
      const allFields = formsWithFields.flatMap(form => form.fields || []);
      const fieldValues = allFields.map(f => f.fieldValue);
      expect(fieldValues).toContain('form1-value');
      expect(fieldValues).toContain('form2-value');
    });
  });

  describe('Complex Nested Forms', () => {
    test('should handle deeply nested form structures', () => {
      const html = `
        <form>
          <div class="form-section">
            <h2>Personal Information</h2>
            <div class="form-group">
              <div class="form-row">
                <div class="col">
                  <label for="fullName">Full Name*:</label>
                  <input type="text" id="fullName" name="fullName" value="John Smith" required>
                </div>
                <div class="col">
                  <label>Date of Birth:</label>
                  <input type="date" name="dob" value="1990-01-01">
                </div>
              </div>
              
              <div class="form-row">
                <label>Nationality:</label>
                <select name="nationality">
                  <option value="us" selected>United States</option>
                  <option value="ca">Canada</option>
                  <option value="uk">United Kingdom</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="form-section">
            <h2>Preferences</h2>
            <fieldset>
              <legend>Which topics interest you?</legend>
              <label><input type="checkbox" name="interests" value="tech" checked> Technology</label>
              <label><input type="checkbox" name="interests" value="science"> Science</label>
              <label><input type="checkbox" name="interests" value="arts" checked> Arts</label>
            </fieldset>
          </div>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(3);
      
      // Check specific field values
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('John Smith');
      expect(fieldValues).toContain('1990-01-01');
      expect(fieldValues.some(value => value.includes('United States') || value.includes('us'))).toBe(true);
      
      // Check field types
      const fieldTypes = form.fields!.map(f => f.fieldType);
      expect(fieldTypes).toContain('text');
      expect(fieldTypes).toContain('date');
      expect(fieldTypes).toContain('select');
      expect(fieldTypes).toContain('checkbox');
    });

    test('should handle attribute-based field identification', () => {
      const html = `
        <form>
          <input type="text" name="username" placeholder="Enter your username" value="johndoe">
          <input type="email" name="email" title="Your email address" value="john@example.com">
          <textarea name="comments" placeholder="Additional comments">Great service!</textarea>
          
          <select name="country" title="Select your country">
            <option value="us" selected>United States</option>
            <option value="ca">Canada</option>
          </select>
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(4);
      
      // Check field values
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('johndoe');
      expect(fieldValues).toContain('john@example.com');
      expect(fieldValues).toContain('Great service!');
      expect(fieldValues.some(value => value.includes('United States') || value.includes('us'))).toBe(true);
      
      // Check field types
      const fieldTypes = form.fields!.map(f => f.fieldType);
      expect(fieldTypes).toContain('text');
      expect(fieldTypes).toContain('email');
      expect(fieldTypes).toContain('textarea');
      expect(fieldTypes).toContain('select');
    });
  });

  describe('Field Type Detection', () => {
    test('should correctly identify different input types', () => {
      const html = `
        <form>
          <input type="text" name="text" value="text-value">
          <input type="email" name="email" value="email@test.com">
          <input type="password" name="password" value="secret">
          <input type="number" name="number" value="123">
          <input type="tel" name="phone" value="555-0123">
          <input type="url" name="website" value="https://example.com">
          <input type="date" name="date" value="2024-01-01">
          <input type="checkbox" name="checkbox" checked>
          <input type="radio" name="radio" value="option1" checked>
          <input type="hidden" name="hidden" value="hidden-value">
        </form>
      `;
      
      const result = partitioner.partition(html);
      const forms = result.elements.filter(el => el.type === ElementType.FORM) as FormElement[];
      const formsWithFields = forms.filter(form => form.fields && form.fields.length > 0);
      
      expect(formsWithFields).toHaveLength(1);
      
      const form = formsWithFields[0];
      expect(form.fields).toBeDefined();
      expect(form.fields!.length).toBeGreaterThanOrEqual(8);
      
      // Check that various field types are detected
      const fieldTypes = form.fields!.map(f => f.fieldType);
      expect(fieldTypes).toContain('text');
      expect(fieldTypes).toContain('email');
      expect(fieldTypes).toContain('password');
      expect(fieldTypes).toContain('checkbox');
      expect(fieldTypes).toContain('radio');
      expect(fieldTypes).toContain('hidden');
      
      // Check specific field values
      const fieldValues = form.fields!.map(f => f.fieldValue);
      expect(fieldValues).toContain('text-value');
      expect(fieldValues).toContain('email@test.com');
      expect(fieldValues).toContain('hidden-value');
    });
  });
});