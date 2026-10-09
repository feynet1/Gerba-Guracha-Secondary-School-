import { Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/useAuth';

function DashboardPage() {
  const { t } = useTranslation();
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, md: 4 },
        borderRadius: 4,
        background: 'linear-gradient(135deg, rgba(15,76,129,0.04), rgba(245,185,66,0.08))',
      }}
    >
      <Stack spacing={2}>
        <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700 }}>
          {t('dashboard')}
        </Typography>
        <Typography variant="h3" component="h1" color="text.primary">
          {t('appName')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {user?.displayName || user?.email || t('welcomeTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('welcomeMessage')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('currentRole')}: {role || t('guest')}
        </Typography>
        <Button variant="outlined" color="error" onClick={handleLogout} sx={{ alignSelf: 'flex-start' }}>
          {t('signOut')}
        </Button>
      </Stack>
    </Paper>
  );
}

export default DashboardPage;
