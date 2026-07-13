"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, type SessionData, type Workspace } from "@/lib/api";

type AppContextValue = {
  session: SessionData | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  loading: boolean;
  refresh: () => Promise<void>;
  selectWorkspace: (id: string) => void;
  signOut: () => Promise<void>;
};
const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiFetch<SessionData>("/api/v1/me");
      const list = await apiFetch<Workspace[]>("/api/v1/workspaces");
      setSession(me);
      setWorkspaces(list);
      const stored = typeof window !== "undefined" ? localStorage.getItem("taskgenie.workspace") : null;
      const next = list.find((item) => item.id === stored)?.id ?? list[0]?.id ?? null;
      setWorkspaceId(next);
      if (next && typeof window !== "undefined") localStorage.setItem("taskgenie.workspace", next);
    } catch {
      setSession(null);
      setWorkspaces([]);
      setWorkspaceId(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const selectWorkspace = useCallback((id: string) => { setWorkspaceId(id); localStorage.setItem("taskgenie.workspace", id); }, []);
  const signOut = useCallback(async () => { await apiFetch("/api/auth/sign-out", { method: "POST", body: JSON.stringify({}) }); setSession(null); setWorkspaces([]); setWorkspaceId(null); }, []);
  const value = useMemo<AppContextValue>(() => ({ session, workspaces, workspace: workspaces.find((item) => item.id === workspaceId) ?? null, loading, refresh, selectWorkspace, signOut }), [session, workspaces, workspaceId, loading, refresh, selectWorkspace, signOut]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error("useApp must be used inside AppProviders"); return value; }
