import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { auth, db } from './firebase/config';

const ROLES = new Set(['admin', 'director', 'teacher', 'registrar', 'student', 'parent']);

export async function listUserProfiles() {
  if (!db) throw new Error('Cloud Firestore is not configured.');

  const result = await getDocs(query(collection(db, 'users'), orderBy('email'), limit(200)));
  return result.docs.map((snapshot) => ({ uid: snapshot.id, ...snapshot.data() }));
}

export async function provisionUserProfile({ uid, email, displayName, role }) {
  if (!db) throw new Error('Cloud Firestore is not configured.');

  const normalizedUid = String(uid || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(displayName || '').trim();
  const normalizedRole = String(role || '').trim();

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalizedUid)) throw new Error('Enter the Firebase Authentication user UID.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
  if (!normalizedName || normalizedName.length > 100) throw new Error('Enter a display name up to 100 characters.');
  if (!ROLES.has(normalizedRole)) throw new Error('Choose a supported user role.');

  await setDoc(doc(db, 'users', normalizedUid), {
    uid: normalizedUid,
    email: normalizedEmail,
    displayName: normalizedName,
    role: normalizedRole,
    active: true,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserProfileRole(uid, role) {
  if (!db) throw new Error('Cloud Firestore is not configured.');
  if (!ROLES.has(role)) throw new Error('Choose a supported user role.');

  await updateDoc(doc(db, 'users', uid), {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserProfileActive(uid, active) {
  if (!db) throw new Error('Cloud Firestore is not configured.');

  await updateDoc(doc(db, 'users', uid), {
    active,
    updatedAt: serverTimestamp(),
  });
}
