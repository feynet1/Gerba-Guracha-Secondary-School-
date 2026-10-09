import { httpsCallable } from 'firebase/functions';
import { collection, getDoc, getDocs, limit, orderBy, query, startAfter, where, doc } from 'firebase/firestore';

import { db, functions } from './firebase/config';

const call = async (name, data) => {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const result = await httpsCallable(functions, name)(data);
  return result.data;
};

export const createStudent = (data) => call('createStudent', data);
export const updateStudent = (data) => call('updateStudent', data);
export const assignStudentToClass = (data) => call('assignStudentToClass', data);
export const updateStudentStatus = (data) => call('updateStudentStatus', data);
export const createParent = (data) => call('createParent', data);
export const updateParent = (data) => call('updateParent', data);
export const linkParentToStudent = (data) => call('linkParentToStudent', data);
export const createClass = (data) => call('createClass', data);
export const updateClass = (data) => call('updateClass', data);
export const fetchStudents = (data) => call('listStudents', data);
export const fetchStudent = (studentId) => call('getStudent', { studentId });
export const fetchClass = (classId) => call('getClass', { classId });
export const fetchParent = (parentId) => call('getParent', { parentId });
export const fetchMyStudentProfile = () => call('getMyStudentProfile', {});
export const fetchMyLinkedStudents = () => call('getMyLinkedStudents', {});

export async function fetchClasses() {
  if (!db) throw new Error('Cloud Firestore is not configured.');
  const snapshot = await getDocs(query(collection(db, 'classes'), orderBy('grade'), orderBy('section'), limit(200)));
  return snapshot.docs.map((item) => ({ classId: item.id, ...item.data() }));
}

export async function fetchParents() {
  if (!db) throw new Error('Cloud Firestore is not configured.');
  const snapshot = await getDocs(query(collection(db, 'parents'), where('status', '==', 'active'), orderBy('lastName'), limit(100)));
  return snapshot.docs.map((item) => ({ parentId: item.id, ...item.data() }));
}

export async function fetchParentRecords(pageSize = 25, cursor = null) {
  if (!db) throw new Error('Cloud Firestore is not configured.');
  let parentsQuery = query(collection(db, 'parents'), orderBy('lastName'), limit(pageSize));
  if (cursor) {
    const cursorSnapshot = await getDoc(doc(db, 'parents', cursor));
    if (!cursorSnapshot.exists()) throw new Error('Invalid parent pagination cursor.');
    parentsQuery = query(collection(db, 'parents'), orderBy('lastName'), startAfter(cursorSnapshot), limit(pageSize));
  }
  const snapshot = await getDocs(parentsQuery);
  return {
    parents: snapshot.docs.map((item) => ({ parentId: item.id, ...item.data() })),
    nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}
