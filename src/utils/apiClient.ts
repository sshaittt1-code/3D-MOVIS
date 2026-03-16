import { safeGetString, safeParseJson } from './safeStorage';

export type ApiFetchOptions = {
  baseUrl?: string;
  sessionString?: string;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
};

export class ApiClientError extends Error {
  status?: number;
  transient: boolean;

  constructor(message: string, options: { status?: number; transient?: boolean } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.transient = options.transient ?? false;
  }
}

export const buildApiUrl = (base: string, path: string) =>
  `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createAbortSignal = (timeoutMs: number | undefined, externalSignal?: AbortSignal) => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternal);
      }
    }
  };
};

const shouldRetry = (error: unknown, attempt: number, retryCount: number, method: string) => {
  if (attempt >= retryCount) return false;
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) return false;

  if (error instanceof ApiClientError) {
    if (error.status === 408 || error.status === 429) return true;
    return Boolean(error.status && error.status >= 500) || error.transient;
  }

  return true;
};

export const fetchApiJson = async <T = any>(
  input: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
): Promise<T> => {
  const method = (init.method || 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? 8000;
  const retryCount = options.retryCount ?? (method === 'GET' || method === 'HEAD' ? 1 : 0);
  const retryDelayMs = options.retryDelayMs ?? 450;
  const resolvedInput = options.baseUrl && !/^https?:\/\//i.test(input)
    ? buildApiUrl(options.baseUrl, input)
    : input;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const headers = new Headers(init.headers ?? {});
    const sessionString = options.sessionString
      || (typeof localStorage !== 'undefined' ? safeGetString(localStorage, 'tg_session', '') : '');
    if (sessionString && !headers.has('x-tg-session')) {
      headers.set('x-tg-session', sessionString);
    }

    const { signal, cleanup } = createAbortSignal(timeoutMs, init.signal);

    try {
      const response = await fetch(resolvedInput, { ...init, headers, signal });
      const bodyText = await response.text();
      const trimmedBody = bodyText.trim();
      const parsedBody = trimmedBody && !trimmedBody.startsWith('<')
        ? safeParseJson<Record<string, unknown>>(bodyText, {})
        : {};

      if (!response.ok) {
        throw new ApiClientError(
          typeof parsedBody.error === 'string' ? parsedBody.error : bodyText || `Request failed with ${response.status}`,
          { status: response.status, transient: response.status >= 500 || response.status === 408 || response.status === 429 }
        );
      }

      if (!trimmedBody) {
        return {} as T;
      }

      if (trimmedBody.startsWith('<')) {
        throw new ApiClientError('API returned HTML instead of JSON.', {
          status: response.status,
          transient: false
        });
      }

      return safeParseJson<T>(bodyText, {} as T);
    } catch (error: any) {
      const normalizedError = error instanceof ApiClientError
        ? error
        : new ApiClientError(error?.message || 'Network request failed', {
            transient: error?.name === 'AbortError' || error?.name === 'TimeoutError'
          });

      if (!shouldRetry(normalizedError, attempt, retryCount, method)) {
        throw normalizedError;
      }

      await delay(retryDelayMs * (attempt + 1));
      continue;
    } finally {
      cleanup();
    }
  }

  throw new ApiClientError('Request failed after retries.');
};
