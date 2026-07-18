import { partitionHtml } from './dist/index.js';

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
      <img src="example.jpg" alt="Example image" width="300" height="200">
    </article>
  </main>
  <footer>
    <p>© 2024 Test Company</p>
  </footer>
</body>
</html>
`;

console.log('🧹 Processing HTML with unstructured-ts...\n');

const result = partitionHtml(html);

console.log(`📊 Extracted ${result.elements.length} elements:\n`);

result.elements.forEach((element, i) => {
  console.log(`${i + 1}. ${element.type}: "${element.text}"`);
  if (element.type === 'Table') {
    const table = element;
    console.log(`   Headers: [${table.headers?.join(', ')}]`);
    console.log(`   Rows: ${table.rows?.length} rows`);
  }
  if (element.type === 'Image') {
    const image = element;
    console.log(`   Source: ${image.src}`);
    console.log(`   Alt: ${image.alt}`);
  }
});

console.log(`\n⚡ Processing completed in ${result.metadata.processingTime}ms`);