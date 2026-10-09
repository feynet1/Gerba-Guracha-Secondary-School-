import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
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
import {
  assignStudentToClass,
  createStudent,
  fetchClasses,
  fetchMyLinkedStudents,
  fetchMyStudentProfile,
  fetchParents,
  fetchStudent,
  fetchStudents,
  linkParentToStudent,
  updateStudent,
} from '../../services/phase2';

const emptyStudent = {
  admissionNumber: '',
  firstName: '',
  middleName: '',
  lastName: '',
  gender: 'male',
  dateOfBirth: '',
  classId: '',
  parentIds: [],
  phone: '',
  address: '',
  enrollmentYear: new Date().getFullYear(),
  status: 'active',
};

function StudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = ['admin', 'registrar'].includes(role);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [gender, setGender] = useState('');
  const [section, setSection] = useState('');
  const [stream, setStream] = useState('');
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const updateFilter = (setter, value) => {
    setter(value);
    setCursorHistory([]);
  };

  const load = useCallback(async (next = null) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchStudents({ pageSize: 25, grade, status, gender, section, stream, search, cursor: next });
      setStudents(result.students);
      setNextCursor(result.nextCursor);
      setCursor(next);
    } catch (err) {
      setError(err.message || t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }, [grade, status, gender, section, stream, search, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(null), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Typography variant="h4">{t('students')}</Typography>
        {canManage && <Button variant="contained" onClick={() => navigate('/students/new')}>{t('registerStudent')}</Button>}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label={t('search')} value={search} onChange={(event) => updateFilter(setSearch, event.target.value)} fullWidth />
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>{t('grade')}</InputLabel>
              <Select value={grade} label={t('grade')} onChange={(event) => updateFilter(setGrade, event.target.value)}>
                <MenuItem value="">{t('allGrades')}</MenuItem>
                {[9, 10, 11, 12].map((value) => <MenuItem key={value} value={value}>{t('gradeNumber', { number: value })}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>{t('gender')}</InputLabel>
              <Select value={gender} label={t('gender')} onChange={(event) => updateFilter(setGender, event.target.value)}>
                <MenuItem value="">{t('allGenders')}</MenuItem>
                <MenuItem value="male">{t('male')}</MenuItem>
                <MenuItem value="female">{t('female')}</MenuItem>
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>{t('stream')}</InputLabel>
              <Select value={stream} label={t('stream')} onChange={(event) => updateFilter(setStream, event.target.value)}>
                <MenuItem value="">{t('allStreams')}</MenuItem>
                <MenuItem value="natural">{t('naturalScience')}</MenuItem>
                <MenuItem value="social">{t('socialScience')}</MenuItem>
              </Select>
            </FormControl>
            <TextField label={t('section')} value={section} onChange={(event) => updateFilter(setSection, event.target.value)} />
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>{t('status')}</InputLabel>
              <Select value={status} label={t('status')} onChange={(event) => updateFilter(setStatus, event.target.value)}>
                <MenuItem value="">{t('allStatuses')}</MenuItem>
                <MenuItem value="active">{t('active')}</MenuItem>
                <MenuItem value="inactive">{t('inactive')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>
      {loading ? <Typography>{t('loadingStudents')}</Typography> : students.length === 0 ? (
        <Alert severity="info">{t('noStudents')}</Alert>
      ) : (
        <Card>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('admissionNumber')}</TableCell>
                <TableCell>{t('name')}</TableCell>
                <TableCell>{t('gender')}</TableCell>
                <TableCell>{t('grade')}</TableCell>
                <TableCell>{t('section')}</TableCell>
                <TableCell>{t('stream')}</TableCell>
                <TableCell>{t('status')}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.studentId} hover onClick={() => navigate(`/students/${student.studentId}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell>{student.admissionNumber}</TableCell>
                    <TableCell>{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}</TableCell>
                    <TableCell>{t(student.gender)}</TableCell>
                    <TableCell>{student.grade}</TableCell>
                    <TableCell>{student.section || student.sectionId}</TableCell>
                    <TableCell>{student.stream ? t(student.stream === 'natural' ? 'naturalScience' : 'socialScience') : '—'}</TableCell>
                    <TableCell><Chip size="small" label={t(student.status)} color={student.status === 'active' ? 'success' : 'default'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" justifyContent="space-between" p={2}>
            <Button disabled={!cursorHistory.length || loading} onClick={() => {
              const history = [...cursorHistory];
              const previous = history.pop() || null;
              setCursorHistory(history);
              load(previous);
            }}>{t('previous')}</Button>
            <Button disabled={!nextCursor || loading} onClick={() => {
              setCursorHistory((history) => [...history, cursor]);
              load(nextCursor);
            }}>{t('next')}</Button>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function StudentFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { studentId } = useParams();
  const editing = Boolean(studentId);
  const [form, setForm] = useState(emptyStudent);
  const [classes, setClasses] = useState([]);
  const [parents, setParents] = useState([]);
  const [originalStudent, setOriginalStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchClasses(), fetchParents(), ...(editing ? [fetchStudent(studentId)] : [])])
      .then(([allClasses, allParents, student]) => {
        setClasses(allClasses.filter((item) => item.active || item.classId === student?.classId));
        setParents(allParents);
        if (student) {
          setOriginalStudent(student);
          const birthDate = student.dateOfBirth?.toDate ? student.dateOfBirth.toDate() : student.dateOfBirth ? new Date(student.dateOfBirth) : null;
          setForm({ ...emptyStudent, ...student, dateOfBirth: birthDate ? birthDate.toISOString().slice(0, 10) : '' });
        }
      })
      .catch((err) => setError(err.message || t('requestFailed')))
      .finally(() => setLoading(false));
  }, [studentId, editing, t]);

  const chosenClass = classes.find((item) => item.classId === form.classId);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { ...form, grade: chosenClass?.grade, stream: chosenClass?.stream };
      if (editing) {
        await updateStudent({ ...data, studentId });
        const priorParents = new Set(originalStudent.parentIds || []);
        const selectedParents = new Set(form.parentIds || []);
        const relationshipChanges = [
          ...[...selectedParents].filter((id) => !priorParents.has(id)).map((parentId) => ({ parentId, studentId, linked: true })),
          ...[...priorParents].filter((id) => !selectedParents.has(id)).map((parentId) => ({ parentId, studentId, linked: false })),
        ];
        await Promise.all(relationshipChanges.map(linkParentToStudent));
        if (form.classId !== originalStudent.classId) {
          const selected = classes.find((item) => item.classId === form.classId);
          if (!selected) throw new Error(t('classNotFound'));
          await assignStudentToClass({ studentId, classId: selected.classId });
        }
      } else {
        const result = await createStudent(data);
        navigate(`/students/${result.studentId}`, { replace: true });
        return;
      }
      navigate(`/students/${studentId}`);
    } catch (err) {
      setError(err.message || t('requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>{t('loading')}</Typography>;
  return (
    <Card sx={{ maxWidth: 900, mx: 'auto' }}>
      <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
        <Stack spacing={3}>
          <Typography variant="h4">{t(editing ? 'editStudent' : 'registerStudent')}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {!editing && <TextField required label={t('admissionNumber')} value={form.admissionNumber} onChange={(event) => setForm({ ...form, admissionNumber: event.target.value })} />}
              <TextField required label={t('firstName')} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
              <TextField label={t('middleName')} value={form.middleName} onChange={(event) => setForm({ ...form, middleName: event.target.value })} />
              <TextField required label={t('lastName')} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
              <FormControl>
                <InputLabel>{t('gender')}</InputLabel>
                <Select value={form.gender} label={t('gender')} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
                  <MenuItem value="male">{t('male')}</MenuItem>
                  <MenuItem value="female">{t('female')}</MenuItem>
                </Select>
              </FormControl>
              <TextField type="date" label={t('dateOfBirth')} InputLabelProps={{ shrink: true }} value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} />
              <FormControl required>
                <InputLabel>{t('class')}</InputLabel>
                <Select value={form.classId || ''} label={t('class')} onChange={(event) => setForm({ ...form, classId: event.target.value })}>
                  {classes.map((item) => (
                    <MenuItem key={item.classId} value={item.classId}>
                      {t('gradeNumber', { number: item.grade })} - {item.section}
                      {item.stream ? ` - ${t(item.stream === 'natural' ? 'naturalScience' : 'socialScience')}` : ''}
                      {' '}({item.academicYear})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel>{t('parents')}</InputLabel>
                <Select multiple value={form.parentIds || []} label={t('parents')} onChange={(event) => setForm({ ...form, parentIds: event.target.value })}>
                  {parents.map((parent) => <MenuItem key={parent.parentId} value={parent.parentId}>{parent.firstName} {parent.lastName} - {t(parent.relationship)}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label={t('phone')} value={form.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <TextField label={t('address')} multiline minRows={2} value={form.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              {editing && (
                <FormControl>
                  <InputLabel>{t('status')}</InputLabel>
                  <Select value={form.status} label={t('status')} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    <MenuItem value="active">{t('active')}</MenuItem>
                    <MenuItem value="inactive">{t('inactive')}</MenuItem>
                  </Select>
                </FormControl>
              )}
              <Stack direction="row" spacing={2}>
                <Button type="submit" variant="contained" disabled={saving || !form.classId}>{saving ? t('savingStudent') : t('save')}</Button>
                <Button onClick={() => navigate(-1)}>{t('cancel')}</Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function StudentProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { studentId } = useParams();
  const { role } = useAuth();
  const canManage = ['admin', 'registrar'].includes(role);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStudent(studentId)
      .then(setStudent)
      .catch((err) => setError(err.message || t('requestFailed')))
      .finally(() => setLoading(false));
  }, [studentId, t]);

  if (loading) return <Typography>{t('loading')}</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!student) return <Alert severity="info">{t('noStudents')}</Alert>;
  const date = student.dateOfBirth?.toDate ? student.dateOfBirth.toDate() : student.dateOfBirth ? new Date(student.dateOfBirth) : null;
  return (
    <Card sx={{ maxWidth: 900, mx: 'auto' }}>
      <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
        <Stack spacing={2}>
          <Typography variant="h4">{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}</Typography>
          <Typography>{t('admissionNumber')}: {student.admissionNumber}</Typography>
          <Typography>{t('gender')}: {t(student.gender)}</Typography>
          <Typography>{t('dateOfBirth')}: {date?.toLocaleDateString() || '—'}</Typography>
          <Typography>{t('grade')}: {student.grade}</Typography>
          <Typography>{t('section')}: {student.section || student.sectionId || '—'}</Typography>
          <Typography>{t('stream')}: {student.stream ? t(student.stream === 'natural' ? 'naturalScience' : 'socialScience') : '—'}</Typography>
          <Typography variant="h6">{t('parents')}</Typography>
          {student.parents?.length ? student.parents.map((parent) => (
            <Typography key={parent.parentId}>
              {parent.firstName} {parent.lastName} · {t(parent.relationship)} · {parent.phone}
            </Typography>
          )) : <Typography color="text.secondary">{t('noParents')}</Typography>}
          <Typography>{t('status')}: {t(student.status)}</Typography>
          <Typography>{t('phone')}: {student.phone || '—'}</Typography>
          <Typography>{t('address')}: {student.address || '—'}</Typography>
          {canManage && <Button variant="contained" onClick={() => navigate(`/students/${studentId}/edit`)}>{t('edit')}</Button>}
          <Button onClick={() => navigate('/students')}>{t('backToStudents')}</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MyStudentProfilePage() {
  const { t } = useTranslation();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMyStudentProfile().then(setStudent).catch((err) => setError(err.message || t('requestFailed')));
  }, [t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!student) return <Typography>{t('loading')}</Typography>;
  return (
    <Card sx={{ maxWidth: 900, mx: 'auto' }}><CardContent>
      <Stack spacing={2}>
        <Typography variant="h4">{t('studentProfile')}</Typography>
        <Typography>{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}</Typography>
        <Typography>{t('admissionNumber')}: {student.admissionNumber}</Typography>
        <Typography>{t('grade')}: {student.grade} · {t('section')}: {student.section}</Typography>
        <Typography>{t('status')}: {t(student.status)}</Typography>
      </Stack>
    </CardContent></Card>
  );
}

function ParentChildrenPage() {
  const { t } = useTranslation();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMyLinkedStudents().then((result) => setStudents(result.students)).catch((err) => setError(err.message || t('requestFailed')));
  }, [t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (students === null) return <Typography>{t('loadingStudents')}</Typography>;
  if (!students.length) return <Alert severity="info">{t('noLinkedStudents')}</Alert>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('linkedStudents')}</Typography>
      {students.map((student) => (
        <Card key={student.studentId}><CardContent>
          <Stack spacing={1}>
            <Typography variant="h6">{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}</Typography>
            <Typography>{t('admissionNumber')}: {student.admissionNumber}</Typography>
            <Typography>{t('grade')}: {student.grade} · {t('section')}: {student.section}</Typography>
          </Stack>
        </CardContent></Card>
      ))}
    </Stack>
  );
}

export { StudentFormPage, StudentProfilePage, MyStudentProfilePage, ParentChildrenPage };
export default StudentsPage;
