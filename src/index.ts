import express from 'express';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseManager } from './core/database';
import { GitManager } from './core/git-manager';
import { MCPServerManager as ExternalMCPManager } from './core/mcp-manager';
import { MCPServerManager } from './mcp/mcp-server-manager';
import { NarrativeController } from './llm/narrative-controller';
import { GameLoader } from './core/game-loader';
import { ImageService } from './services/image-service';
import { AudioAssembler } from './audio';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;  // Changed to 3001 to avoid conflicts
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const DEFAULT_GAME = process.env.DEFAULT_GAME || 'the-heist';

// Disable caching globally for all responses
app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const gameLoader = new GameLoader('./games');
let currentGame: any = null;

// Load default game and initialize MCP servers
async function initializeGame() {
  try {
    const gameName = process.argv.find(arg => arg.startsWith('--game='))?.split('=')[1] || DEFAULT_GAME;

    currentGame = await gameLoader.loadGame(gameName);

    console.log(`🎮 Loading game: ${currentGame.game.title}`);
    console.log(`🤖 Using model: ${currentGame.llm?.model || 'llama-3.3-70b-abliterated'}`);

    // Check for existing save and content hash compatibility
    const resumeCheck = await gameLoader.isResumeAvailable(gameName);

    if (resumeCheck.available && resumeCheck.metadata) {
      console.log(`💾 Found existing save from ${resumeCheck.metadata.lastPlayed}`);
      console.log(`📊 Turn count: ${resumeCheck.metadata.turnCount || 0}`);
      console.log(`🌿 Current branch: ${resumeCheck.metadata.currentBranch}`);
      console.log(`✅ Content hash matches - resuming game state`);
    } else if (resumeCheck.reason === 'content_changed') {
      console.log(`⚠️  Content has changed since last save - starting fresh`);
      console.log(`📝 Old content hash: ${resumeCheck.metadata?.contentHash.substring(0, 12)}...`);
      console.log(`📝 New content hash: ${gameLoader.getContentHash().substring(0, 12)}...`);
    } else {
      console.log(`🆕 No existing save found - starting new game`);
    }

    // Update Git manager to use game-specific saves
    const savesPath = gameLoader.getSavesPath();
    git.repoPath = savesPath || './game-state';

    // Initialize MCP server manager with game path and starting room
    const startingRoom = currentGame.game.startingRoom || 'start';
    mcpManager = new MCPServerManager(gameLoader.getGamePath()!, savesPath || './game-state', startingRoom);
    await mcpManager.initialize();

    // Set up content hash metadata for StateMCP
    const stateMCP = mcpManager.getServer('state') as any;
    if (stateMCP && typeof stateMCP.setGameMetadata === 'function') {
      let metadata;

      if (resumeCheck.available && resumeCheck.metadata) {
        // Use existing metadata
        metadata = resumeCheck.metadata;
        console.log(`📦 Using existing save metadata`);
      } else {
        // Create new metadata
        metadata = await gameLoader.createInitialMetadata(gameName);
        console.log(`📦 Created new save metadata (hash: ${metadata.contentHash.substring(0, 12)}...)`);
      }

      stateMCP.setGameMetadata(metadata);
    } else {
      console.warn('[Warning] StateMCP does not support metadata - save compatibility checking disabled');
    }
    
    // Initialize Narrative Controller with game configuration
    const narrativeConfig = {
      llmProvider: 'creative-server' as const,
      model: currentGame.llm?.model || 'llama-3.3-70b-abliterated',
      temperature: currentGame.llm?.temperature || 0.9,
      maxContextTokens: currentGame.llm?.contextWindow || 32000,
      historyDepth: 10,
      extraInstructions: currentGame.llm?.extraInstructions,
      creativeServer: {
        baseUrl: currentGame.llm?.creativeServer?.baseUrl,
        adminUrl: currentGame.llm?.creativeServer?.adminUrl,
        autoSwitch: currentGame.llm?.creativeServer?.autoSwitch ?? true
      },
      useAgents: currentGame.llm?.useAgents ?? false,  // Disable agents by default with creative server
      agentConfig: currentGame.llm?.agentConfig
    };
    
    narrativeController = new NarrativeController(mcpManager, narrativeConfig);
    await narrativeController.initialize();

    // Initialize image service
    imageService = new ImageService(gameLoader.getGamePath()!);
    imageService.setLLMProvider(narrativeController['llmProvider']); // Access the private provider

    // Connect image service to entity MCP if available
    try {
      const entityMCP = mcpManager.getServer('entity-content');
      if (entityMCP && typeof (entityMCP as any).setImageService === 'function') {
        (entityMCP as any).setImageService(imageService);
        console.log('Image service connected to Entity Content MCP');
      }
    } catch (error) {
      console.log('[ImageService] Could not connect to entity MCP:', error);
    }

    // Initialize audio system if enabled in game config
    if (currentGame.audio && currentGame.audio.enabled) {
      try {
        console.log('🎵 Initializing Audio System...');
        audioAssembler = new AudioAssembler({
          audioConfig: currentGame.audio,
          gameId: gameName,
          mcpManager: mcpManager  // Pass MCP manager to load character voices
        });

        // Connect audio assembler to narrative controller
        narrativeController.setAudioAssembler(audioAssembler);

        console.log('✓ Audio System initialized');
      } catch (error) {
        console.error('⚠️  Audio System initialization failed:', error);
        console.log('Game will continue without audio support');
      }
    } else {
      console.log('🔇 Audio System disabled in game configuration');
    }

    console.log(`Game loaded: ${currentGame.game.title}`);
    console.log('MCP servers initialized');
    console.log('Narrative Controller initialized');
    console.log('Image Service initialized');
  } catch (error) {
    console.error('Failed to load game or initialize MCP servers:', error);
  }
}

