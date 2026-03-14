import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile/Profile';
import UserProfile from './pages/Profile/UserProfile';
import NotificationsPage from './pages/Notifications/NotificationsPage';
import QuizzesPage from './pages/Quizzes/QuizzesPage';
import ManageQuizContentPage from './pages/Quizzes/ManageQuizContentPage';
import QuizIntroPage from './pages/Quizzes/Student/QuizIntroPage';
import TakeQuizPage from './pages/Quizzes/Student/TakeQuizPage';
import QuizResultsPage from './pages/Quizzes/Student/QuizResultsPage';
import QuizCompletionPage from './pages/Quizzes/Student/QuizCompletionPage';
import ProtectedRoute from './components/ProtectedRoute';
import GlobalLayout from './components/GlobalLayout';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <Dashboard />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <Profile />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:id"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <UserProfile />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <NotificationsPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <QuizzesPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/edit/:id"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <ManageQuizContentPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id/intro"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <QuizIntroPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id/take"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <TakeQuizPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id/complete"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <QuizCompletionPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id/results/:attemptId"
            element={
              <ProtectedRoute>
                <GlobalLayout>
                  <QuizResultsPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
