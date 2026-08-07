import { ConfigProvider, Spin } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/auth/AuthContext';
import { api } from './shared/api/client';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { StaffShell, adminMenu, curatorMenu, supportMenu } from './shared/layout/StaffShell';
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
import { LkProfilePage } from './pages/lk/LkProfilePage';
import { MockPaymentPage } from './pages/payments/MockPaymentPage';
import {
  LkCourseSupportPage,
  LkTechSupportPage,
  StaffSupportInboxPage,
  AdminSupportInboxPage,
} from './pages/lk/LkSupportPages';
import { StaffReviewsPage } from './pages/staff/StaffReviewsPage';
import { StaffEmployeesPage } from './pages/staff/StaffEmployeesPage';
import {
  SupportInboxPage,
  SupportStudentPage,
  SupportUsersPage,
} from './pages/support/SupportPages';
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
  role: 'ADMIN' | 'STAFF' | 'SUPPORT';
}) {
  const { user, loading } = useAuth();
  const managed = useQuery({
    queryKey: ['courses', 'managed'],
    queryFn: () => api<unknown[]>('/courses?managedOnly=true'),
    enabled:
      !!user && role === 'STAFF' && user.globalRole !== 'ADMIN',
  });

  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (role === 'ADMIN') {
    if (user.globalRole !== 'ADMIN') {
      if (user.globalRole === 'SUPPORT') {
        return <Navigate to="/support" replace />;
      }
      return <Navigate to="/lk" replace />;
    }
    return children;
  }

  if (role === 'SUPPORT') {
    if (user.globalRole === 'ADMIN' || user.globalRole === 'SUPPORT') {
      return children;
    }
    return <Navigate to="/lk" replace />;
  }

  // Curator panel: only real curators (or admins peeking)
  if (user.globalRole === 'ADMIN') {
    return children;
  }
  if (user.globalRole === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }
  if (managed.isLoading) return <Spin fullscreen />;
  if (!(managed.data?.length)) {
    return <Navigate to="/lk" replace />;
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/payments/mock" element={<MockPaymentPage />} />

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
        <Route path="profile" element={<LkProfilePage />} />
        <Route path="support/course" element={<LkCourseSupportPage />} />
        <Route path="support/tech" element={<LkTechSupportPage />} />
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
        <Route path="employees" element={<StaffEmployeesPage />} />
        <Route path="support" element={<AdminSupportInboxPage />} />
        <Route path="reviews" element={<StaffReviewsPage />} />
        <Route path="profile" element={<LkProfilePage />} />
      </Route>

      <Route
        path="/support"
        element={
          <Guard role="SUPPORT">
            <StaffShell
              base="/support"
              items={supportMenu('/support')}
              roleLabel="Поддержка"
            />
          </Guard>
        }
      >
        <Route index element={<Navigate to="/support/inbox" replace />} />
        <Route path="inbox" element={<SupportInboxPage />} />
        <Route path="users" element={<SupportUsersPage />} />
        <Route path="users/:id" element={<SupportStudentPage />} />
        <Route path="profile" element={<LkProfilePage />} />
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
        <Route
          path="support"
          element={
            <StaffSupportInboxPage
              channel="COURSE"
              title="Поддержка курса"
            />
          }
        />
        <Route path="reviews" element={<StaffReviewsPage />} />
        <Route path="profile" element={<LkProfilePage />} />
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