// const db = new DatabaseManager('./data'); // Currently unused
const git = new GitManager('./game-state');
// const externalMCPManager = new ExternalMCPManager(DEBUG_MODE); // Currently unused
let mcpManager: MCPServerManager;
let narrativeController: NarrativeController;
let imageService: ImageService;
let audioAssembler: AudioAssembler | null = null;

// Status Broadcasting System
class StatusBroadcaster {
  private connections = new Set<any>();
  
  addConnection(ws: any) {
    this.connections.add(ws);
  }
  
  removeConnection(ws: any) {
    this.connections.delete(ws);
  }
  
  broadcast(status: string, details?: any) {
    console.log(`[StatusBroadcaster] Broadcasting: ${status} (${this.connections.size} connections)`);
    const message = JSON.stringify({
      type: 'status_update',
      status,
      details,
      timestamp: Date.now()
    });
    
    for (const ws of this.connections) {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.send(message);
          console.log(`[StatusBroadcaster] Sent to client: ${status}`);
        } catch (error) {
          console.warn('Failed to send status to client:', error);
          this.connections.delete(ws);
        }
      }
    }
  }
}

const statusBroadcaster = new StatusBroadcaster();

// Make status broadcaster globally available for agents  
global.statusBroadcaster = statusBroadcaster;

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  statusBroadcaster.addConnection(ws);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'command':
          handleCommand(ws, data);
          break;
        case 'query':
          handleQuery(ws, data);
          break;
        case 'mcp_tool':
          handleMCPTool(ws, data);
          break;
        case 'player_action':
          handlePlayerAction(ws, data);
          break;
        case 'start_conversation':
          handleStartConversation(ws, data);
          break;
        case 'dialogue':
          handleDialogue(ws, data);
          break;
        case 'create_branch':
          handleCreateBranch(ws, data);
          break;
        case 'switch_branch':
          handleSwitchBranch(ws, data);
          break;
        case 'list_branches':
          handleListBranches(ws, data);
          break;
        case 'rollback':
          handleRollback(ws, data);
          break;
        case 'delete_branch':
          handleDeleteBranch(ws, data);
          break;
        default:
          ws.send(JSON.stringify({ error: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    statusBroadcaster.removeConnection(ws);
  });
});

