/**
 * Creative Server Integration Test
 * Tests connection, text generation, and image generation
 */

import { CreativeServerProvider } from './src/llm/creative-server-provider';
import { ImageService } from './src/services/image-service';
import * as fs from 'fs';
import * as path from 'path';

async function testCreativeServer() {
  console.log('🧪 Creative Server Integration Test\n');
  console.log('=' .repeat(60));

  // Test 1: Server Connection
  console.log('\n📡 Test 1: Server Connection');
  console.log('-'.repeat(60));

  const provider = new CreativeServerProvider({
    baseUrl: 'http://192.168.1.95:8000/v1',
    adminUrl: 'http://192.168.1.95:8000/admin',
    autoSwitch: true
  });

  try {
    const available = await provider.isAvailable();
    console.log(`✅ Server available: ${available}`);

    if (!available) {
      console.error('❌ Server not reachable. Please check:');
      console.error('   - Server is running at 192.168.1.95:8000');
      console.error('   - Network connectivity');
      console.error('   - Firewall settings');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Connection test failed: ${error.message}`);
    process.exit(1);
  }

  // Test 2: Initialization & Working Set
  console.log('\n⚙️  Test 2: Initialization & Working Set');
  console.log('-'.repeat(60));

  try {
    await provider.initialize();
    console.log('✅ Provider initialized successfully');

    const modelInfo = provider.getModelInfo();
    console.log(`📊 Model Info:`);
    console.log(`   - Name: ${modelInfo.name}`);
    console.log(`   - Context Window: ${modelInfo.contextWindow} tokens`);
    console.log(`   - Tokens/sec: ${modelInfo.maxTokensPerSecond}`);
    console.log(`   - Size: ${modelInfo.modelSize}`);
  } catch (error: any) {
    console.error(`❌ Initialization failed: ${error.message}`);
    process.exit(1);
  }

  // Test 3: Text Generation
  console.log('\n📝 Test 3: Text Generation');
  console.log('-'.repeat(60));

  try {
    console.log('Generating narrative (this may take 20-30 seconds)...');
    const startTime = Date.now();

    const response = await provider.complete({
      systemContext: 'You are a creative game master for a dark fantasy RPG.',
      worldState: {
        currentRoom: 'tavern_main',
        currentRoomName: 'The Crimson Lantern',
        roomDescription: 'A dimly lit tavern filled with smoke and suspicious characters.',
        connectedRooms: ['street', 'upstairs'],
        presentNPCs: [
          {
            id: 'bartender',
            name: 'Grimwald',
            description: 'A gruff, one-eyed bartender with a mysterious past',
            currentMood: 'suspicious',
            relationship: { trust: 20, fear: 10, respect: 30 },
            recentMemories: []
          }
        ],
        visibleItems: ['mysterious_box', 'wanted_poster'],
        environment: {
          lighting: 'dim',
          sounds: ['murmuring voices', 'clinking glasses'],
          smells: ['ale', 'smoke', 'sweat'],
          hazards: []
        },
        gameTime: {
          timeOfDay: 'night'
        }
      },
      recentHistory: [],
      availableActions: [
        { id: 'talk_bartender', name: 'Talk to Grimwald', description: 'Approach the bartender' },
        { id: 'examine_box', name: 'Examine box', description: 'Look at the mysterious box' }
      ],
      query: 'The player enters the tavern for the first time. Describe the scene with rich sensory details and introduce Grimwald the bartender.'
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Text generated in ${(elapsed/1000).toFixed(1)}s`);
    console.log(`📖 Narrative (${response.narrative.length} chars):`);
    console.log('-'.repeat(60));
    console.log(response.narrative);
    console.log('-'.repeat(60));

    if (response.dialogue) {
      console.log(`💬 Dialogue: "${response.dialogue}"`);
    }
    console.log(`🎭 Mood: ${response.mood}`);

    // Calculate tokens/sec
    const estimatedTokens = Math.ceil(response.narrative.length / 4);
    const tokensPerSec = (estimatedTokens / (elapsed / 1000)).toFixed(1);
    console.log(`⚡ Performance: ~${tokensPerSec} tokens/sec (estimated)`);

  } catch (error: any) {
    console.error(`❌ Text generation failed: ${error.message}`);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 4: Image Generation
  console.log('\n🎨 Test 4: Image Generation');
  console.log('-'.repeat(60));

  try {
    console.log('Generating character portrait (this may take 30-45 seconds)...');
    const startTime = Date.now();

    const imageResult = await provider.generateImage!(
      'character portrait, gruff one-eyed bartender, scarred face, leather apron, fantasy art style, detailed',
      {
        size: '512x512',
        steps: 20,
        negativePrompt: 'blurry, low quality, deformed, cartoon'
      }
    );

    const elapsed = Date.now() - startTime;

    if (imageResult.success && imageResult.imageData) {
      console.log(`✅ Image generated in ${(elapsed/1000).toFixed(1)}s`);

      // Save test image
      const testDir = path.join(__dirname, 'test-output');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const imagePath = path.join(testDir, 'bartender_portrait.png');
      const imageBuffer = Buffer.from(imageResult.imageData, 'base64');
      fs.writeFileSync(imagePath, imageBuffer);

      console.log(`💾 Image saved to: ${imagePath}`);
      console.log(`📊 Image size: ${imageBuffer.length} bytes`);
      console.log(`📐 Dimensions: ${imageResult.metadata?.size}`);
      console.log(`🎲 Seed: ${imageResult.metadata?.seed || 'random'}`);
    } else {
      console.error(`❌ Image generation failed: ${imageResult.error}`);
    }

  } catch (error: any) {
    console.error(`❌ Image generation failed: ${error.message}`);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 5: Image Service Integration
  console.log('\n🖼️  Test 5: Image Service Integration');
  console.log('-'.repeat(60));

  try {
    const imageService = new ImageService('./test-output');
    imageService.setLLMProvider(provider);

    console.log('Generating entity image via ImageService...');
    const startTime = Date.now();

    const imageId = await imageService.generateEntityImage(
      'test_npc_grimwald',
      'gruff bartender, one-eyed, scarred, leather apron',
      { size: '512x512', steps: 15 }
    );

    const elapsed = Date.now() - startTime;

    if (imageId) {
      console.log(`✅ Image generated in ${(elapsed/1000).toFixed(1)}s`);
      console.log(`🆔 Image ID: ${imageId}`);

      const metadata = imageService.getImageMetadata(imageId);
      console.log(`📋 Metadata:`, JSON.stringify(metadata, null, 2));

      const imagePath = imageService.getImagePath(imageId);
      console.log(`📁 File path: ${imagePath}`);

      // Test retrieval
      const retrieved = imageService.findImageByEntity('test_npc_grimwald');
      console.log(`✅ Image retrieval test: ${retrieved ? 'PASSED' : 'FAILED'}`);

      // Test caching (should not regenerate)
      console.log('\nTesting cache (should skip generation)...');
      const imageId2 = await imageService.generateEntityImage(
        'test_npc_grimwald',
        'different description should be ignored',
        { size: '512x512' }
      );
      console.log(`✅ Cache test: ${imageId === imageId2 ? 'PASSED (used cache)' : 'FAILED (regenerated)'}`);

    } else {
      console.error('❌ ImageService failed to generate image');
    }

  } catch (error: any) {
    console.error(`❌ ImageService test failed: ${error.message}`);
  }

  // Test 6: Cleanup & Shutdown
  console.log('\n🧹 Test 6: Cleanup');
  console.log('-'.repeat(60));

  try {
    await provider.shutdown();
    console.log('✅ Provider shut down successfully');
  } catch (error: any) {
    console.error(`❌ Shutdown failed: ${error.message}`);
  }

  // Final Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
  console.log('='.repeat(60));
  console.log('\nGenerated files:');
  console.log('  - test-output/bartender_portrait.png');
  console.log('  - test-output/generated-images/entity_test_npc_grimwald_*.png');
  console.log('  - test-output/generated-images/metadata.json');
  console.log('\n💡 Tip: Open the images to verify quality!');
}

// Run tests
testCreativeServer().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
