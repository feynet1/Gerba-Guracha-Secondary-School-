import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from './firebase/config';

const requireDb = () => {
  if (!db || !auth?.currentUser) throw new Error('Sign in and configure Firestore before continuing.');
};

const required = (value, label, max = 100) => {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) throw new Error(`${label} is required.`);
  return result;
};

const documentKey = (...values) => values.map((value) => String(value || 'none')).join('__').replaceAll('/', '_');
const settingsRef = () => doc(db, 'schoolSettings', 'timetable');
const usageRef = (assignmentId) => doc(db, 'assignmentScheduleUsage', assignmentId);
const lockRef = (type, resourceId, entry) => doc(db, 'timetableSlotLocks', documentKey(type, resourceId, entry.academicYear, entry.dayOfWeek, entry.periodId));

function teacherInput(input) {
  const employeeId = required(input.employeeId, 'Employee ID', 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(employeeId)) throw new Error('Employee ID can contain letters, numbers, hyphens, and underscores.');
  const gender = String(input.gender || '').toLowerCase();
  if (gender && !['male', 'female'].includes(gender)) throw new Error('Choose a valid gender.');
  const email = String(input.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return {
    employeeId,
    firstName: required(input.firstName, 'First name'),
    middleName: String(input.middleName || '').trim(),
    lastName: required(input.lastName, 'Last name'),
    gender: gender || null,
    phone: String(input.phone || '').trim(),
    email,
    qualification: String(input.qualification || '').trim(),
    specialization: Array.isArray(input.specialization) ? input.specialization.map((value) => required(value, 'Specialization', 60)) : [],
    employmentStatus: ['active', 'inactive'].includes(input.employmentStatus) ? input.employmentStatus : 'active',
  };
}

function subjectInput(input) {
  const code = required(input.code, 'Subject code', 20).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) throw new Error('Subject codes must contain 2-20 letters, numbers, hyphens, or underscores.');
  const applicableGrades = [...new Set((input.applicableGrades || []).map(Number))].sort((a, b) => a - b);
  const applicableStreams = [...new Set((input.applicableStreams || []).map((value) => String(value).toLowerCase()))];
  if (!applicableGrades.length || applicableGrades.some((grade) => ![9, 10, 11, 12].includes(grade))) throw new Error('Choose applicable grades from 9 to 12.');
  if (applicableStreams.some((stream) => !['natural', 'social'].includes(stream))) throw new Error('Choose valid streams.');
  if (applicableGrades.some((grade) => grade >= 11) && !applicableStreams.length) throw new Error('Select at least one stream for Grades 11 and 12.');
  const periodsPerWeek = Number(input.periodsPerWeek);
  if (!Number.isInteger(periodsPerWeek) || periodsPerWeek < 1 || periodsPerWeek > 40) throw new Error('Periods per week must be between 1 and 40.');
  return {
    code,
    name: required(input.name, 'Subject name'),
    description: String(input.description || '').trim().slice(0, 500),
    applicableGrades,
    applicableStreams,
    periodsPerWeek,
    active: input.active !== false,
  };
}

function assignmentKey(value) {
  return documentKey(value.teacherId, value.classId, value.subjectId, value.academicYear);
}

