import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { I18nextProvider } from 'react-i18next';

import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import theme from './theme/theme';
import i18n from './i18n';

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nextProvider>
  );
}

export default App;
