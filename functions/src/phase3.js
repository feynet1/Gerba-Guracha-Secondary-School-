const { createHash } = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const {
  DAYS,
  EMPLOYMENT_STATUSES,
  GRADES,
  STREAMS,
  overlaps,
  timeToMinutes,
  validateGradeStreams,
  validateSubjectApplicability,
  validateTimetableSettings,
} = require('./phase3Validation');

const auth = getAuth();
const db = getFirestore();
const ADMIN = new Set(['admin']);
const STAFF_READ = new Set(['admin', 'director']);
const TEACHER_READ = new Set(['admin', 'director', 'teacher']);
const clean = (value) => String(value ?? '').trim();
const key = (...parts) => createHash('sha256').update(parts.join('|').toLowerCase()).digest('hex');
const timestamp = () => FieldValue.serverTimestamp();

function assertAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
}

function assertRole(request, roles) {
  assertAuth(request);
  if (!roles.has(request.auth.token.role)) throw new HttpsError('permission-denied', 'You are not authorized to perform this operation.');
}

function text(value, field, limit = 100) {
  const result = clean(value);
  if (!result || result.length > limit) throw new HttpsError('invalid-argument', `${field} is required and must be at most ${limit} characters.`);
  return result;
}

function validEmail(value) {
  const email = clean(value).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  return email;
}

function validate(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('invalid-argument', error.message);
  }
}

function teacherData(input, existing = {}) {
  const employeeId = text(input.employeeId, 'Employee ID', 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(employeeId)) {
    throw new HttpsError('invalid-argument', 'Employee ID can contain letters, numbers, hyphens, and underscores.');
  }
  const status = clean(input.employmentStatus || existing.employmentStatus || 'active').toLowerCase();
  if (!EMPLOYMENT_STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Choose a valid employment status.');
  const specializations = Array.isArray(input.specialization)
    ? [...new Set(input.specialization.map((value) => text(value, 'Specialization', 60)))]
    : [];
  if (specializations.length > 20) throw new HttpsError('invalid-argument', 'A teacher can have at most 20 specializations.');
  const gender = clean(input.gender || existing.gender || '').toLowerCase();
  if (gender && !['male', 'female'].includes(gender)) throw new HttpsError('invalid-argument', 'Choose a valid gender.');
  const profile = {
    employeeId,
    firstName: text(input.firstName, 'First name'),
    middleName: clean(input.middleName).slice(0, 100),
    lastName: text(input.lastName, 'Last name'),
    gender: gender || null,
    phone: clean(input.phone).slice(0, 30),
    email: validEmail(input.email),
    qualification: clean(input.qualification).slice(0, 120),
    specialization: specializations,
    employmentStatus: status,
  };
  profile.searchEmployeeId = employeeId.toLowerCase();
  profile.searchFirstName = profile.firstName.toLowerCase();
  profile.searchLastName = profile.lastName.toLowerCase();
  profile.searchEmail = profile.email.toLowerCase();
  return profile;
}

function subjectData(input) {
  if (input.active !== undefined && typeof input.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Subject active status must be a boolean.');
  }
  const code = text(input.code, 'Subject code', 20).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Subject codes must contain 2-20 letters, numbers, hyphens, or underscores.');
  }
  const applicability = validate(() => validateGradeStreams(input.applicableGrades, input.applicableStreams || []));
  const periodsPerWeek = Number(input.periodsPerWeek);
  if (!Number.isInteger(periodsPerWeek) || periodsPerWeek < 1 || periodsPerWeek > 40) {
    throw new HttpsError('invalid-argument', 'Periods per week must be a whole number from 1 to 40.');
  }
  return {
    code,
    name: text(input.name, 'Subject name', 100),
    description: clean(input.description).slice(0, 500),
    applicableGrades: applicability.grades,
    applicableStreams: applicability.streams,
    periodsPerWeek,
    active: input.active !== false,
  };
}

function settingsRef() {
  return db.collection('schoolSettings').doc('timetable');
}

function validateAssignmentReferences(teacher, classRecord, subject, academicYear, periodsPerWeek) {
  if (!teacher || teacher.employmentStatus !== 'active') throw new HttpsError('failed-precondition', 'Select an active teacher.');
  if (!classRecord || !classRecord.active) throw new HttpsError('failed-precondition', 'Select an active class.');
  if (!subject || !subject.active) throw new HttpsError('failed-precondition', 'Select an active subject.');
  if (!validateSubjectApplicability(subject, classRecord)) {
    throw new HttpsError('failed-precondition', 'The subject does not apply to the selected class grade and stream.');
  }
  if (academicYear !== classRecord.academicYear) throw new HttpsError('failed-precondition', 'Academic year must match the selected class.');
  const count = Number(periodsPerWeek);
  if (!Number.isInteger(count) || count < 1 || count > subject.periodsPerWeek) {
    throw new HttpsError('invalid-argument', `Periods per week must be between 1 and ${subject.periodsPerWeek}.`);
  }
}

function assignmentKey(record) {
  return key('assignment', record.teacherId, record.classId, record.subjectId, record.academicYear);
}

function slotLockRef(type, resourceId, year, day) {
  return db.collection('timetableSlotLocks').doc(key(type, resourceId, year, day));
}

function assignmentUsageRef(assignmentId) {
  return db.collection('assignmentScheduleUsage').doc(assignmentId);
}

function resourceSpecs(entry, settings) {
  const specs = [
    { type: 'class', id: entry.classId, conflict: 'class' },
    { type: 'teacher', id: entry.teacherId, conflict: 'teacher' },
  ];
  if (settings.roomAllocationEnabled) specs.push({ type: 'room', id: entry.room, conflict: 'room' });
  return specs.map((spec) => ({
    ...spec,
    ref: slotLockRef(spec.type, spec.id, entry.academicYear, entry.dayOfWeek),
  }));
}

function assertNoOverlap(existing, proposed, ignoredEntryId, conflictType) {
  for (const reservation of existing) {
    if (reservation.entryId === ignoredEntryId) continue;
    if (overlaps(proposed, reservation)) {
      if (conflictType === 'class') throw new HttpsError('already-exists', 'This class already has a lesson during this period.');
      if (conflictType === 'teacher') throw new HttpsError('already-exists', 'This teacher is already assigned to another class during this period.');
      if (conflictType === 'room') throw new HttpsError('already-exists', 'This room is already occupied during this period.');
    }
  }
}

function periodFor(settings, input) {
  if (!settings.schoolDays.includes(input.dayOfWeek)) throw new HttpsError('invalid-argument', 'Choose a configured school day.');
  const period = settings.periods.find((item) => item.id === input.periodId);
  if (!period) throw new HttpsError('invalid-argument', 'Choose a period from the timetable configuration.');
  if (period.type !== 'lesson') throw new HttpsError('failed-precondition', 'Break periods cannot be scheduled as lessons.');
  if (input.startTime !== period.startTime || input.endTime !== period.endTime) {
    throw new HttpsError('invalid-argument', 'Lesson times must match the selected configured period.');
  }
  if (timeToMinutes(period.startTime) >= timeToMinutes(period.endTime)) {
    throw new HttpsError('invalid-argument', 'Configured period times are invalid.');
  }
  return period;
}

function validateEntryFromSnapshots(input, assignmentSnapshot, classSnapshot, teacherSnapshot, subjectSnapshot, settingsSnapshot) {
  if (!assignmentSnapshot.exists || !assignmentSnapshot.data().active) {
    throw new HttpsError('failed-precondition', 'Select an active teacher assignment.');
  }
  if (!classSnapshot.exists || !classSnapshot.data().active) throw new HttpsError('failed-precondition', 'The assigned class is inactive.');
  if (!teacherSnapshot.exists || teacherSnapshot.data().employmentStatus !== 'active') {
    throw new HttpsError('failed-precondition', 'The assigned teacher is inactive.');
  }
  if (!subjectSnapshot.exists || !subjectSnapshot.data().active) throw new HttpsError('failed-precondition', 'The assigned subject is inactive.');
  if (!settingsSnapshot.exists) throw new HttpsError('failed-precondition', 'Configure school timetable settings first.');
  const assignment = assignmentSnapshot.data();
  const classRecord = classSnapshot.data();
  if (!validateSubjectApplicability(subjectSnapshot.data(), classRecord)) {
    throw new HttpsError('failed-precondition', 'The subject no longer applies to the selected class grade and stream.');
  }
  const settings = settingsSnapshot.data();
  const academicYear = text(input.academicYear, 'Academic year', 20);
  if (academicYear !== settings.academicYear || academicYear !== assignment.academicYear) {
    throw new HttpsError('failed-precondition', 'Timetable academic year must match the active configuration and assignment.');
  }
  if (assignment.classId !== input.classId || assignment.teacherId !== input.teacherId || assignment.subjectId !== input.subjectId) {
    throw new HttpsError('failed-precondition', 'Teacher, class, and subject must match the selected assignment.');
  }
  if (assignment.classId !== classRecord.classId && classRecord.classId) {
    throw new HttpsError('failed-precondition', 'Assignment class does not match the selected class.');
  }
  const period = periodFor(settings, input);
  const room = clean(input.room);
  if (settings.roomAllocationEnabled && (!room || !settings.rooms.includes(room))) {
    throw new HttpsError('invalid-argument', 'Choose a configured room.');
  }
  if (!settings.roomAllocationEnabled && room) throw new HttpsError('invalid-argument', 'Room assignment is not enabled in the timetable settings.');
  return {
    classId: assignment.classId,
    teacherId: assignment.teacherId,
    subjectId: assignment.subjectId,
    assignmentId: input.assignmentId,
    academicYear,
    dayOfWeek: clean(input.dayOfWeek),
    periodId: period.id,
    startTime: period.startTime,
    endTime: period.endTime,
    room: room || null,
    active: true,
  };
}

