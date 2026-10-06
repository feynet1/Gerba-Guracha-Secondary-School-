import { Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import { getDashboardPathForRole } from '../../utils/auth';

function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, role } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const redirectTo = location.state?.from || '/dashboard';

  useEffect(() => {
    if (user) {
      navigate(getDashboardPathForRole(role), { replace: true });
    }
  }, [navigate, role, user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      await login(form.email, form.password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const code = error?.code || '';
      if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
        setErrorMessage(t('invalidCredentials'));
      } else if (code.includes('user-disabled')) {
        setErrorMessage(t('accountDisabled'));
      } else {
        setErrorMessage(t('loginFailed'));
      }
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
        background: 'linear-gradient(135deg, #edf5ff 0%, #f8f8f8 100%)',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 440, borderRadius: 4, boxShadow: 3 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={3}>
            <Box textAlign="center">
              <Typography variant="h4" component="h1" fontWeight={700} color="primary.main">
                {t('appName')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('schoolAccess')}
              </Typography>
            </Box>

            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="body2" fontWeight={600}>{t('language')}</Typography>
              <Select
                value={i18n.language || 'en'}
                onChange={(event) => i18n.changeLanguage(event.target.value)}
                size="small"
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="en">{t('english')}</MenuItem>
                <MenuItem value="om">{t('afaanOromo')}</MenuItem>
              </Select>
            </Stack>

            <Divider />

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Stack spacing={2}>
                {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

                <TextField
                  label={t('email')}
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  fullWidth
                />

                <FormControl variant="outlined" fullWidth>
                  <InputLabel htmlFor="login-password">{t('password')}</InputLabel>
                  <OutlinedInput
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleChange}
                    required
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                          onClick={() => setShowPassword((current) => !current)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    }
                    label={t('password')}
                  />
                </FormControl>

                <Button type="submit" variant="contained" size="large" disabled={loading}>
                  {loading ? t('loading') : t('signIn')}
                </Button>

                <Box textAlign="center">
                  <Link component={RouterLink} to="/forgot-password" variant="body2">
                    {t('forgotPassword')}
                  </Link>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LoginPage;