async function handleCommand(ws: any, data: any) {
  const response = {
    type: 'response',
    id: data.id,
    result: null as any
  };
  
  try {
    switch (data.command) {
      case 'save':
        const commitHash = await git.saveState(data.message || 'Game state saved', data.state);
        response.result = { commitHash };
        break;
      case 'load':
        const state = await git.loadState(data.commitHash);
        response.result = { state };
        break;
      case 'branch':
        await git.createBranch(data.name, data.fromCommit);
        response.result = { success: true };
        break;
      default:
        response.result = { error: 'Unknown command' };
    }
  } catch (error: any) {
    response.result = { error: error.message };
  }
  
  ws.send(JSON.stringify(response));
}

async function handleQuery(ws: any, data: any) {
  const response = {
    type: 'response',
    id: data.id,
    result: null as any
  };
  
  try {
    switch (data.query) {
      case 'branches':
        const branches = await git.getBranches();
        response.result = { branches };
        break;
      case 'history':
        const history = await git.getHistory(data.branch, data.limit);
        response.result = { history };
        break;
      default:
        response.result = { error: 'Unknown query' };
    }
  } catch (error: any) {
    response.result = { error: error.message };
  }
  
  ws.send(JSON.stringify(response));
}

async function handleMCPTool(ws: any, data: any) {
  const response = {
    type: 'mcp_response',
    id: data.id,
    result: null as any
  };
  
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const { server, tool, params } = data;
    response.result = await mcpManager.executeTool(server, tool, params);
  } catch (error: any) {
    response.result = { error: error.message };
  }
  
  ws.send(JSON.stringify(response));
}

async function handlePlayerAction(ws: any, data: any) {
  const response = {
    type: 'narrative_response',
    id: data.id,
    result: null as any
  };

  try {
    if (!narrativeController) {
      throw new Error('Narrative Controller not initialized');
    }

    const { action, rawInput } = data;
    const input = rawInput || action.description || '';

    console.log(`[PlayerAction] Received input: "${input}"`);

    // Check for slash commands
    if (input.startsWith('/')) {
      console.log(`[PlayerAction] Detected slash command: "${input}"`);
      const commandMatch = input.match(/^\/(\w+)\s*(.*)$/);

      if (commandMatch) {
        const [, command, args] = commandMatch;
        console.log(`[PlayerAction] Parsed command: "${command}", args: "${args}"`);

        if (command === 'restart') {
          // Handle restart command - wipe saves and start fresh
          await handleRestartCommand(ws, data.id);
          return; // Don't send normal response
        }

        if (command === 'continue') {
          // Handle /continue command - let the scene unfold without player input
          console.log(`[PlayerAction] Continue command - letting scene unfold naturally`);
          const playerAction = {
            type: 'continue' as const,
            rawInput: 'continue'
          };
          response.result = await narrativeController.processPlayerAction(playerAction);
          ws.send(JSON.stringify(response));
          return;
        }

        if (command === 'generate' && args.startsWith('image')) {
          // Extract user instructions after "image"
          const userInstructions = args.replace(/^image\s*/, '').trim();
          console.log(`[PlayerAction] Image generation request with instructions: "${userInstructions}"`);

          // Handle image generation command
          await handleImageGenerationCommand(ws, data.id, userInstructions);
          return; // Don't send normal response
        }
      }
    }

    // Handle empty input as "continue" command
    if (!input || input.trim() === '') {
      console.log(`[PlayerAction] Empty input - continuing scene naturally`);
      const playerAction = {
        type: 'continue' as const,
        rawInput: 'continue'
      };
      response.result = await narrativeController.processPlayerAction(playerAction);
      ws.send(JSON.stringify(response));
      return;
    }

    const playerAction = {
      type: action.type || 'interaction',
      target: action.target,
      params: action.params,
      rawInput: input
    };

    response.result = await narrativeController.processPlayerAction(playerAction);
  } catch (error: any) {
    response.result = {
      success: false,
      narrative: 'Something went wrong as you attempt your action...',
      error: error.message
    };
  }

  ws.send(JSON.stringify(response));
}

