# Rollback Enhancement Design v2
## Simplified Auto-Branching Approach

## Overview

This document describes enhanced rollback/timeline features for the Narrative Engine, enabling players to explore alternate story paths through an intuitive message-based interface.

**Key Philosophy**: Instead of *deleting* the future when editing past messages, we **preserve all timelines** using Git branches. This mirrors Claude's conversation branching and ensures nothing is ever lost.

## Core Principles

### 1. Uniform Message Handling
- All messages (player commands AND narrator responses) can be edited
- All messages have the same context menu interface
- No special cases for "last message" vs "older message"

### 2. Rollback = Branch, Not Delete
- Editing a message creates a new timeline branch
- Original timeline is preserved automatically
- Player can switch between timelines anytime
- Nothing is ever permanently deleted

### 3. Let LLM Handle Consistency
- Edited narration is narrative-only (not parsed into state)
- LLM sees edited text in history and adapts naturally
- State changes come from player actions, not narration parsing
- Avoids complex state extraction logic

## User Experience

### Click Any Message → Context Menu

Every message shows a context menu with options based on type and position:

```
┌─────────────────────────────┐
│ 📋 Copy text                │  ← Always available
│ ✏️ Edit & replay from here  │  ← For player commands
│ 📝 Rewrite narration        │  ← For narrator responses
│ 🔄 Rollback to here         │  ← If not last message
│ 🌿 Branch timeline here     │  ← If not last message
└─────────────────────────────┘
```

### Edit Flow with Auto-Branching

**Scenario: Edit older message**

```
Current timeline:
  Msg 1: "Enter room"
  Msg 2: [Narrator: "You step inside"]
  Msg 3: "Talk to Amélie"  ← Click "Edit"
  Msg 4: [Narrator: "She smiles..."]
  Msg 5: "Flirt"
  Msg 6: [Narrator: "She blushes..."]

User clicks "Edit & replay from here" on Msg 3:
  ↓
Modal appears:
┌────────────────────────────────────────────┐
│ Edit and Create New Timeline?              │
├────────────────────────────────────────────┤
│ Editing this message will branch the story│
│                                             │
│ Current timeline will be preserved as:     │
│ 🌿 "talk-amelie-2025-10-14"               │
│                                             │
│ You'll continue on the main timeline      │
│ with your edited version.                  │
│                                             │
│ Edit command:                              │
│ [Talk to Scarlett____________]            │
│                                             │
│ [Cancel] [Branch & Continue]               │
└────────────────────────────────────────────┘
  ↓
User clicks "Branch & Continue":
  ↓
System creates branch "talk-amelie-2025-10-14":
  Msg 1: "Enter room"
  Msg 2: [Narrator: "You step inside"]
  Msg 3: "Talk to Amélie"
  Msg 4: [Narrator: "She smiles..."]
  Msg 5: "Flirt"
  Msg 6: [Narrator: "She blushes..."]
  ↑ (frozen here - preserved forever)

Main timeline rolls back and continues:
  Msg 1: "Enter room"
  Msg 2: [Narrator: "You step inside"]
  Msg 3: "Talk to Scarlett"  ← New edited command
  Msg 4: [Narrator: "Scarlett grins..."]  ← New LLM response
  ↑ You are here - continue playing
```

### Timeline Switching

```vue
<!-- Header shows current timeline -->
<div class="timeline-selector">
  <select v-model="currentBranch">
    <option value="main">Main Timeline (4 messages)</option>
    <option value="talk-amelie-2025-10-14">Amélie Path (6 messages)</option>
    <option value="polite-approach-2025-10-14">Polite Path (8 messages)</option>
  </select>
  <button @click="showTimelineManager">🌳 Manage</button>
</div>
```

Switching timelines:
1. User selects different timeline from dropdown
2. Client sends `{ type: 'switch_branch', branchName: '...' }`
3. Server loads state from that branch
4. Client reloads all messages for that branch
5. User continues from where that timeline left off

## Technical Architecture

### Message Structure

```typescript
interface GameMessage {
  id: string;                    // Unique message ID
  type: 'command' | 'description' | 'dialogue' | 'system' | 'error';
  text: string;
  timestamp: Date;
  commitHash?: string;           // Server-side Git commit for this message
  isEdited: boolean;             // Whether this message was user-edited
  originalText?: string;         // Original text before edit (for history)
  canRollback: boolean;          // Whether rollback is available
}
```

### Timeline Structure

