import { cn } from '@/lib/utils';
import { User, Bot, Loader2, Pencil } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/stores/assistant-store';
import { DiffPreview } from './DiffPreview';

interface ChatMessageProps {
  message: ChatMessageType;
  onApply?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
  onRevert?: (suggestionId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  isLastUserMessage?: boolean;
}

export function ChatMessage({ message, onApply, onReject, onRevert, onEdit, isLastUserMessage }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';

  return (
    <div className={cn('group flex gap-2.5 px-3 py-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col gap-1.5 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div className="relative">
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
              isError && 'bg-destructive/10 text-destructive'
            )}
          >
            {message.content || (isStreaming && <Loader2 className="w-3.5 h-3.5 animate-spin" />)}
            {isStreaming && message.content && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse" />
            )}
          </div>
          {isUser && message.status === 'done' && (
            <button
              onClick={() => onEdit?.(message.id, message.content)}
              className="absolute -bottom-1 -left-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-background border border-border shadow-sm hover:bg-muted"
              title={isLastUserMessage ? '重新编辑' : '从此处重新编辑'}
            >
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Edit suggestions */}
        {message.editSuggestions && message.editSuggestions.length > 0 && (
          <div className="w-full space-y-2 mt-1">
            {message.editSuggestions.map((suggestion) => (
              <DiffPreview
                key={suggestion.id}
                suggestion={suggestion}
                onApply={() => onApply?.(suggestion.id)}
                onReject={() => onReject?.(suggestion.id)}
                onRevert={() => onRevert?.(suggestion.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