async function handleRestartCommand(ws: any, requestId: string) {
  try {
    console.log(`[Restart] Player requested game restart`);

    const gameName = process.argv.find(arg => arg.startsWith('--game='))?.split('=')[1] || DEFAULT_GAME;
    const savesPath = gameLoader.getSavesPath();

    if (!savesPath) {
      throw new Error('No game loaded');
    }

    // Archive the old save directory by renaming it
    const timestamp = Date.now();
    const archivePath = `${savesPath}_backup_${timestamp}`;

    console.log(`[Restart] Archiving current save to: ${archivePath}`);
    fs.renameSync(savesPath, archivePath);

    // Recreate empty saves directory
    fs.mkdirSync(savesPath, { recursive: true });

    console.log(`[Restart] Old save archived. Reinitializing game...`);

    // Reinitialize Git repository for the new save
    const newGit = new GitManager(savesPath);

    // Update the global git manager reference
    git.repoPath = savesPath;

    // Create fresh metadata
    const freshMetadata = await gameLoader.createInitialMetadata(gameName);

    // Reinitialize StateMCP with fresh metadata
    const stateMCP = mcpManager.getServer('state') as any;
    if (stateMCP) {
      // Reset the StateMCP internal state
      await stateMCP.initialize(); // Re-runs initialization which loads from Git

      // Set fresh metadata
      stateMCP.setGameMetadata(freshMetadata);
    }

    // Clear narrative history MCP
    const narrativeHistoryMCP = mcpManager.getServer('narrative-history') as any;
    if (narrativeHistoryMCP && typeof narrativeHistoryMCP.clearHistory === 'function') {
      narrativeHistoryMCP.clearHistory();
      console.log(`[Restart] Cleared narrative history`);
    }

    // Send clear history command to client
    ws.send(JSON.stringify({
      type: 'clear_history'
    }));

    // Small delay to ensure clear processes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send success notification
    ws.send(JSON.stringify({
      type: 'narrative_response',
      id: requestId,
      result: {
        success: true,
        narrative: `🔄 **Game Restarted!**\n\nYour previous save has been archived to:\n\`${path.basename(archivePath)}\`\n\nStarting fresh from the beginning.`,
        restart: {
          archivePath,
          timestamp
        }
      }
    }));

    // Automatically send a "look" command to start the game fresh
    console.log(`[Restart] Sending automatic 'look' command`);

    const lookAction = {
      type: 'interaction' as const,
      rawInput: 'look'
    };

    const result = await narrativeController.processPlayerAction(lookAction);

    // Send the initial narrative
    ws.send(JSON.stringify({
      type: 'narrative_response',
      id: `restart_look_${Date.now()}`,
      result
    }));

    console.log(`[Restart] Game restart complete with initial look`);

  } catch (error: any) {
    console.error('[Restart] Failed:', error);
    ws.send(JSON.stringify({
      type: 'narrative_response',
      id: requestId,
      result: {
        success: false,
        narrative: `❌ Restart failed: ${error.message}`
      }
    }));
  }
}

