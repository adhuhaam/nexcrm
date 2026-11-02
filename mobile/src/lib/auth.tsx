import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearSession, getJson, loadSession, login as apiLogin, logout as apiLogout, onAuthChange } from "./api";

export type OfficeSession = {
  user: { id: string; name: string; email: string };
  role: {
    id: string;
    slug: string;
    name: string;
    canPreview: boolean;
    canEdit: boolean;
    canDelete: boolean;
    systemRole: boolean;
  };
};

type AuthState = {
  ready: boolean;
  session: OfficeSession | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<OfficeSession | null>(null);

  const refresh = useCallback(async () => {
    const token = await loadSession();
    if (!token) {
      setSession(null);
      return;
    }
    try {
      const data = await getJson<{ user: OfficeSession["user"] | null; role?: OfficeSession["role"] }>(
        "/api/v1/session",
      );
      if (data.user && data.role) {
        setSession({ user: data.user, role: data.role });
      } else {
        await clearSession();
        setSession(null);
      }
    } catch {
      await clearSession();
      setSession(null);
    }
  }, []);

  useEffect(() => {
    onAuthChange((authed) => {
      if (!authed) setSession(null);
      else void refresh();
    });
    void (async () => {
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await apiLogout();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, refresh, signIn, signOut }),
    [ready, session, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