export async function createTeacher(input) {
  requireDb();
  const data = teacherInput(input);
  const teacherRef = doc(collection(db, 'teachers'));
  const employeeRef = doc(db, 'employeeIds', data.employeeId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(employeeRef);
    if (existing.exists()) throw new Error('That employee ID is already in use.');
    const timestamp = serverTimestamp();
    transaction.set(teacherRef, {
      ...data,
      userId: null,
      assignedClassIds: [],
      searchEmployeeId: data.employeeId.toLowerCase(),
      searchFirstName: data.firstName.toLowerCase(),
      searchLastName: data.lastName.toLowerCase(),
      searchEmail: data.email.toLowerCase(),
      createdAt: timestamp,
      createdBy: auth.currentUser.uid,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
    transaction.set(employeeRef, { teacherId: teacherRef.id });
  });
  return { teacherId: teacherRef.id };
}

export async function updateTeacher(input) {
  requireDb();
  const teacherId = required(input.teacherId, 'Teacher ID', 128);
  const data = teacherInput(input);
  await runTransaction(db, async (transaction) => {
    const teacherRef = doc(db, 'teachers', teacherId);
    const teacherSnapshot = await transaction.get(teacherRef);
    if (!teacherSnapshot.exists()) throw new Error('Teacher profile was not found.');
    const oldEmployee = doc(db, 'employeeIds', teacherSnapshot.data().employeeId);
    const newEmployee = doc(db, 'employeeIds', data.employeeId);
    const oldLock = await transaction.get(oldEmployee);
    const newLock = oldEmployee.path === newEmployee.path ? oldLock : await transaction.get(newEmployee);
    if (newLock.exists() && newLock.data().teacherId !== teacherId) throw new Error('That employee ID is already in use.');
    transaction.update(teacherRef, {
      ...data,
      searchEmployeeId: data.employeeId.toLowerCase(),
      searchFirstName: data.firstName.toLowerCase(),
      searchLastName: data.lastName.toLowerCase(),
      searchEmail: data.email.toLowerCase(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    });
    if (oldEmployee.path !== newEmployee.path) {
      if (oldLock.exists()) transaction.delete(oldEmployee);
      transaction.set(newEmployee, { teacherId });
    }
  });
  return { success: true };
}

export async function linkTeacherAccount({ teacherId, userId }) {
  requireDb();
  const teacherRef = doc(db, 'teachers', required(teacherId, 'Teacher ID', 128));
  const userRef = doc(db, 'users', required(userId, 'User ID', 128));
  const accountRef = doc(db, 'accountLinks', userId);
  await runTransaction(db, async (transaction) => {
    const [teacher, user, account] = await Promise.all([
      transaction.get(teacherRef),
      transaction.get(userRef),
      transaction.get(accountRef),
    ]);
    if (!teacher.exists() || !user.exists()) throw new Error('Teacher or user profile was not found.');
    if (user.data().role !== 'teacher' || user.data().active !== true) throw new Error('The linked account must be an active teacher account.');
    if (account.exists() && (account.data().type !== 'teacher' || account.data().recordId !== teacherId)) {
      throw new Error('This account is already linked to another record.');
    }
    const oldUserId = teacher.data().userId;
    transaction.update(teacherRef, { userId, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    transaction.set(accountRef, { type: 'teacher', recordId: teacherId });
    if (oldUserId && oldUserId !== userId) transaction.delete(doc(db, 'accountLinks', oldUserId));
  });
  return { success: true };
}

const toTeacher = (snapshot) => ({ teacherId: snapshot.id, ...snapshot.data() });

export async function getTeacher(teacherId) {
  requireDb();
  const snapshot = await getDoc(doc(db, 'teachers', teacherId));
  if (!snapshot.exists()) throw new Error('Teacher profile was not found.');
  return toTeacher(snapshot);
}

export async function getMyTeacherProfile() {
  requireDb();
  const link = await getDoc(doc(db, 'accountLinks', auth.currentUser.uid));
  if (!link.exists() || link.data().type !== 'teacher') throw new Error('No teacher profile is linked to this account.');
  return getTeacher(link.data().recordId);
}

export async function listTeachers({ search = '', employmentStatus } = {}) {
  requireDb();
  let recordsQuery = query(collection(db, 'teachers'), orderBy('employeeId'), limit(100));
  if (employmentStatus) recordsQuery = query(collection(db, 'teachers'), where('employmentStatus', '==', employmentStatus), orderBy('employeeId'), limit(100));
  const snapshot = await getDocs(recordsQuery);
  const normalizedSearch = String(search).trim().toLowerCase();
  return {
    teachers: snapshot.docs.map(toTeacher).filter((teacher) =>
      (!employmentStatus || teacher.employmentStatus === employmentStatus)
      && (!normalizedSearch || [teacher.employeeId, teacher.firstName, teacher.lastName, teacher.email].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))),
  };
}

export async function createSubject(input) {
  requireDb();
  const data = subjectInput(input);
  const subjectRef = doc(collection(db, 'subjects'));
  const codeRef = doc(db, 'subjectCodes', data.code);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(codeRef)).exists()) throw new Error('That subject code is already in use.');
    const timestamp = serverTimestamp();
    transaction.set(subjectRef, { ...data, createdAt: timestamp, createdBy: auth.currentUser.uid, updatedAt: timestamp, updatedBy: auth.currentUser.uid });
    transaction.set(codeRef, { subjectId: subjectRef.id });
  });
  return { subjectId: subjectRef.id };
}

