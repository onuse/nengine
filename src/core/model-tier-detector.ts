// VRAM Detection and Model Tier System
// Automatically selects best available model based on system capabilities

import { execSync } from 'child_process';
import * as os from 'os';

export interface ModelTier {
  name: string;
  vramRequired: number; // GB
  models: {
    primary: string;
    fallback: string;
    uncensored?: string;
  };
  description: string;
}

export interface VRAMInfo {
  totalVRAM: number; // GB
  availableVRAM: number; // GB
  gpuName: string;
  detectionMethod: string;
}

export class ModelTierDetector {
  private static modelTiers: ModelTier[] = [
    {
      name: "infinite",
      vramRequired: 512,
      models: {
        primary: "llama3.1:405b",
        fallback: "claude-3-opus",
        uncensored: "goliath:120b"
      },
      description: "Unlimited VRAM - Best possible models"
    },
    {
      name: "enterprise", 
      vramRequired: 256,
      models: {
        primary: "llama3.1:70b",
        fallback: "mixtral:8x22b",
        uncensored: "goliath:120b"
      },
      description: "256GB+ VRAM - Enterprise/Research grade"
    },
    {
      name: "workstation_high",
      vramRequired: 128,
      models: {
        primary: "llama3.1:70b-q4_K_M",
        fallback: "mixtral:8x22b-q4_K_M", 
        uncensored: "wizard-vicuna:30b-uncensored"
      },
      description: "128GB VRAM - High-end workstation"
    },
    {
      name: "workstation",
      vramRequired: 64,
      models: {
        primary: "llama3.1:70b-q8_0",
        fallback: "mixtral:8x7b",
        uncensored: "wizard-vicuna:30b-uncensored-q4_K_M"
      },
      description: "64GB VRAM - Professional workstation"
    },
    {
      name: "prosumer_high", 
      vramRequired: 32,
      models: {
        primary: "llama3.1:70b-q4_K_M",
        fallback: "mixtral:8x7b-q4_K_M",
        uncensored: "nous-hermes2:34b-uncensored"
      },
      description: "32GB VRAM - High-end prosumer (RTX 6000 Ada)"
    },
    {
      name: "prosumer_ultra",
      vramRequired: 32,
      models: {
        primary: "llama3.1:70b-q4_K_M",
        fallback: "llama3.1:32b",
        uncensored: "nous-hermes2:70b-uncensored-q4_K_M"
      },
      description: "32GB VRAM - Ultra prosumer (RTX 5090, H100)"
    },
    {
      name: "prosumer",
      vramRequired: 24,
      models: {
        primary: "llama3.1:32b",
        fallback: "mixtral:8x7b-q4_K_M", 
        uncensored: "nous-hermes2:34b-uncensored-q4_K_M"
      },
      description: "24GB VRAM - Prosumer (RTX 4090, RTX A6000)"
    },
    {
      name: "enthusiast",
      vramRequired: 16,
      models: {
        primary: "llama3.1:13b",
        fallback: "mixtral:8x7b-q4_K_M",
        uncensored: "nous-hermes2:13b-uncensored"
      },
      description: "16GB VRAM - Enthusiast (RTX 4080, RTX A4000)"
    },
    {
      name: "gaming_high",
      vramRequired: 12,
      models: {
        primary: "llama3.1:8b",
        fallback: "mistral:7b-instruct",
        uncensored: "nous-hermes2:10.7b-solar-uncensored"
      },
      description: "12GB VRAM - High gaming (RTX 4070 Ti, RTX 3080 Ti)"
    },
    {
      name: "gaming",
      vramRequired: 8,
      models: {
        primary: "llama3.1:8b-q4_K_M",
        fallback: "mistral:7b-instruct-q4_K_M",
        uncensored: "nous-hermes2:7b-dpo-q4_K_M"
      },
      description: "8GB VRAM - Gaming (RTX 4060 Ti, RTX 3070)"
    },
    {
      name: "budget",
      vramRequired: 6,
      models: {
        primary: "phi3:mini",
        fallback: "gemma2:9b-q4_K_M", 
        uncensored: "openchat:7b-q4_K_M"
      },
      description: "6GB VRAM - Budget gaming (RTX 4060, RTX 3060)"
    },
    {
      name: "minimal",
      vramRequired: 4,
      models: {
        primary: "phi3:mini-q4_K_M",
        fallback: "tinyllama:1.1b",
        uncensored: "vicuna:7b-uncensored-q2_K"
      },
      description: "4GB VRAM - Minimal/Testing (GTX 1660, RTX 3050)"
    }
  ];

