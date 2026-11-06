import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { useState } from 'react';
import type { SignupDay } from '../api/types';

// Validated with the dataviz palette checker (CVD/normal-vision separation pass on a light surface).
const SERIES = [
  { key: 'parents', label: 'Parents', color: '#3949AB' },
  { key: 'tutors', label: 'Tutors', color: '#F57C00' },
] as const;

const W = 720;
const H = 260;
const PAD = { top: 24, right: 12, bottom: 32, left: 36 };
const GAP = 2; // surface gap between stacked segments

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= v) ?? pow * 10;
  return step * 4;
}

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Stacked daily bar chart in plain SVG (no chart library). */
export function SignupsChart({ data }: { data: SignupDay[] }) {
  const theme = useTheme();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) => d.parents + d.tutors);
  const max = niceMax(Math.max(0, ...totals));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const sum = totals.reduce((a, b) => a + b, 0);
  const hovered = hover != null ? data[hover] : null;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          {SERIES.map((s) => (
            <Stack key={s.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: s.color }} />
              <Typography variant="body2" color="text.secondary">
                {s.label}
              </Typography>
            </Stack>
          ))}
          <Typography variant="body2" color="text.secondary">
            · {sum} total
          </Typography>
        </Stack>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="Chart view">
          <ToggleButton value="chart" aria-label="Chart view">
            <BarChartOutlined fontSize="small" />
          </ToggleButton>
          <ToggleButton value="table" aria-label="Table view">
            <TableRowsOutlined fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {view === 'table' ? (
        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Parents</TableCell>
                <TableCell align="right">Tutors</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{dayLabel(d.date)}</TableCell>
                  <TableCell align="right">{d.parents}</TableCell>
                  <TableCell align="right">{d.tutors}</TableCell>
                  <TableCell align="right">{d.parents + d.tutors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : (
        <Box sx={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`Daily signups over the last ${data.length} days: ${sum} total`}
            style={{ display: 'block', overflow: 'visible' }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={theme.palette.divider} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={theme.palette.text.secondary}>
                  {Number.isInteger(t) ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const x = cx - barW / 2;
              let base = 0;
              const segs = SERIES.map((s) => {
                const v = d[s.key];
                const seg = { s, v, from: base, to: base + v };
                base += v;
                return seg;
              }).filter((seg) => seg.v > 0);
              const total = totals[i];
              const showLabel = i % 2 === data.length % 2 || data.length <= 8;
              return (
                <g key={d.date}>
                  {hover === i && (
                    <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill={theme.palette.primary.main} opacity={0.05} />
                  )}
                  {segs.map((seg, j) => {
                    const top = y(seg.to);
                    const bottom = y(seg.from) - (j > 0 ? GAP : 0);
                    const h = Math.max(1, bottom - top);
                    const isTop = j === segs.length - 1;
                    const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                    // Rounded data-end on the top segment only; square at the baseline/joins.
                    const path = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
                    return <path key={seg.s.key} d={path} fill={seg.s.color} />;
                  })}
                  {total > 0 && (
                    <text x={cx} y={y(total) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.palette.text.primary}>
                      {total}
                    </text>
                  )}
                  {showLabel && (
                    <text x={cx} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill={theme.palette.text.secondary}>
                      {dayLabel(d.date)}
                    </text>
                  )}
                  {/* Hit target: full-height column, larger than the mark. */}
                  <rect
                    x={cx - slot / 2}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={0}
                    aria-label={`${dayLabel(d.date)}: ${d.parents} parents, ${d.tutors} tutors`}
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke={theme.palette.text.secondary} strokeWidth={1} />
          </svg>
          {hovered && hover != null && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
                transform: hover > data.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                boxShadow: 2,
                px: 1.5,
                py: 1,
                pointerEvents: 'none',
                minWidth: 130,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {dayLabel(hovered.date)}
              </Typography>
              {SERIES.map((s) => (
                <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: s.color }} />
                  <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {s.label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {hovered[s.key]}
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