export async function updateSubject(input) {
  requireDb();
  const subjectId = required(input.subjectId, 'Subject ID', 128);
  const data = subjectInput(input);
  await runTransaction(db, async (transaction) => {
    const subjectRef = doc(db, 'subjects', subjectId);
    const snapshot = await transaction.get(subjectRef);
    if (!snapshot.exists()) throw new Error('Subject was not found.');
    const oldCode = doc(db, 'subjectCodes', snapshot.data().code);
    const newCode = doc(db, 'subjectCodes', data.code);
    const [oldLock, newLock] = await Promise.all([
      transaction.get(oldCode),
      oldCode.path === newCode.path ? transaction.get(oldCode) : transaction.get(newCode),
    ]);
    if (newLock.exists() && newLock.data().subjectId !== subjectId) throw new Error('That subject code is already in use.');
    transaction.update(subjectRef, { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    if (oldCode.path !== newCode.path) {
      if (oldLock.exists()) transaction.delete(oldCode);
      transaction.set(newCode, { subjectId });
    }
  });
  return { success: true };
}

export async function getSubject(subjectId) {
  requireDb();
  const snapshot = await getDoc(doc(db, 'subjects', subjectId));
  if (!snapshot.exists()) throw new Error('Subject was not found.');
  return { subjectId: snapshot.id, ...snapshot.data() };
}

export async function listSubjects({ grade, stream, active, search = '' } = {}) {
  requireDb();
  const filters = [];
  if (grade) filters.push(where('applicableGrades', 'array-contains', Number(grade)));
  if (typeof active === 'boolean') filters.push(where('active', '==', active));
  const snapshot = await getDocs(query(collection(db, 'subjects'), ...filters, orderBy('code'), limit(100)));
  const normalizedSearch = String(search).toLowerCase();
  return {
    subjects: snapshot.docs.map((item) => ({ subjectId: item.id, ...item.data() }))
      .filter((subject) => (!stream || subject.applicableStreams.includes(stream))
        && (!normalizedSearch || subject.code.toLowerCase().includes(normalizedSearch) || subject.name.toLowerCase().includes(normalizedSearch))),
  };
}

export async function createTeacherAssignment(input) {
  requireDb();
  const data = {
    teacherId: required(input.teacherId, 'Teacher', 128),
    classId: required(input.classId, 'Class', 128),
    subjectId: required(input.subjectId, 'Subject', 128),
    academicYear: required(input.academicYear, 'Academic year', 20),
    periodsPerWeek: Number(input.periodsPerWeek),
    active: true,
  };
  if (!Number.isInteger(data.periodsPerWeek) || data.periodsPerWeek < 1 || data.periodsPerWeek > 40) throw new Error('Enter a valid weekly period count.');
  const assignmentRef = doc(collection(db, 'teacherAssignments'));
  const keyRef = doc(db, 'teacherAssignmentKeys', assignmentKey(data));
  await runTransaction(db, async (transaction) => {
    const lock = await transaction.get(keyRef);
    if (lock.exists()) throw new Error('An active assignment already exists for this teacher, class, subject, and year.');
    const [teacher, classRecord, subject] = await Promise.all([
      transaction.get(doc(db, 'teachers', data.teacherId)),
      transaction.get(doc(db, 'classes', data.classId)),
      transaction.get(doc(db, 'subjects', data.subjectId)),
    ]);
    if (!teacher.exists() || teacher.data().employmentStatus !== 'active'
      || !classRecord.exists() || !classRecord.data().active
      || !subject.exists() || !subject.data().active) throw new Error('Select active teacher, class, and subject records.');
    const timestamp = serverTimestamp();
    transaction.set(assignmentRef, { ...data, createdAt: timestamp, createdBy: auth.currentUser.uid, updatedAt: timestamp, updatedBy: auth.currentUser.uid });
    transaction.set(keyRef, { assignmentId: assignmentRef.id });
  });
  return { assignmentId: assignmentRef.id, ...data };
}

export async function updateTeacherAssignment(input) {
  requireDb();
  const assignmentIdValue = required(input.assignmentId, 'Assignment ID', 128);
  const ref = doc(db, 'teacherAssignments', assignmentIdValue);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Teacher assignment was not found.');
    const old = snapshot.data();
    const data = {
      teacherId: required(input.teacherId || old.teacherId, 'Teacher', 128),
      classId: required(input.classId || old.classId, 'Class', 128),
      subjectId: required(input.subjectId || old.subjectId, 'Subject', 128),
      academicYear: required(input.academicYear || old.academicYear, 'Academic year', 20),
      periodsPerWeek: Number(input.periodsPerWeek ?? old.periodsPerWeek),
      active: input.active !== false,
    };
    const usageSnapshot = await transaction.get(usageRef(assignmentIdValue));
    const used = usageSnapshot.exists() ? Number(usageSnapshot.data().count || 0) : 0;
    if (used && (!data.active || assignmentKey(data) !== assignmentKey(old) || data.periodsPerWeek < used)) {
      throw new Error('Deactivate or reschedule timetable entries before changing this assignment.');
    }
    const oldLock = doc(db, 'teacherAssignmentKeys', assignmentKey(old));
    const newLock = doc(db, 'teacherAssignmentKeys', assignmentKey(data));
    const [oldKey, newKey] = await Promise.all([transaction.get(oldLock), oldLock.path === newLock.path ? transaction.get(oldLock) : transaction.get(newLock)]);
    if (data.active && newKey.exists() && newKey.data().assignmentId !== assignmentIdValue) throw new Error('An active assignment already exists.');
    transaction.update(ref, { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    if (oldLock.path !== newLock.path && oldKey.exists()) transaction.delete(oldLock);
    if (data.active) transaction.set(newLock, { assignmentId: assignmentIdValue });
    else if (oldKey.exists()) transaction.delete(oldLock);
  });
  return { success: true };
}

export async function listTeacherAssignments(filters = {}) {
  requireDb();
  let teacherId = String(filters.teacherId || '');
  if (auth.currentUser && (await getDoc(doc(db, 'users', auth.currentUser.uid))).data()?.role === 'teacher') {
    const account = await getDoc(doc(db, 'accountLinks', auth.currentUser.uid));
    if (!account.exists() || account.data().type !== 'teacher') throw new Error('No teacher profile is linked to this account.');
    teacherId = account.data().recordId;
  }
  const clauses = [];
  if (teacherId) clauses.push(where('teacherId', '==', teacherId));
  if (filters.classId) clauses.push(where('classId', '==', filters.classId));
  if (filters.subjectId) clauses.push(where('subjectId', '==', filters.subjectId));
  if (filters.academicYear) clauses.push(where('academicYear', '==', filters.academicYear));
  if (typeof filters.active === 'boolean') clauses.push(where('active', '==', filters.active));
  const snapshot = await getDocs(query(collection(db, 'teacherAssignments'), ...clauses, orderBy('academicYear', 'desc'), limit(100)));
  const assignments = await Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data();
    const [teacher, classRecord, subject] = await Promise.all([
      getDoc(doc(db, 'teachers', data.teacherId)),
      getDoc(doc(db, 'classes', data.classId)),
      getDoc(doc(db, 'subjects', data.subjectId)),
    ]);
    return {
      assignmentId: item.id,
      ...data,
      teacherName: teacher.exists() ? `${teacher.data().firstName} ${teacher.data().lastName}` : '',
      employeeId: teacher.exists() ? teacher.data().employeeId : '',
      className: classRecord.exists() ? classRecord.data().name : '',
      grade: classRecord.exists() ? classRecord.data().grade : null,
      stream: classRecord.exists() ? classRecord.data().stream : null,
      subjectName: subject.exists() ? subject.data().name : '',
      subjectCode: subject.exists() ? subject.data().code : '',
    };
  }));
  return { assignments };
}

