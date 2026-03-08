/**
 * useDirectorySync - 监听关联目录的文件变更，增量同步到当前项目
 * 每次切换到关联了目录的项目时，会先做一次完整同步，之后再监听增量变更。
 * 同步期间暂停 writeback，防止循环。
 */
import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { syncDirectoryToProject } from '@/lib/script/directory-import-service';
import { useAssistantStore } from '@/stores/assistant-store';
import { setWritebackPaused } from './use-directory-writeback';
import { toast } from 'sonner';

export function useDirectorySync() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) => s.activeProject);
  const linkedDir = activeProject?.linkedDirectory;
  const cleanupRef = useRef<(() => void) | null>(null);
  const syncingRef = useRef(false);
  const lastSyncedDirRef = useRef<string | null>(null);

  const doSync = useCallback(
    async (dirPath: string, reason: string) => {
      if (!activeProjectId || syncingRef.current) return;
      syncingRef.current = true;
      setWritebackPaused(true);

      try {
        const result = await syncDirectoryToProject(dirPath, activeProjectId);

        if (result.updated) {
          const addNotice = useAssistantStore.getState().addSystemNotice;
          addNotice?.(`${reason}\n数据已同步到当前项目。`);

          if (result.warnings.length > 0) {
            toast.warning(`同步完成，有 ${result.warnings.length} 条警告`);
            console.warn('[DirectorySync] Warnings:', result.warnings);
          } else {
            toast.success('目录数据已同步');
          }
        }
      } catch (err) {
        console.error('[DirectorySync] Sync failed:', err);
        toast.error(`目录同步失败: ${(err as Error).message}`);
      } finally {
        // 延迟恢复 writeback，让 store 变更的副作用先完成
        setTimeout(() => setWritebackPaused(false), 3000);
        syncingRef.current = false;
      }
    },
    [activeProjectId]
  );

  const handleFilesChanged = useCallback(
    async (_event: any, data: { dirPath: string; files: string[] }) => {
      const fileNames = data.files.map((f) => f.split('/').pop()).join(', ');
      await doSync(data.dirPath, `项目目录文件已更新: ${fileNames}`);
    },
    [doSync]
  );

  useEffect(() => {
    if (!linkedDir || !activeProjectId) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      lastSyncedDirRef.current = null;
      return;
    }

    const watcher = (window as any).directoryWatcher;
    if (!watcher?.onFilesChanged) return;

    const dirKey = `${activeProjectId}:${linkedDir}`;
    if (lastSyncedDirRef.current !== dirKey) {
      lastSyncedDirRef.current = dirKey;
      doSync(linkedDir, '项目已打开，正在从关联目录同步数据...');
    }

    watcher.startWatch(linkedDir).catch(() => {});

    const unsub = watcher.onFilesChanged(handleFilesChanged);
    cleanupRef.current = () => {
      unsub();
      watcher.stopWatch(linkedDir).catch(() => {});
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [linkedDir, activeProjectId, handleFilesChanged, doSync]);
}
