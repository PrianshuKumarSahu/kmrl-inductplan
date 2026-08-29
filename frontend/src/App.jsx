import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from './components/ui/toaster';

// Layouts
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FleetPage from './pages/FleetPage';
import TrainsetDetailPage from './pages/TrainsetDetailPage';
import SchedulePage from './pages/SchedulePage';
import GenerateSchedulePage from './pages/GenerateSchedulePage';
import WhatIfPage from './pages/WhatIfPage';
import JobCardsPage from './pages/JobCardsPage';
import BrandingPage from './pages/BrandingPage';
import MLInsightsPage from './pages/MLInsightsPage';
import AuditLogPage from './pages/AuditLogPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route element={<ProtectedRoute minRole="read_only"><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/fleet" element={<FleetPage />} />
              <Route path="/fleet/:id" element={<TrainsetDetailPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/schedule/generate" element={
                <ProtectedRoute minRole="supervisor"><GenerateSchedulePage /></ProtectedRoute>
              } />
              <Route path="/schedule/whatif" element={
                <ProtectedRoute minRole="supervisor"><WhatIfPage /></ProtectedRoute>
              } />
              <Route path="/jobcards" element={
                <ProtectedRoute minRole="operator"><JobCardsPage /></ProtectedRoute>
              } />
              <Route path="/branding" element={
                <ProtectedRoute minRole="operator"><BrandingPage /></ProtectedRoute>
              } />
              <Route path="/ml" element={
                <ProtectedRoute minRole="supervisor"><MLInsightsPage /></ProtectedRoute>
              } />
              <Route path="/audit" element={
                <ProtectedRoute minRole="supervisor"><AuditLogPage /></ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute minRole="supervisor"><AdminPage /></ProtectedRoute>
              } />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
