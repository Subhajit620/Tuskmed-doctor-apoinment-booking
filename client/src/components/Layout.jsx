import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TuskMedWordmark from './TuskMedWordmark';

export default function Layout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  const onLogoClick = () => {
    if (account?.role === 'DOCTOR') navigate('/doctor');
    else if (account?.role === 'ADMIN') navigate('/admin');
    else navigate('/patient');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFBF9] w-full">
      {/* Full-width Top Header */}
      <header className="bg-[#FAF3EC] border-b border-[#F0E5DA] sticky top-0 z-20 w-full shadow-2xs">
        <div className="w-full px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <TuskMedWordmark className="h-9 sm:h-12 w-auto cursor-pointer shrink-0" onClick={onLogoClick} />
          </div>

          {account && (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <button
                className="bg-[#CAA067] hover:bg-[#B88F55] text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 shadow-xs transition-colors"
                onClick={onLogout}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 sm:h-5 sm:w-5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Full-width Main Content */}
      <main className="flex-1 w-full px-3 sm:px-6 lg:px-10 py-4 sm:py-8">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-slate-400 py-4 border-t border-slate-200/60 w-full">
        TuskMed Teleconsult &middot;{' '}
        {account?.role === 'DOCTOR'
          ? 'Doctor Portal'
          : account?.role === 'ADMIN'
          ? 'Admin Control Center'
          : 'Patient Portal'}
      </footer>
    </div>
  );
}
