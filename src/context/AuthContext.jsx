import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import { auth } from '../services/firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await nextUser.getIdTokenResult();
        setUser(nextUser);
        setRole(tokenResult.claims.role || null);
      } catch (error) {
        setUser(nextUser);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshRole = async () => {
    if (!auth || !auth.currentUser) {
      setRole(null);
      return;
    }

    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    setRole(tokenResult.claims.role || null);
  };

  const login = async (email, password) => {
    if (!auth) {
      throw new Error('Firebase Authentication is not configured.');
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const tokenResult = await credential.user.getIdTokenResult();
    setUser(credential.user);
    setRole(tokenResult.claims.role || null);
    return credential.user;
  };

  const logout = async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
    setUser(null);
    setRole(null);
  };

  const resetPassword = async (email) => {
    if (!auth) {
      throw new Error('Firebase Authentication is not configured.');
    }

    await sendPasswordResetEmail(auth, email);
  };

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      resetPassword,
      refreshRole,
    }),
    [user, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
