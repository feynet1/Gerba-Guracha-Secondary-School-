const test = require('node:test');
const assert = require('node:assert/strict');
const {
  overlaps,
  timeToMinutes,
  validateGradeStreams,
  validatePeriods,
  validateSubjectApplicability,
  validateTimetableSettings,
} = require('../src/phase3Validation');

test('subject applicability permits one stream across Grades 9-12', () => {
  assert.deepEqual(validateGradeStreams([9, 10, 11, 12], ['natural', 'social']), {
    grades: [9, 10, 11, 12],
    streams: ['natural', 'social'],
  });
});

test('rejects unsupported grade and stream values', () => {
  assert.throws(() => validateGradeStreams([8], []), /Grades must be between 9 and 12/);
  assert.throws(() => validateGradeStreams([9, 10], ['natural']), /Streams can only be configured/);
  assert.throws(() => validateGradeStreams([11], []), /Select at least one stream/);
  assert.throws(() => validateGradeStreams([11], ['science']), /Choose a valid stream/);
});

test('subject applicability matches grade and upper-grade stream', () => {
  const subject = { applicableGrades: [9, 11], applicableStreams: ['natural'] };
  assert.equal(validateSubjectApplicability(subject, { grade: 9, stream: null }), true);
  assert.equal(validateSubjectApplicability(subject, { grade: 11, stream: 'natural' }), true);
  assert.equal(validateSubjectApplicability(subject, { grade: 11, stream: 'social' }), false);
  assert.equal(validateSubjectApplicability(subject, { grade: 10, stream: 'natural' }), false);
});

test('converts and validates configured times', () => {
  assert.equal(timeToMinutes('08:40'), 520);
  assert.throws(() => timeToMinutes('8:40'), /24-hour HH:MM/);
  assert.throws(() => timeToMinutes('25:00'), /24-hour HH:MM/);
});

test('detects interval overlap and permits adjacent lessons', () => {
  assert.equal(overlaps({ startTime: '08:00', endTime: '08:40' }, { startTime: '08:30', endTime: '09:00' }), true);
  assert.equal(overlaps({ startTime: '08:00', endTime: '08:40' }, { startTime: '08:40', endTime: '09:20' }), false);
});

test('validates configurable periods and rejects overlap or duplicate IDs', () => {
  const periods = [
    { id: 'P1', label: 'First', type: 'lesson', startTime: '08:00', endTime: '08:40' },
    { id: 'B1', label: 'Break', type: 'break', startTime: '08:40', endTime: '09:00' },
  ];
  assert.equal(validatePeriods(periods).length, 2);
  assert.throws(() => validatePeriods([
    periods[0],
    { ...periods[1], id: 'P1' },
  ]), /Period IDs must be unique/);
  assert.throws(() => validatePeriods([
    periods[0],
    { ...periods[1], id: 'P2', type: 'lesson', startTime: '08:30' },
  ]), /periods cannot overlap/);
  assert.throws(() => validatePeriods([
    { ...periods[0], endTime: '07:30' },
  ]), /must end after it starts/);
});

test('timetable settings validate days, periods, room allocation and daily limits', () => {
  const settings = {
    academicYear: '2018/19',
    schoolDays: ['monday', 'friday'],
    periods: [{ id: 'P1', label: 'First', type: 'lesson', startTime: '08:00', endTime: '08:40' }],
    rooms: ['Room 1'],
    roomAllocationEnabled: true,
    timeZone: 'Africa/Addis_Ababa',
    maxPeriodsPerDay: 8,
  };
  assert.deepEqual(validateTimetableSettings(settings).schoolDays, ['monday', 'friday']);
  assert.throws(() => validateTimetableSettings({ ...settings, schoolDays: ['Funday'] }), /valid school days/);
  assert.throws(() => validateTimetableSettings({ ...settings, rooms: [] }), /Add at least one room/);
  assert.throws(() => validateTimetableSettings({ ...settings, maxPeriodsPerDay: 21 }), /Daily lesson limit/);
});
