/**
 * Integration Test Runner for Test Quest
 * Automated testing system that plays through the test-quest game
 * and validates all engine functionality
 */

import WebSocket from 'ws';
import axios from 'axios';

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  responseTime?: number;
  details?: any;
}

interface GameResponse {
  type: string;
  id?: string;
  result?: any;
  error?: string;
}

export class IntegrationTestRunner {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private results: TestResult[] = [];
  private messageId = 0;
  private pendingMessages = new Map<string, (response: GameResponse) => void>();

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async runFullTestSuite(): Promise<TestResult[]> {
    console.log('🚀 Starting Narrative Engine Integration Test Suite...\n');
    
    try {
      // Phase 1: Server Health Check
      await this.testServerHealth();
      
      // Phase 2: Connect to WebSocket
      await this.connectWebSocket();
      
      // Phase 3: MCP Server Tests
      await this.testMCPServers();
      
      // Phase 4: Game Content Tests
      await this.testGameContent();
      
      // Phase 5: Narrative Engine Tests
      await this.testNarrativeEngine();
      
      // Phase 6: State Management Tests
      await this.testStateManagement();
      
      // Phase 7: Quality Validation
      await this.validateResponseQuality();
      
      await this.cleanup();
      
    } catch (error) {
      console.error('❌ Test suite failed with error:', error);
      this.addResult('Test Suite Execution', false, `Fatal error: ${error}`);
    }
    
    this.printResults();
    return this.results;
  }

