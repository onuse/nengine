export interface UITheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    backgroundAlt: string;
    text: string;
    textAlt: string;
    border: string;
    borderActive: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  fonts: {
    main: string;
    console: string;
    ui: string;
  };
  borders: {
    style: 'solid' | 'double' | 'dashed' | 'dotted' | 'none';
    width: string;
    radius: string;
  };
}

export interface UIPanelConfig {
  visible: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  size?: string; // CSS size like '30%', '200px'
  resizable?: boolean;
  collapsible?: boolean;
  customClass?: string;
}

export interface UILayoutConfig {
  layout: 'classic-four-panel' | 'minimal' | 'console-only' | 'graphical' | 'custom';
  panels: {
    viewport: UIPanelConfig & {
      showRoomName: boolean;
      showDescription: boolean;
      showExits: boolean;
      showMinimap?: boolean;
    };
    party: UIPanelConfig & {
      showHealth: boolean;
      showStats: boolean;
      showPortraits?: boolean;
      maxVisible?: number;
    };
    inventory: UIPanelConfig & {
      showWeight?: boolean;
      showValue?: boolean;
      groupByType?: boolean;
      quickSlots?: number;
    };
    actions: UIPanelConfig & {
      style: 'buttons' | 'menu' | 'radial' | 'hotkeys';
      showTooltips?: boolean;
      customActions?: string[];
    };
    console: UIPanelConfig & {
      maxLines?: number;
      showTimestamps?: boolean;
      enableHistory?: boolean;
      enableAutocomplete?: boolean;
      fontSize?: string;
    };
    // Optional panels for specific game types
    combat?: UIPanelConfig & {
      showInitiative?: boolean;
      showTargets?: boolean;
      animateDice?: boolean;
    };
    dialogue?: UIPanelConfig & {
      style: 'choices' | 'tree' | 'wheel';
      showSpeakerPortrait?: boolean;
      typewriterEffect?: boolean;
    };
    map?: UIPanelConfig & {
      style: 'ascii' | 'tile' | 'drawn';
      showFogOfWar?: boolean;
      zoomable?: boolean;
    };
    journal?: UIPanelConfig & {
      categories?: string[];
      searchable?: boolean;
    };
  };
}

export interface GameUIConfig {
  theme: UITheme | string; // Can reference predefined theme or custom theme object
  layout: UILayoutConfig;
  features: {
    enableSound?: boolean;
    enableMusic?: boolean;
    enableVibration?: boolean;
    enableParticles?: boolean;
    enableAnimations?: boolean;
    accessibilityMode?: boolean;
  };
  input: {
    primaryInput: 'text' | 'point-click' | 'both';
    enableKeyboardShortcuts?: boolean;
    enableGamepad?: boolean;
    customKeybindings?: Record<string, string>;
  };
  mobile?: {
    enableTouch: boolean;
    showVirtualKeyboard?: boolean;
    layout?: 'responsive' | 'fixed';
  };
}