export async function getTimetableSettings() {
  requireDb();
  const snapshot = await getDoc(settingsRef());
  return { settings: snapshot.exists() ? snapshot.data() : null };
}

export async function saveTimetableSettings(input) {
  requireDb();
  const settings = {
    academicYear: required(input.academicYear, 'Academic year', 20),
    schoolDays: [...new Set(input.schoolDays || [])],
    periods: input.periods || [],
    periodsById: Object.fromEntries((input.periods || []).map((period) => [
      required(period.id, 'Period ID', 24),
      { type: period.type, startTime: period.startTime, endTime: period.endTime },
    ])),
    rooms: input.rooms || [],
    roomAllocationEnabled: input.roomAllocationEnabled === true,
    timeZone: input.timeZone || 'Africa/Addis_Ababa',
    maxPeriodsPerDay: input.maxPeriodsPerDay === '' ? null : input.maxPeriodsPerDay,
  };
  if (!settings.schoolDays.length || !settings.periods.length) throw new Error('Configure school days and periods.');
  await runTransaction(db, async (transaction) => {
    const ref = settingsRef();
    const old = await transaction.get(ref);
    if (old.exists()) throw new Error('Timetable settings are locked after initial creation. Clear timetable entries and ask the project owner to update settings safely.');
    transaction.set(ref, {
      ...settings,
      activeEntryCount: 0,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    });
  });
  return { success: true };
}

