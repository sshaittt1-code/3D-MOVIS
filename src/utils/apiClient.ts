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

const isDevRuntime = () =>
  typeof import.meta !== 'undefined'
  && Boolean((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.DEV);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDomExceptionLike = (value: unknown, name: string) =>
  typeof value === 'object'
  && value !== null
  && 'name' in value
  && (value as { name?: string }).name === name;

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
      const contentType = response.headers.get('content-type') || '';
      if (isDevRuntime()) {
        console.log('response.url =', response.url);
        console.log('content-type =', contentType);
      }
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

      if (!contentType.toLowerCase().includes('application/json')) {
        throw new ApiClientError(
          `Expected JSON but got ${contentType || 'unknown content-type'} from ${resolvedInput}. Body preview: ${trimmedBody.slice(0, 200)}`,
          {
            status: response.status,
            transient: false
          }
        );
      }

      if (trimmedBody.startsWith('<')) {
        throw new ApiClientError(`Expected JSON but got HTML from ${resolvedInput}. Body preview: ${trimmedBody.slice(0, 200)}`, {
          status: response.status,
          transient: false
        });
      }

      return safeParseJson<T>(bodyText, {} as T);
    } catch (error: any) {
      const abortReason = signal.aborted ? (signal as AbortSignal & { reason?: unknown }).reason : undefined;
      const timedOut = isDomExceptionLike(abortReason, 'TimeoutError') || isDomExceptionLike(error, 'TimeoutError');

      if ((error?.name === 'AbortError' || isDomExceptionLike(error, 'AbortError')) && !timedOut) {
        throw new DOMException(error?.message || 'The operation was aborted.', 'AbortError');
      }

      const normalizedError = error instanceof ApiClientError
        ? error
        : new ApiClientError(
            timedOut ? 'Request timed out' : (error?.message || 'Network request failed'),
            {
              status: timedOut ? 408 : undefined,
              transient: timedOut
            }
          );

      if (
        !timedOut
        && !(error instanceof ApiClientError)
        && error?.name !== 'AbortError'
        && !isDomExceptionLike(error, 'AbortError')
      ) {
        normalizedError.transient = true;
      }

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
