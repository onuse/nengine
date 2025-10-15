<template>
  <div id="app">
    <div class="game-container" v-if="gameConfig">
      <!-- Game Header -->
      <div class="game-header">
        <img v-if="gameConfig?.ui?.logo" :src="gameConfig.ui.logo" :alt="gameConfig?.game?.title" class="game-logo" />
        <h1 v-else>{{ gameConfig?.game?.title || 'Narrative Engine' }}</h1>
        <p v-if="gameConfig?.game?.description">{{ gameConfig.game.description }}</p>
      </div>
      
      <!-- Main Game Console -->
      <div class="console-panel">
        <div class="text-console">
          <div class="messages" ref="messagesContainer">
            <div
              v-for="(msg, index) in messages"
              :key="index"
              :class="['message', `message-${msg.type}`, { 'message-edited': msg.isEdited, 'message-clickable': msg.type !== 'system' }]"
              @contextmenu="msg.type !== 'system' && showContextMenu(msg, $event)"
              @click="msg.type !== 'system' && showContextMenu(msg, $event)"
            >
              <div class="message-content">{{ msg.text }}</div>
              <div class="message-timestamp">
                {{ formatTimestamp(msg.timestamp) }}
                <span v-if="msg.isEdited" class="edited-badge">✏️ Edited</span>
                <span v-if="msg.canRollback" class="rollback-indicator">🔄</span>
              </div>
            </div>
            <div v-if="isProcessing" class="processing-message">
              <div class="processing-header">
                <span class="processing-dots">{{ processingMessage }}</span>
                <span class="dots">...</span>
              </div>
              <div class="processing-details">
                <div class="processing-timer">
                  {{ getIcon('timer', '⏱️') }} {{ elapsedSeconds }}s elapsed
                </div>
                <div v-if="currentPhase" class="processing-phase">
                  {{ getIcon('phase', '📍') }} Phase: {{ currentPhase }}
                </div>
                <div v-if="estimatedTimeRemaining" class="processing-eta">
                  {{ getIcon('target', '🎯') }} ETA: ~{{ Math.ceil(estimatedTimeRemaining / 60) }} minutes
                </div>
              </div>
              <div class="processing-progress" v-if="currentPhase && getProgressPercentage() > 0">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: getProgressPercentage() + '%' }"></div>
                </div>
                <div class="progress-text">{{ getProgressText() }}</div>
              </div>
            </div>
          </div>
          <div class="input-section">
            <input
              v-model="inputCommand"
              @keyup.enter="handleCommand"
              class="command-input"
              :disabled="isProcessing"
              :placeholder="isProcessing ? 'Processing...' : 'Type your command here and press Enter...'"
            />
            <button
              @click="toggleRollbackMenu"
              class="rollback-button"
              :disabled="isProcessing || gameHistory.length === 0"
              title="Rollback to previous state"
            >
              {{ getIcon('rollback', '⏪') }} Rollback
            </button>
          </div>

          <!-- Rollback Menu -->
          <div v-if="showRollbackMenu" class="rollback-menu">
            <div class="rollback-header">
              <h3>{{ getIcon('rollback_menu', '🔄') }} Choose a point to return to:</h3>
              <button @click="showRollbackMenu = false" class="close-btn">✕</button>
            </div>
            <div class="rollback-options">
              <div
                v-for="snapshot in gameHistory.slice().reverse()"
                :key="snapshot.id"
                @click="rollbackToSnapshot(snapshot)"
                class="rollback-option"
              >
                <div class="snapshot-info">
                  <div class="snapshot-time">{{ formatTimestamp(snapshot.timestamp) }}</div>
                  <div class="snapshot-desc">{{ snapshot.description }}</div>
                  <div class="snapshot-messages">{{ snapshot.messages.length }} messages</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Context Menu -->
          <div
            v-if="contextMenu.show && contextMenu.message"
            :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
            class="context-menu"
          >
            <div
              v-for="action in getMessageActions(contextMenu.message)"
              :key="action.action"
              @click="handleContextAction(action, contextMenu.message!)"
              class="context-menu-item"
            >
              <span class="context-icon">{{ action.icon }}</span>
              <span class="context-label">{{ action.label }}</span>
            </div>
          </div>

          <!-- Edit Modal -->
          <div v-if="showEditModal" class="modal-overlay" @click="cancelEdit">
            <div class="edit-modal" @click.stop>
              <div class="modal-header">
                <h3>{{ editingMessage?.type === 'command' ? '✏️ Edit Command' : '📝 Rewrite Narration' }}</h3>
                <button @click="cancelEdit" class="close-btn">✕</button>
              </div>
              <div class="modal-body">
                <textarea
                  v-model="editedText"
                  class="edit-textarea"
                  :placeholder="editingMessage?.type === 'command' ? 'Enter your new command...' : 'Rewrite the narration...'"
                  rows="6"
                  autofocus
                ></textarea>
                <div class="modal-hint">
                  {{ editingMessage?.type === 'command' ? 'This will resend your command and create a new timeline branch.' : 'This will update the narration and create a new timeline branch if needed.' }}
                </div>
              </div>
              <div class="modal-footer">
                <button @click="cancelEdit" class="modal-button cancel-button">Cancel</button>
                <button @click="confirmEdit" class="modal-button confirm-button">
                  {{ editingMessage?.type === 'command' ? 'Send' : 'Update' }}
                </button>
              </div>
            </div>
          </div>
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
  timestamp: Date;
  id?: string;
  commitHash?: string;      // Git commit hash for rollback
  isEdited?: boolean;        // Whether this message was user-edited
  originalText?: string;     // Original text before edit
  canRollback?: boolean;     // Whether rollback is available for this message
}

