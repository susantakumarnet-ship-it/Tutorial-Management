import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import type { Paged } from '../api/types';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Hide this column below the md breakpoint to keep tables readable on phones. */
  hideOnMobile?: boolean;
  width?: number | string;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: Paged<T> | null;
  loading: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const mobileHide = { display: { xs: 'none', md: 'table-cell' } } as const;

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  emptyMessage = 'No records found.',
  onRowClick,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) {
  const rows = data?.items ?? [];
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box sx={{ height: 4 }}>{loading && <LinearProgress />}</Box>
      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { py: 1.25 } }}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={{ width: c.width, ...(c.hideOnMobile ? mobileHide : {}) }}>
                  {c.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{ cursor: onRowClick ? 'pointer' : undefined }}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align} sx={c.hideOnMobile ? mobileHide : undefined}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Typography color="text.secondary" align="center" sx={{ py: 5 }}>
                    {emptyMessage}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={data?.total ?? 0}
        page={data && data.total > 0 ? data.page - 1 : 0}
        rowsPerPage={data?.pageSize ?? 20}
        rowsPerPageOptions={[10, 20, 50]}
        onPageChange={(_, p) => onPageChange(p + 1)}
        onRowsPerPageChange={(e) => onPageSizeChange(Number(e.target.value))}
      />
    </Paper>
  );
}
