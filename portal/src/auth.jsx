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

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
