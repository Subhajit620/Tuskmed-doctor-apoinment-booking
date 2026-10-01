import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setAccount(res.data.account);
      setPatients(res.data.patients || []);
    } catch {
      setAccount(null);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setAccount(null);
    setPatients([]);
  }, []);

  const switchActivePatient = useCallback(async (patientId) => {
    const res = await api.patch('/patients/active', { patientId });
    setAccount((prev) => (prev ? { ...prev, activePatientId: res.data.activePatientId } : prev));
    return res.data;
  }, []);

  const addPatient = useCallback((patient) => {
    setPatients((prev) => [...prev, patient]);
  }, []);

  const activePatient = useMemo(
    () => patients.find((p) => p.id === account?.activePatientId) || patients[0] || null,
    [patients, account]
  );

  const value = useMemo(
    () => ({ account, setAccount, patients, setPatients, addPatient, activePatient, switchActivePatient, loading, refresh, logout }),
    [account, setAccount, patients, addPatient, activePatient, switchActivePatient, loading, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
