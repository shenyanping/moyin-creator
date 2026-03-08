/**
 * Media Directory Sync
 * 当项目关联了本地目录时，将生成的图片/视频复制到目录的 media/ 子目录下。
 */
import { useProjectStore } from '@/stores/project-store';

type MediaType = 'images' | 'videos';

/**
 * 将已保存的本地媒体文件复制到项目关联目录的 media/ 下
 * 仅在项目有关联目录时执行，失败时静默（不阻断主流程）
 */
export async function syncMediaToDirectory(
  localPath: string,
  filename: string,
  mediaType: MediaType = 'images'
): Promise<void> {
  const state = useProjectStore.getState();
  const linkedDir = state.activeProject?.linkedDirectory;
  if (!linkedDir) return;

  const watcher = (window as any).directoryWatcher;
  if (!watcher?.copyMedia) return;

  try {
    const destDir = `${linkedDir}/media/${mediaType}`;
    await watcher.copyMedia(localPath, destDir, filename);
  } catch (err) {
    console.warn(`[MediaSync] Failed to copy ${filename} to project directory:`, err);
  }
}

/**
 * 从 local-image:// 路径中提取文件名
 */
export function extractFilenameFromLocalPath(localPath: string): string {
  if (localPath.startsWith('local-image://')) {
    const parts = localPath.replace('local-image://', '').split('/');
    return parts[parts.length - 1] || `media_${Date.now()}.png`;
  }
  return localPath.split('/').pop() || `media_${Date.now()}.png`;
}
