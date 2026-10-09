import { httpsCallable } from 'firebase/functions';

import { functions } from './firebase/config';

async function call(name, data = {}) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const result = await httpsCallable(functions, name)(data);
  return result.data;
}

export const listTeachers = (data) => call('listTeachers', data);
export const getTeacher = (teacherId) => call('getTeacher', { teacherId });
export const getMyTeacherProfile = () => call('getMyTeacherProfile');
export const createTeacher = (data) => call('createTeacher', data);
export const updateTeacher = (data) => call('updateTeacher', data);
export const linkTeacherAccount = (data) => call('linkTeacherAccount', data);

export const listSubjects = (data) => call('listSubjects', data);
export const getSubject = (subjectId) => call('getSubject', { subjectId });
export const createSubject = (data) => call('createSubject', data);
export const updateSubject = (data) => call('updateSubject', data);

export const listTeacherAssignments = (data) => call('listTeacherAssignments', data);
export const createTeacherAssignment = (data) => call('createTeacherAssignment', data);
export const updateTeacherAssignment = (data) => call('updateTeacherAssignment', data);

export const getTimetableSettings = () => call('getTimetableSettings');
export const saveTimetableSettings = (data) => call('saveTimetableSettings', data);
export const listTimetable = (data) => call('listTimetable', data);
export const getTimetableEntry = (entryId) => call('getTimetableEntry', { entryId });
export const createTimetableEntry = (data) => call('createTimetableEntry', data);
export const updateTimetableEntry = (data) => call('updateTimetableEntry', data);
export const deactivateTimetableEntry = (entryId) => call('deactivateTimetableEntry', { entryId });
