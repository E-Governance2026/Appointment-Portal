import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import Layout            from './components/layout/Layout'
import Landing           from './pages/Landing'
import Login             from './pages/Login'
import TrackAppointment  from './pages/TrackAppointment'
import Dashboard         from './pages/Dashboard'
import BookAppointment   from './pages/BookAppointment'
import BookAppointmentNew from './pages/BookAppointmentNew'
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
        <Route path="/"              element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/track"         element={<TrackAppointment />} />
        <Route path="/access-denied" element={<AccessDenied />} />

        {/* ── Authenticated routes ── */}
        <Route element={<Layout />}>
          <Route path="/dashboard"           element={<Dashboard />} />
          <Route path="/my-appointments"     element={<MyAppointments />} />
          <Route path="/my-appointments/:id" element={<AppointmentDetail />} />
          <Route path="/calendar"            element={<CalendarPage />} />
          <Route path="/settings"            element={<Settings />} />

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
          <Route path="/approvals" element={
            <RequireRole allow={['coordinator_authority','admin_dispatcher','super_admin']}>
              <Approvals />
            </RequireRole>
          } />
          <Route path="/visitor-management" element={
            <RequireRole allow={['admin_dispatcher','super_admin']}>
              <VisitorManagement />
            </RequireRole>
          } />
          <Route path="/reports" element={
            <RequireRole allow={['coordinator_authority','admin_dispatcher','super_admin']}>
              <Reports />
            </RequireRole>
          } />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
