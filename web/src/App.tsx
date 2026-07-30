import { ConfigProvider, Spin } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { StaffShell, adminMenu, curatorMenu } from './shared/layout/StaffShell';
import { PublicShell } from './shared/layout/PublicShell';
import { StudentShell } from './shared/layout/StudentShell';
import { DashboardPage } from './pages/DashboardPage';
import { CoursesPage } from './features/courses/CoursesPage';
import { CourseWorkspace } from './features/courses/CourseWorkspace';
import { CourseHubPage } from './features/courses/CourseHubPage';
import { UsersPage } from './features/users/AssignCurators';
import { LandingPage } from './pages/public/LandingPage';
import { CatalogPage } from './pages/public/CatalogPage';
import { PublicCoursePage } from './pages/public/PublicCoursePage';
import { LkHomePage } from './pages/lk/LkHomePage';
import { LkCalendarPage } from './pages/lk/LkCalendarPage';
import { LkCoursePage } from './pages/lk/LkCoursePage';
import { LkLessonPage } from './pages/lk/LkLessonPage';
import { LkAssignmentPage } from './pages/lk/LkAssignmentPage';
import { LkHomeworkPage } from './pages/lk/LkHomeworkPage';
import { LkKnowledgePage } from './pages/lk/LkKnowledgePage';
import { LkStatsPage } from './pages/lk/LkStatsPage';
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

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicShell />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/courses/:idOrSlug" element={<PublicCoursePage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/lk"
        element={
          <AuthGuard>
            <StudentShell />
          </AuthGuard>
        }
      >
        <Route index element={<LkHomePage />} />
        <Route path="calendar" element={<LkCalendarPage />} />
        <Route path="courses/:courseId" element={<LkCoursePage />} />
        <Route path="lessons/:lessonId" element={<LkLessonPage />} />
        <Route path="assignments/:assignmentId" element={<LkAssignmentPage />} />
        <Route path="homework" element={<LkHomeworkPage />} />
        <Route path="knowledge" element={<LkKnowledgePage />} />
        <Route path="stats" element={<LkStatsPage />} />
      </Route>

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
        <Route
          path="assignments"
          element={
            <CourseHubPage base="/admin" tab="hw" title="Домашние задания" />
          }
        />
        <Route
          path="students"
          element={
            <CourseHubPage base="/admin" tab="students" title="Ученики" />
          }
        />
        <Route
          path="analytics"
          element={
            <CourseHubPage base="/admin" tab="analytics" title="Аналитика" />
          }
        />
        <Route
          path="xp"
          element={
            <CourseHubPage base="/admin" tab="xp" title="XP / лидерборд" />
          }
        />
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
        <Route
          path="courses"
          element={<CoursesPage base="/curator" managedOnly />}
        />
        <Route
          path="courses/:courseId"
          element={<CourseWorkspace base="/curator" isAdmin={false} />}
        />
        <Route
          path="assignments"
          element={
            <CourseHubPage
              base="/curator"
              tab="hw"
              title="Домашние задания"
              managedOnly
            />
          }
        />
        <Route
          path="students"
          element={
            <CourseHubPage
              base="/curator"
              tab="students"
              title="Ученики"
              managedOnly
            />
          }
        />
        <Route
          path="analytics"
          element={
            <CourseHubPage
              base="/curator"
              tab="analytics"
              title="Аналитика"
              managedOnly
            />
          }
        />
        <Route
          path="xp"
          element={
            <CourseHubPage
              base="/curator"
              tab="xp"
              title="XP / лидерборд"
              managedOnly
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
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
