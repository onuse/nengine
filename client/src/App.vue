<template>
  <div id="app">
    <div class="game-container" v-if="gameConfig">
      <\!-- Viewport Panel - Conditionally rendered -->
      <div v-if="gameConfig?.ui?.layout?.panels?.viewport?.visible" 
           class="viewport-panel"
           :class="gameConfig?.ui?.layout?.panels?.viewport?.customClass">
        <div class="viewport">
          <h2 v-if="gameConfig?.ui?.layout?.panels?.viewport?.showRoomName && gameState.currentRoom">
            {{ gameState.currentRoom.name }}
          </h2>
          <p v-if="gameConfig?.ui?.layout?.panels?.viewport?.showDescription && gameState.currentRoom">
            {{ gameState.currentRoom.description }}
          </p>
        </div>
      </div>
      
      <div class="panels-container">
        <\!-- Party Panel - Conditionally rendered -->
        <div v-if="gameConfig?.ui?.layout?.panels?.party?.visible" 
             class="party-panel"
             :class="gameConfig?.ui?.layout?.panels?.party?.customClass">
          <h3>Party</h3>
          <div class="party-list">
            <div v-for="member in gameState.party" :key="member.id">
              {{ member.name }}
            </div>
          </div>
        </div>
        
        <\!-- Actions Panel - Conditionally rendered -->
        <div v-if="gameConfig?.ui?.layout?.panels?.actions?.visible" 
             class="actions-panel"
             :class="gameConfig?.ui?.layout?.panels?.actions?.customClass">
          <div class="action-bar">
            <button v-for="action in (gameConfig?.ui?.layout?.panels?.actions?.customActions || gameState.actions)" 
                    :key="action" 
                    @click="handleAction(action)">
              {{ action }}
            </button>
          </div>
        </div>
        
        <\!-- Inventory Panel - Conditionally rendered -->
        <div v-if="gameConfig?.ui?.layout?.panels?.inventory?.visible" 
             class="inventory-panel"
             :class="gameConfig?.ui?.layout?.panels?.inventory?.customClass">
          <h3>Inventory</h3>
          <div class="inventory-list">
            <div v-for="item in gameState.inventory" :key="item.id">
              {{ item.name }}
            </div>
          </div>
        </div>
      </div>
      
      <\!-- Console Panel - Conditionally rendered (default to visible) -->
      <div v-if="isConsolePanelVisible" 
           class="console-panel"
           :class="gameConfig?.ui?.layout?.panels?.console?.customClass">
        <div class="text-console">
          <div class="messages" ref="messagesContainer">
            <div v-for="(msg, index) in messages" :key="index" class="message">
              {{ msg }}
            </div>
          </div>
          <input 
            v-model="inputCommand" 
            @keyup.enter="handleCommand"
            class="command-input"
            placeholder="Enter command..."
          />
        </div>
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

const messages = ref<string[]>([]);

const inputCommand = ref('');
const messagesContainer = ref<HTMLElement>();

let ws: WebSocket | null = null;

const isConsolePanelVisible = computed(() => {
  if (!gameConfig.value?.ui?.layout?.panels?.console) return true;
  return gameConfig.value.ui.layout.panels.console.visible !== false;
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
        messages.value.push(`Welcome to ${gameConfig.value.game.title}`);
      }
      if (gameConfig.value?.game?.description) {
        messages.value.push(gameConfig.value.game.description);
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
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('Connected to server');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    addMessage('Disconnected from game server');
    setTimeout(connectWebSocket, 3000);
  };
}

function handleServerMessage(data: any) {
  if (data.type === 'narrative') {
    addMessage(data.text);
  } else if (data.type === 'state') {
    Object.assign(gameState, data.state);
  }
}

function handleCommand() {
  if (!inputCommand.value.trim()) return;
  
  addMessage(`> ${inputCommand.value}`);
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'command',
      command: inputCommand.value
    }));
  }
  
  inputCommand.value = '';
}

function handleAction(action: string) {
  addMessage(`[Action: ${action}]`);
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'action',
      action: action
    }));
  }
}

async function addMessage(msg: string) {
  messages.value.push(msg);
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
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
}

/* Dynamic panel layout */
.viewport-panel {
  min-height: 30%;
  border-bottom: 1px solid var(--color-text);
  padding: 10px;
  overflow-y: auto;
}

.viewport h2 {
  color: var(--color-info);
  margin-bottom: 10px;
}

.panels-container {
  display: flex;
  min-height: 35%;
  border-bottom: 1px solid var(--color-text);
}

.party-panel {
  width: 25%;
  padding: 10px;
  overflow-y: auto;
  border-right: 1px solid var(--color-text);
}

.inventory-panel {
  width: 25%;
  padding: 10px;
  overflow-y: auto;
  border-left: 1px solid var(--color-text);
}

.actions-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.action-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-bar button {
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-text);
  padding: 10px 20px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.action-bar button:hover {
  background: var(--color-text);
  color: var(--color-background);
}

.console-panel {
  flex: 1;
  min-height: 35%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.text-console {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.messages {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 10px;
  padding: 5px;
  background: var(--color-background);
  border: 1px solid var(--color-text);
}

.message {
  margin-bottom: 5px;
  word-wrap: break-word;
}

.command-input {
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-text);
  padding: 10px;
  font-family: inherit;
  font-size: 14px;
  outline: none;
}

.command-input:focus {
  border-color: var(--color-info);
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