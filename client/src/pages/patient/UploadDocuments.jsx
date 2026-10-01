import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { apiErrorMessage } from '../../api/client';
import { AnimatePresence, motion } from '../../components/motion';

const CATEGORIES = [
  'Lab Report',
  'Prescription',
  'Radiology / Scan (X-Ray, MRI, CT)',
  'Discharge Summary',
  'Vaccination Certificate',
  'Insurance / Medical Bill',
  'Other Medical Record',
];

export default function UploadDocuments() {
  const { activePatient } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [appointmentId, setAppointmentId] = useState('');
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef(null);

  // Load documents for active patient
  const loadDocuments = async () => {
    if (!activePatient) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch appointments and their attached documents from server
      const apptRes = await api.get('/appointments/mine');
      const appts = apptRes.data.appointments || [];
      setAppointments(appts);

      let serverDocs = [];
      appts.forEach((a) => {
        if (a.documents && a.documents.length > 0) {
          a.documents.forEach((d) => {
            serverDocs.push({
              id: d.id,
              title: d.fileName,
              category: 'Appointment Document',
              fileUrl: d.fileUrl,
              sizeBytes: d.sizeBytes,
              uploadedAt: d.uploadedAt || a.createdAt,
              appointmentId: a.id,
              doctorName: a.doctor?.name,
              source: 'SERVER',
            });
          });
        }
      });

      // 2. Fetch locally stored records for this patient
      const stored = localStorage.getItem(`tuskmed_patient_docs_${activePatient.id}`);
      let localDocs = [];
      if (stored) {
        try {
          localDocs = JSON.parse(stored);
        } catch (e) {
          // ignore
        }
      }

      setDocuments([...localDocs, ...serverDocs]);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 4 * 1024 * 1024) {
        setError('File exceeds the 4 MB limit. Please select a smaller file or contact support.');
        return;
      }
      setError('');
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !activePatient) return;

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      let uploadedUrl = null;
      let sizeBytes = file.size;

      if (appointmentId) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post(`/appointments/${appointmentId}/documents`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedUrl = res.data.document?.fileUrl;
      }

      if (!uploadedUrl) {
        uploadedUrl = URL.createObjectURL(file);
      }

      const newDoc = {
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: title || file.name,
        fileName: file.name,
        category,
        docDate,
        appointmentId: appointmentId || null,
        doctorName: appointments.find((a) => a.id === appointmentId)?.doctor?.name || null,
        fileUrl: uploadedUrl,
        sizeBytes,
        notes,
        uploadedAt: new Date().toISOString(),
        source: appointmentId ? 'SERVER' : 'LOCAL',
      };

      const stored = localStorage.getItem(`tuskmed_patient_docs_${activePatient.id}`);
      let localDocs = [];
      if (stored) {
        try {
          localDocs = JSON.parse(stored);
        } catch (e) {
          // ignore
        }
      }

      const updated = [newDoc, ...localDocs];
      localStorage.setItem(`tuskmed_patient_docs_${activePatient.id}`, JSON.stringify(updated));

      setSuccess('Document uploaded successfully!');
      setFile(null);
      setTitle('');
      setNotes('');
      setAppointmentId('');
      setShowUploadModal(false);
      await loadDocuments();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (docId) => {
    if (!window.confirm('Are you sure you want to remove this document?')) return;
    const stored = localStorage.getItem(`tuskmed_patient_docs_${activePatient.id}`);
    if (stored) {
      try {
        const localDocs = JSON.parse(stored);
        const filtered = localDocs.filter((d) => d.id !== docId);
        localStorage.setItem(`tuskmed_patient_docs_${activePatient.id}`, JSON.stringify(filtered));
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } catch (e) {
        // ignore
      }
    }
  };

  const filteredDocs = documents.filter((d) => {
    const matchesCat = selectedCategory === 'ALL' || d.category === selectedCategory;
    const matchesSearch =
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase()) ||
      (d.doctorName && d.doctorName.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full space-y-8 font-sans">
      {/* Page Title */}
      <div className="text-center pt-2">
        <h1 className="text-[28px] sm:text-[36px] font-black text-[#2B434C] font-display tracking-tight">
          Upload Documents
        </h1>
      </div>

      {/* Top Banner Card with + Upload New Document Button */}
      <div className="w-full bg-white rounded-[24px] sm:rounded-[28px] border border-[#EFE5DB] p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)]">
        <div className="space-y-3">
          {/* + Upload New Document Button */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white px-6 py-2.5 rounded-xl font-bold text-[14.5px] sm:text-[15.5px] shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <span className="text-lg leading-none">+</span>
            <span>Upload New Document</span>
          </button>

          {/* Subtext Instructions matching reference screenshot */}
          <p className="text-[12.5px] sm:text-[13.5px] text-[#64748B] leading-relaxed max-w-2xl font-medium">
            Please upload files less than <strong className="text-[#2B434C]">4 MB</strong>. If you are uploading multiple files, please check the total file size before uploading. To upload larger files, kindly contact customer support.
          </p>
        </div>
      </div>

      {/* Main Content: Empty State or Document Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium">
          Loading documents...
        </div>
      ) : filteredDocs.length === 0 ? (
        /* Pixel-Accurate "No documents found" Empty State */
        <div className="py-24 sm:py-32 flex flex-col items-center justify-center text-center">
          {/* Document Outline Icon */}
          <div className="text-[#94A3B8] mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 sm:w-9 sm:h-9">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <p className="text-[13.5px] sm:text-[14.5px] font-semibold text-[#8C9AA8]">
            No documents found
          </p>
        </div>
      ) : (
        /* Document Cards Grid */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold text-[#2B434C] font-display">
              Saved Documents ({filteredDocs.length})
            </h2>
            <div className="w-full sm:w-72">
              <input
                type="text"
                className="w-full bg-white border border-[#E9D5C2] rounded-xl px-4 py-2 text-sm text-[#2B434C] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#CAA067]/40"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-[#EDE2D5] p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[#2B434C] text-[14.5px] truncate" title={doc.title}>
                          {doc.title}
                        </h3>
                        <span className="text-[11.5px] text-[#8B9EA8]">
                          {formatFileSize(doc.sizeBytes)} &middot; {new Date(doc.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {doc.source === 'LOCAL' && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-slate-400 hover:text-red-600 p-1 text-xs"
                        title="Delete Document"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <span className="inline-block bg-[#FAF3EC] text-[#CAA067] text-[11px] font-bold px-2.5 py-1 rounded-md">
                    {doc.category}
                  </span>
                  {doc.notes && <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">{doc.notes}</p>}
                </div>

                <div className="pt-3 flex items-center gap-2 border-t border-[#F0E6DC]">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="flex-1 bg-[#FAF3EC] hover:bg-[#F2E5D8] text-[#2B434C] text-xs py-2 rounded-xl font-bold transition-colors"
                  >
                    Preview
                  </button>
                  <a
                    href={doc.fileUrl}
                    download={doc.title}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#CAA067] hover:bg-[#B88F55] text-white text-xs py-2 px-4 rounded-xl font-bold transition-colors text-center"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 border border-[#EDE2D5]"
            >
              <div className="flex items-center justify-between border-b border-[#F0E6DC] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center font-bold text-sm">
                    +
                  </div>
                  <h3 className="font-black text-[#2B434C] text-lg font-display">Upload Document</h3>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleUpload} className="space-y-4">
                {/* File Drop / Select Area */}
                <div>
                  <label className="block text-xs font-bold text-[#2B434C] mb-1.5">
                    Select File (Max 4 MB) *
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    required
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#FAF3EC] file:text-[#CAA067] hover:file:bg-[#F2E5D8] cursor-pointer border border-[#D5E2F0] rounded-xl p-2 bg-[#FAF3EC]/30"
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-[#2B434C] mb-1.5">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Blood Test CBC Report - Aug 2026"
                    className="w-full bg-[#FAF3EC]/30 border border-[#D5E2F0] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#2B434C] focus:outline-none focus:ring-2 focus:ring-[#CAA067]/40"
                  />
                </div>

                {/* Category & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#2B434C] mb-1.5">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-[#FAF3EC]/30 border border-[#D5E2F0] rounded-xl px-3 py-2 text-xs font-bold text-[#2B434C] focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#2B434C] mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      value={docDate}
                      onChange={(e) => setDocDate(e.target.value)}
                      className="w-full bg-[#FAF3EC]/30 border border-[#D5E2F0] rounded-xl px-3 py-2 text-xs font-bold text-[#2B434C] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-[#2B434C] mb-1.5">
                    Notes / Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Fasting blood sugar 110 mg/dL"
                    className="w-full bg-[#FAF3EC]/30 border border-[#D5E2F0] rounded-xl px-3.5 py-2 text-xs font-medium text-[#2B434C] focus:outline-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F0E6DC]">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !file}
                    className="bg-[#CAA067] hover:bg-[#B88F55] text-white px-6 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : 'Save Document'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col border border-[#EDE2D5]">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-[#2B434C] text-lg font-display">{previewDoc.title}</h3>
                <p className="text-xs text-slate-500">
                  {previewDoc.category} &middot; {new Date(previewDoc.uploadedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-[#FAF3EC]/30 rounded-2xl flex items-center justify-center min-h-[300px]">
              {previewDoc.fileUrl?.startsWith('data:image') || previewDoc.fileUrl?.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                <img src={previewDoc.fileUrl} alt={previewDoc.title} className="max-h-[60vh] object-contain rounded-lg shadow" />
              ) : (
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-[#2B434C]">{previewDoc.title}</h4>
                    <p className="text-xs text-slate-500">{formatFileSize(previewDoc.sizeBytes)}</p>
                  </div>
                  <a
                    href={previewDoc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#CAA067] hover:bg-[#B88F55] text-white text-xs py-2 px-5 rounded-full font-bold inline-flex"
                  >
                    Open Document in New Tab
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setPreviewDoc(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
                Close
              </button>
              <a
                href={previewDoc.fileUrl}
                download={previewDoc.title}
                target="_blank"
                rel="noreferrer"
                className="bg-[#CAA067] hover:bg-[#B88F55] text-white text-xs py-2 px-5 rounded-xl font-bold"
              >
                Download File
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
