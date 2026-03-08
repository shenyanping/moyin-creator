import { useRef, useEffect, useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useAssistantStore, type EditSuggestion } from '@/stores/assistant-store';
import { ChatMessage } from './ChatMessage';
import { RevertConfirmDialog } from './RevertConfirmDialog';
import { Send, Trash2, Square, PanelRightClose, X } from 'lucide-react';
import { buildEditContext, serializeContext } from '@/lib/ai/context-builder';
import { getAssistantSystemPrompt } from '@/lib/ai/assistant-prompt';
import { callChatStream } from '@/lib/ai/chat-stream';
import { parseEditResponse, buildSuggestions, applySuggestion, revertSuggestion } from '@/lib/ai/edit-router';
import { isFeatureReady } from '@/lib/ai/feature-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AssistantPanel() {
  const {
    isOpen,
    setOpen,
    messages,
    isStreaming,
    editingMessageId,
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    appendAssistantContent,
    setEditSuggestions,
    markSuggestionApplied,
    markSuggestionReverted,
    setStreaming,
    clearHistory,
    setEditingMessage,
    truncateFromMessage,
    getAppliedSuggestionsAfter,
  } = useAssistantStore();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [pendingAppliedSuggestions, setPendingAppliedSuggestions] = useState<EditSuggestion[]>([]);

  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length !== prevMessageCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [setStreaming]);

  const doSend = useCallback(async (text: string) => {
    if (!isFeatureReady('script_analysis')) {
      toast.error('请先在设置中为「剧本分析」功能绑定 API 供应商');
      return;
    }

    addUserMessage(text);
    const assistantMsgId = addAssistantMessage();
    setStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const ctx = buildEditContext();
      const contextBlock = serializeContext(ctx);
      const systemPrompt = getAssistantSystemPrompt(contextBlock);

      const fullText = await callChatStream(systemPrompt, text, {
        feature: 'script_analysis',
        temperature: 0.7,
        maxTokens: 4096,
        signal: abortController.signal,
        onToken: (token) => {
          appendAssistantContent(assistantMsgId, token);
        },
      });

      const editResponse = parseEditResponse(fullText);

      updateAssistantMessage(assistantMsgId, {
        content: editResponse.reply || fullText,
        status: 'done',
      });

      if (editResponse.edits && editResponse.edits.length > 0) {
        const suggestions = buildSuggestions(editResponse.edits, ctx);
        if (suggestions.length > 0) {
          setEditSuggestions(assistantMsgId, suggestions);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateAssistantMessage(assistantMsgId, { status: 'done' });
      } else {
        console.error('[AssistantPanel] Error:', err);
        updateAssistantMessage(assistantMsgId, {
          content: `出错了: ${err.message || '未知错误'}`,
          status: 'error',
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    appendAssistantContent,
    setEditSuggestions,
    setStreaming,
  ]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    if (editingMessageId) {
      const applied = getAppliedSuggestionsAfter(editingMessageId);
      if (applied.length > 0) {
        setPendingAppliedSuggestions(applied);
        setRevertDialogOpen(true);
        return;
      }
      truncateFromMessage(editingMessageId);
    }

    setInput('');
    doSend(trimmed);
  }, [input, isStreaming, editingMessageId, getAppliedSuggestionsAfter, truncateFromMessage, doSend]);

  const handleRevertAndResend = useCallback(() => {
    setRevertDialogOpen(false);
    for (const sg of pendingAppliedSuggestions) {
      if (sg.snapshot) {
        revertSuggestion(sg.snapshot);
      }
    }
    const text = input.trim();
    if (editingMessageId) {
      truncateFromMessage(editingMessageId);
    }
    setPendingAppliedSuggestions([]);
    setInput('');
    if (text) doSend(text);
  }, [pendingAppliedSuggestions, input, editingMessageId, truncateFromMessage, doSend]);

  const handleKeepAndResend = useCallback(() => {
    setRevertDialogOpen(false);
    const text = input.trim();
    if (editingMessageId) {
      truncateFromMessage(editingMessageId);
    }
    setPendingAppliedSuggestions([]);
    setInput('');
    if (text) doSend(text);
  }, [input, editingMessageId, truncateFromMessage, doSend]);

  const handleDialogCancel = useCallback(() => {
    setRevertDialogOpen(false);
    setPendingAppliedSuggestions([]);
  }, []);

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    if (isStreaming) return;
    setEditingMessage(messageId);
    setInput(content);
    inputRef.current?.focus();
  }, [isStreaming, setEditingMessage]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setInput('');
  }, [setEditingMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = useCallback(
    (messageId: string, suggestionId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      const suggestion = msg?.editSuggestions?.find((s) => s.id === suggestionId);
      if (!suggestion || suggestion.applied) return;

      const result = applySuggestion(suggestion);
      if (result.success) {
        markSuggestionApplied(messageId, suggestionId, result.snapshot);
        const verb = suggestion.action === 'add' ? '新增' : '修改';
        toast.success(`已${verb}「${suggestion.targetName}」`);
      } else {
        toast.error('操作失败，请检查数据');
      }
    },
    [messages, markSuggestionApplied]
  );

  const handleRevert = useCallback(
    (messageId: string, suggestionId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      const suggestion = msg?.editSuggestions?.find((s) => s.id === suggestionId);
      if (!suggestion || !suggestion.applied || !suggestion.snapshot) return;

      const success = revertSuggestion(suggestion.snapshot);
      if (success) {
        markSuggestionReverted(messageId, suggestionId);
        const verb = suggestion.action === 'add' ? '新增' : '修改';
        toast.success(`已撤回「${suggestion.targetName}」的${verb}`);
      } else {
        toast.error('撤回失败，请检查数据');
      }
    },
    [messages, markSuggestionReverted]
  );

  const handleReject = useCallback(
    (_messageId: string, _suggestionId: string) => {
      toast.info('已忽略该修改建议');
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-background border-l border-border',
        'w-[380px] min-w-[380px] flex-shrink-0',
      )}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">AI 编辑助手</h3>
            <p className="text-xs text-muted-foreground">
              用自然语言修改剧本、角色、场景
            </p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearHistory}
                title="清空对话"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              title="收起面板"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className="py-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-12 px-6">
              <p className="mb-3">你可以通过对话修改或新增项目内容，例如：</p>
              <div className="space-y-2 text-xs text-left max-w-[280px] mx-auto">
                <p className="bg-muted rounded-lg px-3 py-2">
                  「把王大嫂的性格改得更泼辣直爽」
                </p>
                <p className="bg-muted rounded-lg px-3 py-2">
                  「新增一个角色：李大壮，30岁男性，性格憨厚老实」
                </p>
                <p className="bg-muted rounded-lg px-3 py-2">
                  「添加一个夜晚的废弃工厂场景」
                </p>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => {
            const lastUserIdx = messages.reduce((acc, m, i) => m.role === 'user' ? i : acc, -1);
            return (
              <ChatMessage
                key={msg.id}
                message={msg}
                onApply={(suggestionId) => handleApply(msg.id, suggestionId)}
                onReject={(suggestionId) => handleReject(msg.id, suggestionId)}
                onRevert={(suggestionId) => handleRevert(msg.id, suggestionId)}
                onEdit={handleEditMessage}
                isLastUserMessage={idx === lastUserIdx}
              />
            );
          })}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border">
        {editingMessageId && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-orange-500/10 border-b border-orange-500/20 text-xs text-orange-600 dark:text-orange-400">
            <span>正在编辑历史消息，发送后将从此处重新对话</span>
            <button onClick={handleCancelEdit} className="p-0.5 hover:bg-orange-500/20 rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end p-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingMessageId ? '修改后按 Enter 重新发送...' : '输入修改指令...'}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-lg border px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[36px] max-h-[120px]',
              editingMessageId
                ? 'border-orange-500/50 bg-orange-500/5 focus-visible:ring-orange-500'
                : 'border-input bg-background',
            )}
            style={{ height: 'auto', overflow: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 flex-shrink-0"
              onClick={handleStop}
              title="停止生成"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className={cn('h-9 w-9 flex-shrink-0', editingMessageId && 'bg-orange-600 hover:bg-orange-700')}
              onClick={handleSend}
              disabled={!input.trim()}
              title={editingMessageId ? '重新发送' : '发送'}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <RevertConfirmDialog
        open={revertDialogOpen}
        appliedSuggestions={pendingAppliedSuggestions}
        onRevertAndResend={handleRevertAndResend}
        onKeepAndResend={handleKeepAndResend}
        onCancel={handleDialogCancel}
      />
    </div>
  );
}
