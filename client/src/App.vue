<template>
  <div id="app">
    <div class="game-container" v-if="gameConfig">
      <!-- Game Header -->
      <div class="game-header">
        <h1>{{ gameConfig?.game?.title || 'Narrative Engine' }}</h1>
        <p v-if="gameConfig?.game?.description">{{ gameConfig.game.description }}</p>
      </div>
      
      <!-- Main Game Console -->
      <div class="console-panel">
        <div class="text-console">
          <div class="messages" ref="messagesContainer">
            <div v-for="(msg, index) in messages" :key="index" :class="['message', `message-${msg.type}`]">
              {{ msg.text }}
            </div>
            <div v-if="isProcessing" class="processing-message">
              <span class="processing-dots">{{ processingMessage }}</span>
              <span class="dots">...</span>
            </div>
          </div>
          <input 
            v-model="inputCommand" 
            @keyup.enter="handleCommand"
            class="command-input"
            :disabled="isProcessing"
            :placeholder="isProcessing ? 'Processing...' : 'Type your command here and press Enter...'"
          />
        </div>
      </div>
      
      <!-- Quick Actions -->
      <div class="action-bar" v-if="gameConfig?.mechanics?.commands">
        <button v-for="action in quickActions" :key="action" 
                @click="handleAction(action)" 
                class="action-button"
                :disabled="isProcessing">
          {{ action }}
        </button>
      </div>
    </div>
    
    <div v-else class="loading-container">
      <p>Loading game...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, computed } from 'vue';

interface GameState {
  currentRoom: any;
  party: any[];
  inventory: any[];
  actions: string[];
}

const gameConfig = ref<any>(null);

const gameState = reactive<GameState>({
  currentRoom: null,
  party: [],
  inventory: [],
  actions: []
});

interface GameMessage {
  type: 'command' | 'description' | 'dialogue' | 'system' | 'error';
  text: string;
}

const messages = ref<GameMessage[]>([]);
const isProcessing = ref(false);
const processingMessage = ref('');

const inputCommand = ref('');
const messagesContainer = ref<HTMLElement>();

let ws: WebSocket | null = null;

const quickActions = computed(() => {
  if (!gameConfig.value?.mechanics?.commands) return ['look', 'inventory'];
  
  const commands = gameConfig.value.mechanics.commands;
  const actions = [];
  
  if (commands.movement) actions.push(...commands.movement.slice(0, 4)); // first 4 directions
  if (commands.interaction) actions.push('look', 'examine');
  if (commands.meta) actions.push('inventory');
  
  return actions.slice(0, 8); // max 8 quick actions
});

onMounted(async () => {
  await loadGameConfig();
  connectWebSocket();
});

