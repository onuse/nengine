# Rollback Enhancement Design

## Overview

This document describes enhanced rollback/timeline features for the Narrative Engine, enabling players to explore alternate story paths through an intuitive message-based interface.

## Current Implementation

### Client-Side Only (App.vue)
- **Snapshots**: Created after every command/response
- **Storage**: Last 20 snapshots in browser memory
- **Limitation**: UI-only - doesn't rollback server state
- **Access**: Rollback button → menu with snapshot list

### Server-Side (Partially Implemented)
- **State MCP**: Git-based versioning with full rollback support
- **Tools Available**:
  - `loadState(commitOrBranch)` - Load state from any commit
  - `getHistory(branch, limit)` - Get commit history
  - `createBranch(name, fromCommit)` - Create timeline branches
  - `switchBranch(branch)` - Switch between timelines

**The Problem**: Client and server rollback aren't integrated!

## Enhanced Feature Design

### Feature 1: Interactive Message-Based Rollback

**User Experience:**
1. Click/right-click any message in the history
2. See context menu with options:
   - 🔄 **Roll back to here** - Revert game state to this point
   - ✏️ **Edit & continue** - Modify this action and replay from here
   - 🌿 **Branch from here** - Create alternate timeline
   - 📋 **Copy message** - Copy text to clipboard
   - ❌ **Cancel** - Close menu

**Technical Implementation:**

```typescript
interface MessageAction {
  type: 'rollback' | 'edit' | 'branch' | 'copy';
  messageId: string;
  commitHash?: string;  // Server-side commit for this message
}

// Add to each GameMessage:
interface GameMessage {
  type: 'command' | 'description' | 'dialogue' | 'system' | 'error';
  text: string;
  timestamp: Date;
  id: string;
  commitHash?: string;  // Link to server-side state
  canRollback: boolean;  // Whether rollback is available
}
```

**UI Changes:**
```vue
<template>
  <div
    v-for="(msg, index) in messages"
    :key="index"
    :class="['message', `message-${msg.type}`]"
    @contextmenu.prevent="showMessageMenu(msg, $event)"
    @click="msg.canRollback && showMessageMenu(msg, $event)"
  >
    <div class="message-content">{{ msg.text }}</div>
    <div class="message-timestamp">{{ formatTimestamp(msg.timestamp) }}</div>

    <!-- Rollback indicator for interactive messages -->
    <div v-if="msg.canRollback" class="rollback-indicator">
      🔄
    </div>
  </div>

  <!-- Context menu -->
  <div
    v-if="contextMenu.show"
    :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    class="message-context-menu"
  >
    <div @click="rollbackToMessage(contextMenu.message)">
      🔄 Roll back to here
    </div>
    <div @click="editMessage(contextMenu.message)">
      ✏️ Edit & continue
    </div>
    <div @click="branchFromMessage(contextMenu.message)">
      🌿 Branch from here
    </div>
    <div @click="copyMessage(contextMenu.message)">
      📋 Copy message
    </div>
  </div>
</template>
```

### Feature 2: Smart Edit Detection

**Distinction:**
- **Edit LAST message**: No rollback needed, just resend modified command
- **Edit OLDER message**: Requires rollback → edit → replay

**Implementation:**
```typescript
async function editMessage(message: GameMessage) {
  const isLastCommand = isLastCommandMessage(message);

  if (isLastCommand) {
    // Simple case: edit and resend
    inputCommand.value = extractCommandText(message.text);
    // Focus input, let user modify and press Enter
  } else {
    // Complex case: rollback → edit → continue
    await rollbackToMessage(message);
    inputCommand.value = extractCommandText(message.text);
    addMessage('⏸️ Game paused at this point. Edit the command above and press Enter to continue.', 'system');
  }
}

function isLastCommandMessage(message: GameMessage): boolean {
  const commandMessages = messages.value.filter(m => m.type === 'command');
  return commandMessages[commandMessages.length - 1]?.id === message.id;
}
```

### Feature 3: Server-Synchronized Rollback

**WebSocket Protocol:**
```typescript
// Client → Server: Request rollback
{
  type: 'rollback',
  commitHash: 'abc123...',  // Or messageId to lookup commit
  action: 'rollback' | 'branch'
}

// Server → Client: Rollback complete
{
  type: 'rollback_complete',
  commitHash: 'abc123...',
  state: WorldState,  // New current state
  messages: GameMessage[]  // Messages up to this point
}

// Server → Client: Branch created
{
  type: 'branch_created',
  branchName: 'timeline_1710434821',
  commitHash: 'abc123...',
  message: 'Created alternate timeline'
}
```

