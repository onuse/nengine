/**
 * Audio Services Test Script
 *
 * Tests the speaker detection and TTS services independently
 */

import axios from 'axios';

const SPEAKER_DETECTION_URL = 'http://192.168.1.95:8002';
const TTS_URL = 'http://192.168.1.95:8001';

interface TestResult {
  service: string;
  test: string;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function testSpeakerDetectionHealth() {
  console.log('\n=== Testing Speaker Detection Health ===');
  try {
    const response = await axios.get(`${SPEAKER_DETECTION_URL}/health`);
    console.log('✅ Health check passed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    results.push({
      service: 'speaker-detection',
      test: 'health',
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.log('❌ Health check failed');
    console.log('Error:', error.message);
    results.push({
      service: 'speaker-detection',
      test: 'health',
      success: false,
      error: error.message
    });
  }
}

async function testSpeakerDetection() {
  console.log('\n=== Testing Speaker Detection ===');

  const testNarrative = `As you step into the room, a blonde woman smiles at you.

"Bonjour, cher," she purrs. "Welcome to our little gathering."

The auburn woman raises an eyebrow. "Yes, this is a lovely surprise," she says.`;

  const testRequest = {
    narrative: testNarrative,
    characters: [
      {
        id: 'amelie',
        name: 'Amélie',
        aliases: ['the blonde woman', 'Amelie'],
        description: 'A French woman with blonde hair'
      },
      {
        id: 'scarlett',
        name: 'Scarlett',
        aliases: ['the auburn woman'],
        description: 'An Irish woman with auburn hair'
      }
    ]
  };

  console.log('Request payload:', JSON.stringify(testRequest, null, 2));

  try {
    const response = await axios.post(`${SPEAKER_DETECTION_URL}/parse-speakers`, testRequest);
    console.log('✅ Speaker detection successful');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    results.push({
      service: 'speaker-detection',
      test: 'parse-speakers',
      success: true,
      data: response.data
    });
    return response.data.segments;
  } catch (error: any) {
    console.log('❌ Speaker detection failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    results.push({
      service: 'speaker-detection',
      test: 'parse-speakers',
      success: false,
      error: error.response?.data || error.message
    });
    return null;
  }
}

async function testTTSHealth() {
  console.log('\n=== Testing TTS Health ===');
  try {
    const response = await axios.get(`${TTS_URL}/health`);
    console.log('✅ Health check passed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    results.push({
      service: 'tts',
      test: 'health',
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.log('❌ Health check failed');
    console.log('Error:', error.message);
    results.push({
      service: 'tts',
      test: 'health',
      success: false,
      error: error.message
    });
  }
}

async function testTTSSingle() {
  console.log('\n=== Testing TTS Single Synthesis ===');

  const testRequest = {
    text: 'Bonjour, cher. Welcome to our little gathering.',
    voice: 'af_sarah',
    speed: 1.0,
    format: 'wav',
    sample_rate: 24000
  };

  console.log('Request payload:', JSON.stringify(testRequest, null, 2));

  try {
    const response = await axios.post(`${TTS_URL}/synthesize`, testRequest);
    console.log('✅ TTS synthesis successful');
    console.log('Response (audio truncated):', {
      success: response.data.success,
      duration: response.data.duration,
      size_bytes: response.data.size_bytes,
      audio_length: response.data.audio?.length || 0
    });
    results.push({
      service: 'tts',
      test: 'synthesize-single',
      success: true,
      data: {
        duration: response.data.duration,
        size_bytes: response.data.size_bytes
      }
    });
  } catch (error: any) {
    console.log('❌ TTS synthesis failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    results.push({
      service: 'tts',
      test: 'synthesize-single',
      success: false,
      error: error.response?.data || error.message
    });
  }
}

async function testTTSBatch() {
  console.log('\n=== Testing TTS Batch Synthesis ===');

  const testRequest = {
    segments: [
      {
        id: 'seg_001',
        text: 'Bonjour, cher. Welcome to our little gathering.',
        voice: 'af_sarah',
        speed: 0.95
      },
      {
        id: 'seg_002',
        text: 'Yes, this is a lovely surprise.',
        voice: 'af_nicole',
        speed: 1.05
      }
    ],
    format: 'wav'
  };

  console.log('Request payload:', JSON.stringify(testRequest, null, 2));

  try {
    const response = await axios.post(`${TTS_URL}/synthesize/batch`, testRequest);
    console.log('✅ TTS batch synthesis successful');
    console.log('Response (audio truncated):', {
      success: response.data.success,
      total_duration: response.data.total_duration,
      processing_time_ms: response.data.processing_time_ms,
      segment_count: response.data.segments?.length || 0
    });
    results.push({
      service: 'tts',
      test: 'synthesize-batch',
      success: true,
      data: {
        total_duration: response.data.total_duration,
        processing_time_ms: response.data.processing_time_ms,
        segment_count: response.data.segments?.length
      }
    });
  } catch (error: any) {
    console.log('❌ TTS batch synthesis failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    results.push({
      service: 'tts',
      test: 'synthesize-batch',
      success: false,
      error: error.response?.data || error.message
    });
  }
}

async function runAllTests() {
  console.log('🧪 Starting Audio Services Tests...');
  console.log('='.repeat(60));

  await testSpeakerDetectionHealth();
  await testSpeakerDetection();
  await testTTSHealth();
  await testTTSSingle();
  await testTTSBatch();

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\nTotal tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.service} / ${r.test}`);
      console.log(`    Error: ${JSON.stringify(r.error, null, 2)}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

// Run tests
runAllTests().catch(console.error);
