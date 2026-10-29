import { useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';
import { AnimatePresence, motion } from '../../components/motion';

const MAX_LEN = 500;

export default function PostQuery() {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!description.trim()) return;
    setError('');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('description', description);
      if (category) form.append('category', category);
      if (file) form.append('attachment', file);
      const res = await api.post('/queries', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      setDescription('');
      setCategory('');
      setFile(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Main Hero Card Container */}
      <div className="w-full bg-[#EED8C5]/30 rounded-[32px] p-8 sm:p-12 lg:p-14 border border-[#E9D5C2] relative overflow-hidden shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
          
          {/* Left Column: Heading, Subtext, and Step Highlights */}
          <div className="space-y-6 sm:space-y-8">
            {/* Top Sub-tag */}
            <div className="flex items-center gap-2">
              <span className="h-[2px] w-6 bg-[#CAA067]" />
              <span className="text-[12px] sm:text-[13px] font-bold tracking-widest uppercase text-[#CAA067]">
                POST A QUERY
              </span>
            </div>

            {/* Main Headline */}
            <div className="space-y-1">
              <h1 className="text-[32px] sm:text-[42px] lg:text-[48px] font-black text-[#2B434C] leading-[1.15] font-display tracking-tight">
                It is your health
              </h1>
              <div className="text-[32px] sm:text-[42px] lg:text-[48px] italic font-serif text-[#CAA067] leading-[1.15] tracking-tight">
                at your fingertips
              </div>
            </div>

            {/* Description Body */}
            <p className="text-[#64748B] text-[14px] sm:text-[15.5px] leading-relaxed max-w-lg font-medium">
              Guided with best experts. Our digital health platform is removing distance from healthcare. Delivering better digital health. Wherever whenever.
            </p>

            {/* Steps / Highlights (1 and 2) */}
            <div className="space-y-4 pt-2">
              {/* Step 1 */}
              <div className="flex items-start gap-4">
                <div className="w-7 h-7 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-2xs">
                  1
                </div>
                <p className="text-[13.5px] sm:text-[14.5px] font-semibold text-[#2B434C] leading-snug">
                  Describe your health concern in your own words
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4">
                <div className="w-7 h-7 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-2xs">
                  2
                </div>
                <p className="text-[13.5px] sm:text-[14.5px] font-semibold text-[#2B434C] leading-snug">
                  Hit Post Query — we connect you to the right specialist
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Circular Card with Floating Planetary Rotating Ring */}
          <div className="relative flex items-center justify-center py-6 lg:py-4">
            
            {/* Central Ambient Glow */}
            <div className="absolute w-[380px] h-[380px] rounded-full bg-[#CAA067]/10 blur-2xl animate-pulse-halo pointer-events-none -z-0" />

            {/* Main Primary Orbit Ring with Glowing Satellite Node */}
            <div className="absolute w-[460px] h-[460px] sm:w-[510px] sm:h-[510px] rounded-full border border-[#CAA067]/30 pointer-events-none -z-0 flex items-start justify-center animate-orbit-slow">
              <div className="relative -mt-[8px] flex items-center justify-center">
                <span className="w-4 h-4 rounded-full bg-[#CAA067] shadow-[0_0_12px_rgba(202,160,103,0.9)]" />
                <span className="absolute w-8 h-8 rounded-full bg-[#CAA067]/20 animate-ping" />
              </div>
            </div>

            {/* Secondary Concentric Dashed Ring Counter-Rotating */}
            <div className="absolute w-[520px] h-[520px] sm:w-[570px] sm:h-[570px] rounded-full border border-dashed border-[#CAA067]/20 pointer-events-none -z-0 flex items-end justify-center animate-orbit-reverse">
              <div className="relative -mb-[6px] flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-[#DEC39E] shadow-sm" />
              </div>
            </div>

            {/* Inner Circular White Card with Interactive Zoom */}
            <div className="group relative z-10 w-full max-w-[430px] rounded-[36px] bg-white p-7 sm:p-9 shadow-[0_12px_36px_rgba(0,0,0,0.05)] border border-[#EDE2D5] transition-all duration-300 hover:shadow-[0_18px_48px_rgba(0,0,0,0.09)]">
              
              {/* Header Icon + Title */}
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#CAA067] flex items-center justify-center text-white mb-3 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  {/* Message/Speech Bubble Icon */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-[19px] sm:text-[21px] font-black text-[#2B434C] font-display">
                  What's your concern today?
                </h3>
                <p className="text-[12px] sm:text-[13px] text-[#64748B] mt-1 font-medium">
                  Be as brief or detailed as you like.
                </p>
              </div>

              {/* Error Banner */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form Input Area */}
              <form onSubmit={submit} className="space-y-4">
                <div className="relative">
                  <textarea
                    rows={5}
                    maxLength={MAX_LEN}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Chest discomfort after meals, recurring for 3 weeks..."
                    className="w-full bg-[#FAF3EC]/60 border border-[#EBE0D3] rounded-2xl p-4 text-[13.5px] sm:text-[14px] text-[#2B434C] font-medium placeholder:text-[#94A3B8] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#CAA067]/40 focus:border-[#CAA067] resize-none transition-all"
                  />
                  <div className="text-[11px] font-bold text-[#94A3B8] text-right mt-1 px-1">
                    {description.length}/{MAX_LEN}
                  </div>
                </div>

                {/* Post Query Pill Button */}
                <button
                  type="submit"
                  disabled={!description.trim() || busy}
                  className="w-full bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-3 rounded-full font-bold text-[14.5px] sm:text-[15px] shadow-xs hover:shadow-md transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {/* Paper Plane / Send Icon */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>{busy ? 'Posting Query…' : 'Post Query'}</span>
                </button>
              </form>

            </div>
          </div>

        </div>
      </div>

      {/* Query Result / Recommendation Card */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E9D5C2] shadow-xs space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FAF3EC] flex items-center justify-center text-[#CAA067]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2B434C]">
                Matched Speciality: <span className="text-[#CAA067]">{result.matchedSpeciality?.name || 'General Physician'}</span>
              </h2>
              <p className="text-xs text-slate-500">Based on your query description, here are our recommended specialists:</p>
            </div>
          </div>

          {result.recommendedDoctors?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {result.recommendedDoctors.map((doc) => (
                <div key={doc.id} className="p-4 rounded-2xl bg-[#FAF3EC]/60 border border-[#EBE0D3] space-y-2">
                  <div className="font-bold text-[#2B434C] text-[15px]">{doc.name}</div>
                  <div className="text-xs font-semibold text-[#CAA067]">₹{Number(doc.fee).toFixed(0)} per consultation</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No specific doctors listed currently for this speciality. Our care team will get back to you shortly.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
