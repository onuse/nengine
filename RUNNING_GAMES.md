# Running Games - Windows PowerShell Guide

This guide explains how to run different games in the Narrative Engine on Windows.

## Quick Start (Recommended for Windows)

Use the game-specific npm scripts:

```powershell
# Run lovebug game
npm run dev:lovebug

# Run the-heist game
npm run dev:heist

# Run red-lantern-detective game
npm run dev:detective

# Run default game (the-heist)
npm run dev
```

## Why Use Game-Specific Scripts?

PowerShell has issues with the standard `npm run dev -- --game=lovebug` syntax. The `--` argument separator doesn't always work correctly in PowerShell, causing the game parameter to be ignored and defaulting to "the-heist".

**DON'T USE** (may not work in PowerShell):
```powershell
npm run dev -- --game=lovebug    # ❌ Arguments may not pass through correctly
```

**USE INSTEAD** (guaranteed to work):
```powershell
npm run dev:lovebug              # ✅ Works reliably in PowerShell
```

## Alternative Methods

### Method 1: Direct Node Execution
```powershell
node node_modules/tsx/dist/cli.mjs src/index.ts --game=lovebug
```

### Method 2: With Nodemon (auto-reload)
```powershell
node node_modules/nodemon/bin/nodemon.js --exec "node node_modules/tsx/dist/cli.mjs" src/index.ts --game=lovebug
```

### Method 3: Set Environment Variable
```powershell
$env:DEFAULT_GAME="lovebug"
npm run dev
```

## Accessing the Game

Once the server starts successfully, open your browser to:
```
http://localhost:3001
```

## Verifying the Correct Game Loaded

Check the console output when the server starts:

```
🎮 Loading game: Lovebug           # ✅ Correct - loading lovebug
🎮 Loading game: The Heist         # ❌ Wrong - loading the-heist instead
```

## Available Games

- **lovebug** - Paris hotel room scenario (3 rooms, 3 NPCs)
- **the-heist** - Heist planning game (default)
- **red-lantern-detective** - Noir detective mystery (10 rooms, 8 NPCs)

## Adding New Games

To add a new game script to `package.json`:

```json
"dev:mygame": "node node_modules/nodemon/bin/nodemon.js --exec \"node node_modules/tsx/dist/cli.mjs\" src/index.ts --game=mygame"
```

Then run with:
```powershell
npm run dev:mygame
```

## Troubleshooting

### Server says "Loading game: The Heist" when you want lovebug

**Problem**: The `--game` argument isn't being passed through.

**Solution**: Use `npm run dev:lovebug` instead of `npm run dev -- --game=lovebug`

### Port 3001 already in use

**Problem**: Another instance is running.

**Solution**:
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /F /PID [PID]
```

### Git Bash on Windows

If you're using Git Bash on Windows, the standard syntax works:
```bash
npm run dev -- --game=lovebug
```

But the game-specific scripts work everywhere and are recommended.