```typescript
interface Timeline {
  name: string;                  // Git branch name: "talk-amelie-2025-10-14"
  displayName: string;           // User-friendly: "Amélie Path"
  createdAt: Date;
  lastModified: Date;
  parentBranch: string;          // "main"
  branchPoint: string;           // Commit hash where it forked
  messageCount: number;
  isActive: boolean;             // Currently viewing this branch
}
```

### Core Functions

#### 1. Edit Player Command

```typescript
async function handleEditCommand(message: GameMessage) {
  const newCommand = await promptForEdit(message.text);
  if (!newCommand) return;

  const messageIndex = messages.indexOf(message);
  const hasMessagesAfter = messageIndex < messages.length - 1;

  if (hasMessagesAfter) {
    // Create branch to preserve current timeline
    const branchName = generateBranchName(message.text, message.timestamp);

    await sendWebSocket({
      type: 'create_branch',
      branchName: branchName,
      fromCommit: message.commitHash
    });

    // Rollback main timeline to just before this message
    await rollbackToCommit(messages[messageIndex - 1].commitHash);
  }

  // Send new command (creates new history from this point)
  await sendCommand(newCommand);
}
```

#### 2. Edit Narrator Response

```typescript
async function handleEditNarration(message: GameMessage) {
  const newText = await promptForEdit(message.text);
  if (!newText) return;

  const messageIndex = messages.indexOf(message);
  const hasMessagesAfter = messageIndex < messages.length - 1;

  if (hasMessagesAfter) {
    // Create branch to preserve current timeline
    const branchName = generateBranchName(message.text, message.timestamp);

    await sendWebSocket({
      type: 'create_branch',
      branchName: branchName,
      fromCommit: message.commitHash
    });

    // Rollback main timeline to this message
    await rollbackToCommit(message.commitHash);
  }

  // Update the message text
  message.text = newText;
  message.isEdited = true;
  message.originalText = message.text;

  // Delete messages after this point (they're in the branch now)
  messages.splice(messageIndex + 1);

  addSystemMessage('📝 Narration rewritten. Timeline branched. What happens next?');
}
```

#### 3. Simple Rollback (No Edit)

```typescript
async function handleRollback(message: GameMessage) {
  const messageIndex = messages.indexOf(message);

  // Create branch for current timeline
  const branchName = `rollback-${Date.now()}`;

  await sendWebSocket({
    type: 'create_branch',
    branchName: branchName,
    fromCommit: currentCommitHash
  });

  // Rollback to selected message
  await rollbackToCommit(message.commitHash);

  // Truncate client messages
  messages.splice(messageIndex + 1);

  addSystemMessage(`🔄 Rolled back. Original timeline saved as "${branchName}"`);
}
```

#### 4. Branch Naming

```typescript
function generateBranchName(fromMessage: string, timestamp: Date): string {
  // Extract key words from the message
  const words = fromMessage
    .toLowerCase()
    .split(' ')
    .filter(w => w.length > 3 && !['the', 'and', 'you', 'are'].includes(w))
    .slice(0, 3)
    .join('-')
    .replace(/[^a-z0-9-]/g, '');

  const dateStr = timestamp.toISOString().slice(0, 10);

  return `${words}-${dateStr}`;
}

// Examples:
// "Talk to Amélie" → "talk-amelie-2025-10-14"
// "Flirt with her" → "flirt-with-2025-10-14"
// "Be polite and leave" → "polite-leave-2025-10-14"
```

## WebSocket Protocol

### Client → Server Messages

```typescript
// Create a new branch
{
  type: 'create_branch',
  branchName: string,
  fromCommit: string
}

// Switch to existing branch
{
  type: 'switch_branch',
  branchName: string
}

// List all branches
{
  type: 'list_branches'
}

// Rollback to commit
{
  type: 'rollback',
  commitHash: string
}

// Delete branch
{
  type: 'delete_branch',
  branchName: string
}
```

### Server → Client Messages

```typescript
// Branch created successfully
{
  type: 'branch_created',
  branchName: string,
  fromCommit: string
}

// Branch switched
{
  type: 'branch_switched',
  branchName: string,
  state: WorldState,
  historyCount: number  // How many messages to load
}

// Branch list
{
  type: 'branches_list',
  branches: Timeline[]
}

// Rollback complete
{
  type: 'rollback_complete',
  commitHash: string,
  historyCount: number
}

// Error
{
  type: 'error',
  message: string
}
```

## Server Implementation

### WebSocket Handler (src/index.ts)

