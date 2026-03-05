import { cn } from '@/lib/utils';
import { Check, X, ChevronDown, ChevronRight, Plus, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { EditSuggestion } from '@/stores/assistant-store';

const TARGET_TYPE_LABELS: Record<string, string> = {
  character: '角色',
  scene: '场景',
  episode: '剧集',
  shot: '分镜',
};

const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  gender: '性别',
  age: '年龄',
  personality: '性格',
  role: '身份',
  traits: '特质',
  skills: '技能',
  keyActions: '关键事迹',
  appearance: '外貌',
  visualPromptEn: '英文视觉提示词',
  visualPromptZh: '中文视觉提示词',
  relationships: '关系',
  tags: '标签',
  notes: '备注',
  location: '地点',
  time: '时间',
  atmosphere: '氛围',
  visualPrompt: '视觉提示词',
  architectureStyle: '建筑风格',
  lightingDesign: '光影设计',
  colorPalette: '色彩基调',
  title: '标题',
  description: '描述',
};

interface DiffPreviewProps {
  suggestion: EditSuggestion;
  onApply?: () => void;
  onReject?: () => void;
  onRevert?: () => void;
}

export function DiffPreview({ suggestion, onApply, onReject, onRevert }: DiffPreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const typeLabel = TARGET_TYPE_LABELS[suggestion.targetType] || suggestion.targetType;
  const isAdd = suggestion.action === 'add';

  return (
    <div
      className={cn(
        'rounded-lg border text-sm overflow-hidden',
        suggestion.applied
          ? 'border-green-500/30 bg-green-500/5'
          : isAdd
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-border bg-card'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
        {isAdd ? (
          <Plus className="w-3 h-3 text-blue-500 flex-shrink-0" />
        ) : (
          <Pencil className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {isAdd ? '新增' : ''}{typeLabel}
        </span>
        <span className="font-medium truncate">{suggestion.targetName}</span>
        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
          {suggestion.changes.length} 个字段
        </span>
        {suggestion.applied && (
          <span className="text-xs text-green-600 font-medium flex-shrink-0">已应用</span>
        )}
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="border-t border-border">
          {suggestion.changes.map((change, idx) => {
            const fieldLabel = FIELD_LABELS[change.field] || change.field;
            const beforeStr = formatValue(change.before);
            const afterStr = formatValue(change.after);
            const hasBefore = !isAdd && change.before !== undefined && change.before !== null;

            return (
              <div key={idx} className="px-3 py-2 border-b border-border last:border-b-0">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {fieldLabel}
                </div>
                {hasBefore && beforeStr && (
                  <div className="flex gap-1.5 mb-1">
                    <span className="text-xs text-red-500 font-mono flex-shrink-0">-</span>
                    <span className="text-xs text-red-600 dark:text-red-400 line-through opacity-70 break-words">
                      {beforeStr}
                    </span>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <span className={cn("text-xs font-mono flex-shrink-0", isAdd ? "text-blue-500" : "text-green-500")}>+</span>
                  <span className={cn("text-xs break-words", isAdd ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400")}>
                    {afterStr}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Action buttons */}
          {!suggestion.applied ? (
            <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30">
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-3 h-3" />
                拒绝
              </button>
              <button
                onClick={onApply}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {isAdd ? <Plus className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                {isAdd ? '确认新增' : '应用修改'}
              </button>
            </div>
          ) : suggestion.snapshot && (
            <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30">
              <button
                onClick={onRevert}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              >
                <Undo2 className="w-3 h-3" />
                撤回
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(空)';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
