import { Alert, Snackbar, type AlertColor } from '@mui/material';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';

interface Toast {
  key: number;
  message: string;
  severity: AlertColor;
}

interface NotifierValue {
  notify: (message: string, severity?: AlertColor) => void;
  notifyError: (err: unknown) => void;
}

const NotifierContext = createContext<NotifierValue | null>(null);

export function NotifierProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const [open, setOpen] = useState(true);
  const current = queue[0];

  const notify = useCallback((message: string, severity: AlertColor = 'success') => {
    setQueue((q) => [...q, { key: Date.now() + Math.random(), message, severity }]);
    setOpen(true);
  }, []);
  const notifyError = useCallback((err: unknown) => notify(errorMessage(err), 'error'), [notify]);
  const value = useMemo(() => ({ notify, notifyError }), [notify, notifyError]);

  return (
    <NotifierContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={Boolean(current) && open}
        autoHideDuration={current?.severity === 'error' ? 7000 : 4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setOpen(false);
        }}
        TransitionProps={{
          onExited: () => {
            setQueue((q) => q.slice(1));
            setOpen(true);
          },
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={current?.severity ?? 'info'} variant="filled" onClose={() => setOpen(false)} sx={{ width: '100%' }}>
          {current?.message}
        </Alert>
      </Snackbar>
    </NotifierContext.Provider>
  );
}

export function useNotifier() {
  const ctx = useContext(NotifierContext);
  if (!ctx) throw new Error('useNotifier must be used within NotifierProvider');
  return ctx;
}
