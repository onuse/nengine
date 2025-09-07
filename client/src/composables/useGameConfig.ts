import { ref, computed } from 'vue';

// Import types (we'll share them between client and server)
interface UITheme {
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  borders: {
    style: string;
    width: string;
    radius: string;
  };
}

interface GameConfig {
  game: {
    title: string;
    description: string;
  };
  ui: {
    theme: string | UITheme;
    layout: any;
    features: Record<string, boolean>;
    input: any;
  };
}

const gameConfig = ref<GameConfig | null>(null);
const isLoading = ref(true);

export function useGameConfig() {
  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      gameConfig.value = await response.json();
      applyTheme(gameConfig.value?.ui?.theme);
      isLoading.value = false;
    } catch (error) {
      console.error('Failed to load game config:', error);
      // Use default config
      gameConfig.value = getDefaultConfig();
      isLoading.value = false;
    }
  };

  const applyTheme = (theme: string | UITheme | undefined) => {
    if (!theme) return;
    
    const themeObj = typeof theme === 'string' 
      ? getPredefinedTheme(theme) 
      : theme;
    
    if (!themeObj) return;

    // Apply CSS variables
    const root = document.documentElement;
    
    // Colors
    Object.entries(themeObj.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
    
    // Fonts
    Object.entries(themeObj.fonts).forEach(([key, value]) => {
      root.style.setProperty(`--font-${key}`, value);
    });
    
    // Borders
    root.style.setProperty('--border-style', themeObj.borders.style);
    root.style.setProperty('--border-width', themeObj.borders.width);
    root.style.setProperty('--border-radius', themeObj.borders.radius);
  };

  const getPredefinedTheme = (name: string): UITheme | null => {
    const themes: Record<string, UITheme> = {
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
      }
    };
    
    return themes[name] || null;
  };

  const getDefaultConfig = (): GameConfig => ({
    game: {
      title: 'Narrative Engine',
      description: 'A text adventure'
    },
    ui: {
      theme: 'retro-green',
      layout: {
        type: 'classic-adventure',
        panels: {
          viewport: { visible: true },
          party: { visible: true },
          inventory: { visible: true },
          actions: { visible: true },
          console: { visible: true }
        }
      },
      features: {
        enableSound: false,
        enableMusic: false,
        enableAnimations: true
      },
      input: {
        primaryInput: 'both'
      }
    }
  });

  const isPanelVisible = (panelName: string): boolean => {
    return gameConfig.value?.ui?.layout?.panels?.[panelName]?.visible ?? false;
  };

  const getPanelConfig = (panelName: string): any => {
    return gameConfig.value?.ui?.layout?.panels?.[panelName] || {};
  };

  const getFeature = (featureName: string): boolean => {
    return gameConfig.value?.ui?.features?.[featureName] ?? false;
  };

  const getGameTitle = computed(() => gameConfig.value?.game?.title || 'Narrative Engine');

  return {
    gameConfig,
    isLoading,
    loadConfig,
    applyTheme,
    isPanelVisible,
    getPanelConfig,
    getFeature,
    getGameTitle
  };
}