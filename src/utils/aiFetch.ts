const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

export const SERVER_BUSY_FINAL_MESSAGE =
  'AI 서버가 붐벼서 분석하지 못했어요. 1~2분 뒤 다시 눌러 주세요';

export const SERVER_RESTARTING_MESSAGE =
  '앱 서버가 다시 시작되는 중이에요. 잠시 후 다시 눌러 주세요';

export const REQUEST_TIMEOUT_MESSAGE =
  '분석이 너무 오래 걸려 중단했어요. 리뷰 개수를 줄여서 다시 시도해 주세요';

export const INVALID_RESPONSE_MESSAGE =
  '분석 결과를 받지 못했어요. 잠시 후 다시 눌러 주세요';

export type AiErrorKind = 'busy' | 'restarting' | 'timeout' | 'other';

export class AiRequestError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'AiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, retryableFlag?: boolean): boolean {
  return Boolean(retryableFlag) || status === 503 || status === 429;
}

export async function fetchAiWithRetry<T>(params: {
  url: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  timeoutMessage?: string;
  onStatusChange?: (statusMessage: string | null) => void;
  validateData?: (data: unknown) => boolean;
  invalidResponseMessage?: string;
}): Promise<T> {
  const {
    url,
    body,
    headers = {},
    timeoutMs = 55000,
    timeoutMessage = REQUEST_TIMEOUT_MESSAGE,
    onStatusChange,
    validateData,
    invalidResponseMessage = INVALID_RESPONSE_MESSAGE,
  } = params;

  const callEndpoint = async (modelTier: 'primary' | 'lite') => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          ...body,
          modelTier,
          singleAttempt: true,
        }),
        signal: controller.signal,
      });

      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      let isValidJson = false;

      if (rawText.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawText) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>;
            isValidJson = true;
          }
        } catch {
          data = {};
          isValidJson = false;
        }
      }

      return { res, data, isValidJson };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AiRequestError('timeout', timeoutMessage, 504);
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AiRequestError('timeout', timeoutMessage, 504);
      }
      // Fetch network error typically happens while server is restarting / unreachable
      throw new AiRequestError('restarting', SERVER_RESTARTING_MESSAGE);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const extractValidatedOrThrow = (result: {
    res: Response;
    data: Record<string, unknown>;
    isValidJson: boolean;
  }): T => {
    if (!result.isValidJson) {
      throw new AiRequestError('restarting', SERVER_RESTARTING_MESSAGE, result.res.status);
    }
    if (validateData && !validateData(result.data)) {
      throw new AiRequestError('other', invalidResponseMessage, result.res.status);
    }
    return result.data as T;
  };

  const toAiError = (
    result: { res: Response; data: Record<string, unknown>; isValidJson: boolean },
    fallbackMessage: string
  ): AiRequestError => {
    const errorCode = typeof result.data.errorCode === 'string' ? result.data.errorCode : '';
    const serverMsg =
      typeof result.data.error === 'string' && result.data.error.trim()
        ? result.data.error.trim()
        : '';

    if (result.res.status === 504 || errorCode === 'TIMEOUT') {
      return new AiRequestError('timeout', serverMsg || timeoutMessage, result.res.status);
    }
    if (!result.isValidJson) {
      return new AiRequestError('restarting', SERVER_RESTARTING_MESSAGE, result.res.status);
    }
    if (isRetryableStatus(result.res.status, Boolean(result.data.retryable))) {
      return new AiRequestError('busy', SERVER_BUSY_FINAL_MESSAGE, result.res.status);
    }
    return new AiRequestError('other', serverMsg || fallbackMessage, result.res.status);
  };

  onStatusChange?.(null);

  try {
    // Initial attempt on primary model
    let lastResult = await callEndpoint('primary');
    if (lastResult.res.ok) {
      onStatusChange?.(null);
      return extractValidatedOrThrow(lastResult);
    }

    // If server returned non-JSON (HTML/text during restart), report restarting immediately
    if (!lastResult.isValidJson) {
      onStatusChange?.(null);
      throw toAiError(lastResult, SERVER_RESTARTING_MESSAGE);
    }

    if (!isRetryableStatus(lastResult.res.status, Boolean(lastResult.data.retryable))) {
      onStatusChange?.(null);
      throw toAiError(lastResult, invalidResponseMessage);
    }

    // Up to 3 retries with 2s, 5s, 10s delays
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      onStatusChange?.(`AI 서버가 붐벼서 다시 시도하는 중이에요 (${i + 1}/3)`);
      await sleep(RETRY_DELAYS_MS[i]);

      lastResult = await callEndpoint('primary');
      if (lastResult.res.ok) {
        onStatusChange?.(null);
        return extractValidatedOrThrow(lastResult);
      }

      if (!lastResult.isValidJson) {
        onStatusChange?.(null);
        throw toAiError(lastResult, SERVER_RESTARTING_MESSAGE);
      }

      if (!isRetryableStatus(lastResult.res.status, Boolean(lastResult.data.retryable))) {
        onStatusChange?.(null);
        throw toAiError(lastResult, invalidResponseMessage);
      }
    }

    // Fallback once to lighter Gemini model (flash-lite) after 3 failed retries
    onStatusChange?.('가벼운 AI 모델로 한 번 더 시도하고 있어요...');
    const fallbackResult = await callEndpoint('lite');
    onStatusChange?.(null);

    if (fallbackResult.res.ok) {
      return extractValidatedOrThrow(fallbackResult);
    }

    if (isRetryableStatus(fallbackResult.res.status, Boolean(fallbackResult.data.retryable))) {
      throw new AiRequestError('busy', SERVER_BUSY_FINAL_MESSAGE, fallbackResult.res.status);
    }

    throw toAiError(fallbackResult, SERVER_BUSY_FINAL_MESSAGE);
  } catch (err: unknown) {
    onStatusChange?.(null);
    if (err instanceof AiRequestError) {
      throw err;
    }
    throw new AiRequestError(
      'other',
      err instanceof Error && err.message.trim() ? err.message : invalidResponseMessage
    );
  }
}
