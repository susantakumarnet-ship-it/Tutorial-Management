import ArrowBack from '@mui/icons-material/ArrowBack';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { normaliseIndianMobile } from '../utils/format';

const RESEND_SECONDS = 30;

export function LoginPage() {
  const { user, requestOtp, verifyOtp, signOutReason, clearSignOutReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phone, setPhone] = useState(''); // normalised 10 digits
  const [otpSentTo, setOtpSentTo] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  if (user) return <Navigate to={from} replace />;

  const normalised = normaliseIndianMobile(phoneInput);
  const phoneError = phoneTouched && !normalised ? 'Enter a valid 10-digit Indian mobile number' : null;

  const sendOtp = async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(target);
      setPhone(target);
      setOtpSentTo(res.otpSentTo);
      setDevOtp(res.devOtp ?? null);
      setCode('');
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onPhoneSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    clearSignOutReason();
    if (normalised) void sendOtp(normalised);
  };

  const onOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(phone, code);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
      // A non-admin account is signed out: send them back to the phone step.
      if ((err as { code?: string }).code === 'NOT_ADMIN') {
        setStep('phone');
        setDevOtp(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        background: 'linear-gradient(135deg, #1A237E 0%, #283593 45%, #3949AB 100%)',
      }}
    >
      <Paper elevation={8} sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
            <SchoolOutlined />
          </Avatar>
          <Typography variant="h5">Smart Tuition</Typography>
          <Typography variant="body2" color="text.secondary">
            Admin console sign in
          </Typography>
        </Stack>

        {signOutReason && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={clearSignOutReason}>
            {signOutReason}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {step === 'phone' ? (
          <form onSubmit={onPhoneSubmit} noValidate>
            <Stack spacing={2.5}>
              <TextField
                label="Mobile number"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d+\s-]/g, ''))}
                onBlur={() => setPhoneTouched(true)}
                error={Boolean(phoneError)}
                helperText={phoneError ?? 'We will send a one-time password to this number'}
                autoFocus
                autoComplete="tel-national"
                fullWidth
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
                  htmlInput: { inputMode: 'numeric', maxLength: 14 },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
              >
                Send OTP
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={onOtpSubmit} noValidate>
            <Stack spacing={2.5}>
              <Box>
                <Button
                  size="small"
                  startIcon={<ArrowBack />}
                  onClick={() => {
                    setStep('phone');
                    setError(null);
                    setDevOtp(null);
                  }}
                  sx={{ ml: -1 }}
                >
                  Change number
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Enter the 6-digit code sent to <strong>{otpSentTo}</strong>
                </Typography>
              </Box>

              {devOtp && (
                <Alert severity="info" onClose={() => setDevOtp(null)}>
                  Development mode: your OTP is{' '}
                  <Link component="button" type="button" onClick={() => setCode(devOtp)} sx={{ fontWeight: 700, verticalAlign: 'baseline' }}>
                    {devOtp}
                  </Link>{' '}
                  (click to fill).
                </Alert>
              )}

              <TextField
                inputRef={otpRef}
                label="OTP"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                fullWidth
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.5em', fontSize: 20 } } }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy || code.length !== 6}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
              >
                Verify &amp; sign in
              </Button>
              <Typography variant="body2" color="text.secondary" align="center">
                {secondsLeft > 0 ? (
                  <>Resend OTP in {secondsLeft}s</>
                ) : (
                  <Link component="button" type="button" disabled={busy} onClick={() => void sendOtp(phone)}>
                    Resend OTP
                  </Link>
                )}
              </Typography>
            </Stack>
          </form>
        )}
      </Paper>
    </Box>
  );
}
