import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AUTH_ENABLED, AUTH_MISCONFIGURED } from "./index";
import { clearTenantScopedLocalData } from "@/lib/session/clearLocalData";
import { flushDatabaseDrafts, isDatabaseDraftsEnabled } from "@/lib/database-drafts";
import { toast } from "sonner";
import { suspendDatabaseWorkspaceForTransition, stopDatabaseWorkspace } from "@/lib/database-workspace";
import { beginSessionTransition, useSessionTransition } from "@/lib/session/transition";
import { SessionTransitionBoundary } from "@/components/SessionTransitionBoundary";

/**
 * AuthProvider — WorkOS AuthKit, SPA-shaped.
 *
 * The actual auth handshake lives in /api/auth/*. This provider's job is
 * to: (1) fetch the current session on mount, (2) expose signIn/signOut
 * helpers that drive the browser through the OAuth dance, and (3) keep
 * the user state fresh when the tab regains focus (so stale cookies don't
 * leave us showing a signed-in UI when the server has already evicted
 * the session).
 *
 * Production fails closed when WorkOS isn't configured — keeps draft
 * data behind a wall by default. Set VITE_ALLOW_PUBLIC_APP=true to
 * deliberately ship a public demo.
 */

export type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
};

export type ActiveTenant = {
  id: string;
  name: string;
  role: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  /** Currently-selected workspace; null until /signup/workspace runs. */
  activeTenant: ActiveTenant | null;
  /** True when the user has joined at least one tenant (active or not). */
  hasAnyTenant: boolean;
  /** Server-authoritative: the user has a consultant_profiles row. Drives
   *  cross-device consultant routing without trusting localStorage (PM-03). */
  isConsultant: boolean;
  isLoaded: boolean;
  organizationSignInUrl?: string | null;
  /**
   * Navigates the browser to the in-app /sign-in page. The page itself
   * owns the branded form + the "Continue with Google / Microsoft"
   * affordances; this just kicks the user there. See src/routes/SignIn.tsx.
   */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetches /api/auth/session. Useful after the callback completes.
   *  Pass { force: true } after a mutation that changed the session/tenant
   *  so the call doesn't coalesce onto a stale in-flight background refresh. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PASSTHROUGH_CONTEXT: AuthContextValue = {
  user: null,
  activeTenant: null,
  hasAnyTenant: false,
  isConsultant: false,
  isLoaded: true,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
};

export function AuthProvider({ children }: { children: ReactNode }) {
  if (AUTH_MISCONFIGURED) return <AuthConfigurationError />;
  if (!AUTH_ENABLED) {
    // Dev / public-demo mode — render children with a no-op context so
    // useAuth() doesn't have to special-case "auth disabled" everywhere.
    return <AuthContext.Provider value={PASSTHROUGH_CONTEXT}>{children}</AuthContext.Provider>;
  }
  return <RealAuthProvider>{children}</RealAuthProvider>;
}

function RealAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTenant, setActiveTenant] = useState<ActiveTenant | null>(null);
  const [hasAnyTenant, setHasAnyTenant] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [organizationSignInUrl, setOrganizationSignInUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const refreshGeneration = useRef(0);
  // Avoid concurrent /session fetches stomping each other on rapid focus events.
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    const transition = useSessionTransition.getState();
    if (transition.label) return;
    // Coalesce concurrent callers onto the in-flight fetch — EXCEPT a forced
    // refresh. A background focus/visibility refresh may already be in flight
    // reading the OLD cookie; a post-mutation caller (just created a workspace,
    // signed in, verified email) must NOT coalesce onto that stale fetch, or
    // it observes pre-mutation state (user/tenant null) and bounces the user
    // backward. force:true always starts a fresh fetch against the new cookie.
    if (inflight.current && !opts?.force) return inflight.current;
    const generation = ++refreshGeneration.current;
    const p = (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (generation === refreshGeneration.current && useSessionTransition.getState().epoch === transition.epoch && !useSessionTransition.getState().label) setLoadError(true);
          return;
        }
        const data = (await res.json()) as {
          user: AuthUser | null;
          activeTenant?: ActiveTenant | null;
          hasAnyTenant?: boolean;
          isConsultant?: boolean;
          organizationSignInUrl?: string | null;
        };
        if (generation !== refreshGeneration.current || useSessionTransition.getState().label || useSessionTransition.getState().epoch !== transition.epoch) return;
        setLoadError(false);
        setOrganizationSignInUrl(data.organizationSignInUrl ?? null);
        setUser(data.user);
        setActiveTenant(data.activeTenant ?? null);
        setHasAnyTenant(Boolean(data.hasAnyTenant));
        setIsConsultant(Boolean(data.isConsultant));
      } catch {
        if (generation === refreshGeneration.current && useSessionTransition.getState().epoch === transition.epoch && !useSessionTransition.getState().label) setLoadError(true);
      } finally {
        if (generation === refreshGeneration.current) setIsLoaded(true);
      }
    })();
    inflight.current = p;
    try {
      await p;
    } finally {
      // Only clear if we're still the current in-flight promise. A later
      // force:true caller may have overwritten inflight.current with its own
      // promise; clearing unconditionally would drop that reference and let a
      // concurrent non-forced caller start a duplicate /session fetch instead
      // of coalescing onto the still-running forced one.
      if (inflight.current === p) inflight.current = null;
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-check on focus / visibility so a sign-out in another tab propagates.
  useEffect(() => {
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const signIn = useCallback(async () => {
    // The entry route starts hosted AuthKit sign-in.
    window.location.assign("/sign-in");
  }, []);

  const signOut = useCallback(async () => {
    const transition = beginSessionTransition("Saving changes and signing out…");
    if (!transition) return;
    let resume: (() => void) | undefined;
    let departing = false, requestStarted = false;
    try {
      if (isDatabaseDraftsEnabled() && !(await flushDatabaseDrafts())) throw new Error("Some draft changes are only on this device. Retry the save or resolve the conflict first.");
      resume = await suspendDatabaseWorkspaceForTransition();
      requestStarted = true;
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) { requestStarted = false; throw new Error("Could not sign out. Check your connection and try again."); }
      const data = await response.json() as { logoutUrl?: string | null };
      stopDatabaseWorkspace();
      ++refreshGeneration.current;
      setUser(null);
      setActiveTenant(null);
      setHasAnyTenant(false);
      setIsConsultant(false);
      // Wipe tenant-scoped PII from localStorage BEFORE navigating so the next
      // user on a shared/kiosk browser can't read the previous user's drafts,
      // matters, employees, profile, or bookings (security board SA-01/SE-02).
      clearTenantScopedLocalData();
      // Hard navigation so any in-memory route guards re-evaluate cleanly.
      departing = true;
      window.location.assign(data.logoutUrl || "/sign-in?signed_out=1");
    } catch (error) {
      if (requestStarted) {
        // A lost acknowledgement may still have cleared the cookie. Do not
        // resume editing under an assumed identity or erase recovery buffers.
        departing = true;
        stopDatabaseWorkspace();
        window.location.assign("/");
      } else toast.error("Cannot sign out yet", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      if (!departing) { resume?.(); transition.release(); }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, activeTenant, hasAnyTenant, isConsultant, isLoaded, organizationSignInUrl, signIn, signOut, refresh }),
    [user, activeTenant, hasAnyTenant, isConsultant, isLoaded, organizationSignInUrl, signIn, signOut, refresh]
  );

  if (loadError) return (
    <main className="min-h-screen grid place-items-center px-6">
      <section className="max-w-sm text-center" role="alert">
        <h1 className="text-xl font-semibold">Your workspace is temporarily unavailable</h1>
        <p className="mt-3 text-sm">We couldn’t verify your session. Please retry; you don’t need to create another account.</p>
        <button type="button" onClick={() => void refresh({ force: true })} className="mt-6 rounded-md border px-4 py-2">Try again</button>
      </section>
    </main>
  );
  return <AuthContext.Provider value={value}><SessionTransitionBoundary>{children}</SessionTransitionBoundary></AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  // Outside a provider (e.g. tests, isolated renders) we surface the no-op
  // context rather than throwing — keeps unrelated callers from breaking.
  return ctx ?? PASSTHROUGH_CONTEXT;
}

function AuthConfigurationError() {
  return (
    <main className="min-h-screen bg-[var(--ds-canvas)] text-[var(--ds-ink)] grid place-items-center px-6">
      <section className="max-w-md rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
          Configuration required
        </p>
        <h1 className="mt-2 text-xl font-semibold">Authentication is not configured</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ds-body)]">
          This production deployment is blocked because no WorkOS client ID is
          configured. Set <code>VITE_WORKOS_CLIENT_ID</code>, or explicitly
          enable a public demo deployment with{" "}
          <code>VITE_ALLOW_PUBLIC_APP=true</code>.
        </p>
      </section>
    </main>
  );
}