function cleanProfile(doc, id) {
  const record = doc.data();
  return {
    teacherId: id,
    employeeId: record.employeeId,
    firstName: record.firstName,
    middleName: record.middleName || '',
    lastName: record.lastName,
    gender: record.gender || null,
    phone: record.phone || '',
    email: record.email || '',
    qualification: record.qualification || '',
    specialization: record.specialization || [],
    employmentStatus: record.employmentStatus,
    userId: record.userId || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

exports.createTeacher = onCall(async (request) => {
  assertRole(request, ADMIN);
  const data = teacherData(request.data || {});
  const ref = db.collection('teachers').doc();
  const employeeRef = db.collection('employeeIds').doc(key(data.employeeId));
  await db.runTransaction(async (transaction) => {
    const locked = await transaction.get(employeeRef);
    if (locked.exists) throw new HttpsError('already-exists', 'That employee ID is already in use.');
    transaction.create(ref, {
      ...data,
      userId: null,
      assignedClassIds: [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
      createdBy: request.auth.uid,
      updatedBy: request.auth.uid,
    });
    transaction.create(employeeRef, { teacherId: ref.id });
  });
  return { teacherId: ref.id };
});

exports.updateTeacher = onCall(async (request) => {
  assertRole(request, ADMIN);
  const teacherId = text(request.data?.teacherId, 'Teacher ID', 128);
  const updates = teacherData(request.data || {});
  const ref = db.collection('teachers').doc(teacherId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) throw new HttpsError('not-found', 'Teacher profile was not found.');
    const current = existing.data();
    const oldEmployeeRef = db.collection('employeeIds').doc(key(current.employeeId));
    const newEmployeeRef = db.collection('employeeIds').doc(key(updates.employeeId));
    const oldLock = await transaction.get(oldEmployeeRef);
    const newLock = oldEmployeeRef.path === newEmployeeRef.path ? oldLock : await transaction.get(newEmployeeRef);
    if (newLock.exists && newLock.data().teacherId !== teacherId) {
      throw new HttpsError('already-exists', 'That employee ID is already in use.');
    }
    transaction.update(ref, { ...updates, updatedAt: timestamp(), updatedBy: request.auth.uid });
    if (oldEmployeeRef.path !== newEmployeeRef.path) {
      if (oldLock.exists && oldLock.data().teacherId === teacherId) transaction.delete(oldEmployeeRef);
      transaction.set(newEmployeeRef, { teacherId });
    }
  });
  return { success: true };
});

exports.linkTeacherAccount = onCall(async (request) => {
  assertRole(request, ADMIN);
  const teacherId = text(request.data?.teacherId, 'Teacher ID', 128);
  const userId = text(request.data?.userId, 'User ID', 128);
  const userRecord = await auth.getUser(userId);
  if (userRecord.customClaims?.role !== 'teacher') {
    throw new HttpsError('failed-precondition', 'The linked account must have the teacher role.');
  }
  const teacherRef = db.collection('teachers').doc(teacherId);
  const accountRef = db.collection('accountLinks').doc(userId);
  await db.runTransaction(async (transaction) => {
    const [teacher, account] = await Promise.all([transaction.get(teacherRef), transaction.get(accountRef)]);
    if (!teacher.exists) throw new HttpsError('not-found', 'Teacher profile was not found.');
    if (account.exists && (account.data().type !== 'teacher' || account.data().recordId !== teacherId)) {
      throw new HttpsError('already-exists', 'This account is already linked to another record.');
    }
    const oldUserId = teacher.data().userId;
    const oldAccountRef = oldUserId && oldUserId !== userId ? db.collection('accountLinks').doc(oldUserId) : null;
    const oldAccount = oldAccountRef ? await transaction.get(oldAccountRef) : null;
    transaction.update(teacherRef, { userId, updatedAt: timestamp(), updatedBy: request.auth.uid });
    transaction.set(accountRef, { type: 'teacher', recordId: teacherId });
    if (oldAccount?.exists && oldAccount.data().type === 'teacher' && oldAccount.data().recordId === teacherId) {
      transaction.delete(oldAccountRef);
    }
  });
  return { success: true };
});

exports.getMyTeacherProfile = onCall(async (request) => {
  assertRole(request, new Set(['teacher']));
  const account = await db.collection('accountLinks').doc(request.auth.uid).get();
  if (!account.exists || account.data().type !== 'teacher') throw new HttpsError('not-found', 'No teacher profile is linked to this account.');
  const snapshot = await db.collection('teachers').doc(account.data().recordId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Teacher profile was not found.');
  return cleanProfile(snapshot, snapshot.id);
});

exports.getTeacher = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const teacherId = text(request.data?.teacherId, 'Teacher ID', 128);
  const snapshot = await db.collection('teachers').doc(teacherId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Teacher profile was not found.');
  if (request.auth.token.role === 'teacher') {
    const account = await db.collection('accountLinks').doc(request.auth.uid).get();
    if (!account.exists || account.data().recordId !== teacherId || account.data().type !== 'teacher') {
      throw new HttpsError('permission-denied', 'Teachers can only view their own profile.');
    }
  }
  const record = cleanProfile(snapshot, snapshot.id);
  if (request.auth.token.role === 'director') {
    delete record.phone;
    delete record.email;
    delete record.userId;
  }
  return record;
});

exports.listTeachers = onCall(async (request) => {
  assertRole(request, STAFF_READ);
  const search = clean(request.data?.search).toLowerCase().slice(0, 80);
  const status = clean(request.data?.employmentStatus);
  if (status && !EMPLOYMENT_STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Choose a valid employment status.');
  const base = db.collection('teachers');
  let records;
  if (search) {
    const fields = ['searchEmployeeId', 'searchFirstName', 'searchLastName', 'searchEmail'];
    const snapshots = await Promise.all(fields.map((field) => base.where(field, '>=', search)
      .where(field, '<=', `${search}\uf8ff`).orderBy(field).limit(100).get()));
    const docs = new Map();
    snapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => docs.set(doc.id, doc)));
    records = [...docs.values()].filter((doc) => !status || doc.data().employmentStatus === status);
  } else {
    let query = base;
    if (status) query = query.where('employmentStatus', '==', status);
    const snapshot = await query.orderBy('employeeId').limit(100).get();
    records = snapshot.docs;
  }
  return {
    teachers: records.map((doc) => {
      const result = cleanProfile(doc, doc.id);
      if (request.auth.token.role === 'director') {
        delete result.phone;
        delete result.email;
        delete result.userId;
      }
      return result;
    }),
  };
});

