#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test data constants
const TEST_DIR = path.join(__dirname, '../test-output');
const TEST_CONFIG_PATH = path.join(TEST_DIR, 'blue-steel.config.ts');
const TEST_CASE_PATH = path.join(TEST_DIR, 'test-case.ts');

/**
 * Prepare the test environment
 */
async function prepareTestEnvironment() {
  // Create test directory
  try {
    await fs.mkdir(TEST_DIR, { recursive: true });
    console.log(`Created test directory: ${TEST_DIR}`);
  } catch (err: any) {
    console.log(`Error creating test directory: ${err}`);
  }

  // Clean up any existing test files
  try {
    const files = await fs.readdir(TEST_DIR);
    for (const file of files) {
      await fs.unlink(path.join(TEST_DIR, file));
    }
    console.log('Cleaned up existing test files');
  } catch (err: any) {
    // Directory might not exist yet, which is fine
    if (err.code !== 'ENOENT') {
      console.log(`Error cleaning up test files: ${err}`);
    }
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\nRunning BlueSteel MCP Tools Tests');
  console.log('=================================\n');
  
  // Start the MCP server process
  console.log('Starting MCP server...');
  const serverProcess = spawn('node', [path.join(__dirname, '../build/index.js')], {
    stdio: ['pipe', 'pipe', 'inherit']
  });
  
  // Give the server a moment to start up
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Setup Client
  console.log('Connecting MCP client...');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '../build/index.js')]
  });
  
  const client = new Client({
    name: 'blue-steel-test-client',
    version: '1.0.0'
  });
  
  // Connect client to server
  try {
    await client.connect(transport);
    console.log('Client connected successfully');
    
    // Test each tool
    let results = [];
    
    // We'll skip initialize_project as it requires the actual BlueSteel CLI
    // results.push(await testInitializeProject(client));
    
    results.push(await testCreateTestCase(client));
    results.push(await testReadTestCase(client));
    results.push(await testEditTestCase(client));
    
    // We'll skip run_tests as it requires the actual BlueSteel CLI
    // results.push(await testRunTests(client));
    
    results.push(await testGetConfiguration(client));
    results.push(await testUpdateConfiguration(client));
    
    // Print summary
    console.log('\nTest Summary');
    console.log('===========');
    console.log(`Passed: ${results.filter(r => r).length}`);
    console.log(`Failed: ${results.filter(r => !r).length}`);
    console.log(`Total: ${results.length}`);
    
    if (results.every(r => r)) {
      console.log('\n✅ All tests passed!');
    } else {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.log('Tests failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    console.log('\nCleaning up...');
    try {
      await client.close();
    } catch (err) {
      console.log('Error closing client:', err);
    }
    
    serverProcess.kill();
    console.log('Server process terminated');
  }
}

/**
 * Test the initialize_project tool
 * Note: This is commented out as it requires the actual BlueSteel CLI
 */
async function testInitializeProject(client: Client): Promise<boolean> {
  console.log('\nTesting initialize_project tool...');
  try {
    const result = await client.callTool({
      name: 'initialize_project',
      arguments: {}
    });
    const content = result.content as Array<{type: string, text: string}>;
    console.log('✅ initialize_project succeeded:', content[0].text);
    return true;
  } catch (error) {
    console.log('❌ initialize_project failed:', error);
    return false;
  }
}

/**
 * Test the create_test_case tool
 */
async function testCreateTestCase(client: Client): Promise<boolean> {
  console.log('\nTesting create_test_case tool...');
  try {
    const testCase = {
      filename: TEST_CASE_PATH,
      name: 'Sample Test Case',
      testCase: {
        url: 'https://example.com',
        steps: [
          {
            description: 'Navigate to homepage',
            checks: ['Page title should be "Example Domain"'],
            testData: {
              data: [
                { key: 'username', value: 'tester', sensitive: false },
                { key: 'password', value: 'secret123', sensitive: true }
              ],
              other: 'Additional test info'
            }
          }
        ]
      }
    };
    
    const result = await client.callTool({
      name: 'create_test_case',
      arguments: testCase
    });
    const content = result.content as Array<{type: string, text: string}>;
    console.log('✅ create_test_case succeeded:', content[0].text);
    
    // Verify the file was created
    const fileExists = await fs.access(TEST_CASE_PATH).then(() => true).catch(() => false);
    if (!fileExists) {
      console.log('❌ Test case file was not created');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('❌ create_test_case failed:', error);
    return false;
  }
}

/**
 * Test the read_test_case tool
 */
async function testReadTestCase(client: Client): Promise<boolean> {
  console.log('\nTesting read_test_case tool...');
  try {
    const result = await client.callTool({
      name: 'read_test_case',
      arguments: {
        filename: TEST_CASE_PATH
      }
    });
    
    console.log('✅ read_test_case succeeded');
    
    // Verify the response contains the test case data
    const content = result.content as Array<{type: string, text: string}>;
    const responseText = content[0].text;
    const responseData = JSON.parse(responseText);
    
    if (!responseData.name || !responseData.testCase) {
      console.log('❌ read_test_case returned invalid data');
      return false;
    }
    
    console.log('Test case data:', responseData.name);
    return true;
  } catch (error) {
    console.log('❌ read_test_case failed:', error);
    return false;
  }
}

/**
 * Test the edit_test_case tool
 */
async function testEditTestCase(client: Client): Promise<boolean> {
  console.log('\nTesting edit_test_case tool...');
  try {
    const editedTestCase = {
      filename: TEST_CASE_PATH,
      name: 'Updated Test Case',
      testCase: {
        url: 'https://example.org',
        steps: [
          {
            description: 'Navigate to homepage',
            checks: ['Page title should be "Example Domain"'],
            testData: {
              data: [
                { key: 'username', value: 'tester', sensitive: false },
                { key: 'password', value: 'updated_password', sensitive: true }
              ],
              other: 'Updated test info'
            }
          },
          {
            description: 'Click login button',
            checks: ['Should redirect to login page'],
            testData: {
              data: [],
              other: 'New step'
            }
          }
        ]
      }
    };
    
    const result = await client.callTool({
      name: 'edit_test_case',
      arguments: editedTestCase
    });
    const content = result.content as Array<{type: string, text: string}>;
    console.log('✅ edit_test_case succeeded:', content[0].text);
    
    // Verify the file was updated
    const fileContent = await fs.readFile(TEST_CASE_PATH, 'utf-8');
    if (!fileContent.includes('Updated Test Case') || !fileContent.includes('example.org')) {
      console.log('❌ Test case file was not properly updated');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('❌ edit_test_case failed:', error);
    return false;
  }
}

/**
 * Test the run_tests tool
 * Note: This is commented out as it requires the actual BlueSteel CLI
 */
async function testRunTests(client: Client): Promise<boolean> {
  console.log('\nTesting run_tests tool...');
  try {
    const result = await client.callTool({
      name: 'run_tests',
      arguments: {
        pattern: TEST_CASE_PATH,
        workers: 1
      }
    });
    
    const content = result.content as Array<{type: string, text: string}>;
    console.log('✅ run_tests succeeded:', content[0].text);
    return true;
  } catch (error) {
    console.log('❌ run_tests failed:', error);
    return false;
  }
}

/**
 * Test the get_configuration tool
 */
async function testGetConfiguration(client: Client): Promise<boolean> {
  console.log('\nTesting get_configuration tool...');
  try {
    // First create a config file to read
    await fs.writeFile(TEST_CONFIG_PATH, `import { type BlueSteelConfig } from "blue-steel-test";

export default {
    url: "https://api.blue-steel.test",
    apiKey: "test-api-key"
} satisfies BlueSteelConfig;`);
    
    const result = await client.callTool({
      name: 'get_configuration',
      arguments: {
        configPath: TEST_CONFIG_PATH
      }
    });
    
    console.log('✅ get_configuration succeeded');
    
    // Verify the response contains the config data
    const content = result.content as Array<{type: string, text: string}>;
    const responseText = content[0].text;
    const config = JSON.parse(responseText);
    
    if (!config.url || !config.apiKey) {
      console.log('❌ get_configuration returned invalid data');
      return false;
    }
    
    console.log('Configuration data:', config);
    return true;
  } catch (error) {
    console.log('❌ get_configuration failed:', error);
    return false;
  }
}

/**
 * Test the update_configuration tool
 */
async function testUpdateConfiguration(client: Client): Promise<boolean> {
  console.log('\nTesting update_configuration tool...');
  try {
    const updatedConfig = {
      configPath: TEST_CONFIG_PATH,
      config: {
        url: 'https://updated.blue-steel.test',
        apiKey: 'updated-api-key'
      }
    };
    
    const result = await client.callTool({
      name: 'update_configuration',
      arguments: updatedConfig
    });
    const content = result.content as Array<{type: string, text: string}>;
    console.log('✅ update_configuration succeeded:', content[0].text);
    
    // Verify the file was updated
    const fileContent = await fs.readFile(TEST_CONFIG_PATH, 'utf-8');
    if (!fileContent.includes('updated.blue-steel.test') || !fileContent.includes('updated-api-key')) {
      console.log('❌ Configuration file was not properly updated');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('❌ update_configuration failed:', error);
    return false;
  }
}

// Run the tests
prepareTestEnvironment()
  .then(runTests)
  .catch(error => {
    console.log('Test execution failed:', error);
    process.exit(1);
  });
