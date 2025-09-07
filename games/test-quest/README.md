# Test Quest

**Test Quest** is a comprehensive integration test game for the Narrative Engine. It serves dual purposes:

1. **Playable Adventure**: A fun, interactive experience for users to explore engine capabilities
2. **Automated Testing Suite**: Complete validation of all engine systems and functionality

## What This Game Tests

### 🏗️ **Core Engine Systems**
- **All 6 MCP Servers**: World Content, Entity Content, Mechanics, State Management, Character State, Narrative History
- **WebSocket Communication**: Real-time client-server interaction
- **HTTP API Endpoints**: Game configuration and status APIs
- **Git-based State Management**: Save/load with branching timelines
- **LLM Integration**: Narrative generation with Ollama

### 🎮 **Game Mechanics**
- **Room Navigation**: Movement between interconnected areas
- **Item Interactions**: Examination, pickup, use, and special actions
- **NPC Conversations**: Dynamic dialogue with personality-driven responses
- **Combat System**: Turn-based combat with AI opponents
- **Skill System**: Skill checks with success/failure mechanics
- **Character Stats**: Health, attributes, and progression

### 🧪 **Testing Features**
- **Dynamic Content Generation**: Undefined entities created by LLM
- **Response Quality Validation**: Narrative coherence and engagement
- **State Persistence**: Save/load functionality across sessions
- **Error Handling**: Graceful degradation and recovery
- **Performance Monitoring**: Response times and system health

## Game Structure

### **Test Rooms**
- **Test Lobby**: Starting area with basic functionality tests
- **World Content Test Chamber**: Dynamic world generation and environmental systems
- **NPC Interaction Laboratory**: Conversation and dialogue testing
- **Game Mechanics Testing Arena**: Combat, skills, and dice mechanics
- **State Management Testing Facility**: Save/load and persistence testing

### **Test NPCs**
- **Dr. Reality**: Tests world generation systems
- **Harmony**: Friendly interaction testing
- **Grex the Antagonistic**: Hostile interaction handling
- **Mysterious Tester**: Information gathering and deduction
- **Merchant Testos**: Economic systems and trading
- **Professor Conversation**: Complex dialogue trees
- **Echo**: Memory and conversation continuity
- **Training Construct Alpha**: Combat AI testing

### **Test Items**
- **Documentation**: Testing manuals and guides
- **Measurement Tools**: Devices for analyzing engine behavior
- **Interactive Objects**: Items that test various interaction types
- **Combat Equipment**: Weapons and armor for combat testing
- **Skill Training Tools**: Items for practicing and testing skills

## How to Use

### **As a Player**
1. Start the server with: `npm run dev -- --game=test-quest`
2. Connect via WebSocket or HTTP API
3. Explore the testing facility and interact with all systems
4. Each room and NPC provides clear guidance on what's being tested

### **As an Automated Test**
1. Ensure the server is running test-quest: `npm run dev -- --game=test-quest`
2. Run the integration test suite: `node src/test-runner/run-tests.js`
3. Review the detailed test results and any failures
4. Use for continuous integration and regression testing

## Test Coverage

### ✅ **Validated Systems**
- Server health and availability
- WebSocket connection and communication
- All MCP server initialization and functionality
- Game content loading and parsing
- Room navigation and movement
- Item examination and interaction
- NPC conversation initiation and responses
- Complex action processing by LLM
- Narrative quality and coherence
- Save/load state management
- Character statistics and progression
- Combat mechanics and AI
- Skill system and checks

### 📊 **Quality Metrics**
- **Response Time**: All operations under 10 seconds
- **Success Rate**: >95% of operations succeed
- **Narrative Quality**: Coherent, contextual, engaging responses
- **Memory Consistency**: NPCs remember previous interactions
- **State Persistence**: Perfect save/load functionality

## Integration with CI/CD

The test suite can be integrated into continuous integration pipelines:

```bash
# Start server in background
npm run dev -- --game=test-quest &
SERVER_PID=$!

# Wait for server to initialize
sleep 10

# Run tests
node src/test-runner/run-tests.js

# Capture exit code
TEST_RESULT=$?

# Cleanup
kill $SERVER_PID

# Exit with test result
exit $TEST_RESULT
```

## Extending the Tests

To add new test scenarios:

1. **Add New Test Rooms**: Create additional rooms in `content/world.yaml`
2. **Create Test NPCs**: Add NPCs in `content/npcs.yaml` with specific testing goals
3. **Add Test Items**: Create items in `content/items.yaml` for new interaction types
4. **Extend Test Runner**: Add new test methods in `src/test-runner/integration-test.ts`
5. **Update Validation**: Add quality checks for new features

## Example Test Output

```
🚀 Starting Narrative Engine Integration Test Suite...

🏥 Testing Server Health...
  ✅ Server Health Check: Server is healthy (45ms)

🔌 Connecting to WebSocket...
  ✅ WebSocket Connection: Successfully connected to WebSocket

🔧 Testing MCP Servers...
  ✅ MCP Server Initialization: 6 servers initialized
  ✅ MCP Server: world-content: Server operational
  ✅ MCP Server: entity-content: Server operational
  ✅ MCP Server: mechanics-content: Server operational
  ✅ MCP Server: state: Server operational
  ✅ MCP Server: character-state: Server operational
  ✅ MCP Server: narrative-history: Server operational

📊 Test Results Summary:
========================
Total Tests: 23
✅ Passed: 22
❌ Failed: 1
Success Rate: 95.7%

🎯 Integration Test Complete!
```

## Contributing

When adding new engine features, please:

1. Add corresponding test content to test-quest
2. Update the integration test runner to validate the new feature
3. Ensure tests maintain >95% success rate
4. Document any new testing capabilities

Test Quest ensures the Narrative Engine remains robust, reliable, and ready for real-world game development!