import AnnouncementOutlined from '@mui/icons-material/CampaignOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import StarOutline from '@mui/icons-material/StarOutline';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { formatPhone, initials } from '../utils/format';

const DRAWER_WIDTH = 264;

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  soon?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  { to: '/tutors', label: 'Tutor verification', icon: <VerifiedUserOutlined /> },
  { to: '/users', label: 'Users', icon: <PeopleOutline /> },
  { to: '/requirements', label: 'Requirements', icon: <AssignmentOutlined /> },
];

export const NEXT_PHASE_NAV: NavItem[] = [
  { to: '/complaints', label: 'Complaints', icon: <ReportProblemOutlined />, soon: true },
  { to: '/reviews', label: 'Reviews', icon: <StarOutline />, soon: true },
  { to: '/payments', label: 'Subscriptions & Payments', icon: <PaymentsOutlined />, soon: true },
  { to: '/announcements', label: 'Announcements', icon: <AnnouncementOutlined />, soon: true },
  { to: '/catalog', label: 'Subjects & Locations', icon: <PlaceOutlined />, soon: true },
];

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <>
      {items.map((item) => {
        const selected = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <ListItemButton key={item.to} component={NavLink} to={item.to} selected={selected} onClick={onNavigate}>
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2', fontWeight: selected ? 600 : 500 } }} />
            {item.soon && <Chip label="Soon" size="small" sx={{ height: 20, fontSize: 11 }} />}
          </ListItemButton>
        );
      })}
    </>
  );
}

function DrawerContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ gap: 1.5, px: 2.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
          <SchoolOutlined fontSize="small" />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
            Smart Tuition
          </Typography>
          <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            ADMIN CONSOLE
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ py: 1 }}>
        <NavList items={MAIN_NAV} onNavigate={onNavigate} />
      </List>
      <List
        sx={{ py: 0 }}
        subheader={
          <ListSubheader sx={{ lineHeight: '32px', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', bgcolor: 'transparent' }}>
            Coming in next phase
          </ListSubheader>
        }
      >
        <NavList items={NEXT_PHASE_NAV} onNavigate={onNavigate} />
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ p: 2 }}>
        Smart Tuition admin v0.1
      </Typography>
    </Box>
  );
}

export function Layout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setMenuAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar>
          {!isDesktop && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }} aria-label="Open navigation">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="subtitle1" sx={{ flexGrow: 1, display: { md: 'none' } }}>
            Smart Tuition Admin
          </Typography>
          <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'block' } }} />
          <Tooltip title="Account">
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Account menu">
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', fontSize: 14 }}>{initials(user?.fullName)}</Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
              <Typography variant="subtitle2">{user?.fullName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPhone(user?.phone)}
              </Typography>
              {user?.email && (
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              )}
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutOutlined fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isDesktop ? (
          <Drawer
            variant="permanent"
            open
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' } }}
          >
            <DrawerContent />
          </Drawer>
        ) : (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
          >
            <DrawerContent onNavigate={() => setMobileOpen(false)} />
          </Drawer>
        )}
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Toolbar />
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