  static async detectVRAM(): Promise<VRAMInfo> {
    try {
      // Try NVIDIA first (most common for AI)
      const nvidiaSmi = await this.tryNvidiaSmi();
      if (nvidiaSmi) return nvidiaSmi;

      // Try AMD
      const amdInfo = await this.tryAMDInfo();
      if (amdInfo) return amdInfo;

      // Try Intel Arc
      const intelInfo = await this.tryIntelInfo();
      if (intelInfo) return intelInfo;

      // Fallback to system RAM estimation
      return this.estimateFromSystemRAM();

    } catch (error) {
      console.warn('[ModelTierDetector] VRAM detection failed, using conservative estimate');
      return {
        totalVRAM: 8,
        availableVRAM: 6,
        gpuName: "Unknown GPU",
        detectionMethod: "fallback"
      };
    }
  }

  private static async tryNvidiaSmi(): Promise<VRAMInfo | null> {
    try {
      const output = execSync('nvidia-smi --query-gpu=memory.total,memory.free,name --format=csv,noheader,nounits', 
        { encoding: 'utf8', timeout: 5000 });
      
      const lines = output.trim().split('\n');
      const [totalMB, freeMB, gpuName] = lines[0].split(', ');
      
      return {
        totalVRAM: Math.floor(parseInt(totalMB) / 1024),
        availableVRAM: Math.floor(parseInt(freeMB) / 1024),
        gpuName: gpuName.trim(),
        detectionMethod: "nvidia-smi"
      };
    } catch {
      return null;
    }
  }

  private static async tryAMDInfo(): Promise<VRAMInfo | null> {
    try {
      // Try rocm-smi for AMD
      const output = execSync('rocm-smi --showmeminfo vram', 
        { encoding: 'utf8', timeout: 5000 });
      
      // Parse AMD output (format varies)
      const vramMatch = output.match(/(\d+)\s*MB/);
      if (vramMatch) {
        const totalVRAM = Math.floor(parseInt(vramMatch[1]) / 1024);
        return {
          totalVRAM,
          availableVRAM: Math.floor(totalVRAM * 0.8), // Estimate 80% available
          gpuName: "AMD GPU",
          detectionMethod: "rocm-smi"
        };
      }
    } catch {
      // Try alternative AMD detection
      try {
        const lspci = execSync('lspci | grep -i "vga\\|3d\\|display"', { encoding: 'utf8' });
        if (lspci.toLowerCase().includes('amd') || lspci.toLowerCase().includes('radeon')) {
          return {
            totalVRAM: 8, // Conservative estimate for AMD
            availableVRAM: 6,
            gpuName: "AMD GPU (estimated)",
            detectionMethod: "lspci-amd"
          };
        }
      } catch {}
    }
    return null;
  }

  private static async tryIntelInfo(): Promise<VRAMInfo | null> {
    try {
      const lspci = execSync('lspci | grep -i "vga\\|3d\\|display"', { encoding: 'utf8' });
      if (lspci.toLowerCase().includes('intel')) {
        // Intel Arc or integrated - usually shares system RAM
        const totalRAM = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
        const estimatedVRAM = Math.min(Math.floor(totalRAM * 0.25), 16); // Max 25% of RAM or 16GB
        
        return {
          totalVRAM: estimatedVRAM,
          availableVRAM: Math.floor(estimatedVRAM * 0.8),
          gpuName: "Intel GPU (shared memory)",
          detectionMethod: "intel-estimate"
        };
      }
    } catch {}
    return null;
  }

