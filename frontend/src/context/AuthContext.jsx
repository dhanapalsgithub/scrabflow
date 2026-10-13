import { createContext, useCallback, useContext, useState } from "react";
import { api, STORAGE_KEY } from "@/lib/api";

const AuthContext = createContext(null);

const persist = (s) => {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));

  const login = useCallback(async (email, password, role) => {
    const { data } = await api.post("/login", { email, password, role });
    const session = { ...data.user, token: data.token };
    persist(session);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => {
    persist(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      persist(next);
      return next;
    });
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
