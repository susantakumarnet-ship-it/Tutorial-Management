import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RequirementsPage } from './pages/RequirementsPage';
import { TutorDetailPage } from './pages/TutorDetailPage';
import { TutorsPage } from './pages/TutorsPage';
import { UsersPage } from './pages/UsersPage';

const COMING_SOON = [
  { path: 'complaints', title: 'Complaints', description: 'Review and resolve complaints raised by parents and tutors.' },
  { path: 'reviews', title: 'Reviews', description: 'Moderate ratings and reviews, and hide inappropriate content.' },
  {
    path: 'payments',
    title: 'Subscriptions & Payments',
    description: 'Track subscription plans, featured listings, payments and refunds.',
  },
  { path: 'announcements', title: 'Announcements', description: 'Send announcements to all users, parents only or tutors only.' },
  { path: 'catalog', title: 'Subjects & Locations', description: 'Manage the subjects, classes, boards and service locations catalogue.' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="tutors" element={<TutorsPage />} />
        <Route path="tutors/:id" element={<TutorDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="requirements" element={<RequirementsPage />} />
        {COMING_SOON.map((p) => (
          <Route key={p.path} path={p.path} element={<ComingSoonPage title={p.title} description={p.description} />} />
        ))}
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
