const TOKEN_KEY = 'hiraman_portal_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function headers(json = true) {
  const h = {};
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function handle(res) {
  if (res.ok) return res;
  let body = {};
  try { body = await res.json(); } catch { /* not json */ }
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event('hiraman:logout'));
  }
  throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.code);
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await handle(await fetch(`/api${path}`, {
    method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
  return res.json();
}

export async function upload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await handle(await fetch('/api/uploads', { method: 'POST', headers: headers(false), body: fd }));
  return (await res.json()).url;
}

// Private files (ID photos) need the login token, so they are fetched and shown as a local blob.
export async function blobUrl(path) {
  const res = await handle(await fetch(`/api${path}`, { headers: headers(false) }));
  return URL.createObjectURL(await res.blob());
}

export async function download(path, filename) {
  const res = await handle(await fetch(`/api${path}`, { headers: headers(false) }));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