async function handleImageGenerationCommand(ws: any, requestId: string, userInstructions: string) {
  try {
    if (!narrativeController || !imageService) {
      throw new Error('Services not initialized');
    }

    // Generate unique image ID
    const imageId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Send immediate acknowledgment
    ws.send(JSON.stringify({
      type: 'narrative_response',
      id: requestId,
      result: {
        success: true,
        narrative: `📸 Generating image... (ID: ${imageId})\n\nThe game continues while your image is being created. You'll be notified when it's ready.`,
        imageGeneration: {
          status: 'started',
          imageId
        }
      }
    }));

    // Start async image generation
    generateSceneImageAsync(imageId, userInstructions, ws);

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'narrative_response',
      id: requestId,
      result: {
        success: false,
        narrative: `Failed to start image generation: ${error.message}`
      }
    }));
  }
}

async function generateSceneImageAsync(imageId: string, userInstructions: string, ws: any) {
  try {
    // Step 1: Use LLM to generate detailed image prompt
    statusBroadcaster.broadcast('image_generation', {
      imageId,
      status: 'generating_prompt',
      message: '🎨 Creating detailed image prompt...'
    });

    const imagePrompt = await narrativeController.generateImagePrompt(userInstructions);

    // Step 2: Generate the actual image
    statusBroadcaster.broadcast('image_generation', {
      imageId,
      status: 'generating_image',
      message: '🖼️ Generating image (this may take 30-60 seconds)...',
      prompt: imagePrompt
    });

    await imageService.generateSceneImage(imageId, imagePrompt);

    // Step 3: Notify completion
    statusBroadcaster.broadcast('image_generation', {
      imageId,
      status: 'complete',
      message: `✨ Your image is ready!`,
      url: `/api/images/${imageId}`
    });

  } catch (error: any) {
    console.error('[ImageGeneration] Failed:', error);
    statusBroadcaster.broadcast('image_generation', {
      imageId,
      status: 'failed',
      message: `❌ Image generation failed: ${error.message}`
    });
  }
}

async function handleStartConversation(ws: any, data: any) {
  const response = {
    type: 'conversation_response',
    id: data.id,
    result: null as any
  };
  
  try {
    if (!narrativeController) {
      throw new Error('Narrative Controller not initialized');
    }

    const { npcId, playerId = 'player' } = data;
    response.result = await narrativeController.startConversation(npcId, playerId);
  } catch (error: any) {
    response.result = { 
      success: false,
      narrative: 'You approach, but the conversation doesn\'t seem to start properly.',
      error: error.message 
    };
  }
  
  ws.send(JSON.stringify(response));
}

async function handleDialogue(ws: any, data: any) {
  const response = {
    type: 'dialogue_response',
    id: data.id,
    result: null as any
  };
  
  try {
    if (!narrativeController) {
      throw new Error('Narrative Controller not initialized');
    }

    const { playerId = 'player', npcId, dialogue } = data;
    response.result = await narrativeController.processDialogue(playerId, npcId, dialogue);
  } catch (error: any) {
    response.result = { 
      success: false,
      narrative: 'The conversation falters as something goes wrong...',
      error: error.message 
    };
  }
  
  ws.send(JSON.stringify(response));
}

// Timeline/Branch Management Handlers

async function handleCreateBranch(ws: any, data: any) {
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const { branchName, fromCommit } = data;

    await mcpManager.executeTool('state', 'createBranch', {
      name: branchName,
      fromCommit: fromCommit
    });

    ws.send(JSON.stringify({
      type: 'branch_created',
      branchName,
      fromCommit
    }));

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to create branch: ${error.message}`
    }));
  }
}

async function handleSwitchBranch(ws: any, data: any) {
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const { branchName } = data;

    await mcpManager.executeTool('state', 'switchBranch', {
      branch: branchName
    });

    const state = await mcpManager.executeTool('state', 'getWorldState', {});
    const history = await mcpManager.executeTool('state', 'getHistory', {
      branch: branchName,
      limit: 100
    });

    ws.send(JSON.stringify({
      type: 'branch_switched',
      branchName,
      state,
      historyCount: history.length
    }));

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to switch branch: ${error.message}`
    }));
  }
}