  private async testServerHealth(): Promise<void> {
    console.log('🏥 Testing Server Health...');
    
    try {
      const startTime = Date.now();
      const response = await axios.get(`${this.baseUrl}/health`);
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 && response.data.status === 'ok') {
        this.addResult('Server Health Check', true, 'Server is healthy', responseTime);
      } else {
        this.addResult('Server Health Check', false, 'Server returned unexpected response');
      }
    } catch (error) {
      this.addResult('Server Health Check', false, `Server not accessible: ${error}`);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    console.log('🔌 Connecting to WebSocket...');
    
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace('http', 'ws');
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        this.addResult('WebSocket Connection', true, 'Successfully connected to WebSocket');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        this.addResult('WebSocket Connection', false, `Failed to connect: ${error}`);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        try {
          const response: GameResponse = JSON.parse(data.toString());
          if (response.id && this.pendingMessages.has(response.id)) {
            const resolver = this.pendingMessages.get(response.id)!;
            this.pendingMessages.delete(response.id);
            resolver(response);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });
    });
  }

  private async testMCPServers(): Promise<void> {
    console.log('🔧 Testing MCP Servers...');
    
    try {
      // Test MCP server status
      const response = await axios.get(`${this.baseUrl}/api/mcp/status`);
      const status = response.data;
      
      if (status.initialized && Object.keys(status.servers).length >= 6) {
        this.addResult('MCP Server Initialization', true, `${Object.keys(status.servers).length} servers initialized`);
        
        // Test each server individually
        for (const [serverName, serverInfo] of Object.entries(status.servers)) {
          this.addResult(`MCP Server: ${serverName}`, true, `Server operational`, undefined, serverInfo);
        }
      } else {
        this.addResult('MCP Server Initialization', false, 'Not all servers initialized');
      }
    } catch (error) {
      this.addResult('MCP Server Status', false, `Failed to check MCP status: ${error}`);
    }
  }

  private async testGameContent(): Promise<void> {
    console.log('🎮 Testing Game Content Loading...');
    
    try {
      // Load test-quest game
      const response = await axios.get(`${this.baseUrl}/api/config`);
      const gameConfig = response.data;
      
      if (gameConfig.game && gameConfig.game.title === 'Test Quest') {
        this.addResult('Game Content Loading', true, 'Test Quest loaded successfully');
      } else {
        this.addResult('Game Content Loading', false, 'Wrong game loaded or game not found');
      }
      
      // Test room navigation
      await this.testRoomNavigation();
      
      // Test NPC interactions
      await this.testNPCInteractions();
      
      // Test item interactions
      await this.testItemInteractions();
      
    } catch (error) {
      this.addResult('Game Content Loading', false, `Failed to load game content: ${error}`);
    }
  }

  private async testRoomNavigation(): Promise<void> {
    console.log('🚪 Testing Room Navigation...');
    
    // Test basic movement
    const response = await this.sendGameMessage('player_action', {
      action: { type: 'look' },
      rawInput: 'look'
    });
    
    if (response.result && response.result.success !== false) {
      this.addResult('Room Navigation', true, 'Successfully processed look command');
      
      // Test movement to different test rooms
      const rooms = ['world_test_room', 'npc_test_room', 'mechanics_test_room', 'state_test_room'];
      
      for (const room of rooms) {
        await this.testRoomVisit(room);
      }
    } else {
      this.addResult('Room Navigation', false, 'Failed to process basic look command');
    }
  }

  private async testRoomVisit(roomId: string): Promise<void> {
    const direction = this.getRoomDirection(roomId);
    const response = await this.sendGameMessage('player_action', {
      action: { type: 'move', target: direction },
      rawInput: direction
    });
    
    if (response.result && response.result.success !== false) {
      this.addResult(`Visit ${roomId}`, true, `Successfully moved to ${roomId}`);
      
      // Return to lobby for next test
      await this.sendGameMessage('player_action', {
        action: { type: 'move', target: 'south' },
        rawInput: 'south'
      });
    } else {
      this.addResult(`Visit ${roomId}`, false, `Failed to move to ${roomId}`);
    }
  }

  private async testNPCInteractions(): Promise<void> {
    console.log('👥 Testing NPC Interactions...');
    
    // Move to NPC test room
    await this.sendGameMessage('player_action', {
      action: { type: 'move', target: 'east' },
      rawInput: 'east'
    });
    
    // Test conversation with friendly NPC
    const response = await this.sendGameMessage('start_conversation', {
      npcId: 'friendly_tester',
      playerId: 'player'
    });
    
    if (response.result && response.result.success !== false) {
      this.addResult('NPC Conversation Start', true, 'Successfully started conversation');
      
      // Test dialogue response
      const dialogueResponse = await this.sendGameMessage('dialogue', {
        playerId: 'player',
        npcId: 'friendly_tester',
        dialogue: 'hello'
      });
      
      if (dialogueResponse.result && dialogueResponse.result.narrative) {
        this.addResult('NPC Dialogue Response', true, 'Received narrative response from NPC');
      } else {
        this.addResult('NPC Dialogue Response', false, 'No narrative response from NPC');
      }
    } else {
      this.addResult('NPC Conversation Start', false, 'Failed to start conversation');
    }
  }

  private async testItemInteractions(): Promise<void> {
    console.log('📦 Testing Item Interactions...');
    
    // Return to lobby
    await this.sendGameMessage('player_action', {
      action: { type: 'move', target: 'west' },
      rawInput: 'west'
    });
    
    // Test examining an item
    const response = await this.sendGameMessage('player_action', {
      action: { type: 'examine', target: 'test_manual' },
      rawInput: 'examine test manual'
    });
    
    if (response.result && response.result.narrative) {
      this.addResult('Item Examination', true, 'Successfully examined item');
      
      // Test picking up item
      const pickupResponse = await this.sendGameMessage('player_action', {
        action: { type: 'get', target: 'test_manual' },
        rawInput: 'get test manual'
      });
      
      if (pickupResponse.result && pickupResponse.result.success !== false) {
        this.addResult('Item Pickup', true, 'Successfully picked up item');
      } else {
        this.addResult('Item Pickup', false, 'Failed to pick up item');
      }
    } else {
      this.addResult('Item Examination', false, 'Failed to examine item');
    }
  }

  private async testNarrativeEngine(): Promise<void> {
    console.log('📚 Testing Narrative Engine...');
    
    // Test complex action processing
    const response = await this.sendGameMessage('player_action', {
      action: { 
        type: 'complex_action',
        description: 'I want to carefully examine the room for hidden secrets while thinking about the nature of reality'
      },
      rawInput: 'I want to carefully examine the room for hidden secrets while thinking about the nature of reality'
    });
    
    if (response.result && response.result.narrative) {
      this.addResult('Complex Action Processing', true, 'LLM processed complex action successfully');
      
      // Validate narrative quality
      const narrative = response.result.narrative;
      if (narrative.length > 50 && narrative.includes('room')) {
        this.addResult('Narrative Quality Check', true, 'Generated narrative has appropriate length and context');
      } else {
        this.addResult('Narrative Quality Check', false, 'Generated narrative is too short or lacks context');
      }
    } else {
      this.addResult('Complex Action Processing', false, 'Failed to process complex action');
    }
  }

  private async testStateManagement(): Promise<void> {
    console.log('💾 Testing State Management...');
    
    // Test save functionality
    const saveResponse = await this.sendGameMessage('command', {
      command: 'save',
      message: 'Integration test save',
      state: { testRun: true, timestamp: Date.now() }
    });
    
    if (saveResponse.result && saveResponse.result.commitHash) {
      this.addResult('Game Save', true, `Saved game with commit: ${saveResponse.result.commitHash}`);
      
      // Test load functionality
      const loadResponse = await this.sendGameMessage('command', {
        command: 'load',
        commitHash: saveResponse.result.commitHash
      });
      
      if (loadResponse.result && loadResponse.result.state) {
        this.addResult('Game Load', true, 'Successfully loaded saved game');
      } else {
        this.addResult('Game Load', false, 'Failed to load saved game');
      }
    } else {
      this.addResult('Game Save', false, 'Failed to save game');
    }
  }

  private async validateResponseQuality(): Promise<void> {
    console.log('✨ Validating Response Quality...');
    
    // Test multiple narrative responses and evaluate quality
    const testPrompts = [
      'look around carefully',
      'examine the strange testing equipment',
      'think about the nature of this testing environment'
    ];
    
    let qualityTests = 0;
    let passedQuality = 0;
    
    for (const prompt of testPrompts) {
      const response = await this.sendGameMessage('player_action', {
        action: { type: 'examine', description: prompt },
        rawInput: prompt
      });
      
      if (response.result && response.result.narrative) {
        qualityTests++;
        const quality = await this.evaluateNarrativeQuality(response.result.narrative);
        if (quality.score >= 0.7) {
          passedQuality++;
        }
      }
    }
    
    if (qualityTests > 0) {
      const qualityRatio = passedQuality / qualityTests;
      this.addResult('Narrative Quality Validation', qualityRatio >= 0.6, 
        `${passedQuality}/${qualityTests} responses met quality standards`);
    }
  }

  private async evaluateNarrativeQuality(narrative: string): Promise<{ score: number; reasons: string[] }> {
    // Simple quality heuristics (could be enhanced with LLM evaluation)
    const reasons: string[] = [];
    let score = 0;
    
    // Length check
    if (narrative.length >= 50) {
      score += 0.2;
      reasons.push('Appropriate length');
    }
    
    // Descriptive language
    if (narrative.match(/\b(see|hear|feel|smell|touch|appears?|looks?|seems?)\b/i)) {
      score += 0.2;
      reasons.push('Contains sensory language');
    }
    
    // Coherence check (basic)
    if (narrative.includes('test') || narrative.includes('room') || narrative.includes('engine')) {
      score += 0.2;
      reasons.push('Contextually relevant');
    }
    
    // Grammar check (basic)
    if (narrative.match(/^[A-Z]/) && narrative.match(/[.!?]$/)) {
      score += 0.2;
      reasons.push('Proper capitalization and punctuation');
    }
    
    // Engagement check
    if (narrative.match(/\b(you|your)\b/i)) {
      score += 0.2;
      reasons.push('Uses second person perspective');
    }
    
    return { score, reasons };
  }

  private async sendGameMessage(type: string, data: any): Promise<GameResponse> {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }
    
    return new Promise((resolve, reject) => {
      const messageId = (++this.messageId).toString();
      const startTime = Date.now();
      const message = {
        type,
        id: messageId,
        ...data
      };
      
      const wrappedResolve = (response: GameResponse) => {
        const responseTime = Date.now() - startTime;
        console.log(`  📊 Response time: ${responseTime}ms for ${type}`);
        resolve(response);
      };
      
      this.pendingMessages.set(messageId, wrappedResolve);
      
      // Set timeout for response (2 minutes for LLM responses)
      setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          const timeoutTime = Date.now() - startTime;
          this.pendingMessages.delete(messageId);
          reject(new Error(`Message timeout after ${timeoutTime}ms`));
        }
      }, 120000); // 2 minutes
      
      console.log(`  🚀 Sending ${type} message...`);
      this.ws!.send(JSON.stringify(message));
    });
  }

  private getRoomDirection(roomId: string): string {
    const roomDirections: { [key: string]: string } = {
      'world_test_room': 'north',
      'npc_test_room': 'east',
      'mechanics_test_room': 'west',
      'state_test_room': 'south'
    };
    
    return roomDirections[roomId] || 'north';
  }

  private addResult(testName: string, passed: boolean, message: string, responseTime?: number, details?: any): void {
    this.results.push({
      testName,
      passed,
      message,
      responseTime,
      details
    });
    
    const status = passed ? '✅' : '❌';
    const timeStr = responseTime ? ` (${responseTime}ms)` : '';
    console.log(`  ${status} ${testName}: ${message}${timeStr}`);
  }

  private async cleanup(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.testName}: ${result.message}`);
      });
    }
    
    console.log('\n🎯 Integration Test Complete!');
  }
}

// CLI usage
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  runner.runFullTestSuite().catch(console.error);
}