**Server-Side Handler (index.ts):**
```typescript
ws.on('message', async (data) => {
  const message = JSON.parse(data);

  if (message.type === 'rollback') {
    try {
      // Load state from commit
      await stateMCP.executeTool('loadState', {
        commitOrBranch: message.commitHash
      });

      // Get updated state
      const worldState = await stateMCP.executeTool('getWorldState', {});

      // Get commit history up to this point
      const history = await stateMCP.executeTool('getHistory', {
        limit: 100
      });

      // Find commit index
      const commitIndex = history.findIndex(c => c.hash === message.commitHash);

      ws.send(JSON.stringify({
        type: 'rollback_complete',
        commitHash: message.commitHash,
        state: worldState,
        historyCount: commitIndex + 1
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Rollback failed: ${error.message}`
      }));
    }
  }
});
```

### Feature 4: Timeline Branching

**User Experience:**
1. Click "Branch from here" on any message
2. Game creates new timeline (branch) from that point
3. User can switch between timelines
4. Each timeline has independent save history

**UI Addition:**
```vue
<template>
  <!-- Timeline selector -->
  <div class="timeline-selector">
    <select v-model="currentTimeline" @change="switchTimeline">
      <option v-for="branch in timelines" :key="branch" :value="branch">
        {{ formatTimelineName(branch) }}
      </option>
    </select>
    <button @click="showTimelineManager" class="timeline-manager-btn">
      🌳 Manage Timelines
    </button>
  </div>

  <!-- Timeline manager modal -->
  <div v-if="showTimelineManagerModal" class="timeline-manager">
    <div class="timeline-list">
      <div v-for="branch in timelines" :key="branch" class="timeline-item">
        <div class="timeline-info">
          <strong>{{ formatTimelineName(branch) }}</strong>
          <span class="timeline-commits">{{ getCommitCount(branch) }} actions</span>
          <span class="timeline-date">{{ getLastModified(branch) }}</span>
        </div>
        <div class="timeline-actions">
          <button @click="switchToTimeline(branch)">Switch</button>
          <button @click="deleteTimeline(branch)" class="danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

**Data Structure:**
```typescript
interface Timeline {
  branch: string;           // Git branch name
  displayName: string;      // User-friendly name
  created: Date;            // When created
  lastModified: Date;       // Last action timestamp
  commitCount: number;      // Number of commits
  divergedFrom: string;     // Parent branch
  divergedAt: string;       // Commit hash where branched
}

const timelines = ref<Timeline[]>([]);
const currentTimeline = ref<string>('main');
```

### Feature 5: Visual Timeline Graph

**Optional Enhancement**: Show branching structure visually

```
main: Start → Talk to Amélie → Flirt → Kiss → ...
                     ↓
      branch_1: → Ignore → Talk to Scarlett → Dance → ...
                     ↓
      branch_2: → Be polite → Leave room → ...
```

**Implementation**: Use a library like `vis-network` or `cytoscape.js` to visualize Git commit graph.

## Implementation Phases

### Phase 1: Server Integration (High Priority)
1. Add commit hash tracking to messages
2. Implement WebSocket rollback protocol
3. Connect client rollback to server state
4. Test with simple rollback scenarios

**Files to modify:**
- `src/index.ts` - Add rollback WebSocket handler
- `client/src/App.vue` - Send rollback requests to server
- `src/llm/narrative-controller.ts` - Track commit hashes

### Phase 2: Interactive Message Menu (Medium Priority)
1. Add context menu to messages
2. Implement click/right-click handlers
3. Add rollback indicators to messages
4. Style context menu

**Files to modify:**
- `client/src/App.vue` - UI and handlers

### Phase 3: Smart Edit Detection (Medium Priority)
1. Implement last-message detection
2. Add edit-in-place for last command
3. Add rollback→edit for older commands
4. Add "game paused" state indicator

**Files to modify:**
- `client/src/App.vue` - Edit logic

### Phase 4: Timeline Branching (Lower Priority)
1. Implement branch creation
2. Add timeline selector UI
3. Implement timeline switching
4. Add timeline manager modal

**Files to modify:**
- `src/index.ts` - Branch management API
- `client/src/App.vue` - Timeline UI

### Phase 5: Timeline Visualization (Optional)
1. Research visualization libraries
2. Implement commit graph display
3. Add interactive timeline navigation

**New files:**
- `client/src/components/TimelineGraph.vue`

## Data Flow

### Complete Rollback Flow:

```
1. User clicks message "Talk to Amélie"
   ↓
2. Client shows context menu → User selects "Roll back to here"
   ↓
3. Client finds message.commitHash = "abc123"
   ↓
4. Client sends WebSocket: { type: 'rollback', commitHash: 'abc123' }
   ↓
5. Server receives rollback request
   ↓
6. Server calls stateMCP.executeTool('loadState', { commitOrBranch: 'abc123' })
   ↓
7. Git Manager resets game-state to commit abc123
   ↓
8. Server loads state from Git
   ↓
9. Server sends response: { type: 'rollback_complete', commitHash: 'abc123', historyCount: 5 }
   ↓
10. Client receives response
   ↓
11. Client truncates messages to first 5 messages (up to commit)
   ↓
12. Client adds system message: "🔄 Rolled back to: Talk to Amélie"
   ↓
13. User continues playing from this point
   ↓
14. New actions create new commits after abc123
```

