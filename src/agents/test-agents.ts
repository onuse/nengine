/**
 * Simple test script for the agent system
 * Run with: npx tsx src/agents/test-agents.ts
 */

import { VariationAgent } from './variation-agent';
import { NoveltyScorer } from './novelty-scorer';
import { AgentOrchestrator } from './agent-orchestrator';
import { PlayerAction } from '../llm/narrative-controller';

async function testVariationAgent() {
  console.log('\n=== Testing Variation Agent ===');
  
  const agent = new VariationAgent({
    model: 'gemma2:3b',
    temperature: 0.9,
    variationCount: 3
  });

  const testAction: PlayerAction = {
    type: 'movement',
    rawInput: 'go north to the tavern',
    target: 'tavern'
  };

  const testContext = {
    currentRoom: 'market_square',
    currentRoomName: 'Market Square',
    roomDescription: 'A bustling marketplace filled with merchants and travelers.',
    connectedRooms: ['tavern_main', 'guard_tower'],
    presentNPCs: [],
    visibleItems: ['merchant_stall', 'fountain'],
    environment: {
      lighting: 'daylight',
      sounds: ['bustling crowds', 'merchant calls'],
      smells: ['fresh bread', 'horse sweat'],
      hazards: []
    },
    gameTime: {
      timeOfDay: 'afternoon'
    }
  };

  try {
    await agent.initialize();
    const result = await agent.execute({
      action: testAction,
      context: testContext,
      mechanicalResults: { movement: { success: true, targetRoom: 'tavern_main', message: 'Moved successfully' } }
    });

    if (result.success) {
      console.log('✅ Variation Agent Test PASSED');
      console.log(`Generated ${result.content.proposals.length} variations:`);
      result.content.proposals.forEach((proposal: string, i: number) => {
        console.log(`\n${i + 1}. ${proposal.substring(0, 100)}...`);
      });
    } else {
      console.log('❌ Variation Agent Test FAILED:', result.error);
    }

    await agent.shutdown();
  } catch (error) {
    console.log('❌ Variation Agent Test ERROR:', error);
  }
}

async function testNoveltyScorer() {
  console.log('\n=== Testing Novelty Scorer ===');
  
  const scorer = new NoveltyScorer({
    model: 'gemma2:9b',
    temperature: 0.2,
    minScore: 6.0
  });

  const testProposals = [
    'You walk north through the crowded marketplace toward the tavern.',
    'Moving through the bustling square, you make your way to the tavern entrance.',
    'The crowd parts as you stride confidently toward the tavern door.'
  ];

  const testAction: PlayerAction = {
    type: 'movement',
    rawInput: 'go north to the tavern',
    target: 'tavern'
  };

  try {
    await scorer.initialize();
    const result = await scorer.execute({
      action: testAction,
      context: { proposals: testProposals }
    });

    if (result.success) {
      console.log('✅ Novelty Scorer Test PASSED');
      console.log(`Selected: "${result.content.selected.substring(0, 80)}..."`);
      console.log(`Score: ${result.content.scores.total.toFixed(1)}/10`);
      console.log(`Novelty: ${result.content.scores.novelty.toFixed(1)}, Coherence: ${result.content.scores.coherence.toFixed(1)}`);
    } else {
      console.log('❌ Novelty Scorer Test FAILED:', result.error);
    }

    await scorer.shutdown();
  } catch (error) {
    console.log('❌ Novelty Scorer Test ERROR:', error);
  }
}

async function testFullOrchestrator() {
  console.log('\n=== Testing Full Agent Orchestrator ===');
  
  const fallbackHandler = async (action: PlayerAction) => ({
    success: true,
    narrative: 'Fallback response generated.',
    dialogue: undefined,
    stateChanges: [],
    nextActions: []
  });

  const orchestrator = new AgentOrchestrator(fallbackHandler, {
    enabled: true,
    fallbackOnError: true,
    timeoutMs: 20000,
    variation: {
      model: 'gemma2:3b',
      temperature: 0.9,
      variationCount: 3
    },
    evaluation: {
      model: 'gemma2:9b',
      temperature: 0.2,
      minScore: 5.0
    }
  });

  const testAction: PlayerAction = {
    type: 'interaction',
    rawInput: 'examine the mysterious sword on the table',
    target: 'mysterious_sword'
  };

  const testContext = {
    currentRoom: 'weapon_shop',
    currentRoomName: 'Blacksmith Shop',
    roomDescription: 'A dimly lit shop filled with weapons and armor. The smell of hot metal and coal fills the air.',
    connectedRooms: ['main_street'],
    presentNPCs: [{ id: 'blacksmith', name: 'Grom the Blacksmith', description: 'A burly dwarf', currentMood: 'neutral', relationship: { trust: 0, fear: 0, respect: 0 }, recentMemories: [] }],
    visibleItems: ['mysterious_sword', 'forge', 'anvil'],
    environment: {
      lighting: 'dim',
      sounds: ['hammer on metal', 'crackling fire'],
      smells: ['hot metal', 'coal smoke'],
      hazards: []
    },
    gameTime: {
      timeOfDay: 'morning'
    }
  };

  try {
    await orchestrator.initialize();
    const result = await orchestrator.processAction(
      testAction, 
      testContext, 
      { interaction: { success: true, action: 'examine', target: 'mysterious_sword' } }
    );

    if (result.success) {
      console.log('✅ Full Orchestrator Test PASSED');
      console.log(`Generated narrative: "${result.narrative.substring(0, 120)}..."`);
      console.log(`Agent generated: ${result.metadata.agentGenerated}`);
      if (result.metadata.agentGenerated) {
        console.log(`Selected from ${result.metadata.variationCount} variations`);
        console.log(`Processing time: ${result.metadata.totalDuration}ms`);
      }
    } else {
      console.log('❌ Full Orchestrator Test FAILED');
    }

    console.log('\nAgent Metrics:', orchestrator.getMetrics());
    
    await orchestrator.shutdown();
  } catch (error) {
    console.log('❌ Full Orchestrator Test ERROR:', error);
  }
}

async function runTests() {
  console.log('🚀 Starting Agent System Tests...');
  
  try {
    await testVariationAgent();
    await testNoveltyScorer();
    await testFullOrchestrator();
    
    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };