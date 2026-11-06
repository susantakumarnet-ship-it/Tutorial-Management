import BlockOutlined from '@mui/icons-material/BlockOutlined';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import Search from '@mui/icons-material/Search';
import { Box, Button, InputAdornment, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/admin';
import type { AdminUser, Role, UserStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataTable, type Column } from '../components/DataTable';
import { ConfirmDialog, ReasonDialog } from '../components/Dialogs';
import { useNotifier } from '../components/Notifier';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { formatDate, formatDateTime, formatPhone } from '../utils/format';
import { useDebounced, useLoader, useQueryState } from '../utils/hooks';

const ROLES: (Role | '')[] = ['', 'PARENT', 'TUTOR', 'ADMIN'];
const STATUSES: (UserStatus | '')[] = ['', 'ACTIVE', 'BLOCKED', 'DELETED'];
const label = (v: string, all: string) => (v ? v.charAt(0) + v.slice(1).toLowerCase() : all);

export function UsersPage() {
  const { user: me } = useAuth();
  const { notify, notifyError } = useNotifier();
  const qs = useQueryState();
  const role = qs.get('role') as Role | '';
  const status = qs.get('status') as UserStatus | '';
  const page = Number(qs.get('page')) || 1;
  const pageSize = Number(qs.get('pageSize')) || 20;
  const [search, setSearch] = useState(qs.get('q'));
  const q = useDebounced(search.trim());

  useEffect(() => {
    if (q !== qs.get('q')) qs.set({ q, page: 1 });
  }, [q, qs]);

  const { data, setData, loading, reload } = useLoader(
    (signal) => adminApi.users({ role: role || undefined, status: status || undefined, q: qs.get('q') || undefined, page, pageSize }, signal),
    `${role}|${status}|${qs.get('q')}|${page}|${pageSize}`,
  );

  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const patchRow = (id: string, patch: Partial<AdminUser>) =>
    setData((d) => (d ? { ...d, items: d.items.map((u) => (u.id === id ? { ...u, ...patch } : u)) } : d));

  const block = async (reason: string) => {
    if (!blockTarget) return;
    setBusy(true);
    try {
      await adminApi.blockUser(blockTarget.id, reason);
      patchRow(blockTarget.id, { status: 'BLOCKED', blockedReason: reason });
      notify(`${blockTarget.fullName} has been blocked`);
      setBlockTarget(null);
      if (status === 'ACTIVE') reload();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    if (!unblockTarget) return;
    setBusy(true);
    try {
      await adminApi.unblockUser(unblockTarget.id);
      patchRow(unblockTarget.id, { status: 'ACTIVE', blockedReason: null });
      notify(`${unblockTarget.fullName} has been unblocked`);
      setUnblockTarget(null);
      if (status === 'BLOCKED') reload();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<Column<AdminUser>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (u) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {u.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatPhone(u.phone)}
            </Typography>
          </Box>
        ),
      },
      { key: 'email', header: 'Email', hideOnMobile: true, render: (u) => u.email ?? '-' },
      { key: 'role', header: 'Role', render: (u) => <StatusChip value={u.role} /> },
      {
        key: 'status',
        header: 'Status',
        render: (u) =>
          u.blockedReason ? (
            <Tooltip title={`Reason: ${u.blockedReason}`}>
              <span>
                <StatusChip value={u.status} />
              </span>
            </Tooltip>
          ) : (
            <StatusChip value={u.status} />
          ),
      },
      { key: 'verified', header: 'Phone verified', hideOnMobile: true, render: (u) => (u.phoneVerified ? 'Yes' : 'No') },
      { key: 'lastLogin', header: 'Last login', hideOnMobile: true, render: (u) => formatDateTime(u.lastLoginAt) },
      { key: 'joined', header: 'Joined', hideOnMobile: true, render: (u) => formatDate(u.createdAt) },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (u) => {
          if (u.role === 'ADMIN' || u.id === me?.id || u.status === 'DELETED') return null;
          return u.status === 'BLOCKED' ? (
            <Button size="small" color="success" startIcon={<LockOpenOutlined />} onClick={() => setUnblockTarget(u)}>
              Unblock
            </Button>
          ) : (
            <Button size="small" color="error" startIcon={<BlockOutlined />} onClick={() => setBlockTarget(u)}>
              Block
            </Button>
          );
        },
      },
    ],
    [me?.id],
  );

  return (
    <>
      <PageHeader title="Users" subtitle="Parents, tutors and administrators registered on the platform" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by name, phone or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 320 }, bgcolor: 'background.paper' }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { maxLength: 80 },
          }}
        />
        <TextField select size="small" label="Role" value={role} onChange={(e) => qs.set({ role: e.target.value, page: 1 })} sx={{ minWidth: 150, bgcolor: 'background.paper' }}>
          {ROLES.map((r) => (
            <MenuItem key={r || 'all'} value={r}>
              {label(r, 'All roles')}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => qs.set({ status: e.target.value, page: 1 })} sx={{ minWidth: 150, bgcolor: 'background.paper' }}>
          {STATUSES.map((s) => (
            <MenuItem key={s || 'all'} value={s}>
              {label(s, 'All statuses')}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No users match these filters."
        onPageChange={(p) => qs.set({ page: p })}
        onPageSizeChange={(s) => qs.set({ pageSize: s === 20 ? undefined : s, page: 1 })}
      />

      <ReasonDialog
        open={Boolean(blockTarget)}
        title={`Block ${blockTarget?.fullName ?? 'user'}?`}
        description="The user will be signed out of all devices immediately and cannot log in until unblocked."
        label="Reason for blocking"
        confirmLabel="Block user"
        busy={busy}
        onConfirm={(reason) => void block(reason)}
        onClose={() => setBlockTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(unblockTarget)}
        title="Unblock user?"
        message={
          <>
            <strong>{unblockTarget?.fullName}</strong> will be able to sign in again.
            {unblockTarget?.blockedReason && (
              <Box component="span" sx={{ display: 'block', mt: 1 }}>
                Blocked for: {unblockTarget.blockedReason}
              </Box>
            )}
          </>
        }
        confirmLabel="Unblock"
        confirmColor="success"
        busy={busy}
        onConfirm={() => void unblock()}
        onClose={() => setUnblockTarget(null)}
      />
    </>
  );
}
