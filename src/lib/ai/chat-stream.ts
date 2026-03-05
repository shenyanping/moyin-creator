import { getFeatureConfig, type FeatureConfig } from './feature-router';
import { getModelLimits, estimateTokens } from './model-registry';
import type { AIFeature } from '@/stores/api-config-store';

export interface ChatStreamOptions {
  feature?: AIFeature;
  configOverride?: FeatureConfig;
  temperature?: number;
  maxTokens?: number;
  onToken?: (token: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Streaming chat completion using SSE.
 * Returns the full accumulated response text.
 */
export async function callChatStream(
  systemPrompt: string,
  userPrompt: string,
  options: ChatStreamOptions = {}
): Promise<string> {
  const config = options.configOverride || getFeatureConfig(options.feature || 'script_analysis');
  if (!config) {
    const err = new Error('请先在设置中为「剧本分析」功能绑定 API 供应商');
    options.onError?.(err);
    throw err;
  }

  const { baseUrl, model, allApiKeys, keyManager } = config;
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const url = /\/v\d+$/.test(normalizedBase)
    ? `${normalizedBase}/chat/completions`
    : `${normalizedBase}/v1/chat/completions`;

  const modelLimits = getModelLimits(model);
  const requestedMax = options.maxTokens ?? 4096;
  const effectiveMax = Math.min(requestedMax, modelLimits.maxOutput);

  const inputTokens = estimateTokens(systemPrompt + userPrompt);
  if (inputTokens > modelLimits.contextWindow * 0.9) {
    const err = new Error(
      `输入 token (≈${inputTokens}) 超出模型上下文窗口 (${modelLimits.contextWindow}) 的 90%`
    );
    options.onError?.(err);
    throw err;
  }

  const currentKey = keyManager.getCurrentKey() || allApiKeys[0];
  if (!currentKey) {
    const err = new Error('没有可用的 API Key');
    options.onError?.(err);
    throw err;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: effectiveMax,
    stream: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    if (keyManager.handleError(response.status)) {
      console.log(`[ChatStream] Rotated key due to ${response.status}`);
    }
    const errText = await response.text();
    const err = new Error(`API 请求失败: ${response.status} - ${errText}`);
    options.onError?.(err);
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const err = new Error('无法获取响应流');
    options.onError?.(err);
    throw err;
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            options.onToken?.(delta);
          }
        } catch {
          // skip malformed SSE chunks
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('data: ')) {
      try {
        const json = JSON.parse(buffer.trim().slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          options.onToken?.(delta);
        }
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (allApiKeys.length > 1) {
    keyManager.rotateKey();
  }

  options.onDone?.(accumulated);
  return accumulated;
}

/**
 * Non-streaming fallback using the existing callFeatureAPI.
 * Use this when streaming is not critical (e.g., short edits).
 */
export { callFeatureAPI } from './feature-router';
