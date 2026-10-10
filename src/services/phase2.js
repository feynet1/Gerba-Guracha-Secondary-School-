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
  setDoc,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db, auth } from './firebase/config';

const staff = () => {
  if (!auth?.currentUser) throw new Error('Sign in is required.');
};

const required = (value, label, max = 100) => {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) throw new Error(`${label} is required.`);
  return result;
};

const dbReady = () => {
  if (!db) throw new Error('Cloud Firestore is not configured.');
};

const classKey = (data) => `${data.grade}_${data.section}_${data.stream || 'none'}_${data.academicYear}`;

function validateClass(input) {
  const grade = Number(input.grade);
  const stream = input.stream ? String(input.stream).trim().toLowerCase() : null;
  const section = required(input.section, 'Section', 20).toUpperCase();
  const academicYear = required(input.academicYear, 'Academic year', 20);
  const capacity = Number(input.capacity);
  if (![9, 10, 11, 12].includes(grade)) throw new Error('Grade must be 9, 10, 11, or 12.');
  if ([9, 10].includes(grade) && stream) throw new Error('Grades 9 and 10 do not have a stream.');
  if ([11, 12].includes(grade) && !['natural', 'social'].includes(stream)) throw new Error('Choose a valid stream.');
  if (!/^[A-Z0-9_-]{1,20}$/.test(section) || !/^[A-Za-z0-9_-]{1,20}$/.test(academicYear)) {
    throw new Error('Section and academic year can contain letters, numbers, hyphens, and underscores only.');
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new Error('Capacity must be between 1 and 500.');
  return {
    grade,
    stream,
    section,
    academicYear,
    capacity,
    name: `Grade ${grade} - ${section}${stream ? ` - ${stream === 'natural' ? 'Natural Science' : 'Social Science'}` : ''}`,
    active: input.active !== false,
  };
}

export async function createClass(input) {
  staff();
  dbReady();
  const data = validateClass(input);
  const ref = doc(collection(db, 'classes'));
  const keyRef = doc(db, 'classKeys', classKey(data));
  await runTransaction(db, async (transaction) => {
    const lock = await transaction.get(keyRef);
    if (lock.exists()) throw new Error('A class with these details already exists.');
    const timestamp = serverTimestamp();
    transaction.set(ref, {
      ...data,
      studentCount: 0,
      assignedStudentCount: 0,
      createdAt: timestamp,
      createdBy: auth.currentUser.uid,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
    transaction.set(keyRef, { classId: ref.id, ...data });
  });
  return { classId: ref.id };
}

export async function updateClass(input) {
  staff();
  dbReady();
  const classId = required(input.classId, 'Class ID', 128);
  const data = validateClass(input);
  const ref = doc(db, 'classes', classId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Class was not found.');
    const current = snapshot.data();
    if (data.capacity < (current.studentCount || 0)) throw new Error('Capacity cannot be less than the current student count.');
    const oldLock = doc(db, 'classKeys', classKey(current));
    const newLock = doc(db, 'classKeys', classKey(data));
    const oldSnapshot = await transaction.get(oldLock);
    const newSnapshot = oldLock.path === newLock.path ? oldSnapshot : await transaction.get(newLock);
    if (newSnapshot.exists() && newSnapshot.data().classId !== classId) throw new Error('A class with these details already exists.');
    transaction.update(ref, { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    if (oldLock.path !== newLock.path) {
      if (oldSnapshot.exists()) transaction.delete(oldLock);
      transaction.set(newLock, { classId, ...data });
    }
  });
  return { success: true };
}

export async function createParent(input) {
  staff();
  dbReady();
  const email = String(input.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const relationship = required(input.relationship, 'Relationship', 20).toLowerCase();
  if (!['father', 'mother', 'guardian', 'other'].includes(relationship)) throw new Error('Choose a valid relationship.');
  const ref = doc(collection(db, 'parents'));
  const timestamp = serverTimestamp();
  await setDoc(ref, {
    firstName: required(input.firstName, 'First name'),
    middleName: String(input.middleName || '').trim(),
    lastName: required(input.lastName, 'Last name'),
    relationship,
    phone: required(input.phone, 'Phone', 30),
    alternatePhone: String(input.alternatePhone || '').trim(),
    email,
    address: String(input.address || '').trim(),
    userId: null,
    studentIds: [],
    status: 'active',
    createdAt: timestamp,
    createdBy: auth.currentUser.uid,
    updatedAt: timestamp,
    updatedBy: auth.currentUser.uid,
  });
  return { parentId: ref.id };
}

export async function updateParent(input) {
  staff();
  dbReady();
  const parentId = required(input.parentId, 'Parent ID', 128);
  const email = String(input.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const relationship = required(input.relationship, 'Relationship', 20).toLowerCase();
  if (!['father', 'mother', 'guardian', 'other'].includes(relationship)) throw new Error('Choose a valid relationship.');
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  const ref = doc(db, 'parents', parentId);
  await updateDoc(ref, {
    firstName: required(input.firstName, 'First name'),
    middleName: String(input.middleName || '').trim(),
    lastName: required(input.lastName, 'Last name'),
    relationship,
    phone: required(input.phone, 'Phone', 30),
    alternatePhone: String(input.alternatePhone || '').trim(),
    email,
    address: String(input.address || '').trim(),
    status,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
  return { success: true };
}

export async function createStudent(input) {
  staff();
  dbReady();
  const admissionNumber = required(input.admissionNumber, 'Admission number', 40).toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(admissionNumber)) throw new Error('Admission number must use letters, numbers, hyphens, or underscores.');
  const grade = Number(input.grade);
  const stream = input.stream ? String(input.stream).trim().toLowerCase() : null;
  if (![9, 10, 11, 12].includes(grade) || ([9, 10].includes(grade) && stream) || ([11, 12].includes(grade) && !['natural', 'social'].includes(stream))) {
    throw new Error('Choose a valid grade and stream.');
  }
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  const gender = String(input.gender || '').toLowerCase();
  if (!['male', 'female'].includes(gender)) throw new Error('Choose a valid gender.');
  const classId = required(input.classId, 'Class ID', 128);
  const parentIds = [...new Set((input.parentIds || []).map((id) => required(id, 'Parent ID', 128)))];
  if (parentIds.length > 10) throw new Error('A student can have at most 10 linked parents.');
  const ref = doc(collection(db, 'students'));
  const classRef = doc(db, 'classes', classId);
  const admissionRef = doc(db, 'admissionNumbers', admissionNumber);
  const parentRefs = parentIds.map((id) => doc(db, 'parents', id));
  await runTransaction(db, async (transaction) => {
    const [classSnapshot, admissionSnapshot, ...parentSnapshots] = await Promise.all([
      transaction.get(classRef),
      transaction.get(admissionRef),
      ...parentRefs.map((parentRef) => transaction.get(parentRef)),
    ]);
    if (admissionSnapshot.exists()) throw new Error('That admission number is already in use.');
    if (!classSnapshot.exists() || !classSnapshot.data().active) throw new Error('Choose an active class.');
    const classData = classSnapshot.data();
    if (classData.grade !== grade || classData.stream !== stream) throw new Error('The selected class does not match the grade and stream.');
    if (status === 'active' && classData.studentCount >= classData.capacity) throw new Error('The selected class is full.');
    if (parentSnapshots.some((snapshot) => !snapshot.exists() || snapshot.data().status !== 'active')) {
      throw new Error('A selected parent is missing or inactive.');
    }
    const timestamp = serverTimestamp();
    const firstName = required(input.firstName, 'First name');
    const middleName = String(input.middleName || '').trim();
    const lastName = required(input.lastName, 'Last name');
    transaction.set(admissionRef, { studentId: ref.id, admissionNumber });
    transaction.set(ref, {
      admissionNumber,
      searchAdmissionNumber: admissionNumber.toLowerCase(),
      firstName,
      middleName,
      lastName,
      searchFirstName: firstName.toLowerCase(),
      searchMiddleName: middleName.toLowerCase(),
      searchLastName: lastName.toLowerCase(),
      gender,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      grade,
      classId,
      sectionId: classId,
      section: classData.section,
      stream: classData.stream,
      parentIds,
      phone: String(input.phone || '').trim(),
      address: String(input.address || '').trim(),
      enrollmentYear: Number(input.enrollmentYear) || new Date().getFullYear(),
      status,
      photoUrl: null,
      userId: null,
      createdAt: timestamp,
      createdBy: auth.currentUser.uid,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
    transaction.update(classRef, {
      studentCount: (classData.studentCount || 0) + (status === 'active' ? 1 : 0),
      assignedStudentCount: (classData.assignedStudentCount || 0) + 1,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
    parentRefs.forEach((parentRef, index) => transaction.update(parentRef, {
      studentIds: [...new Set([...(parentSnapshots[index].data().studentIds || []), ref.id])],
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    }));
  });
  return { studentId: ref.id, admissionNumber };
}

export async function updateStudent(input) {
  staff();
  dbReady();
  const studentId = required(input.studentId, 'Student ID', 128);
  const status = String(input.status || '').toLowerCase();
  const gender = String(input.gender || '').toLowerCase();
  if (!['active', 'inactive'].includes(status) || !['male', 'female'].includes(gender)) throw new Error('Choose a valid status and gender.');
  const dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) throw new Error('Enter a valid date of birth.');
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'students', studentId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Student was not found.');
    const student = snapshot.data();
    const classRef = doc(db, 'classes', student.classId || student.sectionId);
    const classSnapshot = await transaction.get(classRef);
    const classData = classSnapshot.exists() ? classSnapshot.data() : null;
    if (student.status !== status && status === 'active' && classData && classData.studentCount >= classData.capacity) {
      throw new Error('The student cannot be activated because the class is full.');
    }
    const firstName = required(input.firstName, 'First name');
    const middleName = String(input.middleName || '').trim();
    const lastName = required(input.lastName, 'Last name');
    transaction.update(ref, {
      firstName,
      middleName,
      lastName,
      searchFirstName: firstName.toLowerCase(),
      searchMiddleName: middleName.toLowerCase(),
      searchLastName: lastName.toLowerCase(),
      gender,
      dateOfBirth,
      phone: String(input.phone || '').trim(),
      address: String(input.address || '').trim(),
      status,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    });
    if (classData && student.status !== status) {
      transaction.update(classRef, {
        studentCount: classData.studentCount + (status === 'active' ? 1 : -1),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
      });
    }
  });
  return { success: true };
}

export async function assignStudentToClass({ studentId, classId }) {
  staff();
  dbReady();
  await runTransaction(db, async (transaction) => {
    const studentRef = doc(db, 'students', required(studentId, 'Student ID', 128));
    const classRef = doc(db, 'classes', required(classId, 'Class ID', 128));
    const [studentSnapshot, classSnapshot] = await Promise.all([transaction.get(studentRef), transaction.get(classRef)]);
    if (!studentSnapshot.exists()) throw new Error('Student was not found.');
    if (!classSnapshot.exists() || !classSnapshot.data().active) throw new Error('Choose an active class.');
    const student = studentSnapshot.data();
    const target = classSnapshot.data();
    const oldClassId = student.classId || student.sectionId;
    if (oldClassId === classId) return;
    if (student.status === 'active' && target.studentCount >= target.capacity) throw new Error('The selected class is full.');
    const oldRef = oldClassId ? doc(db, 'classes', oldClassId) : null;
    const oldSnapshot = oldRef ? await transaction.get(oldRef) : null;
    const timestamp = serverTimestamp();
    transaction.update(classRef, {
      assignedStudentCount: (target.assignedStudentCount || 0) + 1,
      studentCount: (target.studentCount || 0) + (student.status === 'active' ? 1 : 0),
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
    if (oldRef && oldSnapshot?.exists()) {
      const old = oldSnapshot.data();
      transaction.update(oldRef, {
        assignedStudentCount: Math.max(0, (old.assignedStudentCount || 0) - 1),
        studentCount: Math.max(0, (old.studentCount || 0) - (student.status === 'active' ? 1 : 0)),
        updatedAt: timestamp,
        updatedBy: auth.currentUser.uid,
      });
    }
    transaction.update(studentRef, {
      classId,
      grade: target.grade,
      sectionId: classId,
      section: target.section,
      stream: target.stream,
      updatedAt: timestamp,
      updatedBy: auth.currentUser.uid,
    });
  });
  return { success: true };
}

export async function linkParentToStudent({ parentId, studentId, linked }) {
  staff();
  dbReady();
  await runTransaction(db, async (transaction) => {
    const parentRef = doc(db, 'parents', required(parentId, 'Parent ID', 128));
    const studentRef = doc(db, 'students', required(studentId, 'Student ID', 128));
    const [parentSnapshot, studentSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(studentRef)]);
    if (!parentSnapshot.exists() || !studentSnapshot.exists()) throw new Error('Parent or student was not found.');
    const parent = parentSnapshot.data();
    const student = studentSnapshot.data();
    const parentIds = new Set(parent.studentIds || []);
    const studentIds = new Set(student.parentIds || []);
    if (linked) {
      if (parent.status !== 'active') throw new Error('An inactive parent cannot be linked.');
      parentIds.add(studentId);
      studentIds.add(parentId);
    } else {
      parentIds.delete(studentId);
      studentIds.delete(parentId);
    }
    const timestamp = serverTimestamp();
    transaction.update(parentRef, { studentIds: [...parentIds], updatedAt: timestamp, updatedBy: auth.currentUser.uid });
    transaction.update(studentRef, { parentIds: [...studentIds], updatedAt: timestamp, updatedBy: auth.currentUser.uid });
  });
  return { success: true };
}

export async function updateStudentStatus({ studentId, status }) {
  const result = await fetchStudent(studentId);
  return updateStudent({ ...result, studentId, status });
}

export async function fetchStudents(filters = {}) {
  dbReady();
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 100);
  const base = collection(db, 'students');
  const clauses = [];
  if (filters.grade) clauses.push(where('grade', '==', Number(filters.grade)));
  if (filters.status) clauses.push(where('status', '==', filters.status));
  if (filters.classId) clauses.push(where('classId', '==', filters.classId));
  if (filters.stream) clauses.push(where('stream', '==', filters.stream));
  const search = String(filters.search || '').trim().toLowerCase();
  if (search) {
    const matching = await Promise.all(['searchAdmissionNumber', 'searchFirstName', 'searchMiddleName', 'searchLastName'].map((field) =>
      getDocs(query(base, where(field, '>=', search), where(field, '<=', `${search}\uf8ff`), orderBy(field), limit(pageSize * 4)))));
    const unique = new Map();
    matching.forEach((snapshot) => snapshot.docs.forEach((item) => unique.set(item.id, item)));
    const records = [...unique.values()]
      .map((item) => ({ studentId: item.id, ...item.data() }))
      .filter((item) => (!filters.gender || item.gender === filters.gender)
        && (!filters.section || item.section === filters.section)
        && (!filters.stream || item.stream === filters.stream)
        && (!filters.classId || item.classId === filters.classId)
        && (!filters.grade || item.grade === Number(filters.grade))
        && (!filters.status || item.status === filters.status))
      .sort((left, right) => left.admissionNumber.localeCompare(right.admissionNumber));
    const offset = Number(String(filters.cursor || '').replace('offset:', '')) || 0;
    const page = records.slice(offset, offset + pageSize);
    return { students: page, nextCursor: offset + pageSize < records.length ? `offset:${offset + pageSize}` : null };
  }

  clauses.push(orderBy('admissionNumber'));
  clauses.push(limit(pageSize + 1));
  if (filters.cursor) {
    const cursor = await getDoc(doc(db, 'students', filters.cursor));
    if (!cursor.exists()) throw new Error('Invalid student pagination cursor.');
    clauses.splice(clauses.length - 1, 0, startAfter(cursor));
  }
  const snapshot = await getDocs(query(base, ...clauses));
  const docs = snapshot.docs.slice(0, pageSize);
  const students = docs.map((item) => ({ studentId: item.id, ...item.data() }))
    .filter((item) => (!filters.gender || item.gender === filters.gender)
      && (!filters.section || item.section === filters.section));
  return { students, nextCursor: snapshot.docs.length > pageSize ? docs[docs.length - 1]?.id : null };
}

export async function fetchStudent(studentId) {
  dbReady();
  const snapshot = await getDoc(doc(db, 'students', studentId));
  if (!snapshot.exists()) throw new Error('Student was not found.');
  const record = { studentId: snapshot.id, ...snapshot.data() };
  const parents = await Promise.all((record.parentIds || []).map((parentId) => getDoc(doc(db, 'parents', parentId))));
  record.parents = parents.filter((parent) => parent.exists()).map((parent) => ({
    parentId: parent.id,
    firstName: parent.data().firstName,
    middleName: parent.data().middleName,
    lastName: parent.data().lastName,
    relationship: parent.data().relationship,
    phone: parent.data().phone,
  }));
  return record;
}

export async function fetchClass(classId) {
  dbReady();
  const snapshot = await getDoc(doc(db, 'classes', classId));
  if (!snapshot.exists()) throw new Error('Class was not found.');
  return { classId: snapshot.id, ...snapshot.data() };
}

export async function fetchParent(parentId) {
  dbReady();
  const snapshot = await getDoc(doc(db, 'parents', parentId));
  if (!snapshot.exists()) throw new Error('Parent was not found.');
  const record = { parentId: snapshot.id, ...snapshot.data() };
  const children = await Promise.all((record.studentIds || []).map((studentId) => getDoc(doc(db, 'students', studentId))));
  record.students = children.filter((student) => student.exists()).map((student) => ({
    studentId: student.id,
    admissionNumber: student.data().admissionNumber,
    firstName: student.data().firstName,
    lastName: student.data().lastName,
  }));
  return record;
}

export async function fetchMyStudentProfile() {
  staff();
  dbReady();
  const snapshot = await getDocs(query(collection(db, 'students'), where('userId', '==', auth.currentUser.uid), limit(1)));
  if (snapshot.empty) throw new Error('No student profile is linked to this account.');
  const item = snapshot.docs[0];
  const record = { studentId: item.id, ...item.data() };
  return record;
}

export async function fetchMyLinkedStudents() {
  staff();
  dbReady();
  const parents = await getDocs(query(collection(db, 'parents'), where('userId', '==', auth.currentUser.uid), limit(1)));
  if (parents.empty) throw new Error('No parent profile is linked to this account.');
  const ids = parents.docs[0].data().studentIds || [];
  const students = await Promise.all(ids.map((studentId) => getDoc(doc(db, 'students', studentId))));
  return { students: students.filter((item) => item.exists()).map((item) => ({ studentId: item.id, ...item.data() })) };
}

export async function fetchClasses() {
  dbReady();
  const snapshot = await getDocs(query(collection(db, 'classes'), orderBy('grade'), orderBy('section'), limit(200)));
  return snapshot.docs.map((item) => ({ classId: item.id, ...item.data() }));
}

export async function fetchParents() {
  dbReady();
  const snapshot = await getDocs(query(collection(db, 'parents'), where('status', '==', 'active'), orderBy('lastName'), limit(100)));
  return snapshot.docs.map((item) => ({ parentId: item.id, ...item.data() }));
}

export async function fetchParentRecords(pageSize = 25, cursor = null) {
  dbReady();
  let recordsQuery = query(collection(db, 'parents'), orderBy('lastName'), limit(pageSize));
  if (cursor) {
    const cursorSnapshot = await getDoc(doc(db, 'parents', cursor));
    if (!cursorSnapshot.exists()) throw new Error('Invalid parent pagination cursor.');
    recordsQuery = query(collection(db, 'parents'), orderBy('lastName'), startAfter(cursorSnapshot), limit(pageSize));
  }
  const snapshot = await getDocs(recordsQuery);
  return {
    parents: snapshot.docs.map((item) => ({ parentId: item.id, ...item.data() })),
    nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}
