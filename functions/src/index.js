const admin = require('firebase-admin');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');

admin.initializeApp();

const ALLOWED_ROLES = new Set(['admin', 'director', 'teacher', 'registrar', 'student', 'parent']);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const assertAuthenticated = (context) => {
  if (!context?.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
};

const assertAdmin = (context) => {
  assertAuthenticated(context);

  if (context.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access is required.');
  }
};

const validateRole = (role) => {
  if (!ALLOWED_ROLES.has(String(role || '').trim())) {
    throw new HttpsError('invalid-argument', 'Unsupported role requested.');
  }
};

exports.healthCheck = onRequest((request, response) => {
  response.status(200).json({
    status: 'ok',
    message: 'School Management System functions are configured successfully.',
    timestamp: new Date().toISOString(),
  });
});

exports.createUser = onCall(async (request) => {
  assertAdmin(request.auth ? { auth: request.auth } : request);

  const email = String(request.data?.email || '').trim();
  const password = String(request.data?.password || '');
  const displayName = String(request.data?.displayName || '').trim();
  const role = String(request.data?.role || '').trim();

  if (!isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }

  if (password.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters long.');
  }

  validateRole(role);

  const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
  if (existingUser) {
    throw new HttpsError('already-exists', 'A user with that email already exists.');
  }

  const userRecord = await admin.auth().createUser({
    email,
    password,
    displayName: displayName || email.split('@')[0],
    emailVerified: false,
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  await admin.firestore().collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: displayName || userRecord.email.split('@')[0],
      role,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    uid: userRecord.uid,
    email: userRecord.email,
    displayName: displayName || userRecord.email.split('@')[0],
    role,
  };
});

exports.setUserRole = onCall(async (request) => {
  assertAdmin(request.auth ? { auth: request.auth } : request);

  const targetUid = String(request.data?.uid || '').trim();
  const role = String(request.data?.role || '').trim();

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'A user ID is required.');
  }

  validateRole(role);

  const callerUid = request.auth.uid;
  if (targetUid === callerUid) {
    throw new HttpsError('permission-denied', 'Users cannot change their own role.');
  }

  const targetUser = await admin.auth().getUser(targetUid).catch(() => null);
  if (!targetUser) {
    throw new HttpsError('not-found', 'Target user was not found.');
  }

  await admin.auth().setCustomUserClaims(targetUid, { role });

  await admin.firestore().collection('users').doc(targetUid).set(
    {
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    success: true,
    uid: targetUid,
    role,
  };
});