  private static estimateFromSystemRAM(): VRAMInfo {
    const totalRAM = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
    
    // Conservative estimates based on system RAM
    let estimatedVRAM: number;
    if (totalRAM >= 64) estimatedVRAM = 16; // High-end system probably has good GPU
    else if (totalRAM >= 32) estimatedVRAM = 8;  // Mid-range system
    else if (totalRAM >= 16) estimatedVRAM = 6;  // Budget gaming
    else estimatedVRAM = 4; // Minimal system

    return {
      totalVRAM: estimatedVRAM,
      availableVRAM: Math.floor(estimatedVRAM * 0.75),
      gpuName: "Estimated from system RAM",
      detectionMethod: "ram-estimate"
    };
  }

  static selectOptimalTier(vramInfo: VRAMInfo, preferUncensored: boolean = false): ModelTier {
    // Use available VRAM with some safety margin
    const usableVRAM = Math.floor(vramInfo.availableVRAM * 0.9);
    
    // Find the best tier that fits
    for (const tier of this.modelTiers) {
      if (tier.vramRequired <= usableVRAM) {
        console.log(`[ModelTierDetector] Selected tier: ${tier.name} (${tier.vramRequired}GB required, ${usableVRAM}GB available)`);
        return tier;
      }
    }

    // Fallback to minimal tier
    return this.modelTiers[this.modelTiers.length - 1];
  }

  static getRecommendedModel(vramInfo: VRAMInfo, preferUncensored: boolean = false, gameOverrides?: any): string {
    const tier = this.selectOptimalTier(vramInfo, preferUncensored);
    
    // Check for game-specific model overrides
    if (gameOverrides?.modelTiers) {
      const gameSpecificTier = gameOverrides.modelTiers[tier.name];
      if (gameSpecificTier) {
        if (preferUncensored && gameSpecificTier.uncensored) {
          return gameSpecificTier.uncensored;
        }
        if (gameSpecificTier.primary) {
          return gameSpecificTier.primary;
        }
      }
    }
    
    // Fallback to system defaults
    if (preferUncensored && tier.models.uncensored) {
      return tier.models.uncensored;
    }
    
    return tier.models.primary;
  }

  static async autoDetectAndConfigure(preferUncensored: boolean = false, gameOverrides?: any): Promise<{
    vramInfo: VRAMInfo;
    selectedTier: ModelTier;
    recommendedModel: string;
    fallbackModel: string;
  }> {
    const vramInfo = await this.detectVRAM();
    const selectedTier = this.selectOptimalTier(vramInfo, preferUncensored);
    
    const recommendedModel = this.getRecommendedModel(vramInfo, preferUncensored, gameOverrides);
    
    // Get fallback model (with game overrides)
    let fallbackModel = selectedTier.models.fallback;
    if (gameOverrides?.modelTiers?.[selectedTier.name]?.fallback) {
      fallbackModel = gameOverrides.modelTiers[selectedTier.name].fallback;
    }

    console.log(`[ModelTierDetector] VRAM Detection Results:`);
    console.log(`  GPU: ${vramInfo.gpuName}`);
    console.log(`  Total VRAM: ${vramInfo.totalVRAM}GB`);
    console.log(`  Available VRAM: ${vramInfo.availableVRAM}GB`);
    console.log(`  Detection Method: ${vramInfo.detectionMethod}`);
    console.log(`  Selected Tier: ${selectedTier.name} - ${selectedTier.description}`);
    console.log(`  Recommended Model: ${recommendedModel}`);
    console.log(`  Fallback Model: ${fallbackModel}`);

    return {
      vramInfo,
      selectedTier,
      recommendedModel,
      fallbackModel
    };
  }

  static getAllTiers(): ModelTier[] {
    return [...this.modelTiers];
  }

  static getTierByName(name: string): ModelTier | undefined {
    return this.modelTiers.find(tier => tier.name === name);
  }
}