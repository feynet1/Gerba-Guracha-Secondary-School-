import { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import { auth, db } from '../services/firebase/config';

import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth && db));

  useEffect(() => {
    if (!auth || !db) {
      return undefined;
    }

    let unsubscribeProfile;
    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      setLoading(true);

      if (!nextUser) {
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(nextUser);
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', nextUser.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            setProfile(null);
            setRole(null);
            setLoading(false);
            return;
          }

          const userProfile = snapshot.data();
          setProfile(userProfile);
          setRole(userProfile.active === true ? userProfile.role || null : null);
          setLoading(false);
        },
        (profileError) => {
          console.error('Unable to load the user profile.', profileError);
          setProfile(null);
          setRole(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const refreshRole = async () => {
    if (!auth?.currentUser || !db) {
      setRole(null);
      return;
    }

    try {
      const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userProfile = snapshot.exists() ? snapshot.data() : null;
      setProfile(userProfile);
      setRole(userProfile?.active === true ? userProfile.role || null : null);
    } catch (error) {
      console.error('Unable to refresh the user role.', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    if (!auth) {
      throw new Error('Firebase Authentication is not configured.');
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    setUser(credential.user);
    return credential.user;
  };

  const logout = async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
    setUser(null);
    setProfile(null);
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
      profile,
      role,
      loading,
      isAuthenticated: Boolean(user),
      isActive: profile?.active === true,
      login,
      logout,
      resetPassword,
      refreshRole,
    }),
    [user, profile, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
