import { Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function UnauthorizedPage() {
  const { t } = useTranslation();

  return (
    <Paper elevation={2} sx={{ maxWidth: 520, mx: 'auto', mt: 10, p: 4, borderRadius: 4 }}>
      <Stack spacing={3} alignItems="center" textAlign="center">
        <Typography variant="h4" color="error.main">
          403
        </Typography>
        <Typography variant="h5">{t('accessDenied')}</Typography>
        <Typography variant="body1" color="text.secondary">
          {t('unauthorizedMessage')}
        </Typography>
        <Button component={Link} to="/dashboard" variant="contained">
          {t('goToDashboard')}
        </Button>
      </Stack>
    </Paper>
  );
}

export default UnauthorizedPage;
