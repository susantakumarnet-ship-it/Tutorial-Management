import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import ChildCareOutlined from '@mui/icons-material/ChildCareOutlined';
import CurrencyRupeeOutlined from '@mui/icons-material/CurrencyRupeeOutlined';
import FamilyRestroomOutlined from '@mui/icons-material/FamilyRestroomOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import Refresh from '@mui/icons-material/Refresh';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { Alert, Avatar, Box, Button, Card, CardActionArea, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { PageHeader } from '../components/PageHeader';
import { SignupsChart } from '../components/SignupsChart';
import { formatNumber, formatPaise } from '../utils/format';
import { useLoader } from '../utils/hooks';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color: string;
  hint?: ReactNode;
  to?: string;
}

function StatCard({ label, value, icon, color, hint, to }: StatCardProps) {
  const navigate = useNavigate();
  const body = (
    <CardContent>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Avatar variant="rounded" sx={{ bgcolor: `${color}1A`, color, width: 44, height: 44 }}>
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ lineHeight: 1.3 }}>
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Box>
      </Stack>
    </CardContent>
  );
  return <Card sx={{ height: '100%' }}>{to ? <CardActionArea sx={{ height: '100%' }} onClick={() => navigate(to)}>{body}</CardActionArea> : body}</Card>;
}

const grid = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
} as const;

export function DashboardPage() {
  const { data: s, loading, error, reload } = useLoader((signal) => adminApi.stats(signal), 'stats');

  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-');

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview at a glance"
        actions={
          <Button startIcon={<Refresh />} onClick={reload} disabled={loading}>
            Refresh
          </Button>
        }
      />
      {error && !s ? (
        <Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>
          Could not load statistics.
        </Alert>
      ) : !s ? (
        <Box sx={grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={92} />
          ))}
        </Box>
      ) : (
        <>
          <Box sx={grid}>
            <StatCard label="Parents" value={formatNumber(s.parents)} icon={<FamilyRestroomOutlined />} color="#3949AB" to="/users?role=PARENT" />
            <StatCard label="Tutors" value={formatNumber(s.tutors)} icon={<SchoolOutlined />} color="#283593" to="/users?role=TUTOR" />
            <StatCard label="Students" value={formatNumber(s.students)} icon={<ChildCareOutlined />} color="#00838F" />
            <StatCard
              label="Revenue"
              value={formatPaise(s.revenuePaise)}
              icon={<CurrencyRupeeOutlined />}
              color="#2E7D32"
              hint="Paid payments, all time"
            />
            <StatCard
              label="Approved tutors"
              value={formatNumber(s.approvedTutors)}
              icon={<VerifiedOutlined />}
              color="#2E7D32"
              to="/tutors?status=APPROVED"
            />
            <StatCard
              label="Pending verification"
              value={formatNumber(s.pendingTutors)}
              icon={<HourglassEmptyOutlined />}
              color="#F57C00"
              hint={s.pendingTutors > 0 ? 'Needs review' : 'All caught up'}
              to="/tutors?status=PENDING"
            />
            <StatCard
              label="Open requirements"
              value={formatNumber(s.openRequirements)}
              icon={<AssignmentOutlined />}
              color="#1565C0"
              to="/requirements?status=OPEN"
            />
            <StatCard
              label="Fulfilled requirements"
              value={formatNumber(s.fulfilledRequirements)}
              icon={<TaskAltOutlined />}
              color="#2E7D32"
              to="/requirements?status=FULFILLED"
            />
            <StatCard
              label="Applications"
              value={formatNumber(s.applications)}
              icon={<HandshakeOutlined />}
              color="#6A1B9A"
              hint={`${formatNumber(s.acceptedApplications)} accepted (${pct(s.acceptedApplications, s.applications)})`}
            />
            <StatCard
              label="Blocked users"
              value={formatNumber(s.blockedUsers)}
              icon={<BlockOutlined />}
              color="#C62828"
              to="/users?status=BLOCKED"
            />
            <StatCard
              label="Open complaints"
              value={formatNumber(s.openComplaints)}
              icon={<ReportProblemOutlined />}
              color="#AD1457"
              hint="Open or in review"
            />
          </Box>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6">New signups</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Parents and tutors registered per day, last {s.signups.length} days
              </Typography>
              <SignupsChart data={s.signups} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
