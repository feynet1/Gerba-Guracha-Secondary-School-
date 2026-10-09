import { useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/useAuth';

const drawerWidth = 240;

function MainLayout() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { role, user, logout } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigationItems = useMemo(() => {
    const items = [{ label: 'dashboard', path: '/dashboard' }];

    if (role === 'admin') {
      items.push({ label: 'userManagement', path: '/admin/users' });
    }

    if (['admin', 'registrar', 'director'].includes(role)) {
      items.push(
        { label: 'students', path: '/students' },
        { label: 'classes', path: '/classes' },
        { label: 'parents', path: '/parents' },
      );
    }

    if (['admin', 'director'].includes(role)) {
      items.push({ label: 'teachers', path: '/teachers' });
    }

    if (['admin', 'director', 'teacher'].includes(role)) {
      items.push(
        { label: 'subjects', path: '/subjects' },
        { label: 'teacherAssignments', path: '/teacher-assignments' },
        { label: 'timetable', path: '/timetable' },
      );
    }

    if (role === 'admin') items.push({ label: 'timetableSettings', path: '/timetable/settings' });
    if (role === 'teacher') items.push({ label: 'myTeacherProfile', path: '/teacher/profile' });
    if (role === 'student') items.push({ label: 'studentProfile', path: '/student/profile' });
    if (role === 'parent') items.push({ label: 'linkedStudents', path: '/parent/children' });

    return items;
  }, [role]);

  const handleLanguageChange = (event) => {
    i18n.changeLanguage(event.target.value);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: 'primary.main' }}>
          {t('appName')}
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1.5, py: 1 }}>
        {navigationItems.map((item) => {
          const isSelected = location.pathname === item.path;

          return (
            <ListItemButton
              key={item.label}
              selected={isSelected}
              onClick={() => {
                navigate(item.path);
                if (isMobile) {
                  setMobileOpen(false);
                }
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'primary.light',
                  color: 'primary.main',
                },
              }}
            >
              <ListItemText primary={t(item.label)} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, backgroundColor: 'background.paper', color: 'text.primary' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {isMobile && (
              <IconButton color="inherit" aria-label="open navigation" edge="start" onClick={() => setMobileOpen((previous) => !previous)} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
              {t('appName')}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {user?.email || 'User'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {role || 'Guest'}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('language')}
            </Typography>
            <Select value={i18n.language || 'en'} onChange={handleLanguageChange} size="small" sx={{ minWidth: 140 }}>
              <MenuItem value="en">{t('english')}</MenuItem>
              <MenuItem value="om">{t('afaanOromo')}</MenuItem>
            </Select>
            <Button variant="outlined" color="error" size="small" startIcon={<LogoutIcon />} onClick={handleLogout}>
              {t('signOut')}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { xs: 0, md: drawerWidth }, flexShrink: { xs: 0, md: 0 }, display: { xs: 'none', md: 'block' } }}>
        <Drawer
          variant="permanent"
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              top: 64,
              height: 'calc(100% - 64px)',
              borderRight: '1px solid rgba(18, 34, 49, 0.08)',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
            },
          }}
        >
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 4 },
          mt: 8,
          ml: { xs: 0, md: `${drawerWidth}px` },
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default MainLayout;
