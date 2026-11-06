import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'error' | 'success' | 'warning';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
  busy,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={onConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  label?: string;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'error' | 'success' | 'warning';
  /** When false the reason is optional. */
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Dialog that collects a free-text reason/note before performing an action. */
export function ReasonDialog({
  open,
  title,
  description,
  label = 'Reason',
  confirmLabel = 'Submit',
  confirmColor = 'error',
  required = true,
  minLength = 3,
  maxLength = 500,
  busy,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const error =
    required && trimmed.length < minLength
      ? `Please enter at least ${minLength} characters`
      : trimmed.length > maxLength
        ? `Maximum ${maxLength} characters`
        : null;

  const submit = () => {
    setTouched(true);
    if (!error) onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label={required ? label : `${label} (optional)`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && Boolean(error)}
          helperText={(touched && error) || `${trimmed.length}/${maxLength}`}
          slotProps={{ htmlInput: { maxLength } }}
          disabled={busy}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={submit}
          disabled={busy || (touched && Boolean(error))}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
