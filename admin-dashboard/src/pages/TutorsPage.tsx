import Search from '@mui/icons-material/Search';
import { Avatar, Box, InputAdornment, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { resolveFileUrl } from '../api/config';
import type { TutorListItem, VerificationStatus } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { formatDate, formatPhone, initials } from '../utils/format';
import { useDebounced, useLoader, useQueryState } from '../utils/hooks';

const TABS: { value: VerificationStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ALL', label: 'All' },
];

const columns: Column<TutorListItem>[] = [
  {
    key: 'tutor',
    header: 'Tutor',
    render: (t) => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar src={resolveFileUrl(t.photoUrl)} sx={{ width: 36, height: 36, fontSize: 14 }}>
          {initials(t.fullName)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {t.fullName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {formatPhone(t.phone)}
          </Typography>
        </Box>
      </Stack>
    ),
  },
  { key: 'email', header: 'Email', hideOnMobile: true, render: (t) => t.email ?? '-' },
  { key: 'city', header: 'City', hideOnMobile: true, render: (t) => t.city ?? '-' },
  {
    key: 'exp',
    header: 'Experience',
    hideOnMobile: true,
    align: 'right',
    render: (t) => (t.experienceYears != null ? `${t.experienceYears} yr${t.experienceYears === 1 ? '' : 's'}` : '-'),
  },
  { key: 'docs', header: 'Docs', align: 'right', hideOnMobile: true, render: (t) => t.documentCount },
  { key: 'submitted', header: 'Submitted', hideOnMobile: true, render: (t) => formatDate(t.submittedAt) },
  {
    key: 'status',
    header: 'Status',
    render: (t) => (
      <Stack direction="row" spacing={0.5}>
        <StatusChip value={t.verificationStatus} />
        {t.accountStatus !== 'ACTIVE' && <StatusChip value={t.accountStatus} />}
      </Stack>
    ),
  },
];

export function TutorsPage() {
  const navigate = useNavigate();
  const qs = useQueryState();
  const status = (qs.get('status') || 'PENDING') as VerificationStatus | 'ALL';
  const page = Number(qs.get('page')) || 1;
  const pageSize = Number(qs.get('pageSize')) || 20;
  const [search, setSearch] = useState(qs.get('q'));
  const q = useDebounced(search.trim());

  useEffect(() => {
    if (q !== qs.get('q')) qs.set({ q, page: 1 });
  }, [q, qs]);

  const { data, loading } = useLoader(
    (signal) =>
      adminApi.tutors({ status: status === 'ALL' ? undefined : status, q: qs.get('q') || undefined, page, pageSize }, signal),
    `${status}|${qs.get('q')}|${page}|${pageSize}`,
  );

  return (
    <>
      <PageHeader title="Tutor verification" subtitle="Review tutor profiles and documents before they become visible to parents" />
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs
          value={status}
          onChange={(_, v) => qs.set({ status: v === 'PENDING' ? undefined : v, page: 1 })}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 1 }}
        >
          {TABS.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      </Paper>
      <TextField
        placeholder="Search by name, phone or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 2, width: { xs: '100%', sm: 360 }, bgcolor: 'background.paper' }}
        slotProps={{
          input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
          htmlInput: { maxLength: 80 },
        }}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage={status === 'PENDING' ? 'No tutors are waiting for verification.' : 'No tutors match these filters.'}
        onRowClick={(t) => navigate(`/tutors/${t.id}`)}
        onPageChange={(p) => qs.set({ page: p })}
        onPageSizeChange={(s) => qs.set({ pageSize: s === 20 ? undefined : s, page: 1 })}
      />
    </>
  );
}
