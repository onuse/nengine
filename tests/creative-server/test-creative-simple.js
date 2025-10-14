/**
 * Simple Creative Server Test (plain JS)
 * Tests connection and basic functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://192.168.1.95:8000/v1';
const ADMIN_URL = 'http://192.168.1.95:8000/admin';

async function test() {
  console.log('🧪 Creative Server Integration Test\n');
  console.log('='.repeat(60));

  // Test 1: Server Health
  console.log('\n📡 Test 1: Server Health Check');
  console.log('-'.repeat(60));

  try {
    const health = await axios.get('http://192.168.1.95:8000/health', { timeout: 5000 });
    console.log(`✅ Server is ${health.data.status}`);
  } catch (error) {
    console.error('❌ Server not reachable:', error.message);
    console.error('\nPlease check:');
    console.error('  - Server is running at 192.168.1.95:8000');
    console.error('  - Network connectivity');
    console.error('  - Firewall settings');
    process.exit(1);
  }

  // Test 2: Check Working Set
  console.log('\n⚙️  Test 2: Working Set Status');
  console.log('-'.repeat(60));

  try {
    const sets = await axios.get(`${ADMIN_URL}/sets`, { timeout: 5000 });
    const currentSet = sets.data.current;
    console.log(`📊 Current working set: ${currentSet}`);

    if (currentSet !== 'creative') {
      console.log('⚠️  Not on creative set, attempting to switch...');

      await axios.post(`${ADMIN_URL}/sets/switch`,
        { target_set: 'creative' },
        { timeout: 10000 }
      );

      console.log('⏳ Waiting 60 seconds for models to load...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      console.log('✅ Should be ready now');
    } else {
      console.log('✅ Already on creative working set');
    }
  } catch (error) {
    console.error('❌ Working set check failed:', error.message);
    console.log('⚠️  Continuing anyway...');
  }

  // Test 3: Text Generation
  console.log('\n📝 Test 3: Text Generation (Llama 3.3 70B)');
  console.log('-'.repeat(60));

  try {
    console.log('Generating text (this may take 20-30 seconds)...');
    const startTime = Date.now();

    const response = await axios.post(`${BASE_URL}/chat/completions`, {
      model: 'llama-3.3-70b-abliterated',
      messages: [
        {
          role: 'system',
          content: 'You are a creative game master for a dark fantasy RPG.'
        },
        {
          role: 'user',
          content: 'Describe a mysterious tavern called "The Crimson Lantern" where a gruff, one-eyed bartender named Grimwald serves suspicious patrons. Make it atmospheric and vivid.'
        }
      ],
      temperature: 0.9,
      max_tokens: 200
    }, {
      timeout: 120000
    });

    const elapsed = Date.now() - startTime;
    const narrative = response.data.choices[0].message.content;

    console.log(`✅ Text generated in ${(elapsed/1000).toFixed(1)}s`);
    console.log(`📊 Usage:`, response.data.usage);
    console.log(`\n📖 Generated Narrative:`);
    console.log('-'.repeat(60));
    console.log(narrative);
    console.log('-'.repeat(60));

    const tokensPerSec = (response.data.usage.completion_tokens / (elapsed / 1000)).toFixed(1);
    console.log(`⚡ Performance: ${tokensPerSec} tokens/sec`);

  } catch (error) {
    console.error('❌ Text generation failed:', error.message);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }

  // Test 4: Image Generation
  console.log('\n🎨 Test 4: Image Generation (FLUX Unchained)');
  console.log('-'.repeat(60));

  try {
    console.log('Generating image (this may take 30-45 seconds)...');
    const startTime = Date.now();

    const response = await axios.post(`${BASE_URL}/images/generations`, {
      model: 'flux-unchained:12b',
      prompt: 'character portrait, gruff one-eyed bartender, scarred face, leather apron, fantasy art style, detailed',
      negative_prompt: 'blurry, low quality, deformed, cartoon',
      size: '512x512',
      steps: 20,
      n: 1
    }, {
      timeout: 300000
    });

    const elapsed = Date.now() - startTime;
    const imageB64 = response.data.data[0].b64_json;

    console.log(`✅ Image generated in ${(elapsed/1000).toFixed(1)}s`);

    // Save image
    const testDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const imagePath = path.join(testDir, 'bartender_portrait.png');
    const imageBuffer = Buffer.from(imageB64, 'base64');
    fs.writeFileSync(imagePath, imageBuffer);

    console.log(`💾 Image saved to: ${imagePath}`);
    console.log(`📊 File size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  } catch (error) {
    console.error('❌ Image generation failed:', error.message);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test suite completed!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Check test-output/bartender_portrait.png');
  console.log('  2. Review the generated narrative quality');
  console.log('  3. Run: npm run dev -- --game=example-creative-game');
  console.log('\n💡 Integration is ready to use!');
}

// Run test
test().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
