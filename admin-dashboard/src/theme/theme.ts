import { alpha, createTheme } from '@mui/material/styles';

const primary = '#283593'; // deep indigo
const secondary = '#F57C00'; // warm saffron accent

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: primary, light: '#5F5FC4', dark: '#001064', contrastText: '#fff' },
    secondary: { main: secondary, light: '#FFAD42', dark: '#BB4D00', contrastText: '#fff' },
    success: { main: '#2E7D32' },
    warning: { main: '#ED6C02' },
    error: { main: '#C62828' },
    info: { main: '#1565C0' },
    background: { default: '#F4F6FB', paper: '#FFFFFF' },
    text: { primary: '#1A2033', secondary: '#5A6478' },
    divider: '#E3E7F0',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Segoe UI", system-ui, -apple-system, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: '#F4F6FB' } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: '#E3E7F0' } },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          color: '#5A6478',
          backgroundColor: '#F8F9FC',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(t.palette.primary.main, 0.04) },
        }),
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: 8,
          margin: '2px 8px',
          '&.Mui-selected': {
            backgroundColor: alpha(t.palette.primary.main, 0.1),
            color: t.palette.primary.main,
            '& .MuiListItemIcon-root': { color: t.palette.primary.main },
          },
        }),
      },
    },
  },
});
