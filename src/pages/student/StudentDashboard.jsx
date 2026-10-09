import { Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/useAuth';

function StudentDashboard() {
  const { user, logout, role } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Paper elevation={0} sx={{ p: 4, borderRadius: 4 }}>
      <Stack spacing={2}>
        <Typography variant="overline" color="primary.main" fontWeight={700}>Student</Typography>
        <Typography variant="h4">{t('studentDashboard')}</Typography>
        <Typography variant="body1">{user?.displayName || user?.email}</Typography>
        <Typography variant="body2" color="text.secondary">{t('currentRole')}: {role}</Typography>
        <Button variant="outlined" color="error" onClick={handleLogout}>{t('signOut')}</Button>
      </Stack>
    </Paper>
  );
}

export default StudentDashboard;
