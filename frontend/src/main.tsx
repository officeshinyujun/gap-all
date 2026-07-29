import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import '../app/globals.css';
import { ThemeProvider } from '@shared/contexts/ThemeContext';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { JobProgressProvider } from '@features/exam-generation/model/JobProgressProvider';
import { ExamGenerationToast } from '@widgets/ExamGenerationToast/ui/ExamGenerationToast';
import { ErrorReport } from '@widgets/ErrorReport';
const LandingPage = lazy(() => import('@/app/(auth)/landing/page'));
const LoginPage = lazy(() => import('@/app/(auth)/login/page'));
const TermsPage = lazy(() => import('@/app/(auth)/terms/page'));
const PrivacyPage = lazy(() => import('@/app/(auth)/privacy/page'));
const MainLayout = lazy(() => import('@/app/(main)/layout'));
const Home = lazy(() => import('@/app/(main)/page'));
const StudyHome = lazy(() => import('@/app/(main)/study/page'));
const StudyPage = lazy(() => import('@/app/(main)/study/[subject]/page'));
const ConceptPage = lazy(() => import('@/app/(main)/study/[subject]/[chapter]/concept/page'));
const StudyQ1Page = lazy(() => import('@/app/(main)/study/[subject]/[chapter]/q1/page'));
const StudyQ2Page = lazy(() => import('@/app/(main)/study/[subject]/[chapter]/q2/page'));
const StudyQ3Page = lazy(() => import('@/app/(main)/study/[subject]/[chapter]/q3/page'));
const ExamPage = lazy(() => import('@/app/(main)/exam/[subject]/page'));
const ExamCreate = lazy(() => import('@/app/(main)/exam/[subject]/create/page'));
const ExamDetailPage = lazy(() => import('@/app/(main)/exam/[subject]/[examId]/page'));
const ReviewPage = lazy(() => import('@/app/(main)/review/page'));
const ProfilePage = lazy(() => import('@/app/(main)/profile/page'));
const ChatPage = lazy(() => import('@/app/(main)/chat/page'));
const ConceptListPage = lazy(() => import('@/app/(main)/concept-list/page'));
const GoogleCallbackPage = lazy(() => import('@/app/auth/google/callback/page'));

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <JobProgressProvider>
            <Suspense fallback={<div aria-live="polite" />}>
              <Routes>
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
                <Route element={<MainLayout />}>
                  <Route index element={<Home />} />
                  <Route path="/study" element={<StudyHome />} />
                  <Route path="/study/:subject" element={<StudyPage />} />
                  <Route path="/study/:subject/:chapter/concept" element={<ConceptPage />} />
                  <Route path="/study/:subject/:chapter/q1" element={<StudyQ1Page />} />
                  <Route path="/study/:subject/:chapter/q2" element={<StudyQ2Page />} />
                  <Route path="/study/:subject/:chapter/q3" element={<StudyQ3Page />} />
                  <Route path="/exam/:subject" element={<ExamPage />} />
                  <Route path="/exam/:subject/create" element={<ExamCreate />} />
                  <Route path="/exam/:subject/:examId" element={<ExamDetailPage />} />
                  <Route path="/review" element={<ReviewPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/concept-list" element={<ConceptListPage />} />
                </Route>
              </Routes>
            </Suspense>
            <ExamGenerationToast />
            <ErrorReport />
          </JobProgressProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
