import * as git from 'isomorphic-git';
import * as fs from 'fs';
import * as path from 'path';
import { GitContext } from '../types/core';
import { GameSaveMetadata, ContentHasher } from './content-hasher';

export interface Commit {
  hash: string;
  branch: string;
  message: string;
  timestamp: number;
  changes: any;
}

export class GitManager {
  public repoPath: string;
  private currentBranch: string = 'main';
  private author = {
    name: 'Narrative Engine',
    email: 'engine@nengine.local'
  };

  constructor(repoPath: string = './game-state') {
    this.repoPath = path.resolve(repoPath);
    this.initRepository();
  }

  private async initRepository(): Promise<void> {
    if (!fs.existsSync(this.repoPath)) {
      fs.mkdirSync(this.repoPath, { recursive: true });
    }

    const gitDir = path.join(this.repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      await git.init({
        fs,
        dir: this.repoPath,
        defaultBranch: 'main'
      });

      const readmePath = path.join(this.repoPath, 'README.md');
      fs.writeFileSync(readmePath, '# Narrative Engine Game State\n\nThis directory contains the versioned game state.\n');
      
      await git.add({
        fs,
        dir: this.repoPath,
        filepath: 'README.md'
      });

      await git.commit({
        fs,
        dir: this.repoPath,
        message: 'Initial commit',
        author: this.author
      });
    }
  }

  async saveState(message: string, data: any, metadata?: GameSaveMetadata): Promise<string> {
    const timestamp = Date.now();
    const filename = `state_${timestamp}.json`;
    const filepath = path.join(this.repoPath, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    await git.add({
      fs,
      dir: this.repoPath,
      filepath: filename
    });

    // If metadata provided, save it to .meta.json and commit it too
    if (metadata) {
      ContentHasher.saveMetadata(this.repoPath, metadata);

      await git.add({
        fs,
        dir: this.repoPath,
        filepath: '.meta.json'
      });
    }

    const sha = await git.commit({
      fs,
      dir: this.repoPath,
      message,
      author: this.author
    });

    // Update metadata with latest commit hash if metadata was provided
    if (metadata) {
      metadata.lastCommit = sha;
      metadata.lastPlayed = new Date().toISOString();
      ContentHasher.saveMetadata(this.repoPath, metadata);
    }

    return sha;
  }

  async loadState(commitHash?: string): Promise<any> {
    if (commitHash) {
      await git.checkout({
        fs,
        dir: this.repoPath,
        ref: commitHash
      });
    }

    const files = fs.readdirSync(this.repoPath)
      .filter(f => f.startsWith('state_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return null;
    }

    const latestFile = path.join(this.repoPath, files[0]);
    const content = fs.readFileSync(latestFile, 'utf-8');
    return JSON.parse(content);
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await git.currentBranch({
      fs,
      dir: this.repoPath
    });
    return branch || 'main';
  }

  async getBranches(): Promise<string[]> {
    const branches = await git.listBranches({
      fs,
      dir: this.repoPath
    });
    return branches;
  }

  async createBranch(name: string, fromCommit?: string): Promise<void> {
    await git.branch({
      fs,
      dir: this.repoPath,
      ref: name,
      checkout: true,
      object: fromCommit
    });
    this.currentBranch = name;
  }

  async switchBranch(branch: string): Promise<void> {
    await git.checkout({
      fs,
      dir: this.repoPath,
      ref: branch
    });
    this.currentBranch = branch;
  }

  async getHistory(branch?: string, limit: number = 10): Promise<Commit[]> {
    const commits = await git.log({
      fs,
      dir: this.repoPath,
      ref: branch || this.currentBranch,
      depth: limit
    });

    return commits.map(c => ({
      hash: c.oid,
      branch: branch || this.currentBranch,
      message: c.commit.message,
      timestamp: c.commit.committer.timestamp * 1000,
      changes: {}
    }));
  }

  async cherryPick(commits: string[]): Promise<void> {
    for (const commitHash of commits) {
      const commit = await git.readCommit({
        fs,
        dir: this.repoPath,
        oid: commitHash
      });

      const tree = await git.readTree({
        fs,
        dir: this.repoPath,
        oid: commit.commit.tree
      });

      for (const entry of tree.tree) {
        if (entry.type === 'blob' && entry.path.startsWith('state_')) {
          const blob = await git.readBlob({
            fs,
            dir: this.repoPath,
            oid: entry.oid
          });

          const content = Buffer.from(blob.blob).toString('utf-8');
          const filepath = path.join(this.repoPath, entry.path);
          fs.writeFileSync(filepath, content);

          await git.add({
            fs,
            dir: this.repoPath,
            filepath: entry.path
          });
        }
      }

      await git.commit({
        fs,
        dir: this.repoPath,
        message: `Cherry-pick: ${commit.commit.message}`,
        author: this.author
      });
    }
  }

  async getDiff(from: string, to: string): Promise<any> {
    const fromCommit = await git.readCommit({
      fs,
      dir: this.repoPath,
      oid: from
    });

    const toCommit = await git.readCommit({
      fs,
      dir: this.repoPath,
      oid: to
    });

    return {
      from: fromCommit.oid,
      to: toCommit.oid,
      fromMessage: fromCommit.commit.message,
      toMessage: toCommit.commit.message
    };
  }

  getContext(): GitContext {
    return {
      branch: this.currentBranch,
      commit: '',
      message: ''
    };
  }

  /**
   * Load metadata from .meta.json in the save directory
   */
  async loadMetadata(): Promise<GameSaveMetadata | null> {
    return ContentHasher.loadMetadata(this.repoPath);
  }

  /**
   * Save metadata to .meta.json in the save directory
   */
  async saveMetadata(metadata: GameSaveMetadata): Promise<void> {
    ContentHasher.saveMetadata(this.repoPath, metadata);
  }

  /**
   * Get latest commit hash
   */
  async getLatestCommit(): Promise<string> {
    try {
      const commits = await this.getHistory(this.currentBranch, 1);
      return commits.length > 0 ? commits[0].hash : '';
    } catch {
      return '';
    }
  }

  /**
   * Check if save directory has any commits (not counting initial README)
   */
  async hasSaves(): Promise<boolean> {
    try {
      const commits = await this.getHistory(this.currentBranch, 10);
      // If more than 1 commit, we have saves (first is always README)
      return commits.length > 1;
    } catch {
      return false;
    }
  }
}