const { applicationDefault, initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const projectId = 'gerba-guracha-secondary-school';
const email = String(process.argv[2] || '').trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node .\\bootstrap-admin.cjs <account-email>');
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
});
const auth = getAuth(app);
const firestore = getFirestore(app);

async function findExistingAdmin() {
  let pageToken;

  do {
    const result = await auth.listUsers(1000, pageToken);
    const existingAdmin = result.users.find(
      (user) => user.customClaims?.role === 'admin',
    );

    if (existingAdmin) {
      return existingAdmin;
    }

    pageToken = result.pageToken;
  } while (pageToken);

  return null;
}

async function bootstrapAdmin() {
  const user = await auth.getUserByEmail(email);
  const existingAdmin = await findExistingAdmin();

  if (existingAdmin && existingAdmin.uid !== user.uid) {
    throw new Error(
      `Admin already exists (${existingAdmin.email}). Refusing to bootstrap another account.`,
    );
  }

  if (user.customClaims?.role && user.customClaims.role !== 'admin') {
    throw new Error(
      `The target account already has role "${user.customClaims.role}". Refusing to replace it.`,
    );
  }

  const profileRef = firestore.collection('users').doc(user.uid);
  const profile = await profileRef.get();
  const timestamp = FieldValue.serverTimestamp();

  await profileRef.set(
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      role: 'admin',
      active: true,
      ...(!profile.exists ? { createdAt: timestamp } : {}),
      updatedAt: timestamp,
    },
    { merge: true },
  );

  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    role: 'admin',
  });

  console.log(`Admin role assigned to ${user.email} (${user.uid}).`);
  console.log('Ask the user to sign in again to load the updated custom claim.');
}

bootstrapAdmin()
  .catch((error) => {
    console.error(`Admin bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await deleteApp(app);
  });




