# Game Persistence Design - Content Hash + Git Resume

## Problem Statement

When a player returns to a game, we need to determine:
1. **Can we resume from their last Git commit?** (content hasn't changed)
2. **Should we start fresh?** (game content has been updated)
3. **Which save state belongs to which game version?**

Currently, when you start `lovebug`, it always initializes from scratch. If content files change (world.yaml, characters.yaml, items.yaml), old save states could be incompatible.

## Solution: Content Hash Fingerprinting

**Core Idea**: Hash all game content files. Store this hash with each Git commit. On game start:
- Hash current content files
- Check if latest save's content hash matches
- If match → Fast-forward to latest commit
- If mismatch → Start fresh (content changed)

## Architecture

### 1. Content Files to Hash

For each game, hash these files:
```
games/{gameName}/
  ├── game.yaml           # Game config
  └── content/
      ├── world.yaml      # World data
      ├── characters.yaml # NPC definitions
      └── items.yaml      # Item definitions
```

**Note**: We do NOT hash:
- User-generated content (saves, images)
- Temporary files
- Non-content assets (images, audio)

### 2. Hash Generation

Use crypto hash (SHA-256) of concatenated file contents:

```typescript
function generateContentHash(gamePath: string): string {
  const files = [
    'game.yaml',
    'content/world.yaml',
    'content/characters.yaml',
    'content/items.yaml'
  ];

  const contentChunks: string[] = [];

  for (const file of files) {
    const filepath = path.join(gamePath, file);
    if (fs.existsSync(filepath)) {
      contentChunks.push(fs.readFileSync(filepath, 'utf-8'));
    }
  }

  const combined = contentChunks.join('\n---FILE_SEPARATOR---\n');
  return crypto.createHash('sha256').update(combined).digest('hex');
}
```

### 3. Storage in Git Commits

Store content hash in **commit metadata**:

**Option A: Commit message footer**
```
Player action: Look around the room

Content-Hash: a3f5b8c...
Timestamp: 2025-10-14T15:30:00Z
```

**Option B: Separate metadata file** (RECOMMENDED)
```
games/{gameName}/saves/.meta.json
{
  "contentHash": "a3f5b8c...",
  "gameVersion": "1.0.0",
  "lastCommit": "e8d9a2b...",
  "lastPlayed": "2025-10-14T15:30:00Z"
}
```

Commit this file with each state save → Git tracks it automatically.

### 4. Resume Logic Flow

```
┌─────────────────────────┐
│ Player starts game      │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ Hash current content    │
│ files (SHA-256)         │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────────────┐
│ Check saves/{gameName}/.meta.json│
└─────────┬───────────────────────┘
          │
    ┌─────┴─────┐
    │ Exists?   │
    └─────┬─────┘
          │
    ┌─────┴─────┐
    │    NO     │───► Start fresh game (new player)
    └───────────┘
          │
    ┌─────┴─────┐
    │    YES    │
    └─────┬─────┘
          │
          ▼
┌─────────────────────────────────┐
│ Compare content hashes          │
│ meta.contentHash == currentHash?│
└─────────┬───────────────────────┘
          │
    ┌─────┴─────┐
    │   MATCH   │───► Fast-forward to lastCommit
    │           │     Load state from Git
    │           │     Resume game
    └───────────┘
          │
    ┌─────┴─────┐
    │ MISMATCH  │───► Content changed!
    │           │     Options:
    │           │     1. Start fresh
    │           │     2. Warn user (migrate?)
    │           │     3. Archive old save
    └───────────┘
```

### 5. Implementation Plan

#### Phase 1: Content Hashing
- [ ] Add `ContentHasher` utility class
- [ ] Function to hash game content files
- [ ] Function to compare hashes

#### Phase 2: Metadata Storage
- [ ] Create `.meta.json` structure
- [ ] Update `GitManager.saveState()` to write metadata
- [ ] Update `StateMCP.saveState()` to include content hash

#### Phase 3: Resume Logic
- [ ] Update `GameLoader.loadGame()` to check metadata
- [ ] Add resume decision logic
- [ ] Handle content mismatch scenarios

#### Phase 4: Server Integration
- [ ] Update `initializeGame()` to use resume logic
- [ ] Add WebSocket message for "Resume available?"
- [ ] Send resume info to client on connection

#### Phase 5: Client UI (Optional)
- [ ] Show "Continue from where you left off?" prompt
- [ ] Display last played timestamp
- [ ] Warning if content changed

## File Structure After Implementation

```
games/lovebug/
  ├── game.yaml
  ├── content/
  │   ├── world.yaml
  │   ├── characters.yaml
  │   └── items.yaml
  └── saves/              # Git repo per game
      ├── .git/           # Git metadata
      ├── .meta.json      # Content hash metadata (COMMITTED)
      ├── state_*.json    # State snapshots
      └── README.md
```

## Metadata File Schema

```typescript
interface GameSaveMetadata {
  // Content identification
  contentHash: string;           // SHA-256 of content files
  gameVersion: string;            // From game.yaml version field
  gameId: string;                 // From game.yaml id/name

  // Save state
  lastCommit: string;             // Latest Git commit hash
  lastPlayed: string;             // ISO timestamp
  currentBranch: string;          // Git branch (default: "main")

  // Optional metadata
  playerName?: string;            // Player identifier
  playtime?: number;              // Total playtime in seconds
  turnCount?: number;             // Number of turns played

  // Compatibility
  engineVersion?: string;         // nengine version used
  createdAt?: string;             // When save was first created
}
```

## Edge Cases and Solutions

### 1. Content Added (New Files)
**Scenario**: Developer adds `content/quests.yaml`

**Solution**: Hash includes ALL content files. New file → new hash → mismatch → start fresh.

### 2. Content Removed (Deleted Files)
**Scenario**: Developer removes `content/items.yaml`

**Solution**: Hash calculation skips missing files. Different file list → different hash → mismatch.

### 3. Typo Fix in Content
**Scenario**: Fix "teh" → "the" in world.yaml

**Solution**: Any content change → hash changes → player starts fresh. This is CORRECT behavior (content changed).

**Workaround**: If you want to allow "safe" edits, add content versioning system (future enhancement).

### 4. Multiple Players, Same Game
**Scenario**: Two players play lovebug on same machine

**Solution**:
- Option A: Separate Git branches per player (`main-player1`, `main-player2`)
- Option B: Separate save directories (`saves/player1/`, `saves/player2/`)

**Recommendation**: Use **Option B** - each player gets their own save directory with their own `.meta.json` and Git repo.

### 5. Content Hotfix During Play Session
**Scenario**: Player is mid-session, developer pushes content fix

**Solution**: Hash is checked on **game start**, not during play. Player's session continues with old content. Next session → hash mismatch → start fresh.

### 6. Git Branches (Timelines)
**Scenario**: Player has multiple timeline branches

**Solution**: `.meta.json` tracks current branch. All branches use same content hash (they're all timelines of the same game version).

## Migration Strategy

For **existing saves** without content hash:

```typescript
async function migrateOldSave(gamePath: string, savePath: string): Promise<void> {
  // Generate current content hash
  const currentHash = generateContentHash(gamePath);

  // Check if .meta.json exists
  const metaPath = path.join(savePath, '.meta.json');

  if (!fs.existsSync(metaPath)) {
    // No metadata = old save
    // Assume content hash matches (benefit of doubt)
    const metadata: GameSaveMetadata = {
      contentHash: currentHash,
      gameVersion: getCurrentGameVersion(gamePath),
      gameId: path.basename(gamePath),
      lastCommit: await getLatestCommit(savePath),
      lastPlayed: new Date().toISOString(),
      currentBranch: 'main'
    };

    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    console.log('[Migration] Created .meta.json for old save');
  }
}
```

## Performance Considerations

### Hash Computation Cost
- **Small content files** (< 1MB combined): ~1-5ms
- **Large content files** (> 10MB): ~50-100ms

**Optimization**: Cache content hash in memory. Only recompute if:
- Files have different mtime (modification time)
- Game restart

### Git Operations Cost
- **Fast-forward checkout**: ~10-50ms
- **Branch list**: ~5-10ms
- **Commit metadata read**: ~1-5ms

**Result**: Resume adds **< 100ms** to game startup → negligible.

## Configuration Options

Add to `game.yaml`:

```yaml
saves:
  autoSave: true
  autoSaveInterval: 300
  maxSaves: 5
  enableBranching: false

  # NEW OPTIONS
  contentHashing:
    enabled: true                    # Enable content hash checking
    strictMode: true                 # Reject mismatched hashes
    autoMigrate: true                # Auto-migrate old saves
    warnOnMismatch: true             # Show warning instead of blocking
```

## API Changes

### New Methods in `GameLoader`

```typescript
class GameLoader {
  // Get content hash for current game
  getContentHash(): string;

  // Check if save is compatible with current content
  async isResumeAvailable(gameName: string): Promise<{
    available: boolean;
    reason?: string;
    metadata?: GameSaveMetadata;
  }>;

  // Resume from last save
  async resumeGame(gameName: string): Promise<void>;
}
```

### New Methods in `GitManager`

```typescript
class GitManager {
  // Save metadata with commit
  async saveMetadata(metadata: GameSaveMetadata): Promise<void>;

  // Load metadata from latest commit
  async loadMetadata(): Promise<GameSaveMetadata | null>;

  // Get latest commit hash
  async getLatestCommit(): Promise<string>;
}
```

### New WebSocket Messages

**Client → Server**
```typescript
{
  type: 'check_resume',
  gameName: 'lovebug'
}
```

**Server → Client**
```typescript
{
  type: 'resume_available',
  available: true,
  lastPlayed: '2025-10-14T15:30:00Z',
  turnCount: 42,
  currentBranch: 'main'
}

// OR

{
  type: 'resume_unavailable',
  reason: 'content_changed'  // or 'no_save', 'corrupted', etc.
}
```

## Testing Strategy

### Unit Tests
- ✅ Content hash generation with various file combinations
- ✅ Hash comparison (match/mismatch)
- ✅ Metadata serialization/deserialization
- ✅ Missing file handling

### Integration Tests
- ✅ Full game start → save → restart → resume flow
- ✅ Content change detection
- ✅ Old save migration
- ✅ Multiple branches

### Manual Tests
- ✅ Play lovebug → quit → resume → verify state
- ✅ Edit character.yaml → restart → verify fresh start
- ✅ Create timeline branches → quit → resume → verify correct branch

## Timeline

**Estimated Implementation**: 6-8 hours

- Phase 1 (Content Hashing): 1-2 hours
- Phase 2 (Metadata Storage): 2 hours
- Phase 3 (Resume Logic): 2-3 hours
- Phase 4 (Server Integration): 1-2 hours
- Phase 5 (Client UI): 1-2 hours (optional)

## Success Criteria

✅ Players can quit and resume games seamlessly
✅ Content changes force fresh start (data integrity)
✅ No save file corruption or incompatibility
✅ < 100ms overhead on game startup
✅ Works with Git branching/rollback system

## Future Enhancements

1. **Content Versioning**: Allow "compatible" content changes (minor typo fixes)
2. **Save Migration**: Auto-migrate saves when content changes in compatible ways
3. **Cloud Sync**: Sync `.meta.json` and Git repo to cloud storage
4. **Multi-player**: Separate save directories per player profile
5. **Save Browser**: UI to view and manage multiple save states
