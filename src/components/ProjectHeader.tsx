// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ProjectHeader - Top bar showing project name and save status
 * Based on CineGen-AI App.tsx auto-save pattern
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useScriptStore } from "@/stores/script-store";
import { useMediaPanelStore, stages } from "@/stores/media-panel-store";
import { Cloud, CloudOff, Loader2, Check, FolderSync, FolderOutput, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportProjectToDirectory } from "@/lib/script/directory-export-service";
import { toast } from "sonner";

export type SaveStatus = "saved" | "saving" | "unsaved";

export function ProjectHeader() {
  const { activeProject } = useProjectStore();
  const { activeStage } = useMediaPanelStore();
  const scriptStore = useScriptStore();
  
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Get current project data for change detection
  const projectId = activeProject?.id;
  const scriptProject = projectId ? scriptStore.projects[projectId] : null;
  const currentUpdatedAt = scriptProject?.updatedAt || 0;

  // Auto-save effect with 1s debounce
  useEffect(() => {
    if (!projectId || currentUpdatedAt === 0) return;
    
    // Skip if this is the first mount or no actual change
    if (lastUpdateRef.current === currentUpdatedAt) return;
    
    // Mark as unsaved
    setSaveStatus("unsaved");
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for saving
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus("saving");
      
      // Simulate save (Zustand persist handles actual storage)
      setTimeout(() => {
        setSaveStatus("saved");
        lastUpdateRef.current = currentUpdatedAt;
      }, 300);
    }, 1000); // 1s debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectId, currentUpdatedAt]);

  // Get current stage info
  const currentStageConfig = stages.find(s => s.id === activeStage);

  return (
    <div className="h-10 bg-[#0f0f0f] border-b border-zinc-800 px-4 flex items-center justify-between shrink-0">
      {/* Left: Project Name + Stage */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white truncate max-w-[200px]">
          {activeProject?.name || "未命名项目"}
        </span>
        {currentStageConfig && (
          <>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-500 font-mono">
              {currentStageConfig.phase}
            </span>
            <span className="text-xs text-zinc-400">
              {currentStageConfig.label}
            </span>
          </>
        )}
      </div>

      {/* Right: Directory Sync + Save Status */}
      <div className="flex items-center gap-2">
        <DirectorySyncButton projectId={projectId} />
        <SaveStatusIndicator status={saveStatus} />
      </div>
    </div>
  );
}

function DirectorySyncButton({ projectId }: { projectId?: string }) {
  const linkedDir = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)?.linkedDirectory
  );
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (!projectId || !linkedDir || syncing) return;
    setSyncing(true);
    try {
      const result = await exportProjectToDirectory(projectId, linkedDir);
      toast.success(`已同步 ${result.fileCount} 个文件到目录`);
    } catch (err: any) {
      toast.error(`同步失败: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [projectId, linkedDir, syncing]);

  const handleLink = useCallback(async () => {
    if (!projectId) return;
    const watcher = (window as any).directoryWatcher;
    if (!watcher?.openDialog) {
      toast.error("此功能需要桌面端");
      return;
    }
    const dirPath = await watcher.openDialog();
    if (!dirPath) return;

    setSyncing(true);
    try {
      const result = await exportProjectToDirectory(projectId, dirPath);
      useProjectStore.getState().setLinkedDirectory(projectId, dirPath);
      await watcher.startWatch(dirPath);
      toast.success(`已导出 ${result.fileCount} 个文件并关联目录`);
    } catch (err: any) {
      toast.error(`导出失败: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [projectId]);

  const handleUnlink = useCallback(() => {
    if (!projectId) return;
    const watcher = (window as any).directoryWatcher;
    if (linkedDir && watcher?.stopWatch) {
      watcher.stopWatch(linkedDir).catch(() => {});
    }
    useProjectStore.getState().setLinkedDirectory(projectId, undefined);
    toast.success("已取消目录关联");
  }, [projectId, linkedDir]);

  if (!projectId) return null;

  if (!linkedDir) {
    return (
      <button
        onClick={handleLink}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        title="导出并关联项目目录"
      >
        <FolderOutput className="w-3 h-3" />
        <span>导出到目录</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleSync}
        disabled={syncing}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors",
          syncing
            ? "text-yellow-500/70 bg-yellow-500/5"
            : "text-blue-400/70 bg-blue-500/5 hover:text-blue-300 hover:bg-blue-500/10"
        )}
        title={`同步到: ${linkedDir}`}
      >
        {syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <FolderSync className="w-3 h-3" />
        )}
        <span>{syncing ? "同步中..." : "同步到目录"}</span>
      </button>
      <button
        onClick={handleUnlink}
        className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50 transition-colors"
        title="取消目录关联"
      >
        <Link2Off className="w-3 h-3" />
      </button>
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors",
        status === "saved" && "text-green-500/70 bg-green-500/5",
        status === "saving" && "text-yellow-500/70 bg-yellow-500/5",
        status === "unsaved" && "text-zinc-500 bg-zinc-800/50"
      )}
    >
      {status === "saved" && (
        <>
          <Check className="w-3 h-3" />
          <span>Saved</span>
        </>
      )}
      {status === "saving" && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Saving...</span>
        </>
      )}
      {status === "unsaved" && (
        <>
          <CloudOff className="w-3 h-3" />
          <span>Unsaved</span>
        </>
      )}
    </div>
  );
}
