#!/usr/bin/env node

/**
 * Live Website Test Script
 * Tests the unstructured-ts library against real websites to evaluate data structuring performance
 */

import { partitionHtml } from './dist/index.js';

const websites = [
  {
    name: 'GitHub',
    url: 'https://github.com',
    description: 'Code repository platform with complex navigation and content'
  },
  {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    description: 'News aggregation site with simple structure and comments'
  },
  {
    name: 'Reddit',
    url: 'https://www.reddit.com',
    description: 'Social media platform with nested comments and rich content'
  },
  {
    name: 'Stack Overflow',
    url: 'https://stackoverflow.com',
    description: 'Q&A platform with code snippets and structured content'
  },
  {
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Main_Page',
    description: 'Encyclopedia with tables, links, and structured articles'
  },
  {
    name: 'BBC News',
    url: 'https://www.bbc.com/news',
    description: 'News website with articles, images, and multimedia content'
  },
  {
    name: 'Medium',
    url: 'https://medium.com',
    description: 'Publishing platform with rich text and embedded content'
  },
  {
    name: 'Amazon',
    url: 'https://www.amazon.com',
    description: 'E-commerce site with product listings, forms, and complex layout'
  }
];

async function fetchWebsite(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

function analyzeResults(result, websiteName) {
  const { elements, metadata } = result;
  
  console.log(`\n📊 Analysis for ${websiteName}:`);
  console.log(`   Total elements: ${metadata.totalElements}`);
  console.log(`   Processing time: ${metadata.processingTime}ms`);
  console.log(`   Average element length: ${metadata.averageElementLength} chars`);
  
  if (metadata.elementTypeCounts) {
    console.log(`   Element types found:`);
    Object.entries(metadata.elementTypeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10) // Top 10 most common types
      .forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });
  }
  
  if (metadata.tablesExtracted) {
    console.log(`   Tables extracted: ${metadata.tablesExtracted}`);
  }
  
  if (metadata.imagesExtracted) {
    console.log(`   Images extracted: ${metadata.imagesExtracted}`);
  }
  
  if (metadata.formsExtracted) {
    console.log(`   Forms extracted: ${metadata.formsExtracted}`);
  }
  
  if (metadata.linksExtracted) {
    console.log(`   Links extracted: ${metadata.linksExtracted}`);
  }
  
  if (metadata.warnings && metadata.warnings.length > 0) {
    console.log(`   ⚠️  Warnings: ${metadata.warnings.length}`);
    metadata.warnings.forEach(warning => {
      console.log(`     - ${warning}`);
    });
  }
  
  // Sample some elements
  console.log(`   Sample elements:`);
  elements.slice(0, 3).forEach((element, i) => {
    const preview = element.text.substring(0, 100).replace(/\n/g, ' ');
    console.log(`     ${i + 1}. [${element.type}] ${preview}${element.text.length > 100 ? '...' : ''}`);
  });
  
  return {
    websiteName,
    totalElements: metadata.totalElements,
    processingTime: metadata.processingTime,
    elementTypes: Object.keys(metadata.elementTypeCounts || {}),
    topElementTypes: Object.entries(metadata.elementTypeCounts || {})
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count })),
    tablesExtracted: metadata.tablesExtracted || 0,
    imagesExtracted: metadata.imagesExtracted || 0,
    formsExtracted: metadata.formsExtracted || 0,
    linksExtracted: metadata.linksExtracted || 0,
    warnings: metadata.warnings?.length || 0,
    averageElementLength: metadata.averageElementLength || 0
  };
}

async function testWebsite(website) {
  console.log(`\n🌐 Testing ${website.name} (${website.url})`);
  console.log(`   Description: ${website.description}`);
  
  try {
    console.log(`   Fetching HTML...`);
    const html = await fetchWebsite(website.url);
    console.log(`   HTML size: ${(html.length / 1024).toFixed(1)}KB`);
    
    console.log(`   Processing with unstructured-ts...`);
    const startTime = Date.now();
    
    const result = partitionHtml(html, {
      extractTables: true,
      extractImages: true,
      extractForms: true,
      extractLinks: true,
      includeMetadata: true,
      minTextLength: 5,
      skipNavigation: true
    });
    
    const endTime = Date.now();
    console.log(`   ✅ Completed in ${endTime - startTime}ms`);
    
    return analyzeResults(result, website.name);
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      websiteName: website.name,
      error: error.message,
      totalElements: 0,
      processingTime: 0
    };
  }
}

async function runAllTests() {
  console.log('🚀 Starting Live Website Tests for unstructured-ts');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (const website of websites) {
    const result = await testWebsite(website);
    results.push(result);
    
    // Add a small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY REPORT');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  
  console.log(`\n✅ Successful tests: ${successful.length}/${results.length}`);
  console.log(`❌ Failed tests: ${failed.length}/${results.length}`);
  
  if (failed.length > 0) {
    console.log(`\nFailed websites:`);
    failed.forEach(result => {
      console.log(`  - ${result.websiteName}: ${result.error}`);
    });
  }
  
  if (successful.length > 0) {
    console.log(`\nPerformance Summary:`);
    const avgProcessingTime = successful.reduce((sum, r) => sum + r.processingTime, 0) / successful.length;
    const avgElements = successful.reduce((sum, r) => sum + r.totalElements, 0) / successful.length;
    const totalElements = successful.reduce((sum, r) => sum + r.totalElements, 0);
    
    console.log(`  Average processing time: ${avgProcessingTime.toFixed(1)}ms`);
    console.log(`  Average elements per site: ${avgElements.toFixed(1)}`);
    console.log(`  Total elements extracted: ${totalElements}`);
    
    // Element type analysis
    const allElementTypes = new Set();
    successful.forEach(result => {
      result.elementTypes?.forEach(type => allElementTypes.add(type));
    });
    
    console.log(`\nElement Types Discovered: ${allElementTypes.size}`);
    console.log(`  Types: ${Array.from(allElementTypes).sort().join(', ')}`);
    
    // Feature extraction summary
    const totalTables = successful.reduce((sum, r) => sum + r.tablesExtracted, 0);
    const totalImages = successful.reduce((sum, r) => sum + r.imagesExtracted, 0);
    const totalForms = successful.reduce((sum, r) => sum + r.formsExtracted, 0);
    const totalLinks = successful.reduce((sum, r) => sum + r.linksExtracted, 0);
    
    console.log(`\nFeature Extraction Summary:`);
    console.log(`  Tables extracted: ${totalTables}`);
    console.log(`  Images extracted: ${totalImages}`);
    console.log(`  Forms extracted: ${totalForms}`);
    console.log(`  Links extracted: ${totalLinks}`);
    
    // Top performing sites
    console.log(`\nTop Performing Sites (by elements extracted):`);
    successful
      .sort((a, b) => b.totalElements - a.totalElements)
      .slice(0, 3)
      .forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.websiteName}: ${result.totalElements} elements (${result.processingTime}ms)`);
      });
    
    // Sites with warnings
    const sitesWithWarnings = successful.filter(r => r.warnings > 0);
    if (sitesWithWarnings.length > 0) {
      console.log(`\nSites with warnings:`);
      sitesWithWarnings.forEach(result => {
        console.log(`  - ${result.websiteName}: ${result.warnings} warnings`);
      });
    }
  }
  
  console.log('\n🎉 Live website testing completed!');
  console.log('This test demonstrates how unstructured-ts handles real-world web content.');
}

// Run the tests
runAllTests().catch(console.error);