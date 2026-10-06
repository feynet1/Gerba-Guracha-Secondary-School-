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
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createUserAccount } from '../../services/firebase/auth';
import { ROLE_OPTIONS } from '../../utils/auth';

function UserManagementPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ email: '', password: 'TempPass123!', displayName: '', role: 'teacher' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await createUserAccount(form);
      setMessage(`${t('userCreated')}: ${result.email ?? form.email}`);
      setForm((current) => ({ ...current, email: '', password: 'TempPass123!', displayName: '' }));
    } catch (err) {
      const fallback = err?.message || t('requestFailed');
      setError(fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 700, mx: 'auto', borderRadius: 4 }}>
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Typography variant="h4">{t('userManagement')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('adminOnlyMessage')}</Typography>

          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <TextField label={t('displayName')} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} fullWidth />
              <TextField label={t('email')} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} fullWidth required />
              <TextField label={t('temporaryPassword')} type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} fullWidth required />

              <FormControl fullWidth>
                <InputLabel>{t('role')}</InputLabel>
                <Select value={form.role} label={t('role')} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  {ROLE_OPTIONS.map((role) => (
                    <MenuItem key={role} value={role}>{t(role)}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? t('loading') : t('createUser')}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default UserManagementPage;