interface GameSnapshot {
  id: string;
  timestamp: Date;
  messages: GameMessage[];
  gameState: GameState;
  description: string;
}

const messages = ref<GameMessage[]>([]);
const isProcessing = ref(false);
const processingMessage = ref('');
const processingStartTime = ref<Date | null>(null);
const elapsedSeconds = ref(0);
const processingTimer = ref<number | null>(null);

// Rollback system
const gameHistory = ref<GameSnapshot[]>([]);
const showRollbackMenu = ref(false);
const nextMessageId = ref(1);
const currentPhase = ref('');
const phaseStartTime = ref<Date | null>(null);
const estimatedTimeRemaining = ref<number | null>(null);

// Context menu for message editing
const contextMenu = ref<{
  show: boolean;
  x: number;
  y: number;
  message: GameMessage | null;
}>({
  show: false,
  x: 0,
  y: 0,
  message: null
});

// Edit modal
const showEditModal = ref(false);
const editingMessage = ref<GameMessage | null>(null);
const editedText = ref('');

// Phase timing estimates based on our 12B model testing
const phaseEstimates: Record<string, number> = {
  'Initializing': 5,
  'Generating': 120, // 2 variations * ~60s each
  'Evaluating': 60,
  'Completing': 10
};

const inputCommand = ref('');
const messagesContainer = ref<HTMLElement>();

let ws: WebSocket | null = null;

// Icon helper function - returns game-specific icon or default
const getIcon = (name: string, defaultIcon: string): string => {
  return gameConfig.value?.ui?.icons?.[name] || defaultIcon;
};

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

  // Add keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
});

function handleKeydown(event: KeyboardEvent) {
  // ESC to close rollback menu
  if (event.key === 'Escape' && showRollbackMenu.value) {
    showRollbackMenu.value = false;
    event.preventDefault();
  }

  // Ctrl+Z for rollback (when not processing and have history)
  if (event.ctrlKey && event.key === 'z' && !isProcessing.value && gameHistory.value.length > 0) {
    if (!showRollbackMenu.value) {
      toggleRollbackMenu();
    }
    event.preventDefault();
  }
}

