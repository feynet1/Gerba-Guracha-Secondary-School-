import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  listUserProfiles,
  provisionUserProfile,
  updateUserProfileActive,
  updateUserProfileRole,
} from '../../services/adminUsers';
import { ROLE_OPTIONS } from '../../utils/auth';
import { useAuth } from '../../context/useAuth';

const blankForm = { uid: '', email: '', displayName: '', role: 'teacher' };

function UserManagementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form, setForm] = useState(blankForm);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await listUserProfiles());
    } catch (loadError) {
      setError(loadError.message || t('requestFailed'));
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    listUserProfiles().then(
      (profiles) => {
        if (active) setUsers(profiles);
      },
      (loadError) => {
        if (active) setError(loadError.message || t('requestFailed'));
      },
    );
    return () => {
      active = false;
    };
  }, [t]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await provisionUserProfile(form);
      setMessage(t('userProfileCreated'));
      setForm(blankForm);
      await loadUsers();
    } catch (submitError) {
      setError(submitError.message || t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (target, role) => {
    setError('');
    try {
      await updateUserProfileRole(target.uid, role);
      setMessage(t('roleUpdated'));
      await loadUsers();
    } catch (updateError) {
      setError(updateError.message || t('requestFailed'));
    }
  };

  const changeActive = async (target, active) => {
    setError('');
    try {
      await updateUserProfileActive(target.uid, active);
      setMessage(t(active ? 'accountEnabled' : 'accountDisabled'));
      await loadUsers();
    } catch (updateError) {
      setError(updateError.message || t('requestFailed'));
    }
  };

  return (
    <Stack spacing={3}>
      <Card sx={{ maxWidth: 760, mx: 'auto', width: '100%', borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={3}>
            <Typography variant="h4">{t('userManagement')}</Typography>
            <Alert severity="info">{t('manualAuthOnboarding')}</Alert>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Box component="form" onSubmit={submit} noValidate>
              <Stack spacing={2}>
                <TextField
                  label={t('firebaseAuthUid')}
                  value={form.uid}
                  onChange={(event) => setForm({ ...form, uid: event.target.value })}
                  required
                  fullWidth
                />
                <TextField
                  label={t('email')}
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                  fullWidth
                />
                <TextField
                  label={t('displayName')}
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  required
                  fullWidth
                />
                <FormControl fullWidth>
                  <InputLabel>{t('role')}</InputLabel>
                  <Select
                    value={form.role}
                    label={t('role')}
                    onChange={(event) => setForm({ ...form, role: event.target.value })}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <MenuItem key={role} value={role}>{t(role)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button type="submit" variant="contained" disabled={loading}>
                  {loading ? t('loading') : t('provisionProfile')}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">{t('userProfiles')}</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('email')}</TableCell>
                  <TableCell>{t('role')}</TableCell>
                  <TableCell>{t('status')}</TableCell>
                  <TableCell>{t('actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((target) => (
                  <TableRow key={target.uid}>
                    <TableCell>
                      <Typography variant="body2">{target.displayName || target.email}</Typography>
                      <Typography variant="caption" color="text.secondary">{target.email}</Typography>
                    </TableCell>
                    <TableCell>
                      {target.uid === user?.uid ? t(target.role) : (
                        <Select
                          value={target.role}
                          size="small"
                          onChange={(event) => changeRole(target, event.target.value)}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <MenuItem key={role} value={role}>{t(role)}</MenuItem>
                          ))}
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>{t(target.active ? 'active' : 'inactive')}</TableCell>
                    <TableCell>
                      {target.uid !== user?.uid && (
                        <Button
                          size="small"
                          onClick={() => changeActive(target, !target.active)}
                        >
                          {t(target.active ? 'deactivate' : 'activate')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>{t('noUserProfiles')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default UserManagementPage;
