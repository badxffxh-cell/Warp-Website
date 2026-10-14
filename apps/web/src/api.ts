import type { AuthResponse, ApiError } from '@warp/shared';
declare global {
  interface Window {
    __WARP_DESKTOP__?: {
      apiUrl: string;
      request(
        path: string,
        method: string,
        csrf: string,
        body: unknown,
      ): Promise<{ status: number; data: unknown }>;
    };
  }
}
const configured = import.meta.env.VITE_API_URL;
export const API_URL = (
  window.__WARP_DESKTOP__?.apiUrl ||
  configured ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '')
).replace(/\/$/, '');
let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  if (!API_URL)
    throw new RequestError('Configure VITE_API_URL para conectar o Warp à API.', 0, 'CONFIG');
  const method = options.method ?? 'GET',
    multipart = options.body instanceof FormData;
  let response: Response;
  try {
    if (window.__WARP_DESKTOP__) {
      const result = await window.__WARP_DESKTOP__.request(
        `/v1${path}`,
        method,
        csrfToken,
        options.body,
      );
      response = new Response(JSON.stringify(result.data), { status: result.status });
    } else
      response = await fetch(`${API_URL}/v1${path}`, {
        method,
        credentials: 'include',
        headers: {
          'X-Warp-Client': 'web',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          ...(options.body && !multipart ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body
          ? multipart
            ? (options.body as FormData)
            : JSON.stringify(options.body)
          : undefined,
        signal: AbortSignal.timeout(20_000),
      });
  } catch {
    throw new RequestError(
      'Não foi possível conectar à API. Verifique sua conexão e tente novamente.',
      0,
      'NETWORK',
    );
  }
  const data = await response.json();
  if (!response.ok) {
    const error = (data as ApiError).error;
    if (error?.code === 'CSRF_REJECTED' && options.retry !== false) {
      const auth = await api<AuthResponse>('/auth/me');
      setCsrf(auth.csrfToken);
      return api(path, { ...options, retry: false });
    }
    throw new RequestError(
      error?.message ?? 'Não foi possível concluir.',
      response.status,
      error?.code ?? 'UNKNOWN',
    );
  }
  if (data.csrfToken) setCsrf(data.csrfToken);
  return data as T;
}
export async function renewSession() {
  const renew = async () => {
    await api<AuthResponse>('/auth/me');
    try {
      return await api<AuthResponse>('/auth/refresh', { method: 'POST' });
    } catch (e) {
      if (e instanceof RequestError && e.code === 'SESSION_ROTATED')
        return api<AuthResponse>('/auth/me');
      throw e;
    }
  };
  return navigator.locks ? navigator.locks.request('warp-session-renew', renew) : renew();
}
