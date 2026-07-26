import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import '../app/globals.css';
import { ThemeProvider } from '@shared/contexts/ThemeContext';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { JobProgressProvider } from '@features/exam-generation/model/JobProgressProvider';
import { ExamGenerationToast } from '@widgets/ExamGenerationToast/ui/ExamGenerationToast';
import LandingPage from '@/app/(auth)/landing/page';
import LoginPage from '@/app/(auth)/login/page';
import MainLayout from '@/app/(main)/layout';
import Home from '@/app/(main)/page';
import StudyHome from '@/app/(main)/study/page';
import StudyPage from '@/app/(main)/study/[subject]/page';
import ConceptPage from '@/app/(main)/study/[subject]/[chapter]/concept/page';
import StudyQ1Page from '@/app/(main)/study/[subject]/[chapter]/q1/page';
import StudyQ2Page from '@/app/(main)/study/[subject]/[chapter]/q2/page';
import StudyQ3Page from '@/app/(main)/study/[subject]/[chapter]/q3/page';
import ExamPage from '@/app/(main)/exam/[subject]/page';
import ExamCreate from '@/app/(main)/exam/[subject]/create/page';
import ExamDetailPage from '@/app/(main)/exam/[subject]/[examId]/page';
import ReviewPage from '@/app/(main)/review/page';
import ProfilePage from '@/app/(main)/profile/page';
import ChatPage from '@/app/(main)/chat/page';
import ConceptListPage from '@/app/(main)/concept-list/page';
import GoogleCallbackPage from '@/app/auth/google/callback/page';

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
            <Routes>
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
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
            <ExamGenerationToast />
          </JobProgressProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
