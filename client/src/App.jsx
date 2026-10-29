import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

import PatientLayout from './pages/patient/PatientLayout';
import PatientDashboard from './pages/patient/Dashboard';
import PersonalInfo from './pages/patient/PersonalInfo';
import RegisterPatient from './pages/patient/RegisterPatient';
import ChangePatient from './pages/patient/ChangePatient';
import Patients from './pages/patient/Patients';
import Doctors from './pages/patient/Doctors';
import PastAppointmentsAndPrescriptions from './pages/patient/PastAppointmentsAndPrescriptions';
import PostQuery from './pages/patient/PostQuery';
import UploadDocuments from './pages/patient/UploadDocuments';
import MessageBox from './pages/patient/MessageBox';
import HealthMonitoring from './pages/patient/HealthMonitoring';
import BookAppointment from './pages/patient/BookAppointment';
import Appointments from './pages/patient/Appointments';
import AppointmentDetail from './pages/patient/AppointmentDetail';
import VideoCall from './pages/patient/VideoCall';
import Support from './pages/patient/Support';
import Messages from './pages/patient/Messages';

import DoctorLayout from './pages/doctor/DoctorLayout';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import DoctorPastAppointments from './pages/doctor/DoctorPastAppointments';
import DoctorCalendar from './pages/doctor/DoctorCalendar';
import DoctorFinance from './pages/doctor/DoctorFinance';
import DoctorPatients from './pages/doctor/DoctorPatients';
import DoctorPatientDetail from './pages/doctor/DoctorPatientDetail';
import DoctorProfile from './pages/doctor/DoctorProfile';
import DoctorAskAI from './pages/doctor/DoctorAskAI';
import DoctorAppointmentDetail from './pages/doctor/DoctorAppointmentDetail';
import ConsultationRoom from './pages/consultation/ConsultationRoom';

import AdminDashboard from './pages/admin/AdminDashboard';

function Protected({ roles, children }) {
  const { account, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!account) return <Navigate to="/login" replace />;
  if (!account.acceptedPolicy) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(account.role) && account.role !== 'ADMIN') {
    if (account.role === 'DOCTOR') return <Navigate to="/doctor" replace />;
    if (account.role === 'ADMIN') return <Navigate to="/admin" replace />;
    return <Navigate to="/patient" replace />;
  }
  return children;
}

function HomeRedirect() {
  const { account, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!account) return <Navigate to="/login" replace />;
  if (!account.acceptedPolicy) return <Navigate to="/login" replace />;
  if (account.role === 'DOCTOR') return <Navigate to="/doctor" replace />;
  if (account.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/patient" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/patient" element={<Protected roles={['PATIENT']}><PatientLayout /></Protected>}>
          {/* 1. Dashboard */}
          <Route index element={<PatientDashboard />} />

          {/* 2. Personal Information */}
          <Route path="personal-info" element={<PersonalInfo />} />
          <Route path="profile" element={<Navigate to="/patient/personal-info" replace />} />

          {/* 3. Register a New Patient */}
          <Route path="register-patient" element={<RegisterPatient />} />

          {/* 4. Change Patient */}
          <Route path="change-patient" element={<ChangePatient />} />
          <Route path="patients" element={<ChangePatient />} />

          {/* 5. Our Doctors */}
          <Route path="doctors" element={<Doctors />} />

          {/* 6. Past Appointments & Prescriptions */}
          <Route path="past-records" element={<PastAppointmentsAndPrescriptions />} />
          <Route path="past-appointments" element={<PastAppointmentsAndPrescriptions />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="appointments/:id" element={<AppointmentDetail />} />

          {/* 7. Post Query */}
          <Route path="post-query" element={<PostQuery />} />

          {/* 8. Upload Documents */}
          <Route path="upload-documents" element={<UploadDocuments />} />

          {/* 9. Message Box */}
          <Route path="messages" element={<MessageBox />} />
          <Route path="messages/:id" element={<MessageBox />} />
          <Route path="appointments/:id/messages" element={<Messages />} />

          {/* 10. Health Monitoring */}
          <Route path="health-monitoring" element={<HealthMonitoring />} />

          {/* 11. Help & Support */}
          <Route path="support" element={<Support />} />

          {/* Booking & Consultation flows */}
          <Route path="book" element={<BookAppointment />} />
        </Route>

        {/* Full-screen consultation room for Video Consultations (accessible directly via WhatsApp / Message Box link) */}
        <Route path="/consultation/:id" element={<ConsultationRoom />} />
        <Route path="/patient/appointments/:id/call" element={<ConsultationRoom />} />

        <Route path="/doctor" element={<Protected roles={['DOCTOR']}><DoctorLayout /></Protected>}>
          <Route index element={<DoctorDashboard />} />
          <Route path="past-appointments" element={<DoctorPastAppointments />} />
          <Route path="calendar" element={<DoctorCalendar />} />
          <Route path="finance" element={<DoctorFinance />} />
          <Route path="patients" element={<DoctorPatients />} />
          <Route path="patients/:id" element={<DoctorPatientDetail />} />
          <Route path="profile" element={<DoctorProfile />} />
          <Route path="ask-ai" element={<DoctorAskAI />} />
          <Route path="appointments/:id" element={<DoctorAppointmentDetail />} />
        </Route>

        <Route path="/admin" element={<Protected roles={['ADMIN']}><AdminDashboard /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