exports.createSubject = onCall(async (request) => {
  assertRole(request, ADMIN);
  const data = subjectData(request.data || {});
  const ref = db.collection('subjects').doc();
  const lockRef = db.collection('subjectCodes').doc(key(data.code));
  await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    if (lock.exists) throw new HttpsError('already-exists', 'That subject code is already in use.');
    transaction.create(ref, { ...data, createdAt: timestamp(), updatedAt: timestamp(), createdBy: request.auth.uid, updatedBy: request.auth.uid });
    transaction.create(lockRef, { subjectId: ref.id });
  });
  return { subjectId: ref.id };
});

exports.updateSubject = onCall(async (request) => {
  assertRole(request, ADMIN);
  const subjectId = text(request.data?.subjectId, 'Subject ID', 128);
  const updates = subjectData(request.data || {});
  const ref = db.collection('subjects').doc(subjectId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Subject was not found.');
    const oldLockRef = db.collection('subjectCodes').doc(key(snapshot.data().code));
    const newLockRef = db.collection('subjectCodes').doc(key(updates.code));
    const oldLock = await transaction.get(oldLockRef);
    const newLock = oldLockRef.path === newLockRef.path ? oldLock : await transaction.get(newLockRef);
    if (newLock.exists && newLock.data().subjectId !== subjectId) throw new HttpsError('already-exists', 'That subject code is already in use.');
    const assignments = await transaction.get(db.collection('teacherAssignments')
      .where('subjectId', '==', subjectId)
      .where('active', '==', true));
    const activeAssignments = assignments.docs.map((doc) => ({ assignmentId: doc.id, ...doc.data() }));
    const classSnapshots = await Promise.all(activeAssignments.map((assignment) => transaction.get(db.collection('classes').doc(assignment.classId))));
    activeAssignments.forEach((assignment, index) => {
      if (assignment.periodsPerWeek > updates.periodsPerWeek) {
        throw new HttpsError('failed-precondition', 'Subject weekly periods cannot be reduced below an active assignment.');
      }
      const classSnapshot = classSnapshots[index];
      if (classSnapshot.exists && !validateSubjectApplicability(updates, classSnapshot.data())) {
        throw new HttpsError('failed-precondition', 'Subject grades or streams cannot be changed while active assignments use an incompatible class.');
      }
    });
    transaction.update(ref, { ...updates, updatedAt: timestamp(), updatedBy: request.auth.uid });
    if (oldLockRef.path !== newLockRef.path) {
      if (oldLock.exists && oldLock.data().subjectId === subjectId) transaction.delete(oldLockRef);
      transaction.set(newLockRef, { subjectId });
    }
  });
  return { success: true };
});

exports.getSubject = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const subjectId = text(request.data?.subjectId, 'Subject ID', 128);
  const snapshot = await db.collection('subjects').doc(subjectId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Subject was not found.');
  return { subjectId: snapshot.id, ...snapshot.data() };
});

