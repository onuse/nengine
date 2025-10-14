/**
 * Debug image generation endpoint
 */

const axios = require('axios');

const BASE_URL = 'http://192.168.1.95:8000/v1';

async function debugImageGeneration() {
  console.log('🔍 Debugging Image Generation\n');

  // Check what models are available
  console.log('1. Checking available models...');
  try {
    const models = await axios.get(`${BASE_URL}/models`);
    console.log('Available models:', JSON.stringify(models.data, null, 2));
  } catch (error) {
    console.error('Failed to get models:', error.message);
  }

  // Try simplified request
  console.log('\n2. Trying simplified image request...');
  try {
    const response = await axios.post(`${BASE_URL}/images/generations`, {
      prompt: 'test image',
      size: '512x512'
    }, { timeout: 120000 });

    console.log('✅ Worked without model specification!');
    console.log('Response keys:', Object.keys(response.data));
  } catch (error) {
    console.error('Failed:', error.response?.data || error.message);
  }

  // Try with model
  console.log('\n3. Trying with flux-unchained:12b...');
  try {
    const response = await axios.post(`${BASE_URL}/images/generations`, {
      model: 'flux-unchained:12b',
      prompt: 'test image',
      size: '512x512'
    }, { timeout: 120000 });

    console.log('✅ Worked with model!');
  } catch (error) {
    console.error('Failed:', error.response?.data || error.message);
  }

  // Try alternate model name
  console.log('\n4. Trying with flux-unchained (without :12b)...');
  try {
    const response = await axios.post(`${BASE_URL}/images/generations`, {
      model: 'flux-unchained',
      prompt: 'test image',
      size: '512x512'
    }, { timeout: 120000 });

    console.log('✅ Worked with alternate name!');
  } catch (error) {
    console.error('Failed:', error.response?.data || error.message);
  }
}

debugImageGeneration().catch(console.error);
