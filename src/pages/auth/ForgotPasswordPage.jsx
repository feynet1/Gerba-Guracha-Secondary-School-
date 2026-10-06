import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await resetPassword(email.trim());
      setSuccessMessage(t('resetPasswordSuccess'));
    } catch (error) {
      setErrorMessage(t('resetPasswordError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        background: 'linear-gradient(135deg, #edf3ff 0%, #fbfbfb 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 480, borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" component="h1" color="primary.main" fontWeight={700}>
                {t('forgotPassword')}
              </Typography>
            </Box>

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Stack spacing={2}>
                {successMessage && <Alert severity="success">{successMessage}</Alert>}
                {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

                <TextField
                  label={t('email')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  fullWidth
                  required
                  type="email"
                />

                <Button type="submit" variant="contained" disabled={loading}>
                  {loading ? t('loading') : t('resetPassword')}
                </Button>

                <Button component={Link} to="/login" variant="text">
                  {t('backToLogin')}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default ForgotPasswordPage;