exports.listSubjects = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const grade = request.data?.grade ? Number(request.data.grade) : null;
  const stream = clean(request.data?.stream);
  const active = request.data?.active;
  const search = clean(request.data?.search).toLowerCase().slice(0, 80);
  if (grade !== null && !GRADES.has(grade)) throw new HttpsError('invalid-argument', 'Choose a grade between 9 and 12.');
  if (stream && !STREAMS.has(stream)) throw new HttpsError('invalid-argument', 'Choose a valid stream.');
  let query = db.collection('subjects');
  if (grade !== null) query = query.where('applicableGrades', 'array-contains', grade);
  else if (stream) query = query.where('applicableStreams', 'array-contains', stream);
  if (typeof active === 'boolean') query = query.where('active', '==', active);
  const snapshot = await query.orderBy('code').limit(100).get();
  const subjects = snapshot.docs
    .map((doc) => ({ subjectId: doc.id, ...doc.data() }))
    .filter((subject) => (!search || subject.code.toLowerCase().includes(search) || subject.name.toLowerCase().includes(search))
      && (!grade || !stream || subject.applicableStreams.includes(stream)));
  return { subjects };
});

async function assignmentInput(transaction, input, existing) {
  const teacherId = text(input.teacherId || existing?.teacherId, 'Teacher', 128);
  const classId = text(input.classId || existing?.classId, 'Class', 128);
  const subjectId = text(input.subjectId || existing?.subjectId, 'Subject', 128);
  const academicYear = text(input.academicYear || existing?.academicYear, 'Academic year', 20);
  const periodsPerWeek = Number(input.periodsPerWeek ?? existing?.periodsPerWeek);
  const [teacherSnapshot, classSnapshot, subjectSnapshot] = await Promise.all([
    transaction.get(db.collection('teachers').doc(teacherId)),
    transaction.get(db.collection('classes').doc(classId)),
    transaction.get(db.collection('subjects').doc(subjectId)),
  ]);
  const classRecord = classSnapshot.exists ? { classId, ...classSnapshot.data() } : null;
  if (input.active !== undefined && typeof input.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Assignment active status must be a boolean.');
  }
  if (input.active !== false) {
    validateAssignmentReferences(
      teacherSnapshot.exists ? teacherSnapshot.data() : null,
      classRecord,
      subjectSnapshot.exists ? subjectSnapshot.data() : null,
      academicYear,
      periodsPerWeek,
    );
  } else if (!teacherSnapshot.exists || !classRecord || !subjectSnapshot.exists) {
    throw new HttpsError('failed-precondition', 'The assignment references a missing teacher, class, or subject.');
  }
  return { teacherId, classId, subjectId, academicYear, periodsPerWeek };
}

exports.createTeacherAssignment = onCall(async (request) => {
  assertRole(request, ADMIN);
  const ref = db.collection('teacherAssignments').doc();
  const record = await db.runTransaction(async (transaction) => {
    const data = await assignmentInput(transaction, { ...(request.data || {}), active: true });
    const lockRef = db.collection('teacherAssignmentKeys').doc(assignmentKey(data));
    const lock = await transaction.get(lockRef);
    if (lock.exists) throw new HttpsError('already-exists', 'An active assignment already exists for this teacher, class, subject, and academic year.');
    transaction.create(ref, {
      ...data,
      active: true,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      createdBy: request.auth.uid,
      updatedBy: request.auth.uid,
    });
    transaction.create(lockRef, { assignmentId: ref.id });
    return data;
  });
  return { assignmentId: ref.id, ...record };
});

exports.updateTeacherAssignment = onCall(async (request) => {
  assertRole(request, ADMIN);
  const assignmentId = text(request.data?.assignmentId, 'Assignment ID', 128);
  const ref = db.collection('teacherAssignments').doc(assignmentId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Teacher assignment was not found.');
    const current = snapshot.data();
    const active = request.data?.active !== false;
    const data = await assignmentInput(transaction, request.data || {}, current);
    const currentUsage = await transaction.get(assignmentUsageRef(assignmentId));
    if (currentUsage.exists && (currentUsage.data().count || 0) > 0
      && (!active || assignmentKey(data) !== assignmentKey(current) || data.periodsPerWeek < (currentUsage.data().count || 0))) {
      throw new HttpsError('failed-precondition', 'Deactivate or reschedule this assignment’s timetable entries before changing it.');
    }
    const oldKeyRef = db.collection('teacherAssignmentKeys').doc(assignmentKey(current));
    const newKeyRef = db.collection('teacherAssignmentKeys').doc(assignmentKey(data));
    const oldLock = await transaction.get(oldKeyRef);
    const newLock = oldKeyRef.path === newKeyRef.path ? oldLock : await transaction.get(newKeyRef);
    if (active && newLock.exists && newLock.data().assignmentId !== assignmentId) {
      throw new HttpsError('already-exists', 'An active assignment already exists for this teacher, class, subject, and academic year.');
    }
    transaction.update(ref, { ...data, active, updatedAt: timestamp(), updatedBy: request.auth.uid });
    if (oldKeyRef.path !== newKeyRef.path && oldLock.exists && oldLock.data().assignmentId === assignmentId) {
      transaction.delete(oldKeyRef);
    }
    if (active) transaction.set(newKeyRef, { assignmentId });
    else if (oldLock.exists && oldLock.data().assignmentId === assignmentId) transaction.delete(oldKeyRef);
  });
  return { success: true };
});

