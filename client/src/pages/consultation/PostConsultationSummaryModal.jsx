import { motion } from '../../components/motion';
import { Link, useNavigate } from 'react-router-dom';

export default function PostConsultationSummaryModal({
  appointment,
  role,
  callDuration = 0,
  onClose,
}) {
  const navigate = useNavigate();
  const isDoctor = role === 'DOCTOR';

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070D18]/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-xl w-full bg-white text-slate-900 border border-[#F0E5DA] rounded-[32px] overflow-hidden shadow-2xl p-6 sm:p-8 space-y-6 text-center"
      >
        {/* Success Icon Badge */}
        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl font-bold shadow-inner">
          ✓
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-[#1B365D] font-display">
            Consultation Completed
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Your encrypted video consultation session has ended successfully.
          </p>
        </div>

        {/* Consultation Metrics Card */}
        <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-[#FAF3EC] border border-[#F0E5DA] text-left">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Duration</div>
            <div className="font-extrabold text-[#1B365D] text-sm sm:text-base mt-0.5">
              {formatDuration(callDuration)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Mode</div>
            <div className="font-extrabold text-[#CAA067] text-sm sm:text-base mt-0.5">
              Video HD
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
            <div className="font-extrabold text-emerald-600 text-sm sm:text-base mt-0.5">
              COMPLETED
            </div>
          </div>
        </div>

        {/* Doctor & Patient Info */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left space-y-1.5 text-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-400">Doctor:</span>
            <span className="font-bold text-slate-900">{appointment?.doctor?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Patient:</span>
            <span className="font-bold text-slate-900">{appointment?.patient?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Speciality:</span>
            <span className="font-bold text-slate-900">{appointment?.doctor?.speciality || 'General Medicine'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {isDoctor ? (
            <button
              type="button"
              onClick={() => navigate(`/doctor/appointments/${appointment.id}`)}
              className="btn-primary flex-1 py-3.5 text-sm font-bold shadow-xs cursor-pointer"
            >
              View Consultation Record &rarr;
            </button>
          ) : (
            <Link
              to="/patient/past-records"
              className="btn-primary flex-1 py-3.5 text-sm font-bold shadow-xs text-center inline-block"
            >
              View Prescription &amp; Records &rarr;
            </Link>
          )}

          <button
            type="button"
            onClick={() => navigate(isDoctor ? '/doctor' : '/patient')}
            className="btn-secondary flex-1 py-3.5 text-sm font-bold cursor-pointer"
          >
            Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