async function handleListBranches(ws: any, data: any) {
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const branches = await mcpManager.executeTool('state', 'getBranches', {});

    ws.send(JSON.stringify({
      type: 'branches_list',
      branches
    }));

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to list branches: ${error.message}`
    }));
  }
}

async function handleRollback(ws: any, data: any) {
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const { commitHash } = data;

    await mcpManager.executeTool('state', 'loadState', {
      commitOrBranch: commitHash
    });

    const history = await mcpManager.executeTool('state', 'getHistory', {
      limit: 100
    });

    // Find the index of the commit we rolled back to
    const commitIndex = history.findIndex((c: any) => c.hash === commitHash);

    ws.send(JSON.stringify({
      type: 'rollback_complete',
      commitHash,
      historyCount: commitIndex >= 0 ? commitIndex + 1 : 0
    }));

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Rollback failed: ${error.message}`
    }));
  }
}

async function handleDeleteBranch(ws: any, data: any) {
  try {
    if (!mcpManager) {
      throw new Error('MCP servers not initialized');
    }

    const { branchName } = data;

    // Note: GitManager might not have a delete branch method yet
    // This is a placeholder for future implementation
    await mcpManager.executeTool('state', 'deleteBranch', {
      branch: branchName
    });

    ws.send(JSON.stringify({
      type: 'branch_deleted',
      branchName
    }));

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to delete branch: ${error.message}`
    }));
  }
}

// API endpoints
app.get('/api/games', (_req, res) => {
  const games = gameLoader.listGames();
  res.json(games);
});

app.get('/api/config', (req, res) => {
  if (!currentGame) {
    res.status(404).json({ error: 'No game loaded' });
    return;
  }
  res.json(currentGame);
});

app.get('/api/mcp/servers', (req, res) => {
  if (!mcpManager) {
    res.status(503).json({ error: 'MCP servers not initialized' });
    return;
  }
  
  try {
    const servers = mcpManager.listServers();
    res.json({ servers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/mcp/tools', (req, res) => {
  if (!mcpManager) {
    res.status(503).json({ error: 'MCP servers not initialized' });
    return;
  }
  
  try {
    const tools = mcpManager.getAllTools();
    res.json(tools);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/mcp/status', async (req, res) => {
  if (!mcpManager) {
    res.status(503).json({ error: 'MCP servers not initialized' });
    return;
  }
  
  try {
    const status = await mcpManager.getSystemStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/narrative/status', (req, res) => {
  if (!narrativeController) {
    res.status(503).json({ error: 'Narrative Controller not initialized' });
    return;
  }
  
  try {
    res.json({ 
      initialized: true,
      llmProvider: 'ollama',
      ready: true
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/narrative/action', async (req, res) => {
  if (!narrativeController) {
    res.status(503).json({ error: 'Narrative Controller not initialized' });
    return;
  }
  
  try {
    const { action, rawInput } = req.body;
    const playerAction = {
      type: action?.type || 'interaction',
      target: action?.target,
      params: action?.params,
      rawInput: rawInput || action?.description || ''
    };

    const result = await narrativeController.processPlayerAction(playerAction);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      narrative: 'Something went wrong as you attempt your action...',
      error: error.message 
    });
  }
});

// Serve game assets statically
app.use('/api/game/:gameName/assets', (req, res, next) => {
  const gameName = req.params.gameName;
  express.static(path.join(__dirname, '../games', gameName, 'content', 'assets'))(req, res, next);
});

app.get('/api/game/:gameName/theme.css', (req, res) => {
  // First, check if the current loaded game has css_overrides in its config
  if (currentGame && currentGame.ui && currentGame.ui.css_overrides) {
    res.type('text/css');
    res.send(currentGame.ui.css_overrides);
    return;
  }

  // Fall back to checking for a physical CSS file
  const gameName = req.params.gameName;
  const cssPath = path.join(__dirname, '../games', gameName, 'themes', 'custom.css');

  if (fs.existsSync(cssPath)) {
    res.type('text/css');
    res.sendFile(cssPath);
  } else {
    res.status(404).send('/* No custom CSS */');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', debug: DEBUG_MODE });
});

app.get('/api/system/capabilities', async (req, res) => {
  try {
    res.json({
      currentGame: currentGame?.game?.title || 'None',
      model: currentGame?.llm?.model || 'llama-3.3-70b-abliterated',
      provider: currentGame?.llm?.provider || 'creative-server',
      creativeServer: currentGame?.llm?.creativeServer
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Image generation and serving endpoints
app.post('/api/images/generate/entity', async (req, res) => {
  if (!imageService) {
    res.status(503).json({ error: 'Image service not initialized' });
    return;
  }

  try {
    const { entityId, description, options } = req.body;

    if (!entityId || !description) {
      res.status(400).json({ error: 'entityId and description are required' });
      return;
    }

    const imageId = await imageService.generateEntityImage(entityId, description, options);

    if (!imageId) {
      res.status(500).json({ error: 'Image generation failed' });
      return;
    }

    res.json({
      success: true,
      imageId,
      url: `/api/images/${imageId}`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/images/generate/scene', async (req, res) => {
  if (!imageService) {
    res.status(503).json({ error: 'Image service not initialized' });
    return;
  }

  try {
    const { sceneId, description, options } = req.body;

    if (!sceneId || !description) {
      res.status(400).json({ error: 'sceneId and description are required' });
      return;
    }

    const imageId = await imageService.generateSceneImage(sceneId, description, options);

    if (!imageId) {
      res.status(500).json({ error: 'Image generation failed' });
      return;
    }

    res.json({
      success: true,
      imageId,
      url: `/api/images/${imageId}`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/images/:imageId', (req, res) => {
  if (!imageService) {
    res.status(503).json({ error: 'Image service not initialized' });
    return;
  }

  try {
    const { imageId } = req.params;
    const imagePath = imageService.getImagePath(imageId);

    if (!imagePath) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    res.sendFile(path.resolve(imagePath));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/images', (req, res) => {
  if (!imageService) {
    res.status(503).json({ error: 'Image service not initialized' });
    return;
  }

  try {
    const images = imageService.listAllImages();
    res.json({ images });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/images/entity/:entityId', (req, res) => {
  if (!imageService) {
    res.status(503).json({ error: 'Image service not initialized' });
    return;
  }

  try {
    const { entityId } = req.params;
    const metadata = imageService.findImageByEntity(entityId);

    if (!metadata) {
      res.status(404).json({ error: 'No image found for entity' });
      return;
    }

    res.json({
      imageId: metadata.id,
      url: `/api/images/${metadata.id}`,
      metadata
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Audio endpoints
app.get('/api/audio/status', async (req, res) => {
  if (!audioAssembler) {
    res.json({
      enabled: false,
      available: false,
      reason: 'Audio system not initialized'
    });
    return;
  }

  try {
    const status = audioAssembler.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audio/health', async (req, res) => {
  if (!audioAssembler) {
    res.status(503).json({ error: 'Audio system not initialized' });
    return;
  }

  try {
    const health = await audioAssembler.checkHealth();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve generated audio files (WAV format)
app.get('/api/audio/:segmentId.wav', async (req, res) => {
  if (!audioAssembler) {
    res.status(503).json({ error: 'Audio system not initialized' });
    return;
  }

  try {
    const { segmentId } = req.params;
    const audioBuffer = await audioAssembler.getSegmentBuffer(segmentId);

    if (!audioBuffer) {
      res.status(404).json({ error: 'Audio segment not found' });
      return;
    }

    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache audio for 1 hour
    res.send(audioBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, async () => {
  console.log(`Narrative Engine server running on port ${PORT}`);
  console.log(`Debug mode: ${DEBUG_MODE}`);
  
  // Initialize game
  await initializeGame();
});
