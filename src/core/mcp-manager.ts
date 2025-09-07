import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface MCPServerConfig {
  name: string;
  path: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPServerManager {
  private servers: Map<string, ChildProcess> = new Map();
  private configs: MCPServerConfig[] = [];
  private debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  registerServer(config: MCPServerConfig): void {
    this.configs.push(config);
  }

  async startServer(name: string): Promise<void> {
    const config = this.configs.find(c => c.name === name);
    if (!config) {
      throw new Error(`Server ${name} not found`);
    }

    if (this.servers.has(name)) {
      this.log(`Server ${name} already running`);
      return;
    }

    const serverPath = path.resolve(config.path);
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server file not found: ${serverPath}`);
    }

    const env = {
      ...process.env,
      DEBUG_MODE: this.debugMode ? 'true' : 'false',
      ...config.env
    };

    const child = spawn('tsx', [serverPath, ...(config.args || [])], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.on('error', (error) => {
      console.error(`Error starting ${name}:`, error);
    });

    child.on('exit', (code) => {
      this.log(`${name} exited with code ${code}`);
      this.servers.delete(name);
    });

    if (this.debugMode) {
      child.stderr?.on('data', (data) => {
        console.error(`[${name}]`, data.toString());
      });
    }

    this.servers.set(name, child);
    this.log(`Started server: ${name}`);
  }

  async startAll(): Promise<void> {
    for (const config of this.configs) {
      await this.startServer(config.name);
    }
  }

  stopServer(name: string): void {
    const server = this.servers.get(name);
    if (server) {
      server.kill();
      this.servers.delete(name);
      this.log(`Stopped server: ${name}`);
    }
  }

  stopAll(): void {
    for (const [name, server] of this.servers) {
      server.kill();
      this.log(`Stopped server: ${name}`);
    }
    this.servers.clear();
  }

  isRunning(name: string): boolean {
    return this.servers.has(name);
  }

  private log(...args: any[]): void {
    if (this.debugMode) {
      console.log('[MCPManager]', ...args);
    }
  }
}