import CancelOutlined from '@mui/icons-material/CancelOutlined';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { adminApi } from '../api/admin';
import type { AdminRequirement, RequirementStatus } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/Dialogs';
import { useNotifier } from '../components/Notifier';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { formatDate, formatPhone, formatRupees, humanize } from '../utils/format';
import { useLoader, useQueryState } from '../utils/hooks';

const STATUSES: (RequirementStatus | '')[] = ['', 'OPEN', 'FULFILLED', 'CLOSED'];

export function RequirementsPage() {
  const { notify, notifyError } = useNotifier();
  const qs = useQueryState();
  const status = qs.get('status') as RequirementStatus | '';
  const page = Number(qs.get('page')) || 1;
  const pageSize = Number(qs.get('pageSize')) || 20;

  const { data, setData, loading, reload } = useLoader(
    (signal) => adminApi.requirements({ status: status || undefined, page, pageSize }, signal),
    `${status}|${page}|${pageSize}`,
  );

  const [target, setTarget] = useState<AdminRequirement | null>(null);
  const [busy, setBusy] = useState(false);

  const close = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await adminApi.closeRequirement(target.id);
      setData((d) => (d ? { ...d, items: d.items.map((r) => (r.id === target.id ? { ...r, status: 'CLOSED' } : r)) } : d));
      notify('Requirement closed');
      setTarget(null);
      if (status === 'OPEN') reload();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<Column<AdminRequirement>[]>(
    () => [
      {
        key: 'class',
        header: 'Class & subjects',
        render: (r) => (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {r.className}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {r.subjects || '-'}
            </Typography>
          </Box>
        ),
      },
      {
        key: 'parent',
        header: 'Parent',
        render: (r) => (
          <Box>
            <Typography variant="body2">{r.parentName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatPhone(r.parentPhone)}
            </Typography>
          </Box>
        ),
      },
      {
        key: 'location',
        header: 'Location',
        hideOnMobile: true,
        render: (r) => [r.locality, r.city].filter(Boolean).join(', ') + (r.pincode ? ` - ${r.pincode}` : '') || '-',
      },
      { key: 'mode', header: 'Mode', hideOnMobile: true, render: (r) => humanize(r.mode) },
      { key: 'budget', header: 'Budget / month', align: 'right', hideOnMobile: true, render: (r) => formatRupees(r.monthlyBudget) },
      { key: 'apps', header: 'Applications', align: 'right', hideOnMobile: true, render: (r) => r.applicationCount },
      { key: 'created', header: 'Posted', hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
      { key: 'status', header: 'Status', render: (r) => <StatusChip value={r.status} /> },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (r) =>
          r.status === 'OPEN' ? (
            <Button size="small" color="error" startIcon={<CancelOutlined />} onClick={() => setTarget(r)}>
              Close
            </Button>
          ) : null,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Requirements" subtitle="Tuition requirements posted by parents" />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => qs.set({ status: e.target.value, page: 1 })}
          sx={{ minWidth: 180, bgcolor: 'background.paper' }}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s || 'all'} value={s}>
              {s ? humanize(s) : 'All statuses'}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No requirements match this filter."
        onPageChange={(p) => qs.set({ page: p })}
        onPageSizeChange={(s) => qs.set({ pageSize: s === 20 ? undefined : s, page: 1 })}
      />
      <ConfirmDialog
        open={Boolean(target)}
        title="Close this requirement?"
        message={
          target && (
            <>
              <strong>{target.className}</strong> ({target.subjects || 'no subjects'}) posted by {target.parentName} will be closed and
              tutors will no longer be able to apply. This cannot be undone from the dashboard.
            </>
          )
        }
        confirmLabel="Close requirement"
        confirmColor="error"
        busy={busy}
        onConfirm={() => void close()}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
