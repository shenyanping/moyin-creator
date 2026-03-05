import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { EditSuggestion } from '@/stores/assistant-store';

interface RevertConfirmDialogProps {
  open: boolean;
  appliedSuggestions: EditSuggestion[];
  onRevertAndResend: () => void;
  onKeepAndResend: () => void;
  onCancel: () => void;
}

export function RevertConfirmDialog({
  open,
  appliedSuggestions,
  onRevertAndResend,
  onKeepAndResend,
  onCancel,
}: RevertConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>检测到已应用的修改</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                从此处重新发送将删除后续的对话记录。以下
                {appliedSuggestions.length} 项修改已被应用到项目中：
              </p>
              <ul className="text-xs space-y-1 pl-4 max-h-[120px] overflow-y-auto">
                {appliedSuggestions.map((sg) => (
                  <li key={sg.id} className="list-disc text-foreground/80">
                    {sg.action === 'add' ? '新增' : '修改'}{' '}
                    {sg.targetName}
                  </li>
                ))}
              </ul>
              <p>请选择处理方式：</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <Button variant="outline" onClick={onKeepAndResend}>
            保留修改，重新发送
          </Button>
          <AlertDialogAction
            onClick={onRevertAndResend}
            className="bg-orange-600 hover:bg-orange-700"
          >
            撤回修改，重新发送
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
