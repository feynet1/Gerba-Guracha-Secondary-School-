const assert = require('node:assert/strict');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.GCLOUD_PROJECT || 'demo-phase3';
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const firestoreBase = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const authHeaders = { 'Content-Type': 'application/json' };
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const adminApp = initializeApp({ projectId }, `phase3-rules-test-${Date.now()}`);
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function createUser(role) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${role}-${suffix}@example.test`;
  const password = 'TestPassword123!';
  const signup = await jsonRequest(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(signup.status, 200, `Auth emulator signup failed for ${role}: ${JSON.stringify(signup.body)}`);
  await adminAuth.setCustomUserClaims(signup.body.localId, { role });
  const signedIn = await jsonRequest(`${authBase}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(signedIn.status, 200, `Unable to sign in emulator account for ${role}: ${JSON.stringify(signedIn.body)}`);
  return { uid: signup.body.localId, idToken: signedIn.body.idToken };
}

async function read(path, idToken) {
  return jsonRequest(`${firestoreBase}/${path}`, {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
  });
}

async function main() {
  const [admin, director, registrar, teacher, student, parent] = await Promise.all(
    ['admin', 'director', 'registrar', 'teacher', 'student', 'parent'].map(createUser),
  );
  const fixtures = [
    ['teachers/teacher-record', { userId: teacher.uid, employeeId: 'TCH-EMU-1' }],
    [`accountLinks/${teacher.uid}`, { type: 'teacher', recordId: 'teacher-record' }],
    ['teachers/private-record', { userId: 'another-user', employeeId: 'TCH-EMU-2' }],
    ['subjects/subject-record', { code: 'EMU', active: true }],
    ['teacherAssignments/teacher-assignment', { teacherId: 'teacher-record', active: true }],
    ['teacherAssignments/other-assignment', { teacherId: 'another-teacher', active: true }],
    ['timetable/teacher-entry', { teacherId: 'teacher-record', active: true }],
    ['timetable/other-entry', { teacherId: 'another-teacher', active: true }],
    ['students/student-record', { admissionNumber: 'STU-EMU-1' }],
    ['parents/parent-record', { userId: parent.uid }],
    ['classes/class-record', { grade: 9 }],
    ['schoolSettings/timetable', { academicYear: 'EMU' }],
  ];
  await Promise.all(fixtures.map(([path, data]) => adminDb.doc(path).set(data)));

  const checks = [
    ['teachers/teacher-record', null, 403],
    ['students/student-record', null, 403],
    ['teachers/teacher-record', admin.idToken, 200],
    ['teachers/teacher-record', director.idToken, 200],
    ['teachers/teacher-record', registrar.idToken, 403],
    ['teachers/teacher-record', teacher.idToken, 200],
    ['teachers/private-record', teacher.idToken, 403],
    ['subjects/subject-record', teacher.idToken, 200],
    ['teacherAssignments/teacher-assignment', teacher.idToken, 200],
    ['teacherAssignments/other-assignment', teacher.idToken, 403],
    ['timetable/teacher-entry', teacher.idToken, 200],
    ['timetable/other-entry', teacher.idToken, 403],
    ['students/student-record', teacher.idToken, 403],
    ['teachers/teacher-record', student.idToken, 403],
    ['teachers/teacher-record', parent.idToken, 403],
    ['schoolSettings/timetable', director.idToken, 200],
  ];
  for (const [path, token, expected] of checks) {
    const result = await read(path, token);
    assert.equal(result.status, expected, `Expected ${path} read to return ${expected}; got ${result.status}`);
  }
  console.log(`Firestore emulator rules passed ${checks.length} role/access checks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => adminApp.delete());
