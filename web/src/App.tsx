import { ConfigProvider, Spin } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { StaffShell, adminMenu, curatorMenu } from './shared/layout/StaffShell';
import { DashboardPage } from './pages/DashboardPage';
import { CoursesPage } from './features/courses/CoursesPage';
import { CourseWorkspace } from './features/courses/CourseWorkspace';
import { UsersPage } from './features/users/AssignCurators';
import type { ReactNode } from 'react';

const qc = new QueryClient();

const theme = {
  token: {
    colorPrimary: '#beaaf2',
    colorInfo: '#94c8ff',
    borderRadius: 8,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

function Guard({
  children,
  role,
}: {
  children: ReactNode;
  role: 'ADMIN' | 'STAFF';
}) {
  const { user, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'ADMIN' && user.globalRole !== 'ADMIN') {
    return <Navigate to="/curator" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <Guard role="ADMIN">
            <StaffShell base="/admin" items={adminMenu('/admin')} roleLabel="Админ" />
          </Guard>
        }
      >
        <Route index element={<DashboardPage title="Обзор администратора" />} />
        <Route path="courses" element={<CoursesPage base="/admin" />} />
        <Route
          path="courses/:courseId"
          element={<CourseWorkspace base="/admin" isAdmin />}
        />
        <Route path="assignments" element={<CoursesPage base="/admin" />} />
        <Route path="students" element={<CoursesPage base="/admin" />} />
        <Route path="analytics" element={<CoursesPage base="/admin" />} />
        <Route path="xp" element={<CoursesPage base="/admin" />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route
        path="/curator"
        element={
          <Guard role="STAFF">
            <StaffShell
              base="/curator"
              items={curatorMenu('/curator')}
              roleLabel="Куратор"
            />
          </Guard>
        }
      >
        <Route index element={<DashboardPage title="Обзор куратора" />} />
        <Route path="courses" element={<CoursesPage base="/curator" />} />
        <Route
          path="courses/:courseId"
          element={<CourseWorkspace base="/curator" isAdmin={false} />}
        />
        <Route path="assignments" element={<CoursesPage base="/curator" />} />
        <Route path="students" element={<CoursesPage base="/curator" />} />
        <Route path="analytics" element={<CoursesPage base="/curator" />} />
        <Route path="xp" element={<CoursesPage base="/curator" />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={ruRU} theme={theme}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
