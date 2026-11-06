import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', py: 10, textAlign: 'center' }}>
      <Typography variant="h4">Page not found</Typography>
      <Typography color="text.secondary">The page you are looking for does not exist.</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Go to dashboard
      </Button>
    </Stack>
  );
}
