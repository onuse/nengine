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
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const DEFAULT_GAME = process.env.DEFAULT_GAME || 'the-heist';

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
    
    // Update Git manager to use game-specific saves
    const savesPath = gameLoader.getSavesPath();
    git.repoPath = savesPath || './game-state';
    
    // Initialize MCP server manager with game path and starting room
    const startingRoom = currentGame.game.startingRoom || 'start';
    mcpManager = new MCPServerManager(gameLoader.getGamePath()!, savesPath || './game-state', startingRoom);
    await mcpManager.initialize();
    
    // Initialize Narrative Controller with game configuration
    const narrativeConfig = {
      model: currentGame.llm?.model || 'gemma2:9b',
      fallbackModel: currentGame.llm?.fallbackModel || 'mistral:7b',
      temperature: currentGame.llm?.temperature || 0.7,
      maxContextTokens: currentGame.llm?.contextWindow || 4096,
      historyDepth: 10,
      extraInstructions: currentGame.llm?.extraInstructions
    };
    
    narrativeController = new NarrativeController(mcpManager, narrativeConfig);
    await narrativeController.initialize();
    
    console.log(`Game loaded: ${currentGame.game.title}`);
    console.log('MCP servers initialized');
    console.log('Narrative Controller initialized');
  } catch (error) {
    console.error('Failed to load game or initialize MCP servers:', error);
  }
}

// const db = new DatabaseManager('./data'); // Currently unused
const git = new GitManager('./game-state');
// const externalMCPManager = new ExternalMCPManager(DEBUG_MODE); // Currently unused
let mcpManager: MCPServerManager;
let narrativeController: NarrativeController;

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
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
    const playerAction = {
      type: action.type || 'interaction',
      target: action.target,
      params: action.params,
      rawInput: rawInput || action.description || ''
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
  express.static(path.join(__dirname, '../games', gameName, 'assets'))(req, res, next);
});

app.get('/api/game/:gameName/theme.css', (req, res) => {
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

server.listen(PORT, async () => {
  console.log(`Narrative Engine server running on port ${PORT}`);
  console.log(`Debug mode: ${DEBUG_MODE}`);
  
  // Initialize game
  await initializeGame();
});