```typescript
ws.on('message', async (data) => {
  const message = JSON.parse(data);

  switch (message.type) {
    case 'create_branch':
      try {
        await stateMCP.executeTool('createBranch', {
          name: message.branchName,
          fromCommit: message.fromCommit
        });

        ws.send(JSON.stringify({
          type: 'branch_created',
          branchName: message.branchName,
          fromCommit: message.fromCommit
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Failed to create branch: ${error.message}`
        }));
      }
      break;

    case 'switch_branch':
      try {
        await stateMCP.executeTool('switchBranch', {
          branch: message.branchName
        });

        const state = await stateMCP.executeTool('getWorldState', {});
        const history = await stateMCP.executeTool('getHistory', {
          branch: message.branchName,
          limit: 100
        });

        ws.send(JSON.stringify({
          type: 'branch_switched',
          branchName: message.branchName,
          state: state,
          historyCount: history.length
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Failed to switch branch: ${error.message}`
        }));
      }
      break;

    case 'list_branches':
      try {
        const branches = await stateMCP.executeTool('getBranches', {});

        ws.send(JSON.stringify({
          type: 'branches_list',
          branches: branches
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Failed to list branches: ${error.message}`
        }));
      }
      break;

    case 'rollback':
      try {
        await stateMCP.executeTool('loadState', {
          commitOrBranch: message.commitHash
        });

        const history = await stateMCP.executeTool('getHistory', {
          limit: 100
        });

        const commitIndex = history.findIndex(c => c.hash === message.commitHash);

        ws.send(JSON.stringify({
          type: 'rollback_complete',
          commitHash: message.commitHash,
          historyCount: commitIndex + 1
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Rollback failed: ${error.message}`
        }));
      }
      break;
  }
});
```

### Narrative Controller (src/llm/narrative-controller.ts)

Add commit hash tracking to responses:

```typescript
async processPlayerAction(action: PlayerAction): Promise<NarrativeResult> {
  // ... existing code ...

  // Step 6: Record event in history
  this.recordEvent(classifiedAction, llmResponse, mechanicalResults);

  // Step 7: Save state to Git and get commit hash
  const commitHash = await this.mcpManager.executeTool(
    'state-mcp',
    'saveState',
    { message: `Player: ${action.rawInput}` }
  );

  return {
    success: true,
    narrative: llmResponse.narrative,
    dialogue: llmResponse.dialogue,
    stateChanges,
    nextActions,
    commitHash  // ← Return commit hash to client
  };
}
```

## UI Components

### Timeline Selector (Header)

```vue
<template>
  <div class="timeline-selector">
    <div class="current-timeline">
      <span class="timeline-icon">🌿</span>
      <select v-model="currentBranch" @change="switchTimeline">
        <option value="main">Main Timeline ({{ getMessageCount('main') }} msgs)</option>
        <option v-for="branch in branches" :key="branch.name" :value="branch.name">
          {{ branch.displayName }} ({{ branch.messageCount }} msgs)
        </option>
      </select>
      <button @click="showTimelineManager" class="timeline-btn">
        🌳 Manage
      </button>
    </div>
  </div>
</template>

<style>
.timeline-selector {
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--color-border);
}

.current-timeline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timeline-icon {
  font-size: 20px;
}

.current-timeline select {
  flex: 1;
  padding: 8px;
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.timeline-btn {
  padding: 8px 16px;
  white-space: nowrap;
}
</style>
```

### Message Context Menu

```vue
<template>
  <!-- Messages container -->
  <div class="messages" ref="messagesContainer">
    <div
      v-for="(msg, index) in messages"
      :key="msg.id"
      :class="['message', `message-${msg.type}`, { 'message-edited': msg.isEdited }]"
      @contextmenu.prevent="showContextMenu(msg, $event)"
      @click="handleMessageClick(msg)"
    >
      <div class="message-content">{{ msg.text }}</div>
      <div class="message-timestamp">
        {{ formatTimestamp(msg.timestamp) }}
        <span v-if="msg.isEdited" class="edited-badge">✏️ Edited</span>
      </div>
    </div>
  </div>

  <!-- Context Menu -->
  <div
    v-if="contextMenu.show"
    :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    class="message-context-menu"
  >
    <div
      v-for="action in getMessageActions(contextMenu.message)"
      :key="action.action"
      @click="handleContextAction(action, contextMenu.message)"
      class="context-menu-item"
    >
      <span class="context-icon">{{ action.icon }}</span>
      <span class="context-label">{{ action.label }}</span>
    </div>
  </div>
</template>

<style>
.message-edited {
  border-left: 3px solid var(--color-accent);
  background: rgba(255, 255, 0, 0.05);
}

.edited-badge {
  margin-left: 8px;
  font-size: 0.9em;
  opacity: 0.7;
}

.message-context-menu {
  position: fixed;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 200px;
}

.context-menu-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-icon {
  font-size: 18px;
}

.context-label {
  flex: 1;
}
</style>
```

### Timeline Manager Modal

```vue
<template>
  <div v-if="showTimelineManagerModal" class="modal-overlay" @click="closeTimelineManager">
    <div class="timeline-manager" @click.stop>
      <div class="timeline-header">
        <h3>🌳 Timeline Manager</h3>
        <button @click="closeTimelineManager" class="close-btn">✕</button>
      </div>

      <div class="timeline-list">
        <div
          v-for="branch in allTimelines"
          :key="branch.name"
          :class="['timeline-item', { 'timeline-active': branch.isActive }]"
        >
          <div class="timeline-info">
            <div class="timeline-name">
              {{ branch.displayName }}
              <span v-if="branch.isActive" class="active-badge">● Active</span>
            </div>
            <div class="timeline-meta">
              {{ branch.messageCount }} messages • Last modified {{ formatRelativeTime(branch.lastModified) }}
            </div>
            <div v-if="branch.parentBranch !== 'root'" class="timeline-parent">
              Branched from: {{ formatBranchName(branch.parentBranch) }}
            </div>
          </div>

          <div class="timeline-actions">
            <button
              v-if="!branch.isActive"
              @click="switchToTimeline(branch.name)"
              class="timeline-action-btn"
            >
              Switch
            </button>
            <button
              v-if="branch.name !== 'main'"
              @click="deleteTimeline(branch.name)"
              class="timeline-action-btn danger"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

## Implementation Phases

### Phase 1: Server-Side Integration (Week 1)
**Goal**: Connect client rollback to server state

Files to modify:
- `src/index.ts` - Add WebSocket handlers for branches
- `src/llm/narrative-controller.ts` - Return commit hash with responses
- `src/types/mcp-types.ts` - Add NarrativeResult.commitHash field

Tasks:
1. Add commit hash to NarrativeResult interface
2. Track commit hash when saving state
3. Implement WebSocket handlers:
   - `create_branch`
   - `switch_branch`
   - `list_branches`
   - `rollback`
4. Test with simple scenarios

### Phase 2: Client Context Menu (Week 2)
**Goal**: Interactive message editing

Files to modify:
- `client/src/App.vue` - Add context menu and handlers

Tasks:
1. Add context menu component
2. Implement `getMessageActions()` logic
3. Add click/right-click handlers to messages
4. Implement edit modal/prompt
5. Add "Edited" visual indicators
6. Test edit flows

### Phase 3: Timeline UI (Week 3)
**Goal**: Timeline selection and management

Files to modify:
- `client/src/App.vue` - Timeline selector and manager

Tasks:
1. Add timeline selector to header
2. Fetch and display available timelines
3. Implement timeline switching
4. Create timeline manager modal
5. Add timeline deletion
6. Test switching between timelines

### Phase 4: Polish & UX (Week 4)
**Goal**: Smooth user experience

Tasks:
1. Add confirmation dialogs for destructive actions
2. Improve branch naming (let user customize)
3. Add loading states for async operations
4. Add tooltips and help text
5. Handle edge cases (network errors, invalid states)
6. User testing and refinements

## Benefits

1. **Nothing is ever lost** - All story paths preserved in branches
2. **Familiar UX** - Works like Claude's conversation branching
3. **Easy experimentation** - Try risky choices without fear
4. **Narrative control** - Edit both commands AND narration
5. **Git-native** - Uses existing infrastructure perfectly
6. **Efficient storage** - Git only stores diffs

## Edge Cases

### 1. Edit without messages after
- No branch needed
- Just update text and continue

### 2. Network disconnect during branch
- Queue branch request
- Retry when reconnected
- Show "Pending" status

### 3. Conflicting edits
- Not possible (single-player game)
- Each timeline is independent

### 4. Too many branches
- Limit to 20 branches
- Prompt user to delete old branches
- Auto-delete branches older than 30 days

### 5. Invalid commit hash
- Show error message
- Don't change state
- Let user retry or cancel

## Future Enhancements

1. **Visual Timeline Graph** - Show branching structure visually
2. **Timeline Comparison** - Diff between two timelines
3. **Named Save Points** - Bookmark important moments
4. **Timeline Merging** - Combine elements from different branches
5. **Auto-branching** - Automatically create branches for major choices
6. **Timeline Sharing** - Export/import timelines
7. **Replay Mode** - Watch timeline playback as animation

## Conclusion

This design provides a powerful, intuitive way for players to explore narrative possibilities while ensuring nothing is ever lost. By leveraging Git's branching model and mirroring Claude's familiar conversation branching, we create a unique storytelling experience that gives players unprecedented control over their narrative journey.
