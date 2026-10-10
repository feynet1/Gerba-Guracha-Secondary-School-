import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const projectId = 'demo-school-management';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'systemConfig', 'sparkMigration'), { ready: true });
    await setDoc(doc(database, 'users', 'admin-user'), {
      uid: 'admin-user',
      email: 'admin@example.test',
      displayName: 'Admin',
      role: 'admin',
      active: true,
    });
    await setDoc(doc(database, 'users', 'registrar-user'), {
      uid: 'registrar-user',
      email: 'registrar@example.test',
      displayName: 'Registrar',
      role: 'registrar',
      active: true,
    });
    await setDoc(doc(database, 'users', 'director-user'), {
      uid: 'director-user',
      email: 'director@example.test',
      displayName: 'Director',
      role: 'director',
      active: true,
    });
    await setDoc(doc(database, 'users', 'parent-user'), {
      uid: 'parent-user',
      email: 'parent@example.test',
      displayName: 'Parent',
      role: 'parent',
      active: true,
    });
    await setDoc(doc(database, 'teacherAssignments', 'assignment-1'), {
      teacherId: 'teacher-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      academicYear: '2026',
      periodsPerWeek: 4,
      active: true,
    });
    await setDoc(doc(database, 'classes', 'class-1'), { active: true });
    await setDoc(doc(database, 'teachers', 'teacher-1'), { employmentStatus: 'active' });
    await setDoc(doc(database, 'subjects', 'subject-1'), { active: true });
    await setDoc(doc(database, 'students', 'student-private'), {
      admissionNumber: 'STU-001',
      firstName: 'Student',
      phone: 'private number',
      address: 'private address',
      parentIds: [],
    });
    await setDoc(doc(database, 'parents', 'parent-1'), {
      userId: 'parent-user',
      studentIds: ['student-private'],
    });
    await setDoc(doc(database, 'accountLinks', 'parent-user'), {
      type: 'parent',
      recordId: 'parent-1',
    });
    await setDoc(doc(database, 'schoolSettings', 'timetable'), {
      academicYear: '2026',
      schoolDays: ['monday'],
      periodsById: { 'period-1': { type: 'lesson', startTime: '08:00', endTime: '08:45' } },
      rooms: [],
      roomAllocationEnabled: false,
    });
  });
});

after(async () => {
  await environment?.cleanup();
});

test('users cannot create or change their own authorization profile', async () => {
  const userDb = environment.authenticatedContext('registrar-user').firestore();
  await assertFails(setDoc(doc(userDb, 'users', 'registrar-user'), {
    uid: 'registrar-user',
    email: 'registrar@example.test',
    displayName: 'Registrar',
    role: 'admin',
    active: true,
  }));
  await assertFails(setDoc(doc(userDb, 'users', 'self-created'), {
    uid: 'self-created',
    email: 'attacker@example.test',
    displayName: 'Attacker',
    role: 'admin',
    active: true,
  }));
  await assertFails(getDoc(doc(userDb, 'users', 'admin-user')));
});

test('only active admins can read user directory and create user profiles', async () => {
  const adminDb = environment.authenticatedContext('admin-user').firestore();
  await assertSucceeds(getDoc(doc(adminDb, 'users', 'registrar-user')));
  await assertSucceeds(setDoc(doc(adminDb, 'users', 'teacher-user'), {
    uid: 'teacher-user',
    email: 'teacher@example.test',
    displayName: 'Teacher',
    role: 'teacher',
    active: true,
    createdBy: 'admin-user',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

test('school-data writes remain disabled until migration is explicitly marked ready', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'systemConfig', 'sparkMigration'), { ready: false });
  });
  const adminDb = environment.authenticatedContext('admin-user').firestore();
  await assertFails(setDoc(doc(adminDb, 'classes', 'class-before-migration'), {}));
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'systemConfig', 'sparkMigration'), { ready: true });
  });
});

test('director role cannot read documents containing restricted contact details', async () => {
  const directorDb = environment.authenticatedContext('director-user').firestore();
  await assertFails(getDoc(doc(directorDb, 'students', 'student-private')));
  await assertFails(getDoc(doc(directorDb, 'teachers', 'teacher-1')));
});

test('a parent must be linked on both sides before reading a student record', async () => {
  const parentDb = environment.authenticatedContext('parent-user').firestore();
  await assertFails(getDoc(doc(parentDb, 'students', 'student-private')));
});

test('simultaneous transactions cannot reserve the same timetable slot', async () => {
  const adminDb = environment.authenticatedContext('admin-user').firestore();
  const slotId = 'class__class-1__2026__monday__period-1';
  const entry = () => ({
    classId: 'class-1',
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    assignmentId: 'assignment-1',
    academicYear: '2026',
    dayOfWeek: 'monday',
    periodId: 'period-1',
    startTime: '08:00',
    endTime: '08:45',
    room: null,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: 'admin-user',
    updatedAt: serverTimestamp(),
    updatedBy: 'admin-user',
  });
  const tryReserve = (entryId) => runTransaction(adminDb, async (transaction) => {
    const lockRef = doc(adminDb, 'timetableSlotLocks', slotId);
    const teacherLockRef = doc(adminDb, 'timetableSlotLocks', 'teacher__teacher-1__2026__monday__period-1');
    const [lock, teacherLock] = await Promise.all([
      transaction.get(lockRef),
      transaction.get(teacherLockRef),
    ]);
    if (lock.exists() || teacherLock.exists()) throw new Error('slot already reserved');
    const entryRef = doc(collection(adminDb, 'timetable'), entryId);
    transaction.set(lockRef, {
      entryId,
      resourceType: 'class',
      resourceId: 'class-1',
      academicYear: '2026',
      dayOfWeek: 'monday',
      periodId: 'period-1',
    });
    transaction.set(teacherLockRef, {
      entryId,
      resourceType: 'teacher',
      resourceId: 'teacher-1',
      academicYear: '2026',
      dayOfWeek: 'monday',
      periodId: 'period-1',
    });
    transaction.set(entryRef, entry());
  });

  const outcomes = await Promise.allSettled([tryReserve('entry-a'), tryReserve('entry-b')]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1, JSON.stringify(outcomes, (_key, value) => value instanceof Error ? value.message : value));
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);

  const winner = (await getDoc(doc(adminDb, 'timetableSlotLocks', slotId))).data().entryId;
  const entryRef = doc(adminDb, 'timetable', winner);
  const teacherLockRef = doc(adminDb, 'timetableSlotLocks', 'teacher__teacher-1__2026__monday__period-1');
  await assertFails(runTransaction(adminDb, async (transaction) => {
    const entrySnapshot = await transaction.get(entryRef);
    transaction.update(entryRef, {
      active: false,
      updatedAt: serverTimestamp(),
      updatedBy: 'admin-user',
    });
    assert.equal(entrySnapshot.exists(), true);
  }));
  await assertSucceeds(runTransaction(adminDb, async (transaction) => {
    const [entrySnapshot, classLock, teacherLock] = await Promise.all([
      transaction.get(entryRef),
      transaction.get(doc(adminDb, 'timetableSlotLocks', slotId)),
      transaction.get(teacherLockRef),
    ]);
    assert.equal(entrySnapshot.exists(), true);
    assert.equal(classLock.exists(), true);
    assert.equal(teacherLock.exists(), true);
    transaction.update(entryRef, {
      active: false,
      updatedAt: serverTimestamp(),
      updatedBy: 'admin-user',
    });
    transaction.delete(doc(adminDb, 'timetableSlotLocks', slotId));
    transaction.delete(teacherLockRef);
  }));
});
