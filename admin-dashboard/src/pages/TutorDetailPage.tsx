import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import HighlightOff from '@mui/icons-material/HighlightOff';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { resolveFileUrl } from '../api/config';
import type { TutorDocument, TutorProfile } from '../api/types';
import { ConfirmDialog, ReasonDialog } from '../components/Dialogs';
import { useNotifier } from '../components/Notifier';
import { StatusChip } from '../components/StatusChip';
import { DAY_NAMES, formatBytes, formatDate, formatDateTime, formatPhone, formatRupees, humanize, initials } from '../utils/format';
import { useLoader } from '../utils/hooks';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1">{title}</Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function ChipGroup({ label, items }: { label: string; items: { id: number; name: string }[] }) {
  return (
    <Box sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      {items.length ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {items.map((i) => (
            <Chip key={i.id} label={i.name} size="small" />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          None added
        </Typography>
      )}
    </Box>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value ?? '-'}
      </Typography>
    </Box>
  );
}

type DocDialog = { doc: TutorDocument; action: 'APPROVED' | 'REJECTED' } | null;

export function TutorDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { notify, notifyError } = useNotifier();
  const { data: t, setData, loading, error, reload } = useLoader((signal) => adminApi.tutor(id, signal), id);

  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [docDialog, setDocDialog] = useState<DocDialog>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  // Release blob URLs when leaving the page.
  useEffect(
    () => () => {
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const viewDocument = async (doc: TutorDocument) => {
    // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the blob.
    const win = window.open('', '_blank');
    setViewing(doc.id);
    try {
      const blob = await adminApi.documentFile(doc.id);
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalName;
        a.click();
      }
    } catch (err) {
      win?.close();
      notifyError(err);
    } finally {
      setViewing(null);
    }
  };

  const decide = async (action: 'approve' | 'reject', note?: string) => {
    if (!t) return;
    setBusy(true);
    try {
      const updated = action === 'approve' ? await adminApi.approveTutor(t.id, note) : await adminApi.rejectTutor(t.id, note ?? '');
      setData(updated);
      notify(action === 'approve' ? `${t.fullName} has been approved` : `${t.fullName}'s profile was rejected`);
      setDialog(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const reviewDoc = async (note?: string) => {
    if (!docDialog || !t) return;
    setBusy(true);
    try {
      const res = await adminApi.reviewDocument(docDialog.doc.id, docDialog.action, note);
      setData({
        ...t,
        documents: t.documents.map((d) =>
          d.id === res.id ? { ...d, status: res.status, reviewNote: note ?? null } : d,
        ),
      } as TutorProfile);
      notify(`Document ${res.status === 'APPROVED' ? 'approved' : 'rejected'}`);
      setDocDialog(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const backButton = (
    <Button startIcon={<ArrowBack />} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/tutors'))} sx={{ mb: 2, ml: -1 }}>
      Back to tutors
    </Button>
  );

  if (!t) {
    return (
      <>
        {backButton}
        {error && !loading ? (
          <Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>
            Could not load this tutor profile.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={140} />
            <Skeleton variant="rounded" height={240} />
          </Stack>
        )}
      </>
    );
  }

  const canApprove = t.verificationStatus === 'PENDING' || t.verificationStatus === 'REJECTED';
  const canReject = t.verificationStatus === 'PENDING' || t.verificationStatus === 'APPROVED';
  const location = [t.locality, t.city, t.pincode].filter(Boolean).join(', ');

  return (
    <>
      {backButton}

      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
            <Avatar src={resolveFileUrl(t.photoUrl)} alt={t.fullName} sx={{ width: 96, height: 96, fontSize: 32, bgcolor: 'primary.main' }}>
              {initials(t.fullName)}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5">{t.fullName}</Typography>
                <StatusChip value={t.verificationStatus} size="medium" />
                {t.accountStatus !== 'ACTIVE' && <StatusChip value={t.accountStatus} size="medium" />}
                {t.isFeatured && <Chip label="Featured" color="secondary" size="small" />}
              </Stack>
              {t.headline && (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {t.headline}
                </Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2.5 }} sx={{ mt: 1.5, color: 'text.secondary' }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <PhoneOutlined fontSize="small" />
                  <Link href={`tel:${t.phone}`} underline="hover" color="inherit" variant="body2">
                    {formatPhone(t.phone)}
                  </Link>
                </Stack>
                {t.email && (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <EmailOutlined fontSize="small" />
                    <Link href={`mailto:${t.email}`} underline="hover" color="inherit" variant="body2" noWrap>
                      {t.email}
                    </Link>
                  </Stack>
                )}
                {t.reviewCount > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <StarRounded fontSize="small" sx={{ color: '#F9A825' }} />
                    <Typography variant="body2">
                      {t.avgRating.toFixed(1)} ({t.reviewCount} reviews)
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Box>
            <Stack direction={{ xs: 'row', md: 'column' }} spacing={1} sx={{ flexShrink: 0 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutline />}
                disabled={!canApprove || busy}
                onClick={() => setDialog('approve')}
              >
                Approve
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<HighlightOff />}
                disabled={!canReject || busy}
                onClick={() => setDialog('reject')}
              >
                Reject
              </Button>
            </Stack>
          </Stack>

          {t.verificationStatus === 'DRAFT' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This tutor has not submitted their profile for verification yet.
            </Alert>
          )}
          {t.verificationNote && (
            <Alert severity={t.verificationStatus === 'REJECTED' ? 'error' : 'info'} sx={{ mt: 2 }}>
              <strong>Verification note:</strong> {t.verificationNote}
            </Alert>
          )}
          <Stack direction="row" spacing={3} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Field label="Submitted" value={formatDateTime(t.submittedAt)} />
            <Field label="Verified" value={formatDateTime(t.verifiedAt)} />
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Section title="About">
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, mb: 2 }}>
              <Field label="Monthly fee" value={formatRupees(t.monthlyFee)} />
              <Field label="Experience" value={t.experienceYears != null ? `${t.experienceYears} years` : '-'} />
              <Field label="Teaching mode" value={humanize(t.teachingMode)} />
              <Field label="Gender" value={humanize(t.gender)} />
              <Field label="Accepting students" value={t.isAvailable ? 'Yes' : 'No'} />
            </Box>
            {t.bio && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mb: t.experienceDetails ? 1.5 : 0 }}>
                {t.bio}
              </Typography>
            )}
            {t.experienceDetails && (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {t.experienceDetails}
              </Typography>
            )}
          </Section>

          <Section title="Teaching">
            <ChipGroup label="Subjects" items={t.subjects} />
            <ChipGroup label="Classes" items={t.classes} />
            <ChipGroup label="Boards" items={t.boards.map((b) => ({ id: b.id, name: b.code ? `${b.code} - ${b.name}` : b.name }))} />
          </Section>

          <Section title="Qualifications">
            {t.qualifications.length ? (
              <List dense disablePadding>
                {t.qualifications.map((q) => (
                  <ListItem key={q.id} disableGutters>
                    <ListItemText
                      primary={q.degree}
                      secondary={[q.institution, q.year].filter(Boolean).join(' · ') || undefined}
                      slotProps={{ primary: { fontWeight: 500 } }}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No qualifications added.
              </Typography>
            )}
          </Section>

          <Section title={`Documents (${t.documents.length})`}>
            {t.documents.length ? (
              <List disablePadding>
                {t.documents.map((d, i) => (
                  <Box key={d.id}>
                    {i > 0 && <Divider />}
                    <ListItem disableGutters sx={{ py: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                      <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                        <DescriptionOutlined color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        sx={{ minWidth: 180, flex: '1 1 200px' }}
                        primary={
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                              {d.originalName}
                            </Typography>
                            <StatusChip value={d.status} />
                          </Stack>
                        }
                        secondary={
                          <>
                            {humanize(d.docType)} · {formatBytes(d.sizeBytes)} · uploaded {formatDate(d.uploadedAt)}
                            {d.reviewNote && (
                              <Typography component="span" variant="caption" sx={{ display: 'block', mt: 0.5 }} color="error.main">
                                Note: {d.reviewNote}
                              </Typography>
                            )}
                          </>
                        }
                      />
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Button
                          size="small"
                          startIcon={viewing === d.id ? <CircularProgress size={14} /> : <OpenInNew fontSize="small" />}
                          onClick={() => void viewDocument(d)}
                          disabled={viewing === d.id}
                        >
                          View
                        </Button>
                        <Tooltip title="Approve document">
                          <span>
                            <IconButton color="success" size="small" disabled={d.status === 'APPROVED' || busy} onClick={() => setDocDialog({ doc: d, action: 'APPROVED' })}>
                              <CheckCircleOutline fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Reject document">
                          <span>
                            <IconButton color="error" size="small" disabled={d.status === 'REJECTED' || busy} onClick={() => setDocDialog({ doc: d, action: 'REJECTED' })}>
                              <HighlightOff fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </ListItem>
                  </Box>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No documents uploaded.
              </Typography>
            )}
          </Section>
        </Stack>

        <Stack spacing={2}>
          <Section title="Availability">
            {t.availability.length ? (
              <Stack spacing={1}>
                {t.availability.map((a) => (
                  <Stack key={a.id} direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {DAY_NAMES[a.dayOfWeek] ?? `Day ${a.dayOfWeek}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {a.startTime} - {a.endTime}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No availability added.
              </Typography>
            )}
          </Section>

          <Section title="Location">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1.5 }}>
              <PlaceOutlined fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2">{location || 'Not set'}</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Service radius" value={t.serviceRadiusKm != null ? `${t.serviceRadiusKm} km` : '-'} />
              <Field
                label="Coordinates"
                value={
                  t.latitude != null && t.longitude != null ? (
                    <Link
                      href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                    >
                      {t.latitude.toFixed(4)}, {t.longitude.toFixed(4)}
                    </Link>
                  ) : (
                    '-'
                  )
                }
              />
            </Box>
          </Section>

          <Section title="Account">
            <Stack spacing={1.5}>
              <Field label="Account status" value={<StatusChip value={t.accountStatus} />} />
              <Button component={RouterLink} to={`/users?role=TUTOR&q=${encodeURIComponent(t.phone.slice(-10))}`} size="small" sx={{ alignSelf: 'flex-start', ml: -0.5 }}>
                Manage account in Users
              </Button>
            </Stack>
          </Section>
        </Stack>
      </Box>

      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve tutor profile?"
        message={
          <>
            <strong>{t.fullName}</strong> will become visible to parents and any pending documents will be marked approved.
          </>
        }
        confirmLabel="Approve"
        confirmColor="success"
        busy={busy}
        onConfirm={() => void decide('approve')}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        title="Reject tutor profile"
        description={`Tell ${t.fullName} what needs to be fixed. This note is shown to the tutor.`}
        label="Reason for rejection"
        confirmLabel="Reject profile"
        maxLength={1000}
        busy={busy}
        onConfirm={(note) => void decide('reject', note)}
        onClose={() => setDialog(null)}
      />
      {docDialog?.action === 'APPROVED' ? (
        <ConfirmDialog
          open
          title="Approve document?"
          message={<>Mark <strong>{docDialog.doc.originalName}</strong> as approved.</>}
          confirmLabel="Approve"
          confirmColor="success"
          busy={busy}
          onConfirm={() => void reviewDoc()}
          onClose={() => setDocDialog(null)}
        />
      ) : (
        <ReasonDialog
          open={docDialog?.action === 'REJECTED'}
          title="Reject document"
          description={docDialog ? `Explain why "${docDialog.doc.originalName}" is not acceptable.` : undefined}
          label="Reason"
          confirmLabel="Reject document"
          busy={busy}
          onConfirm={(note) => void reviewDoc(note)}
          onClose={() => setDocDialog(null)}
        />
      )}
    </>
  );
}
