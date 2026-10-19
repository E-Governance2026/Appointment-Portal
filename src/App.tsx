import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Layout
import Layout from './components/layout/Layout'

// Public Pages
import Landing          from './pages/Landing'
import Login            from './pages/Login'
import TrackAppointment from './pages/TrackAppointment'

// Auth Pages
import Dashboard         from './pages/Dashboard'
import BookAppointment   from './pages/BookAppointment'          // old wizard (kept)
import BookAppointmentNew from './pages/BookAppointmentNew'       // new 6-step flow
import BookingConfirmation from './pages/BookingConfirmation'
import MyAppointments    from './pages/MyAppointments'
import AppointmentDetail from './pages/AppointmentDetail'
import CalendarPage      from './pages/CalendarPage'
import Approvals         from './pages/Approvals'
import VisitorManagement from './pages/VisitorManagement'
import Reports           from './pages/Reports'
import MasterManagement  from './pages/MasterManagement'
import UserManagement    from './pages/UserManagement'
import Settings          from './pages/Settings'
import AccessDenied      from './pages/AccessDenied'
import RequireRole       from './components/common/RequireRole'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public routes ── */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/track" element={<TrackAppointment />} />
        <Route path="/access-denied" element={<AccessDenied />} />

        {/* ── Authenticated routes (sidebar + navbar shell) ── */}
        {/* Role gates come from permissions.ts NAV_ACCESS (PRD §3, §9). */}
        <Route element={<Layout />}>
          {/* Open to all authenticated users */}
          <Route path="/dashboard"            element={<Dashboard />} />
          <Route path="/my-appointments"      element={<MyAppointments />} />
          <Route path="/my-appointments/:id"  element={<AppointmentDetail />} />
          <Route path="/calendar"             element={<CalendarPage />} />
          <Route path="/settings"             element={<Settings />} />

          {/* Booking — all roles */}
          <Route path="/book" element={
            <RequireRole allow={['requester','coordinator_authority','admin_dispatcher','super_admin']}>
              <BookAppointmentNew />
            </RequireRole>
          } />
          <Route path="/book/confirmation/:id" element={
            <RequireRole allow={['requester','coordinator_authority','admin_dispatcher','super_admin']}>
              <BookingConfirmation />
            </RequireRole>
          } />
          <Route path="/book-appointment" element={
            <RequireRole allow={['requester','coordinator_authority','admin_dispatcher','super_admin']}>
              <BookAppointment />
            </RequireRole>
          } />

          {/* Approvals — coordinator/authority, admin dispatcher, super admin */}
          <Route path="/approvals" element={
            <RequireRole allow={['coordinator_authority','admin_dispatcher','super_admin']}>
              <Approvals />
            </RequireRole>
          } />

          {/* Visitor management — admin dispatcher (reception desk), super admin */}
          <Route path="/visitor-management" element={
            <RequireRole allow={['admin_dispatcher','super_admin']}>
              <VisitorManagement />
            </RequireRole>
          } />

          {/* Reports — coordinator/authority, admin dispatcher, super admin */}
          <Route path="/reports" element={
            <RequireRole allow={['coordinator_authority','admin_dispatcher','super_admin']}>
              <Reports />
            </RequireRole>
          } />

          {/* Admin-only */}
          <Route path="/master-management" element={
            <RequireRole allow={['super_admin']}>
              <MasterManagement />
            </RequireRole>
          } />
          <Route path="/user-management" element={
            <RequireRole allow={['super_admin']}>
              <UserManagement />
            </RequireRole>
          } />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
