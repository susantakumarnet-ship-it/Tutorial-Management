import { Chip, type ChipProps } from '@mui/material';
import { humanize } from '../utils/format';

const COLORS: Record<string, ChipProps['color']> = {
  // verification / document
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
  DRAFT: 'default',
  // user status
  ACTIVE: 'success',
  BLOCKED: 'error',
  DELETED: 'default',
  // requirement status
  OPEN: 'info',
  FULFILLED: 'success',
  CLOSED: 'default',
  // roles
  ADMIN: 'secondary',
  TUTOR: 'primary',
  PARENT: 'info',
};

export function StatusChip({ value, size = 'small' }: { value: string | null | undefined; size?: ChipProps['size'] }) {
  if (!value) return null;
  return <Chip label={humanize(value)} color={COLORS[value] ?? 'default'} size={size} variant="outlined" />;
}