## Commit Hash Tracking

**Current Problem**: Messages don't track which server commit they correspond to.

**Solution**: Add commit hash to every message

**Implementation:**

In `narrative-controller.ts`:
```typescript
async processPlayerAction(action: PlayerAction): Promise<NarrativeResult> {
  // ... existing code ...

  // Step 6: Record event in history
  this.recordEvent(classifiedAction, llmResponse, mechanicalResults);

  // Step 7: Save state to Git and get commit hash
  const commitHash = await this.mcpManager.executeTool(
    'state-mcp',
    'saveState',
    { message: `Player action: ${action.rawInput}` }
  );

  return {
    success: true,
    narrative: llmResponse.narrative,
    dialogue: llmResponse.dialogue,
    stateChanges,
    nextActions,
    commitHash  // ← Add this
  };
}
```

In WebSocket handler (`index.ts`):
```typescript
ws.send(JSON.stringify({
  type: 'narrative_response',
  result: {
    narrative: result.narrative,
    commitHash: result.commitHash  // ← Send to client
  }
}));
```

In `App.vue`:
```typescript
function handleServerMessage(data: any) {
  if (data.type === 'narrative_response' && data.result) {
    addMessage(data.result.narrative, 'description', data.result.commitHash);
  }
}

async function addMessage(
  text: string,
  type: GameMessage['type'] = 'system',
  commitHash?: string
) {
  const message: GameMessage = {
    text,
    type,
    timestamp: new Date(),
    id: `msg_${nextMessageId.value++}`,
    commitHash,  // ← Store commit hash
    canRollback: !!commitHash  // Can rollback if we have a commit
  };
  messages.value.push(message);
  // ...
}
```

## Benefits

1. **Player Agency**: Explore different story paths without restarting
2. **Experimentation**: Try risky choices and rollback if needed
3. **Narrative Preservation**: Keep multiple storylines for comparison
4. **Undo Mistakes**: Fix typos or misunderstood commands
5. **Content Discovery**: See all possible outcomes for choices

## Technical Considerations

### Performance
- Git operations are fast (<50ms for small states)
- Limit history to last 100 commits to prevent bloat
- Consider async loading for timeline visualization

### Storage
- Each commit is ~1-10KB (JSON state)
- 100 commits = ~100KB-1MB per game
- Acceptable for local storage

### Concurrency
- Only one timeline active at a time (no concurrent editing)
- Branch switching requires exclusive lock
- Use async/await to prevent race conditions

### Edge Cases
1. **Rollback while processing**: Disable rollback during LLM generation
2. **Invalid commit hash**: Show error, don't change state
3. **Timeline deleted**: Switch to 'main' automatically
4. **Network disconnect**: Queue rollback requests, retry on reconnect

## Future Enhancements

1. **Named Save Points**: Let users name important moments
2. **Timeline Comparison**: Show diff between two timelines
3. **Timeline Merging**: Combine elements from different timelines
4. **Auto-branching**: Automatically create branch for major choices
5. **Timeline Sharing**: Export/import timelines to share with others
6. **Replay Mode**: Watch timeline playback as animation

## UI Mockups

### Message Context Menu
```
┌─────────────────────────────┐
│ 🔄 Roll back to here        │
│ ✏️ Edit & continue          │
│ 🌿 Branch from here         │
│ 📋 Copy message             │
└─────────────────────────────┘
```

### Timeline Selector
```
┌─────────────────────────────────────────────┐
│ Timeline: [Main Timeline ▼]  [🌳 Manage]    │
└─────────────────────────────────────────────┘
```

### Timeline Manager
```
┌───────────────────────────────────────────────────────┐
│ 🌳 Timeline Manager                           [✕]     │
├───────────────────────────────────────────────────────┤
│ ○ Main Timeline (current)                             │
│   23 actions • Last modified: 2 min ago               │
│   [Switch] [Delete]                                   │
│                                                        │
│ ○ Flirty Path                                         │
│   15 actions • Last modified: 5 min ago               │
│   Branched from: Main Timeline (action 8)             │
│   [Switch] [Delete]                                   │
│                                                        │
│ ○ Polite Approach                                     │
│   10 actions • Last modified: 10 min ago              │
│   Branched from: Main Timeline (action 8)             │
│   [Switch] [Delete]                                   │
└───────────────────────────────────────────────────────┘
```

## Conclusion

These enhancements transform the Narrative Engine from a linear story system into a branching narrative explorer, giving players unprecedented control over their story experience while maintaining full state consistency through Git-based versioning.

The architecture is already in place (state-mcp + Git Manager), we just need to connect the UI to these powerful backend features!