exports.listTeacherAssignments = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const filters = request.data || {};
  let teacherId = clean(filters.teacherId);
  if (request.auth.token.role === 'teacher') {
    const account = await db.collection('accountLinks').doc(request.auth.uid).get();
    if (!account.exists || account.data().type !== 'teacher') throw new HttpsError('not-found', 'No teacher profile is linked to this account.');
    teacherId = account.data().recordId;
  }
  let query = db.collection('teacherAssignments');
  if (teacherId) query = query.where('teacherId', '==', teacherId);
  if (filters.classId) query = query.where('classId', '==', text(filters.classId, 'Class ID', 128));
  if (filters.subjectId) query = query.where('subjectId', '==', text(filters.subjectId, 'Subject ID', 128));
  if (filters.academicYear) query = query.where('academicYear', '==', text(filters.academicYear, 'Academic year', 20));
  if (typeof filters.active === 'boolean') query = query.where('active', '==', filters.active);
  const snapshot = await query.orderBy('academicYear', 'desc').limit(100).get();
  const assignments = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const [teacher, classRecord, subject] = await Promise.all([
      db.collection('teachers').doc(data.teacherId).get(),
      db.collection('classes').doc(data.classId).get(),
      db.collection('subjects').doc(data.subjectId).get(),
    ]);
    return {
      assignmentId: doc.id,
      ...data,
      teacherName: teacher.exists ? `${teacher.data().firstName} ${teacher.data().lastName}` : '',
      employeeId: teacher.exists ? teacher.data().employeeId : '',
      className: classRecord.exists ? classRecord.data().name : '',
      grade: classRecord.exists ? classRecord.data().grade : null,
      stream: classRecord.exists ? classRecord.data().stream : null,
      subjectName: subject.exists ? subject.data().name : '',
      subjectCode: subject.exists ? subject.data().code : '',
    };
  }));
  return { assignments };
});

exports.getTimetableSettings = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const snapshot = await settingsRef().get();
  return { settings: snapshot.exists ? snapshot.data() : null };
});

exports.saveTimetableSettings = onCall(async (request) => {
  assertRole(request, ADMIN);
  const data = validate(() => validateTimetableSettings(request.data || {}));
  const ref = settingsRef();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && (snapshot.data().activeEntryCount || 0) > 0) {
      throw new HttpsError('failed-precondition', 'Deactivate scheduled lessons before changing school timetable settings.');
    }
    transaction.set(ref, {
      ...data,
      activeEntryCount: snapshot.exists ? (snapshot.data().activeEntryCount || 0) : 0,
      updatedAt: timestamp(),
      updatedBy: request.auth.uid,
      ...(snapshot.exists ? {} : { createdAt: timestamp(), createdBy: request.auth.uid }),
    });
  });
  return { success: true };
});

