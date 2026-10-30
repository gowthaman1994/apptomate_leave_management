import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { login, type LoginResult } from "./api";
import { mapLoginFailureToToast } from "./errors";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export interface AuthContextValue {
  session: AuthSession | null;
  pending: boolean;
  signIn: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pending, setPending] = useState(false);
  // A ref guards against two rapid clicks both passing the `pending` check
  // before the first state update re-renders (FR-007) — `pending` state
  // alone is for the UI (disabling the button), not the actual guard.
  const inFlight = useRef(false);

  async function signIn(email: string, password: string): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      let result: LoginResult;
      try {
        result = await login(email, password);
      } catch {
        toast.error(mapLoginFailureToToast({ kind: "network" }));
        return;
      }
      if (result.ok) {
        toast.dismiss();
        setSession({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          email,
        });
      } else {
        toast.error(mapLoginFailureToToast(result));
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <AuthContext.Provider value={{ session, pending, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}

// The provider-plus-hook pair is the standard React context pattern; splitting
// useAuth into its own file for this heuristic alone isn't worth the indirection.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
