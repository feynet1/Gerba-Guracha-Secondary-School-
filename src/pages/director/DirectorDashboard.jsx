import { Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';

function DirectorDashboard() {
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
        <Typography variant="overline" color="primary.main" fontWeight={700}>Director</Typography>
        <Typography variant="h4">{t('directorDashboard')}</Typography>
        <Typography variant="body1">{user?.displayName || user?.email}</Typography>
        <Typography variant="body2" color="text.secondary">{t('currentRole')}: {role}</Typography>
        <Button variant="outlined" color="error" onClick={handleLogout}>{t('signOut')}</Button>
      </Stack>
    </Paper>
  );
}

export default DirectorDashboard;
