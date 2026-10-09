import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/useAuth';
import { fetchClasses } from '../../services/phase2';
import {
  createSubject,
  createTeacher,
  createTeacherAssignment,
  createTimetableEntry,
  deactivateTimetableEntry,
  getMyTeacherProfile,
  getSubject,
  getTeacher,
  getTimetableEntry,
  getTimetableSettings,
  listSubjects,
  listTeachers,
  listTeacherAssignments,
  listTimetable,
  linkTeacherAccount,
  saveTimetableSettings,
  updateSubject,
  updateTeacher,
  updateTimetableEntry,
} from '../../services/phase3';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const STREAM_KEYS = ['natural', 'social'];
const streamLabel = (stream, t) => stream ? t(stream === 'natural' ? 'naturalScience' : 'socialScience') : t('noStream');
const errorMessage = (error, t) => {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('class already has a lesson')) return t('classScheduleConflict');
  if (message.includes('teacher is already assigned')) return t('teacherScheduleConflict');
  if (message.includes('room is already occupied')) return t('roomScheduleConflict');
  if (message.includes('already in use') || message.includes('already exists')) return t('duplicateRecord');
  if (message.includes('inactive')) return t('inactiveReference');
  if (message.includes('configure school timetable')) return t('configureTimetableFirst');
  if (message.includes('break periods')) return t('breakNotSchedulable');
  if (error?.message) {
    return error.code ? `${error.message} (${error.code})` : error.message;
  }
  return t('requestFailed');
};

function TeachersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = role === 'admin';
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    listTeachers({ search, employmentStatus: status || undefined })
      .then((result) => {
        if (!current) return;
        setTeachers(result.teachers);
        setError('');
      })
      .catch((err) => {
        if (current) setError(errorMessage(err, t));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [search, status, t]);
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Typography variant="h4">{t('teachers')}</Typography>
        {canManage && <Button variant="contained" onClick={() => navigate('/teachers/new')}>{t('createTeacher')}</Button>}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth label={t('searchTeachers')} value={search} onChange={(event) => setSearch(event.target.value)} />
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel>{t('employmentStatus')}</InputLabel>
          <Select label={t('employmentStatus')} value={status} onChange={(event) => setStatus(event.target.value)}>
            <MenuItem value="">{t('allStatuses')}</MenuItem>
            <MenuItem value="active">{t('active')}</MenuItem>
            <MenuItem value="inactive">{t('inactive')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {loading ? <Typography>{t('loadingTeachers')}</Typography> : !teachers.length ? <Alert severity="info">{t('noTeachers')}</Alert> : (
        <Stack spacing={1}>
          {teachers.map((teacher) => (
            <Card key={teacher.teacherId}><CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
                <Box>
                  <Typography variant="h6" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/teachers/${teacher.teacherId}`)}>
                    {teacher.firstName} {teacher.middleName} {teacher.lastName}
                  </Typography>
                  <Typography color="text.secondary">{t('employeeId')}: {teacher.employeeId} · {teacher.qualification || '—'}</Typography>
                  {teacher.email && <Typography variant="body2">{teacher.email}</Typography>}
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={t(teacher.employmentStatus)} color={teacher.employmentStatus === 'active' ? 'success' : 'default'} />
                  {canManage && <Button onClick={() => navigate(`/teachers/${teacher.teacherId}/edit`)}>{t('edit')}</Button>}
                </Stack>
              </Stack>
            </CardContent></Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

const emptyTeacher = {
  employeeId: '', firstName: '', middleName: '', lastName: '', gender: '',
  phone: '', email: '', qualification: '', specialization: [], employmentStatus: 'active',
};

function TeacherFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teacherId } = useParams();
  const editing = Boolean(teacherId);
  const [form, setForm] = useState(emptyTeacher);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing) return;
    getTeacher(teacherId)
      .then((teacher) => setForm({ ...emptyTeacher, ...teacher }))
      .catch((err) => setError(errorMessage(err, t)))
      .finally(() => setLoading(false));
  }, [teacherId, editing, t]);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { ...form, specialization: Array.isArray(form.specialization) ? form.specialization : [] };
      if (editing) await updateTeacher({ ...data, teacherId });
      else {
        const result = await createTeacher(data);
        navigate(`/teachers/${result.teacherId}`);
        return;
      }
      navigate(`/teachers/${teacherId}`);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <Typography>{t('loading')}</Typography>;
  return (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}><CardContent sx={{ p: { xs: 2, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography variant="h4">{t(editing ? 'editTeacher' : 'createTeacher')}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack component="form" onSubmit={submit} spacing={2}>
          <TextField required label={t('employeeId')} value={form.employeeId} onChange={(event) => set('employeeId', event.target.value)} />
          <TextField required label={t('firstName')} value={form.firstName} onChange={(event) => set('firstName', event.target.value)} />
          <TextField label={t('middleName')} value={form.middleName} onChange={(event) => set('middleName', event.target.value)} />
          <TextField required label={t('lastName')} value={form.lastName} onChange={(event) => set('lastName', event.target.value)} />
          <FormControl>
            <InputLabel>{t('gender')}</InputLabel>
            <Select label={t('gender')} value={form.gender || ''} onChange={(event) => set('gender', event.target.value)}>
              <MenuItem value="">{t('notSpecified')}</MenuItem>
              <MenuItem value="male">{t('male')}</MenuItem>
              <MenuItem value="female">{t('female')}</MenuItem>
            </Select>
          </FormControl>
          <TextField label={t('phone')} value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          <TextField type="email" label={t('email')} value={form.email} onChange={(event) => set('email', event.target.value)} />
          <TextField label={t('qualification')} value={form.qualification} onChange={(event) => set('qualification', event.target.value)} />
          <TextField
            label={t('specialization')}
            value={(form.specialization || []).join(', ')}
            onChange={(event) => set('specialization', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
            helperText={t('commaSeparatedSpecializations')}
          />
          {editing && (
            <FormControl>
              <InputLabel>{t('employmentStatus')}</InputLabel>
              <Select label={t('employmentStatus')} value={form.employmentStatus} onChange={(event) => set('employmentStatus', event.target.value)}>
                <MenuItem value="active">{t('active')}</MenuItem>
                <MenuItem value="inactive">{t('inactive')}</MenuItem>
              </Select>
            </FormControl>
          )}
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            <Button onClick={() => navigate(-1)}>{t('cancel')}</Button>
          </Stack>
        </Stack>
      </Stack>
    </CardContent></Card>
  );
}

function TeacherDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teacherId } = useParams();
  const { role } = useAuth();
  const canManage = role === 'admin';
  const [teacher, setTeacher] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [accountUid, setAccountUid] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => Promise.all([
    getTeacher(teacherId),
    listTeacherAssignments({ teacherId }),
  ]), [teacherId]);
  useEffect(() => {
    let current = true;
    load()
      .then(([record, result]) => {
        if (!current) return;
        setTeacher(record);
        setAssignments(result.assignments);
      })
      .catch((err) => {
        if (current) setError(errorMessage(err, t));
      });
    return () => { current = false; };
  }, [load, t]);
  const handleLink = async () => {
    setSaving(true);
    setError('');
    try {
      await linkTeacherAccount({ teacherId, userId: accountUid.trim() });
      setAccountUid('');
      const [record, result] = await load();
      setTeacher(record);
      setAssignments(result.assignments);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  if (!teacher) return error ? <Alert severity="error">{error}</Alert> : <Typography>{t('loading')}</Typography>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{teacher.firstName} {teacher.middleName} {teacher.lastName}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography>{t('employeeId')}: {teacher.employeeId}</Typography>
      <Typography>{t('qualification')}: {teacher.qualification || '—'}</Typography>
      <Typography>{t('specialization')}: {(teacher.specialization || []).join(', ') || '—'}</Typography>
      <Typography>{t('employmentStatus')}: {t(teacher.employmentStatus)}</Typography>
      {teacher.email && <Typography>{t('email')}: {teacher.email}</Typography>}
      {teacher.phone && <Typography>{t('phone')}: {teacher.phone}</Typography>}
      {canManage && (
        <>
          <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => navigate(`/teachers/${teacherId}/edit`)}>{t('edit')}</Button>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField label={t('existingTeacherAccountUid')} value={accountUid} onChange={(event) => setAccountUid(event.target.value)} />
            <Button disabled={saving || !accountUid.trim()} onClick={handleLink}>{t('linkExistingAccount')}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">{t('teacherLinkHint')}</Typography>
        </>
      )}
      <Typography variant="h5">{t('teacherAssignments')}</Typography>
      {!assignments.length ? <Alert severity="info">{t('noAssignments')}</Alert> : assignments.map((item) => (
        <Card key={item.assignmentId}><CardContent>
          <Typography>{item.subjectName} · {item.className} · {item.academicYear} · {item.periodsPerWeek} {t('periodsPerWeek')}</Typography>
        </CardContent></Card>
      ))}
    </Stack>
  );
}

function MyTeacherProfilePage() {
  const { t } = useTranslation();
  const [teacher, setTeacher] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getMyTeacherProfile().then(setTeacher).catch((err) => setError(errorMessage(err, t)));
  }, [t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!teacher) return <Typography>{t('loading')}</Typography>;
  return <TeacherDetailsPageContents teacher={teacher} t={t} />;
}

function TeacherDetailsPageContents({ teacher, t }) {
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listTeacherAssignments().then((result) => setAssignments(result.assignments)).catch((err) => setError(errorMessage(err, t)));
  }, [t]);
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('myTeacherProfile')}</Typography>
      <Typography>{teacher.firstName} {teacher.middleName} {teacher.lastName}</Typography>
      <Typography>{t('employeeId')}: {teacher.employeeId}</Typography>
      <Typography>{t('qualification')}: {teacher.qualification || '—'}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="h5">{t('teacherAssignments')}</Typography>
      {assignments === null ? <Typography>{t('loading')}</Typography> : assignments.length === 0
        ? <Alert severity="info">{t('noAssignments')}</Alert>
        : assignments.map((item) => <Card key={item.assignmentId}><CardContent>
          <Typography>{item.subjectName} · {item.className} · {item.academicYear}</Typography>
        </CardContent></Card>)}
    </Stack>
  );
}

function SubjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = role === 'admin';
  const [subjects, setSubjects] = useState([]);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [active, setActive] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    listSubjects({
        grade: grade || undefined,
        stream: stream || undefined,
        active: active === '' ? undefined : active === 'active',
        search,
      })
      .then((result) => {
        if (!current) return;
        setSubjects(result.subjects);
        setError('');
      })
      .catch((err) => {
        if (current) setError(errorMessage(err, t));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [grade, stream, active, search, t]);
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Typography variant="h4">{t('subjects')}</Typography>
        {canManage && <Button variant="contained" onClick={() => navigate('/subjects/new')}>{t('createSubject')}</Button>}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField label={t('searchSubjects')} value={search} onChange={(event) => setSearch(event.target.value)} fullWidth />
        <FormControl sx={{ minWidth: 140 }}><InputLabel>{t('grade')}</InputLabel>
          <Select label={t('grade')} value={grade} onChange={(event) => setGrade(event.target.value)}>
            <MenuItem value="">{t('allGrades')}</MenuItem>{[9, 10, 11, 12].map((value) => <MenuItem key={value} value={value}>{t('gradeNumber', { number: value })}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 160 }}><InputLabel>{t('stream')}</InputLabel>
          <Select label={t('stream')} value={stream} onChange={(event) => setStream(event.target.value)}>
            <MenuItem value="">{t('allStreams')}</MenuItem><MenuItem value="natural">{t('naturalScience')}</MenuItem><MenuItem value="social">{t('socialScience')}</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 140 }}><InputLabel>{t('status')}</InputLabel>
          <Select label={t('status')} value={active} onChange={(event) => setActive(event.target.value)}>
            <MenuItem value="">{t('allStatuses')}</MenuItem><MenuItem value="active">{t('active')}</MenuItem><MenuItem value="inactive">{t('inactive')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {loading ? <Typography>{t('loadingSubjects')}</Typography> : !subjects.length ? <Alert severity="info">{t('noSubjects')}</Alert> : (
        <Stack spacing={1}>{subjects.map((subject) => (
          <Card key={subject.subjectId}><CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
              <Box>
                <Typography variant="h6" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/subjects/${subject.subjectId}`)}>{subject.code} · {subject.name}</Typography>
                <Typography color="text.secondary">
                  {subject.applicableGrades.map((item) => t('gradeNumber', { number: item })).join(', ')}
                  {subject.applicableStreams.length ? ` · ${subject.applicableStreams.map((item) => streamLabel(item, t)).join(', ')}` : ''}
                  {' · '}{subject.periodsPerWeek} {t('periodsPerWeek')}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" color={subject.active ? 'success' : 'default'} label={t(subject.active ? 'active' : 'inactive')} />
                {canManage && <Button onClick={() => navigate(`/subjects/${subject.subjectId}/edit`)}>{t('edit')}</Button>}
              </Stack>
            </Stack>
          </CardContent></Card>
        ))}</Stack>
      )}
    </Stack>
  );
}

function SubjectFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subjectId } = useParams();
  const editing = Boolean(subjectId);
  const [form, setForm] = useState({ code: '', name: '', description: '', applicableGrades: [9, 10, 11, 12], applicableStreams: [...STREAM_KEYS], periodsPerWeek: 5, active: true });
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing) return;
    getSubject(subjectId).then((subject) => setForm(subject)).catch((err) => setError(errorMessage(err, t))).finally(() => setLoading(false));
  }, [editing, subjectId, t]);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateSubject({ ...form, subjectId });
        navigate(`/subjects/${subjectId}`);
      } else {
        const result = await createSubject(form);
        navigate(`/subjects/${result.subjectId}`);
      }
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <Typography>{t('loading')}</Typography>;
  const hasUpperGrades = form.applicableGrades.some((grade) => Number(grade) >= 11);
  return (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}><CardContent sx={{ p: { xs: 2, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography variant="h4">{t(editing ? 'editSubject' : 'createSubject')}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack component="form" onSubmit={submit} spacing={2}>
          <TextField required label={t('subjectCode')} value={form.code} onChange={(event) => set('code', event.target.value)} />
          <TextField required label={t('subjectName')} value={form.name} onChange={(event) => set('name', event.target.value)} />
          <TextField label={t('description')} multiline minRows={2} value={form.description} onChange={(event) => set('description', event.target.value)} />
          <FormControl required><InputLabel>{t('applicableGrades')}</InputLabel>
            <Select multiple label={t('applicableGrades')} value={form.applicableGrades} onChange={(event) => set('applicableGrades', event.target.value.map(Number))}>
              {[9, 10, 11, 12].map((grade) => <MenuItem key={grade} value={grade}>{t('gradeNumber', { number: grade })}</MenuItem>)}
            </Select>
          </FormControl>
          {hasUpperGrades && <FormControl required><InputLabel>{t('applicableStreams')}</InputLabel>
            <Select multiple label={t('applicableStreams')} value={form.applicableStreams} onChange={(event) => set('applicableStreams', event.target.value)}>
              <MenuItem value="natural">{t('naturalScience')}</MenuItem><MenuItem value="social">{t('socialScience')}</MenuItem>
            </Select>
          </FormControl>}
          <TextField required type="number" inputProps={{ min: 1, max: 40 }} label={t('periodsPerWeek')} value={form.periodsPerWeek} onChange={(event) => set('periodsPerWeek', Number(event.target.value))} />
          {editing && <FormControl><InputLabel>{t('status')}</InputLabel>
            <Select label={t('status')} value={form.active ? 'active' : 'inactive'} onChange={(event) => set('active', event.target.value === 'active')}>
              <MenuItem value="active">{t('active')}</MenuItem><MenuItem value="inactive">{t('inactive')}</MenuItem>
            </Select>
          </FormControl>}
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            <Button onClick={() => navigate(-1)}>{t('cancel')}</Button>
          </Stack>
        </Stack>
      </Stack>
    </CardContent></Card>
  );
}

function SubjectDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subjectId } = useParams();
  const { role } = useAuth();
  const [subject, setSubject] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getSubject(subjectId).then(setSubject).catch((err) => setError(errorMessage(err, t)));
  }, [subjectId, t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!subject) return <Typography>{t('loading')}</Typography>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{subject.code} · {subject.name}</Typography>
      <Typography>{t('description')}: {subject.description || '—'}</Typography>
      <Typography>{t('applicableGrades')}: {subject.applicableGrades.map((grade) => t('gradeNumber', { number: grade })).join(', ')}</Typography>
      <Typography>{t('applicableStreams')}: {subject.applicableStreams.map((stream) => streamLabel(stream, t)).join(', ') || t('notApplicable')}</Typography>
      <Typography>{t('periodsPerWeek')}: {subject.periodsPerWeek}</Typography>
      <Typography>{t('status')}: {t(subject.active ? 'active' : 'inactive')}</Typography>
      {role === 'admin' && <Button sx={{ alignSelf: 'flex-start' }} variant="contained" onClick={() => navigate(`/subjects/${subjectId}/edit`)}>{t('edit')}</Button>}
    </Stack>
  );
}

function TeacherAssignmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = role === 'admin';
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [periodsPerWeek, setPeriodsPerWeek] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadAssignments = useCallback(() => listTeacherAssignments({
        teacherId: teacherId || undefined,
        classId: classId || undefined,
        subjectId: subjectId || undefined,
        academicYear: academicYear || undefined,
      }), [teacherId, classId, subjectId, academicYear]);
  useEffect(() => {
    let current = true;
    loadAssignments()
      .then((result) => {
        if (current) setAssignments(result.assignments);
      })
      .catch((err) => {
        if (current) setError(errorMessage(err, t));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [loadAssignments, t]);
  useEffect(() => {
    if (!canManage) return;
    Promise.all([listTeachers({ employmentStatus: 'active' }), fetchClasses(), listSubjects({ active: true })])
      .then(([teacherResult, classResult, subjectResult]) => {
        setTeachers(teacherResult.teachers);
        setClasses(classResult.filter((item) => item.active));
        setSubjects(subjectResult.subjects);
      })
      .catch((err) => setError(errorMessage(err, t)));
  }, [canManage, t]);
  const selectedClass = classes.find((item) => item.classId === classId);
  const eligibleSubjects = subjects.filter((subject) => selectedClass
    && subject.applicableGrades.includes(selectedClass.grade)
    && (selectedClass.grade <= 10 || subject.applicableStreams.includes(selectedClass.stream)));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createTeacherAssignment({ teacherId, classId, subjectId, academicYear: selectedClass.academicYear, periodsPerWeek });
      const result = await loadAssignments();
      setAssignments(result.assignments);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async (assignmentId) => {
    if (!window.confirm(t('confirmDeactivateAssignment'))) return;
    try {
      await updateTeacherAssignment({ assignmentId, active: false });
      await loadAssignments();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('teacherAssignments')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {canManage && <Card><CardContent>
        <Typography variant="h6" mb={2}>{t('createAssignment')}</Typography>
        <Stack component="form" onSubmit={submit} spacing={2}>
          <FormControl required><InputLabel>{t('teacher')}</InputLabel>
            <Select label={t('teacher')} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
              {teachers.map((teacher) => <MenuItem key={teacher.teacherId} value={teacher.teacherId}>{teacher.employeeId} · {teacher.firstName} {teacher.lastName}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl required><InputLabel>{t('class')}</InputLabel>
            <Select label={t('class')} value={classId} onChange={(event) => {
              const selected = classes.find((item) => item.classId === event.target.value);
              setClassId(event.target.value);
              setAcademicYear(selected?.academicYear || '');
              setSubjectId('');
            }}>
              {classes.map((item) => <MenuItem key={item.classId} value={item.classId}>{item.name} · {item.academicYear}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl required disabled={!classId}><InputLabel>{t('subject')}</InputLabel>
            <Select label={t('subject')} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              {eligibleSubjects.map((item) => <MenuItem key={item.subjectId} value={item.subjectId}>{item.code} · {item.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label={t('academicYear')} value={academicYear} InputProps={{ readOnly: true }} />
          <TextField required type="number" inputProps={{ min: 1, max: 40 }} label={t('periodsPerWeek')} value={periodsPerWeek} onChange={(event) => setPeriodsPerWeek(Number(event.target.value))} />
          <Button type="submit" variant="contained" disabled={saving || !teacherId || !classId || !subjectId}>{saving ? t('saving') : t('createAssignment')}</Button>
        </Stack>
      </CardContent></Card>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {canManage && <FormControl fullWidth><InputLabel>{t('teacher')}</InputLabel>
          <Select label={t('teacher')} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <MenuItem value="">{t('allTeachers')}</MenuItem>{teachers.map((item) => <MenuItem key={item.teacherId} value={item.teacherId}>{item.firstName} {item.lastName}</MenuItem>)}
          </Select>
        </FormControl>}
        <TextField label={t('academicYear')} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} />
      </Stack>
      {loading ? <Typography>{t('loadingAssignments')}</Typography> : !assignments.length ? <Alert severity="info">{t('noAssignments')}</Alert> : (
        <Box sx={{ overflowX: 'auto' }}><Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('teacher')}</TableCell><TableCell>{t('class')}</TableCell><TableCell>{t('subject')}</TableCell>
            <TableCell>{t('academicYear')}</TableCell><TableCell>{t('periodsPerWeek')}</TableCell><TableCell>{t('status')}</TableCell>
            {canManage && <TableCell />}
          </TableRow></TableHead>
          <TableBody>{assignments.map((item) => (
            <TableRow key={item.assignmentId}>
              <TableCell>{item.teacherName}</TableCell><TableCell>{item.className}</TableCell>
              <TableCell>{item.subjectCode} · {item.subjectName}</TableCell><TableCell>{item.academicYear}</TableCell>
              <TableCell>{item.periodsPerWeek}</TableCell><TableCell>{t(item.active ? 'active' : 'inactive')}</TableCell>
              {canManage && <TableCell><Button disabled={!item.active} onClick={() => deactivate(item.assignmentId)}>{t('deactivate')}</Button></TableCell>}
            </TableRow>
          ))}</TableBody>
        </Table></Box>
      )}
      {canManage && <Button onClick={() => navigate('/timetable/settings')}>{t('timetableSettings')}</Button>}
    </Stack>
  );
}

const emptySettings = { academicYear: '', schoolDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], periods: [], rooms: [], roomAllocationEnabled: false, timeZone: 'Africa/Addis_Ababa', maxPeriodsPerDay: '' };

function TimetableSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getTimetableSettings().then(({ settings }) => {
      if (settings) setForm({ ...emptySettings, ...settings, maxPeriodsPerDay: settings.maxPeriodsPerDay || '' });
    }).catch((err) => setError(errorMessage(err, t))).finally(() => setLoading(false));
  }, [t]);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const changePeriod = (index, field, value) => set('periods', form.periods.map((period, i) => i === index ? { ...period, [field]: value } : period));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveTimetableSettings({
        ...form,
        maxPeriodsPerDay: form.maxPeriodsPerDay || null,
        rooms: typeof form.rooms === 'string' ? form.rooms.split(',').map((room) => room.trim()).filter(Boolean) : form.rooms,
      });
      navigate('/timetable');
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <Typography>{t('loading')}</Typography>;
  return (
    <Card sx={{ maxWidth: 900, mx: 'auto' }}><CardContent sx={{ p: { xs: 2, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography variant="h4">{t('timetableSettings')}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack component="form" onSubmit={submit} spacing={2}>
          <TextField required label={t('academicYear')} value={form.academicYear} onChange={(event) => set('academicYear', event.target.value)} />
          <FormControl required><InputLabel>{t('schoolDays')}</InputLabel>
            <Select multiple label={t('schoolDays')} value={form.schoolDays} onChange={(event) => set('schoolDays', event.target.value)}>
              {DAY_KEYS.map((day) => <MenuItem key={day} value={day}>{t(day)}</MenuItem>)}
            </Select>
          </FormControl>
          <Typography variant="h6">{t('periodsAndBreaks')}</Typography>
          {form.periods.map((period, index) => (
            <Stack key={`${period.id}-${index}`} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
              <TextField required label={t('periodId')} value={period.id} onChange={(event) => changePeriod(index, 'id', event.target.value)} />
              <TextField required label={t('periodLabel')} value={period.label} onChange={(event) => changePeriod(index, 'label', event.target.value)} />
              <TextField required type="time" label={t('startTime')} InputLabelProps={{ shrink: true }} value={period.startTime} onChange={(event) => changePeriod(index, 'startTime', event.target.value)} />
              <TextField required type="time" label={t('endTime')} InputLabelProps={{ shrink: true }} value={period.endTime} onChange={(event) => changePeriod(index, 'endTime', event.target.value)} />
              <FormControl sx={{ minWidth: 120 }}><InputLabel>{t('periodType')}</InputLabel>
                <Select label={t('periodType')} value={period.type} onChange={(event) => changePeriod(index, 'type', event.target.value)}>
                  <MenuItem value="lesson">{t('lesson')}</MenuItem><MenuItem value="break">{t('break')}</MenuItem>
                </Select>
              </FormControl>
              <Button color="error" onClick={() => set('periods', form.periods.filter((_, i) => i !== index))}>{t('remove')}</Button>
            </Stack>
          ))}
          <Button onClick={() => set('periods', [...form.periods, {
            id: `P${form.periods.length + 1}`, label: `${t('period')} ${form.periods.length + 1}`,
            startTime: '', endTime: '', type: 'lesson',
          }])}>{t('addPeriod')}</Button>
          <FormControlLabel control={<Switch checked={form.roomAllocationEnabled} onChange={(event) => set('roomAllocationEnabled', event.target.checked)} />} label={t('enableRoomAllocation')} />
          <TextField
            label={t('rooms')}
            value={Array.isArray(form.rooms) ? form.rooms.join(', ') : form.rooms}
            onChange={(event) => set('rooms', event.target.value)}
            helperText={t('commaSeparatedRooms')}
          />
          <TextField label={t('timeZone')} value={form.timeZone} onChange={(event) => set('timeZone', event.target.value)} />
          <TextField type="number" inputProps={{ min: 1, max: 20 }} label={t('maxPeriodsPerDay')} value={form.maxPeriodsPerDay} onChange={(event) => set('maxPeriodsPerDay', event.target.value)} />
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            <Button onClick={() => navigate('/timetable')}>{t('cancel')}</Button>
          </Stack>
        </Stack>
      </Stack>
    </CardContent></Card>
  );
}

function TimetableEntryFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { entryId } = useParams();
  const editing = Boolean(entryId);
  const [settings, setSettings] = useState(null);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({ classId: '', assignmentId: '', dayOfWeek: '', periodId: '', room: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([getTimetableSettings(), fetchClasses(), listTeacherAssignments({ active: true })])
      .then(([config, classList, assignmentList]) => {
        setSettings(config.settings);
        setClasses(classList.filter((item) => item.active));
        setAssignments(assignmentList.assignments.filter((item) => item.active));
      })
      .catch((err) => setError(errorMessage(err, t)))
      .finally(() => setLoading(false));
  }, [t]);
  useEffect(() => {
    if (!editing) return;
    getTimetableEntry(entryId).then((entry) => {
      if (entry) setForm({
        classId: entry.classId,
        assignmentId: entry.assignmentId,
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.periodId,
        room: entry.room || '',
      });
      else setError(t('timetableEntryNotFound'));
    }).catch((err) => setError(errorMessage(err, t)));
  }, [editing, entryId, t]);
  const selectedClass = classes.find((item) => item.classId === form.classId);
  const classAssignments = assignments.filter((item) => item.classId === form.classId && item.academicYear === selectedClass?.academicYear);
  const selectedAssignment = assignments.find((item) => item.assignmentId === form.assignmentId);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!selectedAssignment) throw new Error(t('chooseAssignment'));
      const period = settings.periods.find((item) => item.id === form.periodId);
      const data = {
        ...form,
        classId: selectedAssignment.classId,
        teacherId: selectedAssignment.teacherId,
        subjectId: selectedAssignment.subjectId,
        academicYear: selectedAssignment.academicYear,
        startTime: period?.startTime,
        endTime: period?.endTime,
      };
      if (editing) await updateTimetableEntry({ ...data, entryId });
      else await createTimetableEntry(data);
      navigate('/timetable');
    } catch (err) {
      setError(err.message?.startsWith('Choose') ? err.message : errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <Typography>{t('loading')}</Typography>;
  if (!settings) return <Alert severity="warning">{t('configureTimetableFirst')} <Button onClick={() => navigate('/timetable/settings')}>{t('timetableSettings')}</Button></Alert>;
  return (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}><CardContent sx={{ p: { xs: 2, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography variant="h4">{t(editing ? 'editTimetableEntry' : 'createTimetableEntry')}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack component="form" onSubmit={submit} spacing={2}>
          <FormControl required><InputLabel>{t('class')}</InputLabel>
            <Select label={t('class')} value={form.classId} onChange={(event) => {
              setForm({ ...form, classId: event.target.value, assignmentId: '' });
            }}>
              {classes.map((item) => <MenuItem key={item.classId} value={item.classId}>{item.name} · {item.academicYear}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl required disabled={!form.classId}><InputLabel>{t('teacherAssignment')}</InputLabel>
            <Select label={t('teacherAssignment')} value={form.assignmentId} onChange={(event) => setForm({ ...form, assignmentId: event.target.value })}>
              {classAssignments.map((item) => <MenuItem key={item.assignmentId} value={item.assignmentId}>{item.teacherName} · {item.subjectCode} {item.subjectName}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl required><InputLabel>{t('schoolDay')}</InputLabel>
            <Select label={t('schoolDay')} value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>
              {settings.schoolDays.map((day) => <MenuItem key={day} value={day}>{t(day)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl required><InputLabel>{t('period')}</InputLabel>
            <Select label={t('period')} value={form.periodId} onChange={(event) => setForm({ ...form, periodId: event.target.value })}>
              {settings.periods.filter((period) => period.type === 'lesson').map((period) => <MenuItem key={period.id} value={period.id}>{period.label} · {period.startTime}–{period.endTime}</MenuItem>)}
            </Select>
          </FormControl>
          {settings.roomAllocationEnabled && <FormControl required><InputLabel>{t('room')}</InputLabel>
            <Select label={t('room')} value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })}>
              {settings.rooms.map((room) => <MenuItem key={room} value={room}>{room}</MenuItem>)}
            </Select>
          </FormControl>}
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving || !form.assignmentId || !form.periodId}>{saving ? t('saving') : t('save')}</Button>
            <Button onClick={() => navigate('/timetable')}>{t('cancel')}</Button>
          </Stack>
        </Stack>
      </Stack>
    </CardContent></Card>
  );
}

function TimetablePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { classId: routeClassId, teacherId: routeTeacherId } = useParams();
  const canManage = role === 'admin';
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classId, setClassId] = useState(routeClassId || '');
  const [teacherId, setTeacherId] = useState(routeTeacherId || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [result, classList] = await Promise.all([
        listTimetable({ classId: classId || undefined, teacherId: teacherId || undefined }),
        role === 'teacher' ? Promise.resolve([]) : fetchClasses(),
      ]);
    const teacherResult = role === 'teacher' ? null : await listTeachers({ employmentStatus: 'active' });
    return { result, classList, teachers: teacherResult?.teachers || [] };
  }, [classId, teacherId, role]);
  const applyLoadedData = ({ result, classList, teachers: teacherList }) => {
    setSettings(result.settings);
    setEntries(result.entries);
    setClasses(classList);
    setTeachers(teacherList);
  };
  useEffect(() => {
    let current = true;
    load()
      .then((data) => {
        if (current) {
          applyLoadedData(data);
          setError('');
        }
      })
      .catch((err) => {
        if (current) setError(errorMessage(err, t));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [load, t]);
  const bySlot = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => map.set(`${entry.dayOfWeek}|${entry.periodId}`, entry));
    return map;
  }, [entries]);
  const deactivate = async (entryId) => {
    if (!window.confirm(t('confirmDeactivateTimetableEntry'))) return;
    try {
      await deactivateTimetableEntry(entryId);
      applyLoadedData(await load());
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ sm: 'center' }}>
        <Typography variant="h4">{t('timetable')}</Typography>
        <Stack direction="row" spacing={1}>
          {canManage && <Button onClick={() => navigate('/timetable/settings')}>{t('timetableSettings')}</Button>}
          {canManage && <Button variant="contained" onClick={() => navigate('/timetable/new')}>{t('createTimetableEntry')}</Button>}
          <Button onClick={() => window.print()}>{t('printTimetable')}</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {role !== 'teacher' && <FormControl fullWidth><InputLabel>{t('class')}</InputLabel>
          <Select label={t('class')} value={classId} onChange={(event) => setClassId(event.target.value)}>
            <MenuItem value="">{t('allClasses')}</MenuItem>{classes.map((item) => <MenuItem key={item.classId} value={item.classId}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>}
        {role !== 'teacher' && <FormControl fullWidth><InputLabel>{t('teacher')}</InputLabel>
          <Select label={t('teacher')} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <MenuItem value="">{t('allTeachers')}</MenuItem>{teachers.map((item) => <MenuItem key={item.teacherId} value={item.teacherId}>{item.firstName} {item.lastName}</MenuItem>)}
          </Select>
        </FormControl>}
      </Stack>
      {loading ? <Typography>{t('loadingTimetable')}</Typography> : !settings ? <Alert severity="info">{t('configureTimetableFirst')}</Alert> : !entries.length ? <Alert severity="info">{t('noTimetableEntries')}</Alert> : (
        classId || teacherId ? (
          <Box sx={{ overflowX: 'auto', '@media print': { overflow: 'visible' } }}>
            <Table size="small" sx={{ minWidth: 680 }}>
              <TableHead><TableRow>
                <TableCell>{t('period')}</TableCell>
                {settings.schoolDays.map((day) => <TableCell key={day}>{t(day)}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>{settings.periods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell>{period.label}<br />{period.startTime}–{period.endTime}</TableCell>
                  {settings.schoolDays.map((day) => {
                    const entry = period.type === 'lesson' ? bySlot.get(`${day}|${period.id}`) : null;
                    return <TableCell key={day}>
                      {period.type === 'break' ? t('break') : entry ? (
                        <Stack spacing={0.5}>
                          <strong>{entry.subjectCode} · {entry.subjectName}</strong>
                          <span>{entry.className} · {entry.teacherName}</span>
                          {entry.room && <span>{t('room')}: {entry.room}</span>}
                          {canManage && <Stack direction="row">
                            <Button size="small" onClick={() => navigate(`/timetable/${entry.entryId}/edit`)}>{t('edit')}</Button>
                            <Button size="small" color="error" onClick={() => deactivate(entry.entryId)}>{t('deactivate')}</Button>
                          </Stack>}
                        </Stack>
                      ) : '—'}
                    </TableCell>;
                  })}
                </TableRow>
              ))}</TableBody>
            </Table>
          </Box>
        ) : (
          <Stack spacing={1}>
            {settings.schoolDays.map((day) => (
              <Card key={day}><CardContent>
                <Typography variant="h6" mb={1}>{t(day)}</Typography>
                <Stack spacing={1}>
                  {entries.filter((entry) => entry.dayOfWeek === day).map((entry) => (
                    <Stack key={entry.entryId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                      <Typography>{entry.startTime}–{entry.endTime} · {entry.className} · {entry.subjectCode} {entry.subjectName} · {entry.teacherName}{entry.room ? ` · ${t('room')}: ${entry.room}` : ''}</Typography>
                      {canManage && <Stack direction="row">
                        <Button size="small" onClick={() => navigate(`/timetable/${entry.entryId}/edit`)}>{t('edit')}</Button>
                        <Button size="small" color="error" onClick={() => deactivate(entry.entryId)}>{t('deactivate')}</Button>
                      </Stack>}
                    </Stack>
                  ))}
                </Stack>
              </CardContent></Card>
            ))}
          </Stack>
        )
      )}
    </Stack>
  );
}

export {
  MyTeacherProfilePage,
  SubjectDetailsPage,
  SubjectFormPage,
  SubjectsPage,
  TeacherAssignmentsPage,
  TeacherDetailsPage,
  TeacherFormPage,
  TeachersPage,
  TimetableEntryFormPage,
  TimetablePage,
  TimetableSettingsPage,
};
