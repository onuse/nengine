#!/usr/bin/env node

/**
 * CLI Test Runner for Narrative Engine Integration Tests
 * Usage: node run-tests.js [--game=test-quest] [--server=http://localhost:3000]
 */

const { IntegrationTestRunner } = require('./integration-test');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let serverUrl = 'http://localhost:3000';
  let game = 'test-quest';
  
  for (const arg of args) {
    if (arg.startsWith('--server=')) {
      serverUrl = arg.split('=')[1];
    } else if (arg.startsWith('--game=')) {
      game = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log('Narrative Engine Integration Test Runner');
      console.log('Usage: node run-tests.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --server=URL    Server URL (default: http://localhost:3000)');
      console.log('  --game=NAME     Game to test (default: test-quest)');
      console.log('  --help, -h      Show this help message');
      process.exit(0);
    }
  }
  
  console.log(`🧪 Starting integration tests for game: ${game}`);
  console.log(`🌐 Server: ${serverUrl}`);
  console.log('');
  
  // Check if server is running test-quest
  if (game !== 'test-quest') {
    console.log('⚠️  Warning: These tests are designed for the test-quest game.');
    console.log('   Make sure your server is running with --game=test-quest');
    console.log('');
  }
  
  try {
    const runner = new IntegrationTestRunner(serverUrl);
    const results = await runner.runFullTestSuite();
    
    // Exit with appropriate code
    const hasFailures = results.some(r => !r.passed);
    process.exit(hasFailures ? 1 : 0);
    
  } catch (error) {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});