import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0f4c81',
      light: '#e3eef9',
      dark: '#0b3559',
    },
    secondary: {
      main: '#f5b942',
    },
    background: {
      default: '#f4f7fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#122231',
      secondary: '#4d6475',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.04em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
    },
    h3: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  spacing: 8,
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 8px 24px rgba(15, 76, 129, 0.12)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(18, 34, 49, 0.08)',
        },
      },
    },
  },
});

export default theme;