function timetableResources(entry, roomEnabled) {
  const resources = [
    { type: 'class', id: entry.classId },
    { type: 'teacher', id: entry.teacherId },
  ];
  if (roomEnabled && entry.room) resources.push({ type: 'room', id: entry.room });
  return resources;
}

async function scheduleEntry(input, entryId = null) {
  requireDb();
  const id = entryId || doc(collection(db, 'timetable')).id;
  const entryRef = doc(db, 'timetable', id);
  await runTransaction(db, async (transaction) => {
    const previousSnapshot = await transaction.get(entryRef);
    if (entryId && !previousSnapshot.exists()) throw new Error('Timetable entry was not found.');
    if (!entryId && previousSnapshot.exists()) throw new Error('Timetable entry already exists.');
    const previous = previousSnapshot.exists() ? previousSnapshot.data() : null;
    const entry = {
      classId: required(input.classId, 'Class', 128),
      teacherId: required(input.teacherId, 'Teacher', 128),
      subjectId: required(input.subjectId, 'Subject', 128),
      assignmentId: required(input.assignmentId, 'Assignment', 128),
      academicYear: required(input.academicYear, 'Academic year', 20),
      dayOfWeek: required(input.dayOfWeek, 'School day', 12).toLowerCase(),
      periodId: required(input.periodId, 'Period', 24),
    };
    const settingsDocument = await transaction.get(settingsRef());
    if (!settingsDocument.exists()) throw new Error('Configure the school timetable first.');
    const settings = settingsDocument.data();
    const period = settings.periods.find((item) => item.id === entry.periodId);
    if (!settings.schoolDays.includes(entry.dayOfWeek) || !period || period.type !== 'lesson') throw new Error('Choose a configured school day and lesson period.');
    entry.startTime = period.startTime;
    entry.endTime = period.endTime;
    entry.room = String(input.room || '').trim() || null;
    entry.active = true;
    if (entry.academicYear !== settings.academicYear) throw new Error('Academic year must match timetable settings.');
    if (settings.roomAllocationEnabled && (!entry.room || !settings.rooms.includes(entry.room))) throw new Error('Choose a configured room.');
    if (!settings.roomAllocationEnabled && entry.room) throw new Error('Room allocation is not enabled.');

    const references = [
      doc(db, 'teacherAssignments', entry.assignmentId),
      doc(db, 'classes', entry.classId),
      doc(db, 'teachers', entry.teacherId),
      doc(db, 'subjects', entry.subjectId),
    ];
    const [assignment, classRecord, teacher, subject] = await Promise.all(references.map((ref) => transaction.get(ref)));
    if (!assignment.exists() || !assignment.data().active
      || !classRecord.exists() || !classRecord.data().active
      || !teacher.exists() || teacher.data().employmentStatus !== 'active'
      || !subject.exists() || !subject.data().active) throw new Error('The selected timetable references must all be active.');
    if (assignment.data().teacherId !== entry.teacherId || assignment.data().classId !== entry.classId || assignment.data().subjectId !== entry.subjectId) {
      throw new Error('Teacher, class, and subject must match the selected assignment.');
    }
    if (assignment.data().academicYear !== entry.academicYear) throw new Error('Assignment academic year does not match.');
    const specs = timetableResources(entry, settings.roomAllocationEnabled);
    const oldSpecs = previous?.active ? timetableResources(previous, settings.roomAllocationEnabled || Boolean(previous.room)) : [];
    const allSpecs = [...new Map([...specs, ...oldSpecs].map((spec) => {
      const ref = lockRef(spec.type, spec.id, spec.type === 'class' || spec.type === 'teacher' || spec.type === 'room'
        ? (spec.type === 'class' || spec.type === 'teacher' ? entry : entry)
        : entry);
      return [ref.path, { ...spec, ref }];
    })).values()];
    const oldLockRefs = oldSpecs.map((spec) => lockRef(spec.type, spec.id, previous));
    const targetLockRefs = specs.map((spec) => lockRef(spec.type, spec.id, entry));
    const uniqueLockRefs = [...new Map([...allSpecs.map(({ ref }) => ref), ...oldLockRefs, ...targetLockRefs].map((ref) => [ref.path, ref])).values()];
    const lockSnapshots = await Promise.all(uniqueLockRefs.map((ref) => transaction.get(ref)));
    const lockByPath = new Map(uniqueLockRefs.map((ref, index) => [ref.path, lockSnapshots[index]]));
    for (const ref of targetLockRefs) {
      const lock = lockByPath.get(ref.path);
      if (lock.exists() && lock.data().entryId !== id) throw new Error('The selected class, teacher, or room is already scheduled in this period.');
    }
    const useRef = usageRef(entry.assignmentId);
    const useSnapshot = await transaction.get(useRef);
    const currentCount = useSnapshot.exists() ? Number(useSnapshot.data().count || 0) : 0;
    if ((!previous?.active || previous.assignmentId !== entry.assignmentId) && currentCount >= assignment.data().periodsPerWeek) {
      throw new Error('This assignment already has its configured number of weekly periods.');
    }
    const oldUsageRef = previous?.active ? usageRef(previous.assignmentId) : null;
    const oldUsageSnapshot = oldUsageRef ? await transaction.get(oldUsageRef) : null;
    const timestamp = serverTimestamp();
    for (const ref of oldLockRefs) {
      if (!targetLockRefs.some((target) => target.path === ref.path)) transaction.delete(ref);
    }
    for (const [index, spec] of specs.entries()) {
      const ref = targetLockRefs[index];
      const current = lockByPath.get(ref.path);
      if (!current.exists()) {
        transaction.set(ref, {
          entryId: id,
          resourceType: spec.type,
          resourceId: spec.id,
          academicYear: entry.academicYear,
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
        });
      }
    }
    if (previous?.active && previous.assignmentId !== entry.assignmentId && oldUsageSnapshot?.exists()) {
      transaction.set(oldUsageRef, { count: Math.max(0, Number(oldUsageSnapshot.data().count || 0) - 1), updatedAt: timestamp });
    }
    if (!previous?.active || previous.assignmentId !== entry.assignmentId) transaction.set(useRef, { count: currentCount + 1, updatedAt: timestamp });
    transaction.set(entryRef, {
      ...entry,
      createdAt: previous?.createdAt || timestamp,
      createdBy: previous?.createdBy || auth.currentUser.uid,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
  });
  return { entryId: id };
}

export const createTimetableEntry = (data) => scheduleEntry(data);

export async function updateTimetableEntry(data) {
  return scheduleEntry(data, required(data.entryId, 'Timetable entry ID', 128));
}

export async function deactivateTimetableEntry(entryId) {
  requireDb();
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'timetable', required(entryId, 'Timetable entry ID', 128));
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Timetable entry was not found.');
    const entry = snapshot.data();
    if (!entry.active) return;
    const settings = await transaction.get(settingsRef());
    const specs = timetableResources(entry, settings.exists() && settings.data().roomAllocationEnabled || Boolean(entry.room));
    const refs = specs.map((spec) => lockRef(spec.type, spec.id, entry));
    const lockSnapshots = await Promise.all(refs.map((lock) => transaction.get(lock)));
    const usage = await transaction.get(usageRef(entry.assignmentId));
    const timestamp = serverTimestamp();
    refs.forEach((lock, index) => {
      if (lockSnapshots[index].exists() && lockSnapshots[index].data().entryId === entryId) transaction.delete(lock);
    });
    if (usage.exists()) transaction.set(usageRef(entry.assignmentId), { count: Math.max(0, Number(usage.data().count || 0) - 1), updatedAt: timestamp });
    transaction.update(ref, { active: false, updatedAt: timestamp, updatedBy: auth.currentUser.uid });
  });
  return { success: true };
}

