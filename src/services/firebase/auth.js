import { httpsCallable } from 'firebase/functions';

import { functions } from './config';

export const createUserAccount = async ({ email, password, displayName, role }) => {
  if (!functions) {
    throw new Error('Firebase Cloud Functions are not configured.');
  }

  const callable = httpsCallable(functions, 'createUser');
  const result = await callable({ email, password, displayName, role });
  return result.data;
};

export const assignUserRole = async ({ uid, role }) => {
  if (!functions) {
    throw new Error('Firebase Cloud Functions are not configured.');
  }

  const callable = httpsCallable(functions, 'setUserRole');
  const result = await callable({ uid, role });
  return result.data;
};
