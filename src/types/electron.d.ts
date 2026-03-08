// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
export {};

declare global {
  interface Window {
    directoryFs?: {
      readdir: (dirPath: string) => Promise<string[]>;
      readFile: (filePath: string) => Promise<string>;
      exists: (p: string) => Promise<boolean>;
      mkdir: (dirPath: string) => Promise<void>;
      writeFile: (filePath: string, content: string) => Promise<void>;
    };
    directoryWatcher?: {
      openDialog: () => Promise<string | null>;
      startWatch: (dirPath: string) => Promise<boolean>;
      stopWatch: (dirPath: string) => Promise<boolean>;
      onFilesChanged: (callback: (event: any, data: { dirPath: string; files: string[] }) => void) => () => void;
      copyMedia: (srcLocalPath: string, destDir: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
    storageManager?: {
      getPaths: () => Promise<{ basePath: string; projectPath: string; mediaPath: string; cachePath: string }>;
      selectDirectory: () => Promise<string | null>;
      // Unified storage operations (single base path for projects + media)
      validateDataDir: (dirPath: string) => Promise<{ valid: boolean; projectCount?: number; mediaCount?: number; error?: string }>;
      moveData: (newPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      linkData: (dirPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      exportData: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      importData: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
      // Cache
      getCacheSize: () => Promise<{ total: number; details: Array<{ path: string; size: number }> }>;
      clearCache: (options?: { olderThanDays?: number }) => Promise<{ success: boolean; clearedBytes?: number; error?: string }>;
      updateConfig: (config: { autoCleanEnabled?: boolean; autoCleanDays?: number }) => Promise<boolean>;
    };
  }
}