export async function getTimetableEntry(entryId) {
  requireDb();
  const snapshot = await getDoc(doc(db, 'timetable', entryId));
  if (!snapshot.exists()) throw new Error('Timetable entry was not found.');
  return { entryId: snapshot.id, ...snapshot.data() };
}

export async function listTimetable(filters = {}) {
  requireDb();
  const profileSnapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const role = profileSnapshot.exists() ? profileSnapshot.data().role : null;
  const clauses = [];
  if (role === 'teacher') {
    const link = await getDoc(doc(db, 'accountLinks', auth.currentUser.uid));
    if (!link.exists() || link.data().type !== 'teacher') return { entries: [] };
    clauses.push(where('teacherId', '==', link.data().recordId));
  } else if (filters.classId) clauses.push(where('classId', '==', filters.classId));
  if (filters.classId && role === 'teacher') clauses.push(where('classId', '==', filters.classId));
  if (filters.teacherId && role !== 'teacher') clauses.push(where('teacherId', '==', filters.teacherId));
  if (filters.active !== undefined) clauses.push(where('active', '==', filters.active));
  const snapshot = await getDocs(query(collection(db, 'timetable'), ...clauses, orderBy('dayOfWeek'), orderBy('periodId'), limit(300)));
  return { entries: snapshot.docs.map((item) => ({ entryId: item.id, ...item.data() })) };
}
