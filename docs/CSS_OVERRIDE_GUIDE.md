# CSS Override Guide

## Overview

The Narrative Engine supports custom CSS styling through the `game.yaml` configuration. This allows each game to have a unique visual theme without modifying the core Vue components.

## How It Works

1. **CSS Injection**: CSS from `game.yaml` → `ui.css_overrides` is injected into `<head>` at runtime
2. **CSS Variables**: Colors from `ui.themeConfig.colors` are set as CSS custom properties (`--color-*`)
3. **External Files**: Optional external CSS from `/api/game/{id}/theme.css` (fallback if no inline overrides)

See [App.vue:215-237](../client/src/App.vue#L215-L237) for implementation.

## Available CSS Classes

### Message Types
- `.message` - Base message wrapper
- `.message-content` - Message text content
- `.message-timestamp` - Timestamp display
- `.message-description` - Narrative/descriptive text from LLM
- `.message-command` - Player input commands
- `.message-dialogue` - NPC dialogue
- `.message-system` - System messages
- `.message-error` - Error messages

### Layout Components
- `.game-container` - Main game wrapper
- `.game-header` - Title/description area
- `.console-panel` - Console wrapper
- `.text-console` - Text display area
- `.messages` - Scrollable message container
- `.input-section` - Input field wrapper
- `.command-input` - Text input field
- `.action-bar` - Quick action buttons area
- `.action-button` - Individual action buttons
- `.rollback-button` - Rollback control button

### Processing States
- `.processing-message` - Processing indicator
- `.processing-header` - Processing message header
- `.processing-timer` - Elapsed time display
- `.processing-phase` - Current phase indicator
- `.processing-eta` - Estimated time remaining
- `.progress-bar` - Progress bar container
- `.progress-fill` - Progress bar fill

### Rollback UI
- `.rollback-menu` - Rollback menu popup
- `.rollback-header` - Menu header
- `.rollback-options` - Rollback option list
- `.rollback-option` - Individual rollback option
- `.snapshot-info`, `.snapshot-time`, `.snapshot-desc`, `.snapshot-messages`

## CSS Variables

Default variables that can be overridden:

```css
:root {
  --color-primary: #00ff00;        /* Main accent color */
  --color-secondary: #00aa00;      /* Secondary accent */
  --color-background: #000000;     /* Main background */
  --color-backgroundAlt: #111111;  /* Alternate background */
  --color-text: #00ff00;           /* Primary text */
  --color-textAlt: #00aa00;        /* Secondary text */
  --color-border: #00ff00;         /* Border color */
  --color-borderActive: #00ffff;   /* Active border */
  --color-error: #ff0000;          /* Error color */
  --color-info: #00ffff;           /* Info color */
}
```

## Example: Lovebug Game (Romantic Paris Theme)

```yaml
ui:
  css_overrides: |-
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Text&display=swap');

    body {
      background: linear-gradient(180deg, #1a1520 0%, #2a1f2f 50%, #1a1520 100%);
      font-family: 'Crimson Text', serif;
      color: #f5e6d3;
    }

    .game-container {
      background: linear-gradient(135deg, rgba(60, 30, 50, 0.85) 0%, rgba(30, 20, 35, 0.9) 100%);
      border: 2px solid rgba(255, 105, 180, 0.3);
      box-shadow: 0 0 30px rgba(255, 105, 180, 0.2);
    }

    h1, h2, h3 {
      font-family: 'Crimson Text', serif;
      color: #ff69b4;
      text-shadow: 0 0 10px rgba(255, 105, 180, 0.4);
    }

    .message-description {
      background: linear-gradient(90deg, transparent 0%, rgba(255, 105, 180, 0.08) 20%, rgba(255, 105, 180, 0.08) 80%, transparent 100%);
      border-left: 3px solid rgba(255, 105, 180, 0.5);
      color: #e8d4c8 !important;
      padding: 18px 22px;
      line-height: 1.7;
    }

    .message-command {
      color: #ff69b4 !important;
      opacity: 0.9;
    }

    .command-input {
      background: rgba(30, 20, 35, 0.6) !important;
      border: 2px solid rgba(255, 105, 180, 0.3) !important;
      color: #f5e6d3 !important;
    }

    button, .action-button {
      background: linear-gradient(135deg, #ff69b4 0%, #d64494 100%);
      border: 2px solid #ff1493;
      color: #fff;
      box-shadow: 0 4px 8px rgba(255, 105, 180, 0.3);
    }

    button:hover {
      box-shadow: 0 0 15px rgba(255, 105, 180, 0.5);
      transform: translateY(-2px);
    }
```

## Best Practices

1. **Use `!important` sparingly**: Only when Vue component styles have high specificity
2. **Target specific classes**: Don't use overly broad selectors like `div` or `span`
3. **Test all message types**: Ensure command, description, dialogue, system, and error messages are readable
4. **Maintain contrast**: Ensure text is readable against backgrounds
5. **Use CSS variables**: For colors that need to be consistent across the theme
6. **Web fonts**: Load via `@import` at the top of `css_overrides`
7. **Responsive design**: Consider different screen sizes in your overrides

## Common Pitfalls

❌ **Wrong**: Using non-existent classes
```css
.narrative-text { color: red; }  /* This class doesn't exist! */
```

✅ **Right**: Using actual Vue component classes
```css
.message-description { color: red; }  /* Targets actual messages */
```

❌ **Wrong**: Overriding `:root` variables without effect
```css
:root { --color-primary: blue; }  /* Won't affect inline styles */
```

✅ **Right**: Overriding actual elements
```css
.message-command { color: blue !important; }  /* Direct override */
```

## Testing Your Theme

1. Start the game: `npm run dev:yourgame`
2. Test all message types:
   - Enter a command (tests `.message-command`)
   - Wait for response (tests `.message-description`)
   - Trigger system messages (tests `.message-system`)
   - Trigger errors if possible (tests `.message-error`)
3. Check input field styling
4. Check button hover states
5. Verify readability in different lighting conditions
6. Test rollback menu if applicable

## Custom Icons

Games can customize emojis/icons used throughout the interface by adding an `icons` section to `game.yaml`:

```yaml
ui:
  icons:
    connected: "💘"      # Connection established
    disconnected: "💔"   # Connection lost
    connecting: "💌"     # Connecting to server
    error: "💔"          # Error messages
    timer: "💕"          # Processing timer
    phase: "💖"          # Processing phase indicator
    target: "💗"         # ETA/target indicator
    rollback: "💘"       # Rollback action
    rollback_menu: "💝"  # Rollback menu header
```

**Example use case**: The "Lovebug" game replaces all standard checkmarks/indicators with heart emojis for a romantic theme.

The engine will automatically use game-specific icons if defined, otherwise fall back to defaults (✅, ❌, ⏱️, etc.).

## Architecture Notes

- **Separation of concerns**: Static styles in `App.vue`, game-specific overrides in `game.yaml`
- **Icon customization**: Game-specific emoji/icon mappings via `ui.icons`
- **No CSS files needed**: Everything can be inline in YAML
- **Hot reload**: Changes to `game.yaml` require server restart
- **Precedence**: Inline styles > CSS overrides > App.vue styles
