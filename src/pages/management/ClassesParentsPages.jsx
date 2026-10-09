import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/useAuth';
import {
  createClass,
  createParent,
  fetchClass,
  fetchClasses,
  fetchParent,
  fetchParentRecords,
  fetchStudents,
  updateClass,
  updateParent,
} from '../../services/phase2';

function ClassesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = ['admin', 'registrar'].includes(role);
  const { classId } = useParams();
  const editing = Boolean(classId);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState({ grade: 9, section: 'A', stream: '', academicYear: '', capacity: 50, active: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => fetchClasses().then((items) => {
    setClasses(items);
    const selected = items.find((item) => item.classId === classId);
    if (selected) setForm({ ...selected, stream: selected.stream || '' });
  }).catch((err) => setError(err.message || t('requestFailed'))).finally(() => setLoading(false)), [classId, t]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await updateClass({ ...form, classId });
      else await createClass(form);
      setForm({ grade: 9, section: 'A', stream: '', academicYear: '', capacity: 50, active: true });
      await load();
    } catch (err) {
      setError(err.message || t('requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('classes')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {canManage && <Card><CardContent>
        <Typography variant="h6" mb={2}>{t(editing ? 'editClass' : 'createClass')}</Typography>
        <Stack component="form" onSubmit={submit} spacing={2}>
          <FormControl>
            <InputLabel>{t('grade')}</InputLabel>
            <Select label={t('grade')} value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value, stream: Number(event.target.value) < 11 ? '' : form.stream })}>
              {[9, 10, 11, 12].map((grade) => <MenuItem key={grade} value={grade}>{t('gradeNumber', { number: grade })}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField required label={t('section')} value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} />
          {[11, 12].includes(Number(form.grade)) && (
            <FormControl required>
              <InputLabel>{t('stream')}</InputLabel>
              <Select label={t('stream')} value={form.stream} onChange={(event) => setForm({ ...form, stream: event.target.value })}>
                <MenuItem value="natural">{t('naturalScience')}</MenuItem>
                <MenuItem value="social">{t('socialScience')}</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField required label={t('academicYear')} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} />
          <TextField required type="number" label={t('capacity')} inputProps={{ min: 1, max: 500 }} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
          {editing && <FormControl>
            <InputLabel>{t('status')}</InputLabel>
            <Select label={t('status')} value={form.active ? 'active' : 'inactive'} onChange={(event) => setForm({ ...form, active: event.target.value === 'active' })}>
              <MenuItem value="active">{t('active')}</MenuItem>
              <MenuItem value="inactive">{t('inactive')}</MenuItem>
            </Select>
          </FormControl>}
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            {editing && <Button onClick={() => navigate('/classes')}>{t('cancel')}</Button>}
          </Stack>
        </Stack>
      </CardContent></Card>}
      {loading ? <Typography>{t('loadingClasses')}</Typography> : classes.length === 0 ? <Alert severity="info">{t('noClasses')}</Alert> : (
        <Stack spacing={1}>
          {classes.map((item) => (
            <Card key={item.classId}><CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
                <Stack spacing={0.5}>
                  <Typography variant="h6" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/classes/${item.classId}`)}>
                    {t('gradeNumber', { number: item.grade })} - {item.section}
                    {item.stream ? ` - ${t(item.stream === 'natural' ? 'naturalScience' : 'socialScience')}` : ''}
                  </Typography>
                  <Typography color="text.secondary">{item.academicYear} · {t('capacity')}: {item.studentCount || 0}/{item.capacity}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" color={item.active ? 'success' : 'default'} label={t(item.active ? 'active' : 'inactive')} />
                  {canManage && <Button onClick={() => navigate(`/classes/${item.classId}/edit`)}>{t('edit')}</Button>}
                </Stack>
              </Stack>
            </CardContent></Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

const emptyParent = { firstName: '', middleName: '', lastName: '', relationship: 'guardian', phone: '', alternatePhone: '', email: '', address: '', status: 'active' };

function ParentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = ['admin', 'registrar'].includes(role);
  const { parentId } = useParams();
  const editing = Boolean(parentId);
  const [parents, setParents] = useState([]);
  const [form, setForm] = useState(emptyParent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);

  const load = useCallback((next = null) => fetchParentRecords(25, next).then((result) => {
    setParents(result.parents);
    setNextCursor(result.nextCursor);
    setCursor(next);
  }).catch((err) => setError(err.message || t('requestFailed'))).finally(() => setLoading(false)), [t]);

  useEffect(() => {
    load(null);
    if (editing) {
      fetchParent(parentId)
        .then((record) => setForm({ ...emptyParent, ...record }))
        .catch((err) => setError(err.message || t('requestFailed')));
    }
  }, [load, editing, parentId, t]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateParent({ ...form, parentId });
        navigate(`/parents/${parentId}`);
        return;
      }
      await createParent(form);
      setForm(emptyParent);
      setCursorHistory([]);
      await load(null);
    } catch (err) {
      setError(err.message || t('requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('parents')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {canManage && <Card><CardContent>
        <Typography variant="h6" mb={2}>{t(editing ? 'editParent' : 'createParent')}</Typography>
        <Stack component="form" onSubmit={submit} spacing={2}>
          <TextField required label={t('firstName')} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <TextField label={t('middleName')} value={form.middleName} onChange={(event) => setForm({ ...form, middleName: event.target.value })} />
          <TextField required label={t('lastName')} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <FormControl><InputLabel>{t('relationship')}</InputLabel>
            <Select label={t('relationship')} value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })}>
              {['father', 'mother', 'guardian', 'other'].map((value) => <MenuItem key={value} value={value}>{t(value)}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField required label={t('phone')} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <TextField label={t('alternatePhone')} value={form.alternatePhone} onChange={(event) => setForm({ ...form, alternatePhone: event.target.value })} />
          <TextField type="email" label={t('email')} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <TextField label={t('address')} multiline minRows={2} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          {editing && <FormControl><InputLabel>{t('status')}</InputLabel>
            <Select label={t('status')} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <MenuItem value="active">{t('active')}</MenuItem><MenuItem value="inactive">{t('inactive')}</MenuItem>
            </Select>
          </FormControl>}
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            {editing && <Button onClick={() => navigate('/parents')}>{t('cancel')}</Button>}
          </Stack>
        </Stack>
      </CardContent></Card>}
      {loading ? <Typography>{t('loadingParents')}</Typography> : parents.length === 0 ? <Alert severity="info">{t('noParents')}</Alert> : (
        <Stack spacing={1}>
          {parents.map((parent) => (
            <Card key={parent.parentId}><CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                <Stack>
                  <Typography variant="h6" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/parents/${parent.parentId}`)}>{parent.firstName} {parent.middleName} {parent.lastName}</Typography>
                  <Typography color="text.secondary">{t(parent.relationship)} · {parent.phone} · {parent.studentIds?.length || 0} {t('studentsLinked')}</Typography>
                </Stack>
                {canManage && <Button onClick={() => navigate(`/parents/${parent.parentId}/edit`)}>{t('edit')}</Button>}
              </Stack>
            </CardContent></Card>
          ))}
          <Stack direction="row" justifyContent="space-between">
            <Button disabled={!cursorHistory.length} onClick={() => {
              const history = [...cursorHistory];
              const previous = history.pop() || null;
              setCursorHistory(history);
              load(previous);
            }}>{t('previous')}</Button>
            <Button disabled={!nextCursor} onClick={() => {
              setCursorHistory((history) => [...history, cursor]);
              load(nextCursor);
            }}>{t('next')}</Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

function ClassDetailsPage() {
  const { t } = useTranslation();
  const { classId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [classRecord, setClassRecord] = useState(null);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([fetchClass(classId), fetchStudents({ classId, pageSize: 100 })])
      .then(([record, result]) => {
        setClassRecord(record);
        setStudents(result.students);
      })
      .catch((err) => setError(err.message || t('requestFailed')));
  }, [classId, t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!classRecord) return <Typography>{t('loading')}</Typography>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">
        {t('gradeNumber', { number: classRecord.grade })} - {classRecord.section}
        {classRecord.stream ? ` - ${t(classRecord.stream === 'natural' ? 'naturalScience' : 'socialScience')}` : ''}
      </Typography>
      <Typography>{t('section')}: {classRecord.section}</Typography>
      {classRecord.stream && <Typography>{t('stream')}: {t(classRecord.stream === 'natural' ? 'naturalScience' : 'socialScience')}</Typography>}
      <Typography>{t('academicYear')}: {classRecord.academicYear}</Typography>
      <Typography>{t('capacity')}: {classRecord.studentCount || 0}/{classRecord.capacity}</Typography>
      <Typography>{t('status')}: {t(classRecord.active ? 'active' : 'inactive')}</Typography>
      {['admin', 'registrar'].includes(role) && <Button onClick={() => navigate(`/classes/${classId}/edit`)}>{t('edit')}</Button>}
      <Typography variant="h5">{t('students')}</Typography>
      {!students.length ? <Alert severity="info">{t('noStudents')}</Alert> : students.map((student) => (
        <Card key={student.studentId}><CardContent>
          <Typography>{student.admissionNumber} · {student.firstName} {student.lastName}</Typography>
        </CardContent></Card>
      ))}
    </Stack>
  );
}

function ParentDetailsPage() {
  const { t } = useTranslation();
  const { parentId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [parent, setParent] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchParent(parentId).then(setParent).catch((err) => setError(err.message || t('requestFailed')));
  }, [parentId, t]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!parent) return <Typography>{t('loading')}</Typography>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{parent.firstName} {parent.middleName} {parent.lastName}</Typography>
      <Typography>{t('relationship')}: {t(parent.relationship)}</Typography>
      <Typography>{t('phone')}: {parent.phone}</Typography>
      <Typography>{t('alternatePhone')}: {parent.alternatePhone || '—'}</Typography>
      <Typography>{t('email')}: {parent.email || '—'}</Typography>
      <Typography>{t('address')}: {parent.address || '—'}</Typography>
      {['admin', 'registrar'].includes(role) && <Button onClick={() => navigate(`/parents/${parentId}/edit`)}>{t('edit')}</Button>}
      <Typography variant="h5">{t('linkedStudents')}</Typography>
      {parent.students?.length ? parent.students.map((student) => (
        <Card key={student.studentId}><CardContent>
          <Typography>{student.admissionNumber} · {student.firstName} {student.lastName}</Typography>
        </CardContent></Card>
      )) : <Alert severity="info">{t('noLinkedStudents')}</Alert>}
    </Stack>
  );
}

export { ParentsPage, ClassDetailsPage, ParentDetailsPage };
export default ClassesPage;
