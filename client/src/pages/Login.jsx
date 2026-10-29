import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AnimatePresence, motion } from '../components/motion';
import TuskMedWordmark from '../components/TuskMedWordmark';

export default function Login() {
  const [mobile, setMobile] = useState('8101421053');
  const [otpId, setOtpId] = useState(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const [otpRequested, setOtpRequested] = useState(false);
  const [needsPolicy, setNeedsPolicy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const tickResendCooldown = (seconds) => {
    let remaining = seconds;
    const interval = setInterval(() => {
      remaining -= 1;
      setResendIn(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
  };

  const requestOtp = async (e) => {
    e?.preventDefault();
    if (!mobile) return;
    setError('');
    setBusy(true);
    try {
      const formattedMobile = mobile.startsWith('+') ? mobile : `+91${mobile.replace(/^0+/, '')}`;
      const res = await api.post('/auth/otp/request', { mobile: formattedMobile });
      setOtpId(res.data.otpId);
      setDevCode(res.data.devCode || null);
      setResendIn(res.data.resendCooldownSeconds || 30);
      setOtpRequested(true);
      tickResendCooldown(res.data.resendCooldownSeconds || 30);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (!otpId) return;
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/auth/otp/resend', { otpId });
      setOtpId(res.data.otpId);
      setDevCode(res.data.devCode || null);
      setResendIn(res.data.resendCooldownSeconds || 30);
      tickResendCooldown(res.data.resendCooldownSeconds || 30);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpId || !code) {
      setError('Please enter the OTP sent to your phone.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/auth/otp/verify', { otpId, code });
      if (res.data.needsPolicyAcceptance) {
        setNeedsPolicy(true);
      } else {
        await refresh();
        const role = res.data.account?.role;
        if (role === 'DOCTOR') {
          navigate('/doctor', { replace: true });
        } else if (role === 'ADMIN') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/patient', { replace: true });
        }
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const acceptPolicy = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/accept-policy');
      await refresh();
      const role = res.data.account?.role;
      if (role === 'DOCTOR') {
        navigate('/doctor', { replace: true });
      } else if (role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/patient', { replace: true });
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF9] flex flex-col justify-between font-sans">
      {/* Top Header */}
      <header className="bg-transparent py-5 px-8 sm:px-16 w-full">
        <div className="flex items-center gap-3">
          <TuskMedWordmark className="h-11 sm:h-14 w-auto cursor-pointer transition-transform duration-300 hover:scale-105" />
        </div>
      </header>

      {/* Main Container - Scaled Up & Wider */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-2 pb-16 flex flex-col justify-center items-center">
        {/* Title Header */}
        <div className="text-center mb-10 sm:mb-14">
          <h1 className="text-[36px] sm:text-[44px] font-black text-[#2B434C] tracking-tight font-display mb-2.5">
            Log In / Sign Up
          </h1>
          <p className="text-[#64748B] text-[16px] sm:text-[18px] font-medium max-w-xl mx-auto leading-relaxed">
            Access your healthcare dashboard and connect with top doctors
          </p>
        </div>

        {/* Scaled Dual Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 w-full max-w-[1060px] items-stretch">
          
          {/* Left Card: "How it Works" */}
          <div className="bg-[#CCA982] rounded-[30px] p-8 sm:p-12 shadow-sm flex flex-col justify-between text-white min-h-[520px] transition-shadow duration-300 hover:shadow-md">
            <h2 className="text-[26px] sm:text-[30px] font-black text-center text-[#2B434C] tracking-tight font-display mb-6">
              How it Works
            </h2>

            <div className="flex-1 flex flex-col justify-center py-6">
              {/* Step 1 & Step 2 Top Row */}
              <div className="flex items-center justify-center gap-6 sm:gap-10">
                {/* Step 1: Register */}
                <div className="group flex flex-col items-center text-center w-36 cursor-pointer">
                  {/* Circle shape with prominent zoom effect */}
                  <div className="w-[78px] h-[78px] rounded-full bg-white flex items-center justify-center shadow-sm mb-3 transition-all duration-300 ease-out group-hover:scale-120 group-hover:shadow-xl group-hover:bg-[#FFFBF5]">
                    {/* User Plus Icon (fixed size without scaling) */}
                    <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 pointer-events-none">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                  </div>
                  <span className="font-bold text-[17px] text-white transition-colors duration-200 group-hover:text-[#2B434C]">Register</span>
                  <span className="text-[13.5px] text-white/95 font-medium leading-tight mt-1">Create your account</span>
                </div>

                {/* Arrow 1 */}
                <div className="text-white/85 pb-8 transition-transform duration-300 hover:translate-x-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>

                {/* Step 2: Book */}
                <div className="group flex flex-col items-center text-center w-36 cursor-pointer">
                  {/* Circle shape with prominent zoom effect */}
                  <div className="w-[78px] h-[78px] rounded-full bg-white flex items-center justify-center shadow-sm mb-3 transition-all duration-300 ease-out group-hover:scale-120 group-hover:shadow-xl group-hover:bg-[#FFFBF5]">
                    {/* Calendar Icon (fixed size without scaling) */}
                    <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 pointer-events-none">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <span className="font-bold text-[17px] text-white transition-colors duration-200 group-hover:text-[#2B434C]">Book</span>
                  <span className="text-[13.5px] text-white/95 font-medium leading-tight mt-1">Schedule appointment</span>
                </div>

                {/* Arrow 2 */}
                <div className="text-white/85 pb-8 hidden sm:block transition-transform duration-300 hover:translate-x-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>

              {/* Step 3: Pay (Centered Below) */}
              <div className="group flex flex-col items-center text-center mt-8 cursor-pointer">
                {/* Circle shape with prominent zoom effect */}
                <div className="w-[78px] h-[78px] rounded-full bg-white flex items-center justify-center shadow-sm mb-3 transition-all duration-300 ease-out group-hover:scale-120 group-hover:shadow-xl group-hover:bg-[#FFFBF5]">
                  {/* Credit Card Icon (fixed size without scaling) */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 pointer-events-none">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <span className="font-bold text-[17px] text-white transition-colors duration-200 group-hover:text-[#2B434C]">Pay</span>
                <span className="text-[13.5px] text-white/95 font-medium leading-tight mt-1">Secure payment</span>
              </div>
            </div>
          </div>

          {/* Right Card: Login / Signup Form */}
          <div className="bg-white rounded-[30px] p-8 sm:p-12 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-[#EBE3D8] flex flex-col justify-between min-h-[520px] transition-shadow duration-300 hover:shadow-md">
            <div>
              {/* Header Icon + Welcome */}
              <div className="group flex flex-col items-center text-center mb-7 cursor-pointer">
                <div className="w-[68px] h-[68px] rounded-full bg-[#CAA067] flex items-center justify-center text-white mb-3 shadow-xs transition-all duration-300 ease-out group-hover:scale-120 group-hover:shadow-xl group-hover:bg-[#B88F55]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 pointer-events-none">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <h3 className="text-[25px] sm:text-[27px] font-black text-[#2B434C] font-display leading-tight">
                  Welcome
                </h3>
                <p className="text-[14px] sm:text-[15.5px] text-[#64748B] mt-1.5 max-w-[280px] font-medium leading-relaxed">
                  Enter your phone number and OTP to continue
                </p>
              </div>

              {/* Error Banner */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 overflow-hidden text-center font-medium"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sandbox Code Helper */}
              {devCode && (
                <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span>Sandbox OTP: <strong className="font-mono text-sm tracking-wider font-bold">{devCode}</strong></span>
                  <button
                    type="button"
                    onClick={() => setCode(devCode)}
                    className="text-amber-800 underline font-bold hover:text-amber-950 transition-colors"
                  >
                    Use code
                  </button>
                </div>
              )}

              {/* Policy Modal / Step */}
              {needsPolicy ? (
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-slate-600 font-medium">
                    Please accept our terms to complete your sign-in:
                  </p>
                  <label className="flex items-start gap-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#CAA067] focus:ring-[#CAA067]"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      I agree to the <span className="font-bold text-[#CAA067]">Privacy Policy</span> and <span className="font-bold text-[#CAA067]">Terms of Service</span>.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="w-full bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-3 rounded-xl font-bold text-[16px] shadow-xs hover:shadow-md transition-all duration-200 disabled:opacity-50"
                    disabled={!agreed || busy}
                    onClick={acceptPolicy}
                  >
                    {busy ? 'One moment…' : 'Continue to Dashboard'}
                  </button>
                </div>
              ) : (
                /* Form Inputs */
                <form className="space-y-4 sm:space-y-5" onSubmit={(e) => e.preventDefault()}>
                  {/* Phone Number Field */}
                  <div>
                    <label className="block text-[14px] font-bold text-[#2B434C] mb-1.5">
                      Phone Number
                    </label>
                    <div className="flex rounded-xl bg-[#EBF2FA] border border-[#D5E2F0] overflow-hidden focus-within:ring-2 focus-within:ring-[#CAA067]/40 focus-within:border-[#CAA067] transition-all duration-200">
                      <div className="flex items-center gap-2 px-3.5 bg-[#EBF2FA] text-[15px] font-bold text-[#2B434C] border-r border-[#D5E2F0] select-none py-2.5">
                        {/* Indian Flag SVG */}
                        <svg className="w-5 h-3.5 rounded-[2px] shadow-2xs shrink-0" viewBox="0 0 640 480">
                          <path fill="#f93" d="M0 0h640v160H0z"/>
                          <path fill="#fff" d="M0 160h640v160H0z"/>
                          <path fill="#128807" d="M0 320h640v160H0z"/>
                          <g transform="matrix(3.2 0 0 3.2 320 240)">
                            <circle r="20" fill="none" stroke="#008" strokeWidth="2"/>
                            <circle r="3.5" fill="#008"/>
                            <g id="d">
                              <g id="c">
                                <g id="b">
                                  <g id="a">
                                    <line x1="0" y1="0" x2="0" y2="20" stroke="#008" strokeWidth=".8"/>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </svg>
                        <span>+91</span>
                      </div>
                      <input
                        type="tel"
                        className="flex-1 bg-transparent px-3.5 py-2.5 text-[15px] font-bold text-[#2B434C] focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="8101421053"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, ''))}
                        required
                      />
                    </div>
                  </div>

                  {/* Get OTP Button */}
                  <button
                    type="button"
                    onClick={requestOtp}
                    disabled={busy || !mobile}
                    className="w-full bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-2.5 sm:py-3 rounded-xl font-bold text-[15.5px] shadow-xs hover:shadow-md transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    <span className="transition-transform duration-200 group-hover:scale-105">
                      {busy && !otpRequested ? (
                        'Sending OTP…'
                      ) : otpRequested ? (
                        resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'
                      ) : (
                        'Get OTP'
                      )}
                    </span>
                  </button>

                  {/* Enter OTP Field */}
                  <div>
                    <label className="block text-[14px] font-bold text-[#2B434C] mb-1.5">
                      Enter OTP
                    </label>
                    <div className="rounded-xl bg-[#EBF2FA] border border-[#D5E2F0] overflow-hidden focus-within:ring-2 focus-within:ring-[#CAA067]/40 focus-within:border-[#CAA067] transition-all duration-200">
                      <input
                        type="text"
                        maxLength={6}
                        className="w-full bg-transparent px-3.5 py-2.5 text-[15px] font-bold text-[#2B434C] focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="......"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>

                  {/* Verify & Login Button */}
                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={busy || !code}
                    className="w-full bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-2.5 sm:py-3 rounded-xl font-bold text-[15.5px] shadow-xs hover:shadow-md transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{busy ? 'Verifying…' : 'Verify & Login'}</span>
                  </button>
                </form>
              )}
            </div>

            {/* Bottom Info Callout */}
            <div className="mt-6 bg-[#EBF2FA] border border-[#D5E2F0] rounded-xl p-3 sm:p-3.5 text-[12.5px] sm:text-[13px] text-[#475569] text-center leading-normal transition-all duration-200 hover:border-[#CAA067]/40 hover:bg-[#E5EEF9]">
              <span className="font-bold text-[#2B434C]">Already registered?</span> Please login with the same mobile number you used before.
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs sm:text-sm text-slate-400 py-5 w-full">
        TuskMed Teleconsult &middot; Patient Portal
      </footer>
    </div>
  );
}
