const { createHash } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');

initializeApp();
const auth = getAuth();
const db = getFirestore();

const ALLOWED_ROLES = new Set(['admin', 'director', 'teacher', 'registrar', 'student', 'parent']);
const STAFF_ROLES = new Set(['admin', 'registrar']);
const READ_ROLES = new Set(['admin', 'registrar', 'director']);
const STREAMS = new Set(['natural', 'social']);
const GENDERS = new Set(['male', 'female']);
const STATUSES = new Set(['active', 'inactive']);
const PARENT_RELATIONSHIPS = new Set(['father', 'mother', 'guardian', 'other']);

const clean = (value) => String(value ?? '').trim();
const assertAuthenticated = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
};
const assertRole = (request, roles) => {
  assertAuthenticated(request);
  if (!roles.has(request.auth.token.role)) {
    throw new HttpsError('permission-denied', 'You are not authorized to perform this operation.');
  }
};
const assertStaff = (request) => assertRole(request, STAFF_ROLES);
const assertReadable = (request) => assertRole(request, READ_ROLES);
const requireText = (value, label, maxLength = 100) => {
  const result = clean(value);
  if (!result || result.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} is required and must be at most ${maxLength} characters.`);
  }
  return result;
};
const validateGradeStream = (grade, stream) => {
  if (![9, 10, 11, 12].includes(Number(grade))) {
    throw new HttpsError('invalid-argument', 'Grade must be 9, 10, 11, or 12.');
  }
  const normalizedStream = stream == null || stream === '' ? null : clean(stream).toLowerCase();
  if ([9, 10].includes(Number(grade)) && normalizedStream !== null) {
    throw new HttpsError('invalid-argument', 'Grades 9 and 10 do not have a stream.');
  }
  if ([11, 12].includes(Number(grade)) && !STREAMS.has(normalizedStream)) {
    throw new HttpsError('invalid-argument', 'Grades 11 and 12 require a valid stream.');
  }
  return normalizedStream;
};
const validateClassInput = (data) => {
  const grade = Number(data.grade);
  const stream = validateGradeStream(grade, data.stream);
  const section = requireText(data.section, 'Section', 20).toUpperCase();
  const academicYear = requireText(data.academicYear, 'Academic year', 20);
  const capacity = Number(data.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw new HttpsError('invalid-argument', 'Capacity must be a whole number between 1 and 500.');
  }
  if (data.active !== undefined && typeof data.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Class active status must be a boolean.');
  }
  return {
    grade,
    stream,
    section,
    academicYear,
    capacity,
    name: `Grade ${grade} - ${section}${stream ? ` - ${stream === 'natural' ? 'Natural Science' : 'Social Science'}` : ''}`,
    active: data.active !== false,
  };
};
const admissionKey = (admissionNumber) => createHash('sha256').update(admissionNumber.toLowerCase()).digest('hex');
const studentPublicProfile = (studentId, student) => ({
  studentId,
  admissionNumber: student.admissionNumber,
  firstName: student.firstName,
  middleName: student.middleName,
  lastName: student.lastName,
  gender: student.gender,
  dateOfBirth: student.dateOfBirth,
  grade: student.grade,
  section: student.section,
  stream: student.stream,
  status: student.status,
});
const classKey = (data) => createHash('sha256')
  .update([data.grade, data.section, data.stream || '', data.academicYear].join('|').toLowerCase())
  .digest('hex');
exports.healthCheck = onRequest((request, response) => {
  response.status(200).json({
    status: 'ok',
    message: 'School Management System functions are configured successfully.',
    timestamp: new Date().toISOString(),
  });
});

exports.createUser = onCall(async (request) => {
  assertRole(request, new Set(['admin']));
  const email = requireText(request.data?.email, 'Email', 254);
  const password = clean(request.data?.password);
  const displayName = clean(request.data?.displayName);
  const role = clean(request.data?.role);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }
  if (password.length < 8) throw new HttpsError('invalid-argument', 'Password must be at least 8 characters long.');
  if (!ALLOWED_ROLES.has(role)) throw new HttpsError('invalid-argument', 'Unsupported role requested.');
  try {
    await auth.getUserByEmail(email);
    throw new HttpsError('already-exists', 'A user with that email already exists.');
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: displayName || email.split('@')[0],
    emailVerified: false,
  });
  await auth.setCustomUserClaims(userRecord.uid, { role });
  await db.collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: userRecord.email,
    displayName: displayName || userRecord.email.split('@')[0],
    role,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { uid: userRecord.uid, email: userRecord.email, displayName: displayName || userRecord.email.split('@')[0], role };
});

exports.setUserRole = onCall(async (request) => {
  assertRole(request, new Set(['admin']));
  const targetUid = requireText(request.data?.uid, 'User ID', 128);
  const role = clean(request.data?.role);
  if (!ALLOWED_ROLES.has(role)) throw new HttpsError('invalid-argument', 'Unsupported role requested.');
  if (targetUid === request.auth.uid) throw new HttpsError('permission-denied', 'Users cannot change their own role.');
  await auth.getUser(targetUid);
  await auth.setCustomUserClaims(targetUid, { role });
  await db.collection('users').doc(targetUid).set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true, uid: targetUid, role };
});

exports.createClass = onCall(async (request) => {
  assertStaff(request);
  const classData = validateClassInput(request.data || {});
  const ref = db.collection('classes').doc();
  const keyRef = db.collection('classKeys').doc(classKey(classData));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(keyRef);
    if (existing.exists) throw new HttpsError('already-exists', 'A class with this grade, section, stream, and academic year already exists.');
    transaction.create(ref, {
      ...classData,
      studentCount: 0,
      assignedStudentCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
    transaction.create(keyRef, { classId: ref.id });
  });
  return { classId: ref.id };
});

exports.updateClass = onCall(async (request) => {
  assertStaff(request);
  const classId = requireText(request.data?.classId, 'Class ID', 128);
  const classData = validateClassInput(request.data || {});
  const ref = db.collection('classes').doc(classId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Class was not found.');
    const current = snapshot.data();
    if (classData.capacity < (current.studentCount || 0)) {
      throw new HttpsError('failed-precondition', 'Capacity cannot be less than the current student count.');
    }
    if ((current.assignedStudentCount || 0) > 0 && (
      current.grade !== classData.grade
      || current.section !== classData.section
      || current.stream !== classData.stream
      || current.academicYear !== classData.academicYear
    )) {
      throw new HttpsError('failed-precondition', 'A class with students assigned cannot change its grade, section, stream, or academic year.');
    }
    const oldKeyRef = db.collection('classKeys').doc(classKey(current));
    const newKeyRef = db.collection('classKeys').doc(classKey(classData));
    const oldKeySnapshot = await transaction.get(oldKeyRef);
    const newKeySnapshot = oldKeyRef.path === newKeyRef.path ? oldKeySnapshot : await transaction.get(newKeyRef);
    if (newKeySnapshot.exists && newKeySnapshot.data().classId !== classId) {
      throw new HttpsError('already-exists', 'A class with this grade, section, stream, and academic year already exists.');
    }
    transaction.update(ref, { ...classData, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    if (oldKeyRef.path !== newKeyRef.path) {
      if (oldKeySnapshot.exists && oldKeySnapshot.data().classId === classId) transaction.delete(oldKeyRef);
      transaction.set(newKeyRef, { classId });
    } else if (!oldKeySnapshot.exists) {
      transaction.create(newKeyRef, { classId });
    }
  });
  return { success: true };
});

exports.getClass = onCall(async (request) => {
  assertReadable(request);
  const classId = requireText(request.data?.classId, 'Class ID', 128);
  const snapshot = await db.collection('classes').doc(classId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Class was not found.');
  return { classId: snapshot.id, ...snapshot.data() };
});

exports.createParent = onCall(async (request) => {
  assertStaff(request);
  const data = request.data || {};
  const relationship = clean(data.relationship).toLowerCase();
  if (!PARENT_RELATIONSHIPS.has(relationship)) throw new HttpsError('invalid-argument', 'Choose a valid parent relationship.');
  const parent = {
    firstName: requireText(data.firstName, 'First name'),
    middleName: clean(data.middleName),
    lastName: requireText(data.lastName, 'Last name'),
    relationship,
    phone: requireText(data.phone, 'Phone', 30),
    alternatePhone: clean(data.alternatePhone),
    email: clean(data.email).toLowerCase(),
    address: clean(data.address),
    userId: null,
    studentIds: [],
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  };
  if (parent.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  const ref = db.collection('parents').doc();
  await ref.set(parent);
  return { parentId: ref.id };
});

exports.updateParent = onCall(async (request) => {
  assertStaff(request);
  const data = request.data || {};
  const relationship = clean(data.relationship).toLowerCase();
  if (!PARENT_RELATIONSHIPS.has(relationship)) throw new HttpsError('invalid-argument', 'Choose a valid parent relationship.');
  const updates = {
    firstName: requireText(data.firstName, 'First name'),
    middleName: clean(data.middleName),
    lastName: requireText(data.lastName, 'Last name'),
    relationship,
    phone: requireText(data.phone, 'Phone', 30),
    alternatePhone: clean(data.alternatePhone),
    email: clean(data.email).toLowerCase(),
    address: clean(data.address),
    status: data.status === 'inactive' ? 'inactive' : 'active',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  };
  const parentId = requireText(data.parentId, 'Parent ID', 128);
  if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  if (!STATUSES.has(clean(data.status || 'active').toLowerCase())) {
    throw new HttpsError('invalid-argument', 'Choose a valid parent status.');
  }
  await db.collection('parents').doc(parentId).update(updates);
  return { success: true };
});

exports.getParent = onCall(async (request) => {
  assertReadable(request);
  const parentId = requireText(request.data?.parentId, 'Parent ID', 128);
  const snapshot = await db.collection('parents').doc(parentId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Parent was not found.');
  const parent = snapshot.data();
  const childSnapshots = await Promise.all((parent.studentIds || []).map((id) => db.collection('students').doc(id).get()));
  return {
    parentId: snapshot.id,
    ...parent,
    students: childSnapshots.filter((student) => student.exists).map((student) => ({
      studentId: student.id,
      admissionNumber: student.data().admissionNumber,
      firstName: student.data().firstName,
      lastName: student.data().lastName,
    })),
  };
});

exports.createStudent = onCall(async (request) => {
  assertStaff(request);
  const data = request.data || {};
  const admissionNumber = requireText(data.admissionNumber, 'Admission number', 40).toUpperCase();
  const grade = Number(data.grade);
  const stream = validateGradeStream(grade, data.stream);
  const gender = clean(data.gender).toLowerCase();
  const status = clean(data.status || 'active').toLowerCase();
  if (!GENDERS.has(gender)) throw new HttpsError('invalid-argument', 'Choose a valid gender.');
  if (!STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Choose a valid status.');
  const classId = requireText(data.classId, 'Class', 128);
  const parentIds = [...new Set((Array.isArray(data.parentIds) ? data.parentIds : []).map((id) => requireText(id, 'Parent ID', 128)))];
  if (parentIds.length > 10) throw new HttpsError('invalid-argument', 'A student cannot have more than 10 linked parents or guardians.');
  const student = {
    admissionNumber,
    searchAdmissionNumber: admissionNumber.toLowerCase(),
    firstName: requireText(data.firstName, 'First name'),
    middleName: clean(data.middleName),
    lastName: requireText(data.lastName, 'Last name'),
    searchFirstName: clean(data.firstName).toLowerCase(),
    searchMiddleName: clean(data.middleName).toLowerCase(),
    searchLastName: clean(data.lastName).toLowerCase(),
    gender,
    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
    classId,
    parentIds,
    phone: clean(data.phone),
    address: clean(data.address),
    enrollmentYear: Number(data.enrollmentYear) || new Date().getFullYear(),
    status,
    photoUrl: null,
  };
  if (!Number.isInteger(student.enrollmentYear) || student.enrollmentYear < 1900 || student.enrollmentYear > 2200) {
    throw new HttpsError('invalid-argument', 'Enter a valid enrollment year.');
  }
  if (student.dateOfBirth && Number.isNaN(student.dateOfBirth.getTime())) {
    throw new HttpsError('invalid-argument', 'Enter a valid date of birth.');
  }
  const classRef = db.collection('classes').doc(classId);
  const studentRef = db.collection('students').doc();
  const admissionRef = db.collection('admissionNumbers').doc(admissionKey(admissionNumber));
  const parentRefs = parentIds.map((id) => db.collection('parents').doc(id));
  await db.runTransaction(async (transaction) => {
    const [classSnapshot, admissionSnapshot, ...parentSnapshots] = await Promise.all([
      transaction.get(classRef),
      transaction.get(admissionRef),
      ...parentRefs.map((ref) => transaction.get(ref)),
    ]);
    if (admissionSnapshot.exists) throw new HttpsError('already-exists', 'That admission number is already in use.');
    if (!classSnapshot.exists || !classSnapshot.data().active) throw new HttpsError('failed-precondition', 'Choose an existing active class.');
    const classData = classSnapshot.data();
    if (classData.grade !== grade || classData.stream !== stream) {
      throw new HttpsError('invalid-argument', 'The selected class does not match the chosen grade and stream.');
    }
    if (status === 'active' && (classData.studentCount || 0) >= classData.capacity) {
      throw new HttpsError('resource-exhausted', 'The selected class is full.');
    }
    parentSnapshots.forEach((snapshot) => {
      if (!snapshot.exists || snapshot.data().status !== 'active') throw new HttpsError('invalid-argument', 'A selected parent record is missing or inactive.');
    });
    const timestamp = FieldValue.serverTimestamp();
    transaction.create(admissionRef, { studentId: studentRef.id, admissionNumber });
    transaction.create(studentRef, {
      ...student,
      grade: classData.grade,
      sectionId: classRef.id,
      section: classData.section,
      stream: classData.stream,
      createdAt: timestamp,
      createdBy: request.auth.uid,
      updatedAt: timestamp,
      updatedBy: request.auth.uid,
    });
    transaction.update(classRef, {
      studentCount: FieldValue.increment(status === 'active' ? 1 : 0),
      assignedStudentCount: FieldValue.increment(1),
      updatedAt: timestamp,
      updatedBy: request.auth.uid,
    });
    parentRefs.forEach((ref) => transaction.update(ref, {
      studentIds: FieldValue.arrayUnion(studentRef.id),
      updatedAt: timestamp,
      updatedBy: request.auth.uid,
    }));
  });
  return { studentId: studentRef.id, admissionNumber };
});

exports.updateStudent = onCall(async (request) => {
  assertStaff(request);
  const data = request.data || {};
  const studentId = requireText(data.studentId, 'Student ID', 128);
  const gender = clean(data.gender).toLowerCase();
  const status = clean(data.status).toLowerCase();
  if (!GENDERS.has(gender) || !STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Choose valid gender and status values.');
  const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) throw new HttpsError('invalid-argument', 'Enter a valid date of birth.');
  const studentRef = db.collection('students').doc(studentId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(studentRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Student was not found.');
    const student = snapshot.data();
    const classId = student.classId || student.sectionId;
    const classRef = classId ? db.collection('classes').doc(classId) : null;
    const classSnapshot = classRef ? await transaction.get(classRef) : null;
    if (student.status !== status && status === 'active' && classSnapshot?.exists
      && (classSnapshot.data().studentCount || 0) >= classSnapshot.data().capacity) {
      throw new HttpsError('resource-exhausted', 'The student cannot be activated because the class is full.');
    }
    const timestamp = FieldValue.serverTimestamp();
    transaction.update(studentRef, {
      firstName: requireText(data.firstName, 'First name'),
      middleName: clean(data.middleName),
      lastName: requireText(data.lastName, 'Last name'),
      searchFirstName: clean(data.firstName).toLowerCase(),
      searchMiddleName: clean(data.middleName).toLowerCase(),
      searchLastName: clean(data.lastName).toLowerCase(),
      gender,
      dateOfBirth,
      phone: clean(data.phone),
      address: clean(data.address),
      status,
      updatedAt: timestamp,
      updatedBy: request.auth.uid,
    });
    if (student.status !== status && classRef && classSnapshot?.exists) {
      transaction.update(classRef, {
        studentCount: FieldValue.increment(status === 'active' ? 1 : -1),
        updatedAt: timestamp,
        updatedBy: request.auth.uid,
      });
    }
  });
  return { success: true };
});

exports.assignStudentToClass = onCall(async (request) => {
  assertStaff(request);
  const studentId = requireText(request.data?.studentId, 'Student ID', 128);
  const classId = requireText(request.data?.classId, 'Class ID', 128);
  const studentRef = db.collection('students').doc(studentId);
  const classRef = db.collection('classes').doc(classId);
  await db.runTransaction(async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef);
    const classSnapshot = await transaction.get(classRef);
    if (!studentSnapshot.exists) throw new HttpsError('not-found', 'Student was not found.');
    if (!classSnapshot.exists || !classSnapshot.data().active) throw new HttpsError('failed-precondition', 'Choose an existing active class.');
    const student = studentSnapshot.data();
    const target = classSnapshot.data();
    const oldClassId = student.classId || student.sectionId;
    if (oldClassId === classId) return;
    if (student.status === 'active' && target.studentCount >= target.capacity) {
      throw new HttpsError('resource-exhausted', 'The selected class is full.');
    }
    const oldClassRef = oldClassId ? db.collection('classes').doc(oldClassId) : null;
    const oldClassSnapshot = oldClassRef ? await transaction.get(oldClassRef) : null;
    transaction.update(classRef, {
      assignedStudentCount: FieldValue.increment(1),
      ...(student.status === 'active' ? { studentCount: FieldValue.increment(1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
    if (oldClassSnapshot?.exists) transaction.update(oldClassRef, {
      assignedStudentCount: FieldValue.increment(-1),
      ...(student.status === 'active' ? { studentCount: FieldValue.increment(-1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
    transaction.update(studentRef, {
      classId,
      grade: target.grade,
      sectionId: classId,
      section: target.section,
      stream: target.stream,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
  });
  return { success: true };
});

exports.linkParentToStudent = onCall(async (request) => {
  assertStaff(request);
  const parentId = requireText(request.data?.parentId, 'Parent ID', 128);
  const studentId = requireText(request.data?.studentId, 'Student ID', 128);
  const linked = request.data?.linked === true;
  const parentRef = db.collection('parents').doc(parentId);
  const studentRef = db.collection('students').doc(studentId);
  await db.runTransaction(async (transaction) => {
    const [parentSnapshot, studentSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(studentRef)]);
    if (!parentSnapshot.exists || !studentSnapshot.exists) throw new HttpsError('not-found', 'Parent or student record was not found.');
    const parent = parentSnapshot.data();
    const student = studentSnapshot.data();
    if (linked && parent.status !== 'active') throw new HttpsError('failed-precondition', 'An inactive parent cannot be linked.');
    if (linked && !(student.parentIds || []).includes(parentId) && (student.parentIds || []).length >= 10) {
      throw new HttpsError('resource-exhausted', 'A student cannot have more than 10 linked parents or guardians.');
    }
    const operation = linked ? FieldValue.arrayUnion : FieldValue.arrayRemove;
    const timestamp = FieldValue.serverTimestamp();
    transaction.update(parentRef, { studentIds: operation(studentId), updatedAt: timestamp, updatedBy: request.auth.uid });
    transaction.update(studentRef, { parentIds: operation(parentId), updatedAt: timestamp, updatedBy: request.auth.uid });
  });
  return { success: true };
});

exports.listStudents = onCall(async (request) => {
  assertReadable(request);
  const pageSize = Math.min(Math.max(Number(request.data?.pageSize) || 25, 1), 100);
  const search = clean(request.data?.search).toLowerCase();
  const grade = request.data?.grade === undefined || request.data.grade === null || request.data.grade === ''
    ? null
    : Number(request.data.grade);
  const status = clean(request.data?.status);
  const gender = clean(request.data?.gender);
  const stream = clean(request.data?.stream);
  const section = clean(request.data?.section).toUpperCase();
  const classId = clean(request.data?.classId);
  if (search.length > 100
    || (grade !== null && ![9, 10, 11, 12].includes(grade))
    || (status && !STATUSES.has(status))
    || (gender && !GENDERS.has(gender))
    || (stream && !STREAMS.has(stream))
    || section.length > 20
    || classId.length > 128) {
    throw new HttpsError('invalid-argument', 'One or more student filters are invalid.');
  }
  let docs;
  let nextCursor = null;
  if (search) {
    const rawCursor = clean(request.data?.cursor);
    const offset = rawCursor.startsWith('offset:') ? Number(rawCursor.slice(7)) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpsError('invalid-argument', 'Invalid search pagination cursor.');
    const fields = ['searchAdmissionNumber', 'searchFirstName', 'searchMiddleName', 'searchLastName'];
    const results = await Promise.all(fields.map((field) => db.collection('students')
      .where(field, '>=', search)
      .where(field, '<=', `${search}\uf8ff`)
      .orderBy(field)
      .limit(250)
      .get()));
    const uniqueDocs = new Map();
    results.forEach((result) => result.docs.forEach((doc) => uniqueDocs.set(doc.id, doc)));
    const matches = [...uniqueDocs.values()]
      .map((doc) => ({ studentId: doc.id, ...doc.data() }))
      .filter((student) => (!grade || student.grade === grade)
        && (!status || student.status === status)
        && (!gender || student.gender === gender)
        && (!section || student.section === section)
        && (!classId || student.classId === classId)
        && (!stream || student.stream === stream))
      .sort((a, b) => a.admissionNumber.localeCompare(b.admissionNumber));
    docs = matches.slice(offset, offset + pageSize);
    if (offset + pageSize < matches.length) nextCursor = `offset:${offset + pageSize}`;
  } else {
    let query = db.collection('students');
    if (grade) query = query.where('grade', '==', grade);
    if (status) query = query.where('status', '==', status);
    if (classId) query = query.where('classId', '==', classId);
    query = query.orderBy('admissionNumber');
    const scanSize = 100;
    const maxScanned = 2500;
    let scanned = 0;
    let reachedEnd = false;
    let scanCursor = null;
    if (request.data?.cursor) {
      scanCursor = await db.collection('students').doc(clean(request.data.cursor)).get();
      if (!scanCursor.exists) throw new HttpsError('invalid-argument', 'Invalid pagination cursor.');
    }
    const filtered = [];
    let lastScanned = null;
    while (scanned < maxScanned && filtered.length <= pageSize && !reachedEnd) {
      const batchSize = Math.min(scanSize, maxScanned - scanned);
      const batchQuery = query.limit(batchSize);
      const snapshot = scanCursor ? await batchQuery.startAfter(scanCursor).get() : await batchQuery.get();
      if (snapshot.empty) {
        reachedEnd = true;
        break;
      }
      scanned += snapshot.docs.length;
      lastScanned = snapshot.docs[snapshot.docs.length - 1];
      scanCursor = lastScanned;
      filtered.push(...snapshot.docs
        .map((doc) => ({ studentId: doc.id, ...doc.data() }))
        .filter((student) => (!gender || student.gender === gender)
          && (!section || student.section === section)
          && (!classId || student.classId === classId)
          && (!stream || student.stream === stream)));
      if (snapshot.docs.length < batchSize) reachedEnd = true;
    }
    docs = filtered.slice(0, pageSize);
    if (filtered.length > pageSize) nextCursor = docs[docs.length - 1].studentId;
    else if (!reachedEnd && lastScanned) nextCursor = lastScanned.id;
  }
  return {
    students: docs,
    nextCursor,
  };
});

exports.getStudent = onCall(async (request) => {
  assertReadable(request);
  const studentId = requireText(request.data?.studentId, 'Student ID', 128);
  const snapshot = await db.collection('students').doc(studentId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Student was not found.');
  const student = snapshot.data();
  const parentSnapshots = await Promise.all((student.parentIds || []).map((id) => db.collection('parents').doc(id).get()));
  return {
    studentId: snapshot.id,
    ...student,
    parents: parentSnapshots.filter((parent) => parent.exists).map((parent) => {
      const record = parent.data();
      return {
        parentId: parent.id,
        firstName: record.firstName,
        middleName: record.middleName,
        lastName: record.lastName,
        relationship: record.relationship,
        phone: record.phone,
      };
    }),
  };
});

exports.updateStudentStatus = onCall(async (request) => {
  assertStaff(request);
  const studentId = requireText(request.data?.studentId, 'Student ID', 128);
  const status = clean(request.data?.status).toLowerCase();
  if (!STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Choose a valid student status.');
  const studentRef = db.collection('students').doc(studentId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(studentRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Student was not found.');
    const student = snapshot.data();
    const classId = student.classId || student.sectionId;
    const classRef = classId ? db.collection('classes').doc(classId) : null;
    const classSnapshot = classRef ? await transaction.get(classRef) : null;
    if (student.status === status) return;
    if (status === 'active' && classSnapshot?.exists && classSnapshot.data().studentCount >= classSnapshot.data().capacity) {
      throw new HttpsError('resource-exhausted', 'The student cannot be activated because the class is full.');
    }
    const timestamp = FieldValue.serverTimestamp();
    transaction.update(studentRef, { status, updatedAt: timestamp, updatedBy: request.auth.uid });
    if (classRef && classSnapshot?.exists) transaction.update(classRef, {
      studentCount: FieldValue.increment(status === 'active' ? 1 : -1),
      updatedAt: timestamp,
      updatedBy: request.auth.uid,
    });
  });
  return { success: true };
});

exports.getMyStudentProfile = onCall(async (request) => {
  assertAuthenticated(request);
  if (request.auth.token.role !== 'student') throw new HttpsError('permission-denied', 'Student access is required.');
  const snapshot = await db.collection('students').where('userId', '==', request.auth.uid).limit(1).get();
  if (snapshot.empty) throw new HttpsError('not-found', 'No student profile is linked to this account.');
  return studentPublicProfile(snapshot.docs[0].id, snapshot.docs[0].data());
});

exports.getMyLinkedStudents = onCall(async (request) => {
  assertAuthenticated(request);
  if (request.auth.token.role !== 'parent') throw new HttpsError('permission-denied', 'Parent access is required.');
  const parentSnapshot = await db.collection('parents').where('userId', '==', request.auth.uid).limit(1).get();
  if (parentSnapshot.empty) throw new HttpsError('not-found', 'No parent record is linked to this account.');
  const studentIds = parentSnapshot.docs[0].data().studentIds || [];
  const snapshots = await Promise.all(studentIds.map((id) => db.collection('students').doc(id).get()));
  return {
    students: snapshots.filter((item) => item.exists)
      .map((item) => studentPublicProfile(item.id, item.data())),
  };
});

exports.linkStudentAccount = onCall(async (request) => {
  assertStaff(request);
  const studentId = requireText(request.data?.studentId, 'Student ID', 128);
  const userId = requireText(request.data?.userId, 'User ID', 128);
  const userRecord = await auth.getUser(userId);
  if (userRecord.customClaims?.role !== 'student') {
    throw new HttpsError('failed-precondition', 'The linked account must have the student role.');
  }
  const studentRef = db.collection('students').doc(studentId);
  const accountLinkRef = db.collection('accountLinks').doc(userId);
  await db.runTransaction(async (transaction) => {
    const [student, accountLink] = await Promise.all([transaction.get(studentRef), transaction.get(accountLinkRef)]);
    if (!student.exists) throw new HttpsError('not-found', 'Student record was not found.');
    if (accountLink.exists && (accountLink.data().type !== 'student' || accountLink.data().recordId !== studentId)) {
      throw new HttpsError('already-exists', 'This account is already linked to another record.');
    }
    const oldUserId = student.data().userId;
    const oldAccountRef = oldUserId && oldUserId !== userId ? db.collection('accountLinks').doc(oldUserId) : null;
    const oldAccount = oldAccountRef ? await transaction.get(oldAccountRef) : null;
    transaction.update(studentRef, { userId, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    transaction.set(accountLinkRef, { type: 'student', recordId: studentId });
    if (oldAccount?.exists && oldAccount.data().type === 'student' && oldAccount.data().recordId === studentId) {
      transaction.delete(oldAccountRef);
    }
  });
  return { success: true };
});

exports.linkParentAccount = onCall(async (request) => {
  assertStaff(request);
  const parentId = requireText(request.data?.parentId, 'Parent ID', 128);
  const userId = requireText(request.data?.userId, 'User ID', 128);
  const userRecord = await auth.getUser(userId);
  if (userRecord.customClaims?.role !== 'parent') {
    throw new HttpsError('failed-precondition', 'The linked account must have the parent role.');
  }
  const parentRef = db.collection('parents').doc(parentId);
  const accountLinkRef = db.collection('accountLinks').doc(userId);
  await db.runTransaction(async (transaction) => {
    const [parent, accountLink] = await Promise.all([transaction.get(parentRef), transaction.get(accountLinkRef)]);
    if (!parent.exists) throw new HttpsError('not-found', 'Parent record was not found.');
    if (accountLink.exists && (accountLink.data().type !== 'parent' || accountLink.data().recordId !== parentId)) {
      throw new HttpsError('already-exists', 'This account is already linked to another record.');
    }
    const oldUserId = parent.data().userId;
    const oldAccountRef = oldUserId && oldUserId !== userId ? db.collection('accountLinks').doc(oldUserId) : null;
    const oldAccount = oldAccountRef ? await transaction.get(oldAccountRef) : null;
    transaction.update(parentRef, { userId, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    transaction.set(accountLinkRef, { type: 'parent', recordId: parentId });
    if (oldAccount?.exists && oldAccount.data().type === 'parent' && oldAccount.data().recordId === parentId) {
      transaction.delete(oldAccountRef);
    }
  });
  return { success: true };
});
