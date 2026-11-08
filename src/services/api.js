const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
let tokens;
try { tokens = JSON.parse(sessionStorage.getItem('dormfind_tokens') || 'null'); } catch { tokens = null; }

export function setTokens(value) {
  tokens = value;
  if (value) sessionStorage.setItem('dormfind_tokens', JSON.stringify(value));
  else sessionStorage.removeItem('dormfind_tokens');
}
export function hasSession() { return !!tokens?.refresh_token; }
let refreshing, csrfPromise;
function securityToken() {
  if (!csrfPromise) csrfPromise = api('/csrf', {retry: false}).then(result => result.token).catch(error => {
    csrfPromise = null; throw error;
  });
  return csrfPromise;
}

export async function api(path, {method = 'GET', body, retry = true, csrfRetry = true} = {}) {
  const headers = {};
  if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`;
  const form = body instanceof FormData;
  if (body && !form) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = await securityToken();

  // The initial public configuration request can include Render's free-plan wake-up.
  const timeoutMs = path === '/config' ? 90000 : 35000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response, data;
  try {
    response = await fetch(`${BASE}${path}`, {method, headers, credentials: 'include',
      body: body ? (form ? body : JSON.stringify(body)) : undefined, signal: controller.signal});
    data = await response.json().catch(() => {
      throw new Error('The server returned an invalid response. Please try again shortly.');
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(method === 'GET'
        ? 'The server is taking too long. Please try again shortly.'
        : 'The server took too long to respond. Check whether your change was saved before submitting again.');
    }
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timeout); }

  // A CSRF failure happens before any business action. Only that failed action is safe to retry.
  if (response.status === 403 && data.code === 'csrf_failed' && csrfRetry) {
    csrfPromise = null;
    return api(path, {method, body, retry, csrfRetry: false});
  }
  const publicAuthPaths = ['/auth/login', '/auth/register', '/auth/send-email-otp', '/auth/forgot-password',
    '/auth/reset-password', '/auth/refresh', '/auth/logout', '/csrf'];
  if (response.status === 401 && retry && tokens?.refresh_token && !publicAuthPaths.includes(path)) {
    if (!refreshing) refreshing = api('/auth/refresh', {
      method: 'POST', body: {refresh_token: tokens.refresh_token}, retry: false
    }).then(result => setTokens(result.tokens)).catch(error => {
      setTokens(null); window.dispatchEvent(new Event('dormfind-signed-out')); throw error;
    }).finally(() => { refreshing = null; });
    await refreshing;
    return api(path, {method, body, retry: false, csrfRetry});
  }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data.data;
}

export async function signOut() {
  try {
    if (tokens?.refresh_token) {
      let timer;
      try {
        await Promise.race([api('/auth/logout', {method: 'POST', body: {refresh_token: tokens.refresh_token}}),
          new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
      } finally { clearTimeout(timer); }
    }
  } finally { setTokens(null); }
}
