import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as Keychain from 'react-native-keychain';
import {
  completeOnboarding,
  getMe,
  login as apiLogin,
  signup as apiSignup,
  updateProfile,
  type AuthResponse,
  type User,
} from '../api/auth';
import {
  ApiError,
  setAuthToken,
  setUnauthorizedHandler,
} from '../api/client';

const SERVICE = 'com.aux.session';

/**
 * `offline` means a saved login exists but the server couldn't confirm it
 * (not running, no network). The token is kept so Retry can succeed later.
 */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'offline';

type API = {
  status: AuthStatus;
  user: User | null;
  /** Why the last session check failed, when status is `offline`. */
  error: string | null;
  logIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  retry: () => Promise<void>;
  /** Saves your bio to your account. Throws if the server refuses it. */
  saveBio: (bio: string) => Promise<void>;
  /** Marks first-run setup done; the app then opens on the Rank tab once. */
  finishOnboarding: () => Promise<void>;
  /** True right after finishing first-run setup, until the next login. */
  firstRun: boolean;
};

const Context = createContext<API | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  const logOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setFirstRun(false);
    setStatus('signedOut');
    await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
  }, []);

  const restore = useCallback(async () => {
    setStatus('loading');
    const saved = await Keychain.getGenericPassword({ service: SERVICE }).catch(
      () => false as const,
    );
    if (!saved) {
      setStatus('signedOut');
      return;
    }
    setAuthToken(saved.password);
    try {
      setUser(await getMe());
      setError(null);
      setStatus('signedIn');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await logOut();
      else {
        setError((err as Error).message);
        setStatus('offline');
      }
    }
  }, [logOut]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logOut();
    });
    restore();
    return () => setUnauthorizedHandler(null);
  }, [logOut, restore]);

  async function start({ token, user: account }: AuthResponse) {
    // If the Keychain write fails, stay logged in for this session anyway.
    await Keychain.setGenericPassword(account.username, token, {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => {});
    setAuthToken(token);
    setUser(account);
    setFirstRun(false);
    setError(null);
    setStatus('signedIn');
  }

  return (
    <Context.Provider
      value={{
        status,
        user,
        error,
        logIn: async (identifier, password) =>
          start(await apiLogin(identifier.trim(), password)),
        signUp: async (email, username, password) =>
          start(await apiSignup(email.trim(), username.trim(), password)),
        logOut,
        retry: restore,
        saveBio: async bio => setUser(await updateProfile({ bio })),
        finishOnboarding: async () => {
          setUser(await completeOnboarding());
          setFirstRun(true);
        },
        firstRun,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}

/** The logged-in user's id, or null when logged out or outside an AuthProvider. */
export function useUserId() {
  return useContext(Context)?.user?.id ?? null;
}
