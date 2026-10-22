import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('hiraman:logout', out);
    return () => window.removeEventListener('hiraman:logout', out);
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const me = await api('/me');
          if (me.role === 'resident') setToken(null); else setUser(me);
        } catch { setToken(null); }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (res.user.role === 'resident') {
      const err = new Error('This portal is for barangay and LGU staff only.');
      err.code = 'residents_blocked';
      throw err;
    }
    setToken(res.token);
    setUser(res.user);
  }, []);

  // Logging out ends the session on the server too, so the token cannot be reused on this computer.
  const logout = useCallback(async () => {
    try { if (getToken()) await api('/auth/logout', { method: 'POST' }); } catch { /* offline: forget it anyway */ }
    setToken(null); setUser(null);
  }, []);

  // Other sessions end; this browser gets a new token.
  const changePassword = useCallback(async (current, next) => {
    const res = await api('/me/password', { method: 'POST', body: { current, new_password: next } });
    setToken(res.token);
    setUser(res.user);
  }, []);
  return <Ctx.Provider value={{ user, ready, login, logout, changePassword }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
