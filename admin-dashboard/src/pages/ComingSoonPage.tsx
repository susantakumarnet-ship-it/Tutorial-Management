import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined';
import { Avatar, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { PageHeader } from '../components/PageHeader';

export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent>
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 2 }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: 'secondary.light', color: 'secondary.dark' }}>
              <ConstructionOutlined fontSize="large" />
            </Avatar>
            <Chip label="Coming in next phase" color="secondary" />
            <Typography variant="h6">{title} is not available yet</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
              {description}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