async function loadGameConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      gameConfig.value = await response.json();
      console.log('Loaded game:', gameConfig.value?.game?.title);
      
      // Add opening message based on game (not the header description)
      if (gameConfig.value?.game?.opening) {
        addMessage(gameConfig.value.game.opening, 'description');
      } else if (gameConfig.value?.game?.description) {
        // Fallback to description if no opening is defined
        addMessage(gameConfig.value.game.description, 'description');
      }
      
      // Load custom CSS - check for inline css_overrides first
      if (gameConfig.value?.ui?.css_overrides) {
        // Inject CSS directly from the config
        const style = document.createElement('style');
        style.textContent = gameConfig.value.ui.css_overrides;
        document.head.appendChild(style);
        console.log('Applied css_overrides from game config');
      } else if (gameConfig.value?.game?.id) {
        // Fall back to loading external CSS file
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/api/game/${gameConfig.value.game.id}/theme.css`;
        document.head.appendChild(link);
        console.log('Loading external theme CSS');
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
  addMessage(`${getIcon('connecting', '🔌')} Connecting to server...`);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ Connected to server');
    addMessage(`${getIcon('connected', '✅')} Connected to game server`);
    
    // Send initial "look" command to get the game state
    setTimeout(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        isProcessing.value = true;
        processingMessage.value = 'Initializing game world...';
        startProcessingTimer();
        
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
    addMessage(`${getIcon('error', '❌')} Connection error occurred`);
  };

  ws.onclose = (event) => {
    console.log('❌ Disconnected from server. Code:', event.code, 'Reason:', event.reason);
    addMessage(`${getIcon('disconnected', '❌')} Disconnected from game server`);

    // Only reconnect if it wasn't a manual close
    if (event.code !== 1000) {
      addMessage(`${getIcon('rollback', '🔄')} Attempting to reconnect in 3 seconds...`);
      setTimeout(connectWebSocket, 3000);
    }
  };
}

function handleServerMessage(data: any) {
  console.log('Received message:', data);

  // Handle clear history command from server
  if (data.type === 'clear_history') {
    messages.value = [];
    gameHistory.value = [];
    console.log('🧹 History cleared by server');
    return;
  }

  // Handle status updates without clearing processing state
  if (data.type === 'status_update') {
    console.log('📱 UI Status Update:', data.status);
    processingMessage.value = data.status;
    updatePhase(data.status);
    // Ensure processing state stays true for status updates
    if (!isProcessing.value) {
      isProcessing.value = true;
    }
    return;
  }

  // Clear processing state for final responses
  isProcessing.value = false;
  processingMessage.value = '';
  stopProcessingTimer();

  if (data.type === 'narrative_response' || data.type === 'response') {
    // Handle narrative responses from the server
    if (data.result && data.result.narrative) {
      addMessage(data.result.narrative, 'description', data.result.commitHash);
    } else if (data.result && data.result.error) {
      addMessage(`${getIcon('error', '❌')} Error: ${data.result.error}`, 'error');
    } else if (data.error) {
      addMessage(`${getIcon('error', '❌')} Error: ${data.error}`, 'error');
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
    startProcessingTimer();
    
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
    addMessage(`${getIcon('error', '❌')} Not connected to server`);
  }
}

function handleAction(action: string) {
  if (isProcessing.value) return;
  
  addMessage(`> ${action}`, 'command');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    isProcessing.value = true;
    processingMessage.value = `Processing "${action}" action...`;
    startProcessingTimer();
    
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
    addMessage(`${getIcon('error', '❌')} Not connected to server`);
  }
}

async function addMessage(text: string, type: GameMessage['type'] = 'system', commitHash?: string) {
  const message: GameMessage = {
    text,
    type,
    timestamp: new Date(),
    id: `msg_${nextMessageId.value++}`,
    commitHash,
    isEdited: false,
    canRollback: !!commitHash
  };
  messages.value.push(message);

  // Create snapshot after significant messages (commands and responses)
  if (type === 'command' || type === 'description') {
    createGameSnapshot(type === 'command' ? `Command: ${text}` : 'Narrative response');
  }

  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function createGameSnapshot(description: string) {
  const snapshot: GameSnapshot = {
    id: `snapshot_${Date.now()}`,
    timestamp: new Date(),
    messages: [...messages.value],
    gameState: { ...gameState },
    description
  };

  gameHistory.value.push(snapshot);

  // Keep only last 20 snapshots to avoid memory issues
  if (gameHistory.value.length > 20) {
    gameHistory.value.shift();
  }
}

function toggleRollbackMenu() {
  showRollbackMenu.value = !showRollbackMenu.value;
}

function rollbackToSnapshot(snapshot: GameSnapshot) {
  if (isProcessing.value) return;

  // Restore messages up to this point
  messages.value = [...snapshot.messages];

  // Restore game state
  Object.assign(gameState, snapshot.gameState);

  // Remove snapshots after this point
  const snapshotIndex = gameHistory.value.findIndex(s => s.id === snapshot.id);
  if (snapshotIndex !== -1) {
    gameHistory.value = gameHistory.value.slice(0, snapshotIndex + 1);
  }

  // Add rollback message
  addMessage(`${getIcon('rollback', '🔄')} Rolled back to: ${snapshot.description}`, 'system');

  showRollbackMenu.value = false;

  // Scroll to bottom
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

// Context Menu & Edit Handlers

function showContextMenu(message: GameMessage, event: MouseEvent) {
  event.preventDefault();
  showEditModal.value = false;

  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    message
  };

  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
  }, 0);
}

function closeContextMenu() {
  contextMenu.value.show = false;
  contextMenu.value.message = null;
}

interface MessageAction {
  icon: string;
  label: string;
  action: string;
}

function getMessageActions(message: GameMessage): MessageAction[] {
  const actions: MessageAction[] = [];
  const messageIndex = messages.value.findIndex(m => m.id === message.id);
  const isLastMessage = messageIndex === messages.value.length - 1;

  actions.push({ icon: '📋', label: 'Copy text', action: 'copy' });

  if (message.type === 'command') {
    actions.push({
      icon: '✏️',
      label: isLastMessage ? 'Edit & resend' : 'Edit & replay from here',
      action: 'edit_command'
    });
  }

  if (message.type === 'description' || message.type === 'dialogue') {
    actions.push({
      icon: '📝',
      label: 'Rewrite narration',
      action: 'edit_narration'
    });
  }

  if (!isLastMessage && message.commitHash) {
    actions.push({ icon: '🔄', label: 'Rollback to here', action: 'rollback' });
    actions.push({ icon: '🌿', label: 'Branch timeline here', action: 'branch' });
  }

  return actions;
}

function handleContextAction(action: MessageAction, message: GameMessage) {
  closeContextMenu();

  switch (action.action) {
    case 'copy':
      navigator.clipboard.writeText(message.text);
      addMessage('📋 Text copied to clipboard', 'system');
      break;
    case 'edit_command':
      handleEditCommand(message);
      break;
    case 'edit_narration':
      handleEditNarration(message);
      break;
    case 'rollback':
      handleRollbackToMessage(message);
      break;
    case 'branch':
      handleBranchFromMessage(message);
      break;
  }
}

function handleEditCommand(message: GameMessage) {
  editingMessage.value = message;
  editedText.value = message.text;
  showEditModal.value = true;
}

function handleEditNarration(message: GameMessage) {
  editingMessage.value = message;
  editedText.value = message.text;
  showEditModal.value = true;
}

async function confirmEdit() {
  if (!editingMessage.value || !editedText.value) return;

  const message = editingMessage.value;
  const messageIndex = messages.value.findIndex(m => m.id === message.id);
  const hasMessagesAfter = messageIndex < messages.value.length - 1;

  showEditModal.value = false;

  if (hasMessagesAfter) {
    const branchName = generateBranchName(message.text, message.timestamp);

    if (ws) {
      ws.send(JSON.stringify({
        type: 'create_branch',
        branchName,
        fromCommit: messages.value[messages.value.length - 1].commitHash
      }));

      addMessage(`🌿 Created timeline branch: "${branchName}"`, 'system');

      if (messageIndex > 0 && messages.value[messageIndex - 1].commitHash) {
        await rollbackToCommit(messages.value[messageIndex - 1].commitHash);
      }

      messages.value.splice(messageIndex);
    }
  }

  if (message.type === 'command') {
    sendCommand(editedText.value);
  } else {
    message.text = editedText.value;
    message.isEdited = true;
    message.originalText = message.originalText || message.text;
    addMessage('📝 Narration rewritten. Continue your story...', 'system');
  }

  editingMessage.value = null;
  editedText.value = '';
}

function sendCommand(command: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addMessage(`${getIcon('error', '❌')} Not connected to server`);
    return;
  }

  addMessage(`> ${command}`, 'command');

  isProcessing.value = true;
  processingMessage.value = 'Processing command...';
  startProcessingTimer();

  ws.send(JSON.stringify({
    type: 'player_action',
    id: Date.now().toString(),
    action: { type: 'interaction', description: command },
    rawInput: command
  }));
}

function cancelEdit() {
  showEditModal.value = false;
  editingMessage.value = null;
  editedText.value = '';
}

async function handleRollbackToMessage(message: GameMessage) {
  if (!message.commitHash) {
    addMessage('❌ Cannot rollback - no commit hash available', 'error');
    return;
  }

  const messageIndex = messages.value.findIndex(m => m.id === message.id);
  const branchName = `rollback-${Date.now()}`;

  if (ws) {
    ws.send(JSON.stringify({
      type: 'create_branch',
      branchName,
      fromCommit: messages.value[messages.value.length - 1].commitHash
    }));

    addMessage(`🌿 Current timeline saved as: "${branchName}"`, 'system');

    await rollbackToCommit(message.commitHash);
    messages.value.splice(messageIndex + 1);

    addMessage(`🔄 Rolled back to: "${message.text.substring(0, 50)}..."`, 'system');
  }
}

async function handleBranchFromMessage(message: GameMessage) {
  if (!message.commitHash) {
    addMessage('❌ Cannot branch - no commit hash available', 'error');
    return;
  }

  const branchName = generateBranchName(message.text, message.timestamp);

  if (ws) {
    ws.send(JSON.stringify({
      type: 'create_branch',
      branchName,
      fromCommit: message.commitHash
    }));

    addMessage(`🌿 Created branch: "${branchName}" from this point`, 'system');
  }
}

async function rollbackToCommit(commitHash: string) {
  if (!ws) return;

  return new Promise<void>((resolve) => {
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (data.type === 'rollback_complete') {
        ws?.removeEventListener('message', handler);
        resolve();
      } else if (data.type === 'error') {
        ws?.removeEventListener('message', handler);
        addMessage(`❌ Rollback failed: ${data.message}`, 'error');
        resolve();
      }
    };

    ws.addEventListener('message', handler);

    ws.send(JSON.stringify({
      type: 'rollback',
      commitHash
    }));
  });
}

function generateBranchName(fromMessage: string, timestamp: Date): string {
  const words = fromMessage
    .toLowerCase()
    .split(' ')
    .filter(w => w.length > 3 && !['the', 'and', 'you', 'are', 'with'].includes(w))
    .slice(0, 3)
    .join('-')
    .replace(/[^a-z0-9-]/g, '');

  const dateStr = timestamp.toISOString().slice(0, 10);

  return words ? `${words}-${dateStr}` : `branch-${dateStr}`;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function startProcessingTimer() {
  processingStartTime.value = new Date();
  elapsedSeconds.value = 0;

  if (processingTimer.value) {
    clearInterval(processingTimer.value);
  }

  processingTimer.value = window.setInterval(() => {
    if (processingStartTime.value) {
      elapsedSeconds.value = Math.floor((Date.now() - processingStartTime.value.getTime()) / 1000);
      calculateETA(); // Update ETA every second
    }
  }, 1000);
}

function stopProcessingTimer() {
  if (processingTimer.value) {
    clearInterval(processingTimer.value);
    processingTimer.value = null;
  }
  processingStartTime.value = null;
  elapsedSeconds.value = 0;
  currentPhase.value = '';
  phaseStartTime.value = null;
  estimatedTimeRemaining.value = null;
}

function updatePhase(message: string) {
  let newPhase = '';

  if (message.includes('Initializing')) {
    newPhase = 'Initializing';
  } else if (message.includes('Generating')) {
    newPhase = 'Generating';
  } else if (message.includes('Evaluating')) {
    newPhase = 'Evaluating';
  } else if (message.includes('Selected') || message.includes('complete')) {
    newPhase = 'Completing';
  }

  if (newPhase && newPhase !== currentPhase.value) {
    currentPhase.value = newPhase;
    phaseStartTime.value = new Date();
    calculateETA();
  }
}

function calculateETA() {
  if (!currentPhase.value || !elapsedSeconds.value) {
    estimatedTimeRemaining.value = null;
    return;
  }

  const phases = ['Initializing', 'Generating', 'Evaluating', 'Completing'];
  const currentPhaseIndex = phases.indexOf(currentPhase.value);

  if (currentPhaseIndex === -1) {
    estimatedTimeRemaining.value = null;
    return;
  }

  // Calculate remaining time based on phase estimates
  let remainingTime = 0;
  for (let i = currentPhaseIndex; i < phases.length; i++) {
    remainingTime += phaseEstimates[phases[i]] || 0;
  }

  // Adjust based on actual elapsed time vs estimate for current phase
  const currentPhaseEstimate = phaseEstimates[currentPhase.value] || 0;
  const phaseElapsed = phaseStartTime.value ?
    Math.floor((Date.now() - phaseStartTime.value.getTime()) / 1000) : 0;

  if (phaseElapsed > currentPhaseEstimate) {
    // Phase is taking longer than expected, adjust
    remainingTime = remainingTime * 1.5;
  }

  estimatedTimeRemaining.value = remainingTime;
}

function getProgressPercentage(): number {
  if (!currentPhase.value || !elapsedSeconds.value) return 0;

  const phases = ['Initializing', 'Generating', 'Evaluating', 'Completing'];
  const currentPhaseIndex = phases.indexOf(currentPhase.value);

  if (currentPhaseIndex === -1) return 0;

  // Base progress from completed phases
  const phaseWeight = 100 / phases.length;
  let progress = currentPhaseIndex * phaseWeight;

  // Add progress within current phase
  const phaseElapsed = phaseStartTime.value ?
    Math.floor((Date.now() - phaseStartTime.value.getTime()) / 1000) : 0;
  const phaseEstimate = phaseEstimates[currentPhase.value] || 1;
  const phaseProgress = Math.min(phaseElapsed / phaseEstimate, 1);
  progress += phaseProgress * phaseWeight;

  return Math.min(progress, 95); // Cap at 95% until actually complete
}

function getProgressText(): string {
  const percentage = getProgressPercentage();
  return `${Math.round(percentage)}% complete`;
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
  margin: 0;
  padding: 0;
}

#app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.game-container {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 0;
  overflow: hidden;
  min-height: 0;
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
  padding: 0;
  background: var(--color-background);
  min-height: 0;
  overflow: hidden;
}

.text-console {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 15px 15px 15px 15px;
  padding: 15px;
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  min-height: 0;
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

/* Removed - replaced with enhanced .message style below */

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

.input-section {
  display: flex;
  gap: 8px;
  align-items: stretch;
  margin: 0 15px 15px 15px;
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
  flex: 1;
  box-sizing: border-box;
}

.rollback-button {
  background: var(--color-background);
  color: var(--color-secondary);
  border: 2px solid var(--color-secondary);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.rollback-button:hover:not(:disabled) {
  background: var(--color-secondary);
  color: var(--color-background);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
}

.rollback-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
  color: var(--color-secondary, #00ffff);
  font-style: italic;
  font-weight: bold;
  padding: 15px;
  border: 2px solid var(--color-secondary, #00ffff);
  border-radius: 8px;
  margin: 15px 0;
  background: rgba(0, 255, 255, 0.15);
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
  text-align: center;
}

.processing-header {
  margin-bottom: 8px;
}

.processing-timer {
  font-size: 0.9em;
  color: var(--color-textAlt);
  font-weight: normal;
  opacity: 0.8;
}

.message {
  position: relative;
  margin-bottom: 8px;
  word-wrap: break-word;
  text-align: left;
  white-space: pre-line;
}

.message-content {
  margin-bottom: 4px;
}

.message-timestamp {
  font-size: 0.7em;
  color: var(--color-textAlt);
  opacity: 0.6;
  text-align: right;
  font-style: italic;
}

.processing-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.processing-phase, .processing-eta {
  font-size: 0.85em;
  color: var(--color-textAlt);
  font-weight: normal;
}

.processing-progress {
  margin-top: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(0, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-secondary), var(--color-primary));
  transition: width 0.5s ease;
  border-radius: 3px;
}

.progress-text {
  font-size: 0.8em;
  color: var(--color-textAlt);
  text-align: center;
  opacity: 0.8;
}

/* Rollback Menu Styles */
.rollback-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.5);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.rollback-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.rollback-header h3 {
  margin: 0;
  color: var(--color-primary);
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-textAlt);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-error);
  color: white;
}

.rollback-options {
  max-height: 200px;
  overflow-y: auto;
}

.rollback-option {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.rollback-option:hover {
  background: rgba(0, 255, 255, 0.1);
  border-left: 4px solid var(--color-secondary);
}

.rollback-option:last-child {
  border-bottom: none;
}

.snapshot-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.snapshot-time {
  font-size: 0.9em;
  color: var(--color-info);
  font-weight: bold;
}

.snapshot-desc {
  color: var(--color-text);
  font-size: 0.85em;
}

.snapshot-messages {
  color: var(--color-textAlt);
  font-size: 0.75em;
  opacity: 0.7;
}

/* Make console panel relative for rollback menu positioning */
.console-panel {
  position: relative;
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

/* Context Menu & Edit Modal Styles */

.message-clickable {
  cursor: pointer;
  transition: background 0.2s;
  border-radius: 4px;
  padding: 4px;
  margin: -4px;
}

.message-clickable:hover {
  background: rgba(0, 255, 255, 0.05);
}

.message-edited {
  border-left: 3px solid var(--color-secondary);
  padding-left: 8px;
  background: rgba(255, 255, 0, 0.05);
}

.edited-badge,
.rollback-indicator {
  margin-left: 6px;
  font-size: 0.9em;
  opacity: 0.7;
}

.context-menu {
  position: fixed;
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  min-width: 200px;
  overflow: hidden;
}

.context-menu-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.context-menu-item:last-child {
  border-bottom: none;
}

.context-menu-item:hover {
  background: rgba(0, 255, 255, 0.1);
}

.context-icon {
  font-size: 18px;
  width: 20px;
  text-align: center;
}

.context-label {
  flex: 1;
  color: var(--color-text);
}

/* Edit Modal */

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.edit-modal {
  background: var(--color-backgroundAlt);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.modal-header h3 {
  margin: 0;
  color: var(--color-primary);
  font-size: 18px;
}

.modal-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.edit-textarea {
  width: 100%;
  min-height: 150px;
  background: var(--color-background);
  color: var(--color-text);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  padding: 12px;
  font-family: inherit;
  font-size: 16px;
  resize: vertical;
  outline: none;
}

.edit-textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
}

.modal-hint {
  margin-top: 12px;
  font-size: 0.85em;
  color: var(--color-textAlt);
  opacity: 0.7;
  font-style: italic;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.modal-button {
  padding: 10px 20px;
  font-family: inherit;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.cancel-button {
  background: var(--color-backgroundAlt);
  color: var(--color-textAlt);
  border: 2px solid var(--color-textAlt);
}

.cancel-button:hover {
  background: var(--color-textAlt);
  color: var(--color-background);
}

.confirm-button {
  background: var(--color-primary);
  color: var(--color-background);
  border: 2px solid var(--color-primary);
  font-weight: bold;
}

.confirm-button:hover {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  box-shadow: 0 0 12px rgba(0, 255, 255, 0.5);
}
</style>