// Predefined themes for different game genres
export const PREDEFINED_THEMES: Record<string, UITheme> = {
  'retro-green': {
    name: 'Retro Terminal',
    colors: {
      primary: '#0f0',
      secondary: '#0ff',
      background: '#000',
      backgroundAlt: '#111',
      text: '#0f0',
      textAlt: '#090',
      border: '#0f0',
      borderActive: '#0ff',
      success: '#0f0',
      warning: '#ff0',
      error: '#f00',
      info: '#0ff'
    },
    fonts: {
      main: "'Courier New', monospace",
      console: "'Courier New', monospace",
      ui: "'Courier New', monospace"
    },
    borders: {
      style: 'solid',
      width: '1px',
      radius: '0'
    }
  },
  'fantasy': {
    name: 'Fantasy Adventure',
    colors: {
      primary: '#d4af37',
      secondary: '#8b4513',
      background: '#1a1410',
      backgroundAlt: '#2a241a',
      text: '#f4e4c1',
      textAlt: '#c9b78b',
      border: '#8b4513',
      borderActive: '#d4af37',
      success: '#4a7c4e',
      warning: '#d4af37',
      error: '#8b2635',
      info: '#4682b4'
    },
    fonts: {
      main: "'Cinzel', serif",
      console: "'EB Garamond', serif",
      ui: "'Cinzel', serif"
    },
    borders: {
      style: 'double',
      width: '3px',
      radius: '0'
    }
  },
  'scifi': {
    name: 'Sci-Fi Terminal',
    colors: {
      primary: '#00ffff',
      secondary: '#ff00ff',
      background: '#0a0a0f',
      backgroundAlt: '#1a1a2e',
      text: '#e0e0ff',
      textAlt: '#9090ff',
      border: '#00ffff',
      borderActive: '#ff00ff',
      success: '#00ff00',
      warning: '#ffff00',
      error: '#ff0040',
      info: '#00ffff'
    },
    fonts: {
      main: "'Orbitron', sans-serif",
      console: "'Share Tech Mono', monospace",
      ui: "'Exo 2', sans-serif"
    },
    borders: {
      style: 'solid',
      width: '2px',
      radius: '4px'
    }
  },
  'horror': {
    name: 'Horror',
    colors: {
      primary: '#8b0000',
      secondary: '#2f0000',
      background: '#0a0a0a',
      backgroundAlt: '#1a0a0a',
      text: '#c0c0c0',
      textAlt: '#808080',
      border: '#4a0000',
      borderActive: '#8b0000',
      success: '#2a4a2a',
      warning: '#8b4500',
      error: '#ff0000',
      info: '#4a4a6a'
    },
    fonts: {
      main: "'Creepster', cursive",
      console: "'Courier New', monospace",
      ui: "'Griffy', cursive"
    },
    borders: {
      style: 'solid',
      width: '1px',
      radius: '0'
    }
  },
  'minimal': {
    name: 'Minimal',
    colors: {
      primary: '#333',
      secondary: '#666',
      background: '#fff',
      backgroundAlt: '#f5f5f5',
      text: '#333',
      textAlt: '#666',
      border: '#ddd',
      borderActive: '#333',
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336',
      info: '#2196f3'
    },
    fonts: {
      main: "'Inter', sans-serif",
      console: "'JetBrains Mono', monospace",
      ui: "'Inter', sans-serif"
    },
    borders: {
      style: 'solid',
      width: '1px',
      radius: '8px'
    }
  }
};

// Predefined layouts for different game types
export const PREDEFINED_LAYOUTS: Record<string, UILayoutConfig> = {
  'classic-adventure': {
    layout: 'classic-four-panel',
    panels: {
      viewport: {
        visible: true,
        position: 'top',
        size: '30%',
        showRoomName: true,
        showDescription: true,
        showExits: true
      },
      party: {
        visible: true,
        position: 'left',
        size: '25%',
        showHealth: true,
        showStats: false
      },
      inventory: {
        visible: true,
        position: 'right',
        size: '25%'
      },
      actions: {
        visible: true,
        position: 'center',
        style: 'buttons'
      },
      console: {
        visible: true,
        position: 'bottom',
        size: '35%',
        enableHistory: true,
        enableAutocomplete: true
      }
    }
  },
  'text-only': {
    layout: 'console-only',
    panels: {
      viewport: { visible: false, showRoomName: false, showDescription: false, showExits: false },
      party: { visible: false, showHealth: false, showStats: false },
      inventory: { visible: false },
      actions: { visible: false, style: 'buttons' },
      console: {
        visible: true,
        position: 'center',
        size: '100%',
        maxLines: 100,
        enableHistory: true,
        enableAutocomplete: true,
        fontSize: '16px'
      }
    }
  },
  'roguelike': {
    layout: 'custom',
    panels: {
      viewport: {
        visible: false,
        showRoomName: false,
        showDescription: false,
        showExits: false
      },
      party: {
        visible: true,
        position: 'right',
        size: '20%',
        showHealth: true,
        showStats: true
      },
      inventory: {
        visible: true,
        position: 'bottom',
        size: '20%',
        quickSlots: 10
      },
      actions: {
        visible: true,
        style: 'hotkeys'
      },
      console: {
        visible: true,
        position: 'bottom',
        size: '20%',
        maxLines: 5
      },
      map: {
        visible: true,
        position: 'center',
        size: '60%',
        style: 'ascii',
        showFogOfWar: true
      }
    }
  }
};