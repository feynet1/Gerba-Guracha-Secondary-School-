const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const email = String(process.argv[2] || '').trim().toLowerCase();
const password = process.env.LOCAL_ADMIN_PASSWORD || '';

if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Do not override emulator hosts when running this local-only helper.');
  process.exit(1);
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
  console.error('Usage: set LOCAL_ADMIN_PASSWORD, then run node .\\functions\\bootstrap-emulator-admin.cjs <email>');
  process.exit(1);
}

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const app = initializeApp({ projectId: 'demo-phase3' }, `local-admin-${Date.now()}`);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function bootstrap() {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password, emailVerified: true });
  }
  if (user.customClaims?.role && user.customClaims.role !== 'admin') {
    throw new Error(`The local account already has role "${user.customClaims.role}"; refusing to replace it.`);
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role: 'admin' });
  await firestore.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email,
    role: 'admin',
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Local emulator admin is ready: ${user.email}`);
}

bootstrap()
  .catch((error) => {
    console.error(`Local emulator admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => deleteApp(app));
