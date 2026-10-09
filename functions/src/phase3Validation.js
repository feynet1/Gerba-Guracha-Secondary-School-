const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const STREAMS = new Set(['natural', 'social']);
const GRADES = new Set([9, 10, 11, 12]);
const EMPLOYMENT_STATUSES = new Set(['active', 'inactive']);

const clean = (value) => String(value ?? '').trim();

function validateGradeStreams(grades, streams) {
  if (!Array.isArray(grades) || grades.length === 0) throw new Error('Select at least one applicable grade.');
  const normalizedGrades = [...new Set(grades.map(Number))].sort((a, b) => a - b);
  if (normalizedGrades.some((grade) => !GRADES.has(grade))) throw new Error('Grades must be between 9 and 12.');
  if (!Array.isArray(streams)) throw new Error('Streams must be selected from the supported values.');
  const normalizedStreams = [...new Set(streams.map((stream) => clean(stream).toLowerCase()))];
  if (normalizedStreams.some((stream) => !STREAMS.has(stream))) throw new Error('Choose a valid stream.');
  const includesUpperGrades = normalizedGrades.some((grade) => grade >= 11);
  if (!includesUpperGrades && normalizedStreams.length) {
    throw new Error('Streams can only be configured for Grades 11 and 12.');
  }
  if (includesUpperGrades && normalizedStreams.length === 0) {
    throw new Error('Select at least one stream for Grades 11 and 12.');
  }
  return { grades: normalizedGrades, streams: normalizedStreams.sort() };
}

function timeToMinutes(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) throw new Error('Times must use 24-hour HH:MM format.');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function overlaps(left, right) {
  return timeToMinutes(left.startTime) < timeToMinutes(right.endTime)
    && timeToMinutes(left.endTime) > timeToMinutes(right.startTime);
}

function validatePeriods(periods) {
  if (!Array.isArray(periods) || periods.length < 1 || periods.length > 20) {
    throw new Error('Configure between 1 and 20 timetable periods.');
  }
  const ids = new Set();
  const normalized = periods.map((period) => {
    const id = clean(period.id);
    const label = clean(period.label);
    const type = clean(period.type);
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(id) || !label || label.length > 40) {
      throw new Error('Each period needs a valid ID and label.');
    }
    if (ids.has(id)) throw new Error('Period IDs must be unique.');
    ids.add(id);
    if (!['lesson', 'break'].includes(type)) throw new Error('Period type must be lesson or break.');
    const startTime = clean(period.startTime);
    const endTime = clean(period.endTime);
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) throw new Error('Each period must end after it starts.');
    return { id, label, type, startTime, endTime };
  }).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (let index = 1; index < normalized.length; index += 1) {
    if (overlaps(normalized[index - 1], normalized[index])) {
      throw new Error('Configured periods cannot overlap.');
    }
  }
  return normalized;
}

function validateTimetableSettings(input) {
  const academicYear = clean(input.academicYear);
  if (!academicYear || academicYear.length > 20) throw new Error('Enter a valid academic year.');
  if (!Array.isArray(input.schoolDays) || input.schoolDays.length < 1) throw new Error('Select at least one school day.');
  const schoolDays = [...new Set(input.schoolDays.map((day) => clean(day).toLowerCase()))];
  if (schoolDays.some((day) => !DAYS.has(day))) throw new Error('Choose valid school days.');
  const periods = validatePeriods(input.periods);
  const rooms = Array.isArray(input.rooms) ? [...new Set(input.rooms.map((room) => clean(room)).filter(Boolean))] : [];
  if (rooms.some((room) => room.length > 40)) throw new Error('Room names must be 40 characters or fewer.');
  if (input.roomAllocationEnabled === true && rooms.length === 0) {
    throw new Error('Add at least one room when room allocation is enabled.');
  }
  const timeZone = clean(input.timeZone || 'Africa/Addis_Ababa');
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
  } catch {
    throw new Error('Choose a valid time zone.');
  }
  const maxPeriodsPerDay = input.maxPeriodsPerDay === null || input.maxPeriodsPerDay === undefined || input.maxPeriodsPerDay === ''
    ? null
    : Number(input.maxPeriodsPerDay);
  if (maxPeriodsPerDay !== null && (!Number.isInteger(maxPeriodsPerDay) || maxPeriodsPerDay < 1 || maxPeriodsPerDay > 20)) {
    throw new Error('Daily lesson limit must be a whole number from 1 to 20.');
  }
  return {
    academicYear,
    schoolDays,
    periods,
    rooms,
    roomAllocationEnabled: input.roomAllocationEnabled === true,
    timeZone,
    maxPeriodsPerDay,
  };
}

function validateSubjectApplicability(subject, classRecord) {
  if (!subject.applicableGrades.includes(Number(classRecord.grade))) return false;
  if ([11, 12].includes(Number(classRecord.grade))) {
    return subject.applicableStreams.includes(classRecord.stream);
  }
  return classRecord.stream == null;
}

module.exports = {
  DAYS,
  EMPLOYMENT_STATUSES,
  GRADES,
  STREAMS,
  overlaps,
  timeToMinutes,
  validateGradeStreams,
  validatePeriods,
  validateSubjectApplicability,
  validateTimetableSettings,
};