async function loadGameConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      gameConfig.value = await response.json();
      console.log('Loaded game:', gameConfig.value?.game?.title);
      
      // Add welcome message based on game
      if (gameConfig.value?.game?.title) {
        addMessage(`Welcome to ${gameConfig.value.game.title}`, 'system');
      }
      if (gameConfig.value?.game?.description) {
        addMessage(gameConfig.value.game.description, 'system');
      }
      
      // Load custom CSS
      if (gameConfig.value?.game?.id) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/api/game/${gameConfig.value.game.id}/theme.css`;
        document.head.appendChild(link);
      }
      
      // Apply theme colors
      if (gameConfig.value?.ui?.themeConfig?.colors) {
        const root = document.documentElement;
        Object.entries(gameConfig.value.ui.themeConfig.colors).forEach(([key, value]) => {
          root.style.setProperty(`--color-${key}`, value as string);
        });
      }
    }
  } catch (error) {
    console.error('Failed to load game config:', error);
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  console.log('Attempting to connect to:', wsUrl);
  addMessage('🔌 Connecting to server...');
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('✅ Connected to server');
    addMessage('✅ Connected to game server');
    
    // Send initial "look" command to get the game state
    setTimeout(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        isProcessing.value = true;
        processingMessage.value = 'Initializing game world...';
        
        ws.send(JSON.stringify({
          type: 'player_action',
          id: 'initial_look',
          action: { 
            type: 'look'
          },
          rawInput: 'look'
        }));
      }
    }, 500);
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (error) {
      console.error('Failed to parse server message:', error);
      addMessage('❌ Received invalid message from server');
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    addMessage('❌ Connection error occurred');
  };
  
  ws.onclose = (event) => {
    console.log('❌ Disconnected from server. Code:', event.code, 'Reason:', event.reason);
    addMessage('❌ Disconnected from game server');
    
    // Only reconnect if it wasn't a manual close
    if (event.code !== 1000) {
      addMessage('🔄 Attempting to reconnect in 3 seconds...');
      setTimeout(connectWebSocket, 3000);
    }
  };
}

function handleServerMessage(data: any) {
  console.log('Received message:', data);
  
  // Clear processing state
  isProcessing.value = false;
  processingMessage.value = '';
  
  if (data.type === 'narrative_response' || data.type === 'response') {
    // Handle narrative responses from the server
    if (data.result && data.result.narrative) {
      addMessage(data.result.narrative, 'description');
    } else if (data.result && data.result.error) {
      addMessage(`❌ Error: ${data.result.error}`, 'error');
    } else if (data.error) {
      addMessage(`❌ Error: ${data.error}`, 'error');
    }
  } else if (data.type === 'state') {
    Object.assign(gameState, data.state);
  } else if (data.type === 'narrative') {
    addMessage(data.text, 'description');
  }
}

function handleCommand() {
  if (!inputCommand.value.trim() || isProcessing.value) return;
  
  const command = inputCommand.value.trim();
  addMessage(`> ${command}`, 'command');
  inputCommand.value = '';
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    isProcessing.value = true;
    processingMessage.value = 'Processing command...';
    
    // Send as player_action message for the narrative engine
    ws.send(JSON.stringify({
      type: 'player_action',
      id: Date.now().toString(),
      action: { 
        type: 'interaction',
        description: command 
      },
      rawInput: command
    }));
  } else {
    addMessage('❌ Not connected to server');
  }
}

function handleAction(action: string) {
  if (isProcessing.value) return;
  
  addMessage(`> ${action}`, 'command');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    isProcessing.value = true;
    processingMessage.value = `Processing "${action}" action...`;
    
    // Send as player_action message for the narrative engine
    ws.send(JSON.stringify({
      type: 'player_action',
      id: Date.now().toString(),
      action: { 
        type: 'interaction',
        description: action.toLowerCase()
      },
      rawInput: action.toLowerCase()
    }));
  } else {
    addMessage('❌ Not connected to server');
  }
}

async function addMessage(text: string, type: GameMessage['type'] = 'system') {
  messages.value.push({ text, type });
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}
</script>

<style>
/* CSS Variables for theming */
:root {
  --color-primary: #00ff00;
  --color-secondary: #00aa00;
  --color-background: #000000;
  --color-backgroundAlt: #111111;
  --color-text: #00ff00;
  --color-textAlt: #00aa00;
  --color-border: #00ff00;
  --color-borderActive: #00ffff;
  --color-error: #ff0000;
  --color-info: #00ffff;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Courier New', monospace;
  background: var(--color-background);
  color: var(--color-text);
  overflow: hidden;
}

#app {
  width: 100vw;
  height: 100vh;
}

.game-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  overflow: hidden;
}

.game-header {
  background: var(--color-backgroundAlt);
  padding: 15px;
  border-bottom: 2px solid var(--color-border);
  text-align: center;
}

.game-header h1 {
  color: var(--color-primary);
  font-size: 24px;
  margin-bottom: 5px;
  text-shadow: 0 0 10px var(--color-primary);
}

.game-header p {
  color: var(--color-textAlt);
  font-size: 14px;
  font-style: italic;
}

.action-bar {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: var(--color-backgroundAlt);
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
  justify-content: center;
}

.action-button {
  background: var(--color-background);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  padding: 8px 16px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s;
  text-transform: capitalize;
  border-radius: var(--border-radius, 4px);
}

.action-button:hover {
  background: var(--color-primary);
  color: var(--color-background);
  box-shadow: 0 0 8px var(--color-primary);
}

.console-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
  background: var(--color-background);
}

.text-console {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin-bottom: 15px;
  padding: 15px;
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  min-height: 200px;
  max-height: calc(100vh - 300px);
  word-wrap: break-word;
  text-align: left;
}

/* Different message types */
.message-command {
  color: var(--color-info);
  font-style: italic;
  text-align: right;
  opacity: 0.8;
}

.message-description {
  color: var(--color-text);
  text-align: left;
  line-height: 1.6;
  white-space: pre-line; /* Preserves line breaks and spaces */
  margin-bottom: 15px;
  padding: 5px 0;
}

/* Ensure all messages preserve formatting */
.message {
  margin-bottom: 5px;
  word-wrap: break-word;
  text-align: left;
  white-space: pre-line; /* Apply to all messages */
}

.message-dialogue {
  color: var(--color-secondary);
  text-align: left;
  font-style: italic;
}

.message-system {
  color: var(--color-textAlt);
  text-align: center;
  font-size: 0.9em;
  opacity: 0.8;
}

.message-error {
  color: var(--color-error);
  text-align: left;
  font-weight: bold;
}

.command-input {
  background: var(--color-backgroundAlt);
  color: var(--color-text);
  border: 2px solid var(--color-border);
  padding: 12px 16px;
  font-family: inherit;
  font-size: 16px;
  outline: none;
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}

.command-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
}

.command-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.processing-message {
  color: var(--color-secondary);
  font-style: italic;
  padding: 10px;
  border-left: 3px solid var(--color-secondary);
  margin: 10px 0;
  background: rgba(255, 0, 255, 0.1);
}

.dots {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

h3 {
  color: var(--color-info);
  margin-bottom: 10px;
  font-size: 14px;
}

.party-list, .inventory-list {
  font-size: 12px;
}

.party-list div, .inventory-list div {
  margin-bottom: 5px;
}

/* Loading state */
.loading-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  color: var(--color-text);
}

.loading-container p {
  font-size: 18px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>