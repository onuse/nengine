const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('Connected to server');

  // Send a look command after a short delay
  setTimeout(() => {
    console.log('Sending look command...');
    ws.send(JSON.stringify({
      type: 'player_action',
      action: { type: 'interaction' },
      rawInput: 'look'
    }));
  }, 1000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.type);

  if (msg.type === 'narrative_response') {
    console.log('SUCCESS! Two-phase generation completed!');
    console.log('Full response:', JSON.stringify(msg, null, 2));
    if (msg.result?.narrative) {
      console.log('\nNarrative preview:', msg.result.narrative.substring(0, 300) + '...');
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
});

// Timeout after 5 minutes (300000ms) - Llama 3.3 70B needs ~3 minutes
setTimeout(() => {
  console.log('Timeout - no response received after 5 minutes');
  process.exit(1);
}, 300000);