import { Box, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        backgroundColor: 'background.default',
      }}
    >
      <CircularProgress />
      <Typography variant="body1" color="text.secondary">
        {t('loading')}
      </Typography>
    </Box>
  );
}

export default LoadingScreen;