async function writeTimetable(request, entryId) {
  assertRole(request, ADMIN);
  const input = request.data || {};
  const id = entryId || db.collection('timetable').doc().id;
  const entryRef = db.collection('timetable').doc(id);
  const existingSnapshotOutside = entryId ? await entryRef.get() : null;
  if (entryId && !existingSnapshotOutside.exists) throw new HttpsError('not-found', 'Timetable entry was not found.');
  const previous = existingSnapshotOutside?.data() || null;
  const assignmentId = text(input.assignmentId, 'Assignment', 128);
  const assignmentRef = db.collection('teacherAssignments').doc(assignmentId);
  const classRef = db.collection('classes').doc(text(input.classId, 'Class', 128));
  const teacherRef = db.collection('teachers').doc(text(input.teacherId, 'Teacher', 128));
  const subjectRef = db.collection('subjects').doc(text(input.subjectId, 'Subject', 128));
  const settingsDocument = settingsRef();

  const targetPreview = {
    classId: classRef.id,
    teacherId: teacherRef.id,
    subjectId: subjectRef.id,
    assignmentId,
    academicYear: text(input.academicYear, 'Academic year', 20),
    dayOfWeek: text(input.dayOfWeek, 'School day', 12).toLowerCase(),
    periodId: text(input.periodId, 'Period', 24),
    startTime: clean(input.startTime),
    endTime: clean(input.endTime),
    room: clean(input.room),
  };
  const activePrevious = previous?.active ? previous : null;
  const useRef = assignmentUsageRef(assignmentId);
  const oldUseRef = activePrevious ? assignmentUsageRef(activePrevious.assignmentId) : null;

  await db.runTransaction(async (transaction) => {
    const [entrySnapshot, assignmentSnapshot, classSnapshot, teacherSnapshot, subjectSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(entryRef),
      transaction.get(assignmentRef),
      transaction.get(classRef),
      transaction.get(teacherRef),
      transaction.get(subjectRef),
      transaction.get(settingsDocument),
    ]);
    if (entryId && (!entrySnapshot.exists || entrySnapshot.data().updatedAt?.toMillis?.() !== previous.updatedAt?.toMillis?.())) {
      throw new HttpsError('aborted', 'This timetable entry changed while you were editing it. Reload and try again.');
    }
    if (!entryId && entrySnapshot.exists) throw new HttpsError('already-exists', 'Timetable entry already exists.');
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : null;
    if (!settings) throw new HttpsError('failed-precondition', 'Configure school timetable settings first.');
    const entry = validateEntryFromSnapshots(
      targetPreview,
      assignmentSnapshot,
      { exists: classSnapshot.exists, data: () => ({ classId: classSnapshot.id, ...classSnapshot.data() }) },
      teacherSnapshot,
      subjectSnapshot,
      settingsSnapshot,
    );
    const effectiveLocks = resourceSpecs(entry, settings)
      .concat(activePrevious ? resourceSpecs(activePrevious, settings) : [])
      .reduce((map, spec) => map.set(spec.ref.path, spec), new Map());
    const effectiveRefs = [...effectiveLocks.values()];
    const lockSnapshots = await Promise.all(effectiveRefs.map((spec) => transaction.get(spec.ref)));
    const usageRefs = [...new Map([useRef, ...(oldUseRef ? [oldUseRef] : [])].map((ref) => [ref.path, ref])).values()];
    const usageSnapshots = await Promise.all(usageRefs.map((ref) => transaction.get(ref)));
    const usageByPath = new Map(usageRefs.map((ref, index) => [ref.path, usageSnapshots[index]]));
    const reservation = { entryId: id, startTime: entry.startTime, endTime: entry.endTime, periodId: entry.periodId };
    effectiveRefs.forEach((spec, index) => {
      if (spec.type === 'assignment') return;
      const snapshot = lockSnapshots[index];
      assertNoOverlap(snapshot.exists ? snapshot.data().entries || [] : [], reservation, id, spec.conflict);
      if (spec.type === 'class' && settings.maxPeriodsPerDay) {
        const currentEntries = (snapshot.exists ? snapshot.data().entries || [] : []).filter((item) => item.entryId !== id);
        if (currentEntries.length >= settings.maxPeriodsPerDay) {
          throw new HttpsError('failed-precondition', 'The class has reached its configured daily lesson limit.');
        }
      }
    });
    const assignmentUsage = usageByPath.get(useRef.path);
    const currentCount = assignmentUsage?.exists ? Number(assignmentUsage.data().count || 0) : 0;
    if ((!activePrevious || activePrevious.assignmentId !== assignmentId) && currentCount >= assignmentSnapshot.data().periodsPerWeek) {
      throw new HttpsError('failed-precondition', 'This assignment already has its configured number of weekly timetable periods.');
    }
    if (activePrevious?.assignmentId === assignmentId && currentCount > assignmentSnapshot.data().periodsPerWeek) {
      throw new HttpsError('failed-precondition', 'The assignment period limit is lower than its current timetable usage.');
    }

    const oldLockEntries = new Map();
    if (activePrevious) {
      resourceSpecs(activePrevious, settings).forEach((spec) => {
        const index = effectiveRefs.findIndex((item) => item.ref.path === spec.ref.path);
        const snapshot = lockSnapshots[index];
        oldLockEntries.set(spec.ref.path, (snapshot?.exists ? snapshot.data().entries || [] : [])
          .filter((item) => item.entryId !== id));
      });
    }
    const newSpecs = resourceSpecs(entry, settings);
    const writeByPath = new Map();
    newSpecs.forEach((spec) => {
      const index = effectiveRefs.findIndex((item) => item.ref.path === spec.ref.path);
      const existing = lockSnapshots[index]?.exists ? lockSnapshots[index].data().entries || [] : [];
      const entries = existing.filter((item) => item.entryId !== id);
      if (spec.type !== 'assignment') entries.push(reservation);
      writeByPath.set(spec.ref.path, { ref: spec.ref, entries });
    });
    oldLockEntries.forEach((entries, path) => {
      if (!writeByPath.has(path)) {
        const spec = effectiveRefs.find((item) => item.ref.path === path);
        writeByPath.set(path, { ref: spec.ref, entries });
      }
    });
    writeByPath.forEach(({ ref, entries }) => transaction.set(ref, { entries, updatedAt: timestamp() }));

    if (activePrevious && activePrevious.assignmentId !== assignmentId) {
      const oldUsage = usageByPath.get(oldUseRef.path);
      if (oldUsage?.exists) transaction.set(oldUseRef, { count: Math.max(0, (oldUsage.data().count || 0) - 1), updatedAt: timestamp() });
      transaction.set(useRef, { count: currentCount + 1, updatedAt: timestamp() });
    } else if (!activePrevious) {
      transaction.set(useRef, { count: currentCount + 1, updatedAt: timestamp() });
    }
    transaction.set(settingsDocument, {
      activeEntryCount: (settings.activeEntryCount || 0) + (activePrevious ? 0 : 1),
      updatedAt: timestamp(),
      updatedBy: request.auth.uid,
    }, { merge: true });
    transaction.set(entryRef, {
      ...entry,
      createdAt: previous?.createdAt || timestamp(),
      createdBy: previous?.createdBy || request.auth.uid,
      updatedAt: timestamp(),
      updatedBy: request.auth.uid,
    });
  });
  return { entryId: id };
}

exports.createTimetableEntry = onCall(async (request) => writeTimetable(request, null));
exports.updateTimetableEntry = onCall(async (request) => {
  const entryId = text(request.data?.entryId, 'Timetable entry ID', 128);
  return writeTimetable(request, entryId);
});

exports.deactivateTimetableEntry = onCall(async (request) => {
  assertRole(request, ADMIN);
  const entryId = text(request.data?.entryId, 'Timetable entry ID', 128);
  const ref = db.collection('timetable').doc(entryId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Timetable entry was not found.');
    const entry = snapshot.data();
    if (!entry.active) return;
    const settingsDocument = settingsRef();
    const specs = resourceSpecs(entry, { roomAllocationEnabled: Boolean(entry.room) });
    const lockRefs = specs.filter((spec) => spec.type !== 'assignment').map((spec) => spec.ref);
    const useRef = assignmentUsageRef(entry.assignmentId);
    const [settingsSnapshot, useSnapshot, ...lockSnapshots] = await Promise.all([
      transaction.get(settingsDocument),
      transaction.get(useRef),
      ...lockRefs.map((lockRef) => transaction.get(lockRef)),
    ]);
    lockRefs.forEach((lockRef, index) => {
      const entries = (lockSnapshots[index].exists ? lockSnapshots[index].data().entries || [] : [])
        .filter((item) => item.entryId !== entryId);
      transaction.set(lockRef, { entries, updatedAt: timestamp() });
    });
    if (useSnapshot.exists) transaction.set(useRef, { count: Math.max(0, (useSnapshot.data().count || 0) - 1), updatedAt: timestamp() });
    if (settingsSnapshot.exists) {
      transaction.set(settingsDocument, {
        activeEntryCount: Math.max(0, (settingsSnapshot.data().activeEntryCount || 0) - 1),
        updatedAt: timestamp(),
        updatedBy: request.auth.uid,
      }, { merge: true });
    }
    transaction.update(ref, { active: false, updatedAt: timestamp(), updatedBy: request.auth.uid });
  });
  return { success: true };
});

exports.getTimetableEntry = onCall(async (request) => {
  assertRole(request, ADMIN);
  const entryId = text(request.data?.entryId, 'Timetable entry ID', 128);
  const snapshot = await db.collection('timetable').doc(entryId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Timetable entry was not found.');
  return { entryId: snapshot.id, ...snapshot.data() };
});

exports.listTimetable = onCall(async (request) => {
  assertRole(request, TEACHER_READ);
  const filters = request.data || {};
  const settingsSnapshot = await settingsRef().get();
  if (!settingsSnapshot.exists) return { entries: [], settings: null };
  const year = text(filters.academicYear || settingsSnapshot.data()?.academicYear, 'Academic year', 20);
  if (request.auth.token.role === 'teacher') {
    const account = await db.collection('accountLinks').doc(request.auth.uid).get();
    if (!account.exists || account.data().type !== 'teacher') throw new HttpsError('not-found', 'No teacher profile is linked to this account.');
    if (filters.teacherId && filters.teacherId !== account.data().recordId) throw new HttpsError('permission-denied', 'Teachers can only view their own timetable.');
  }
  let query = db.collection('timetable').where('academicYear', '==', year).where('active', '==', true);
  if (request.auth.token.role === 'teacher') {
    const account = await db.collection('accountLinks').doc(request.auth.uid).get();
    query = query.where('teacherId', '==', account.data().recordId);
  } else if (filters.teacherId) query = query.where('teacherId', '==', text(filters.teacherId, 'Teacher ID', 128));
  if (filters.classId) query = query.where('classId', '==', text(filters.classId, 'Class ID', 128));
  if (filters.subjectId) query = query.where('subjectId', '==', text(filters.subjectId, 'Subject ID', 128));
  if (filters.dayOfWeek) {
    const day = clean(filters.dayOfWeek).toLowerCase();
    if (!DAYS.has(day)) throw new HttpsError('invalid-argument', 'Choose a valid school day.');
    query = query.where('dayOfWeek', '==', day);
  }
  const snapshot = await query.orderBy('dayOfWeek').orderBy('startTime').limit(100).get();
  const entries = await Promise.all(snapshot.docs.map(async (doc) => {
    const item = doc.data();
    const [teacher, subject, classRecord] = await Promise.all([
      db.collection('teachers').doc(item.teacherId).get(),
      db.collection('subjects').doc(item.subjectId).get(),
      db.collection('classes').doc(item.classId).get(),
    ]);
    return {
      entryId: doc.id,
      ...item,
      teacherName: teacher.exists ? `${teacher.data().firstName} ${teacher.data().lastName}` : '',
      subjectName: subject.exists ? subject.data().name : '',
      subjectCode: subject.exists ? subject.data().code : '',
      className: classRecord.exists ? classRecord.data().name : '',
    };
  }));
  return { entries, settings: settingsSnapshot.exists ? settingsSnapshot.data() : null };
});
