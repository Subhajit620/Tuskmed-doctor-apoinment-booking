import { useEffect, useState } from 'react';
import api from '../../../api/client';

export default function ConfigPanel() {
  const [config, setConfig] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/admin/config').then((res) => setConfig(res.data.config));
  }, []);

  const update = (key, field, value) => {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const save = async (key) => {
    await api.put(`/admin/config/${key}`, { value: config[key] });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const otp = config.otp_settings || {};
  const policies = config.policies || {};

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card space-y-3">
        <h2 className="font-semibold">OTP settings</h2>
        <div>
          <label className="label">Expiry (minutes)</label>
          <input className="input" type="number" value={otp.expiryMinutes ?? ''} onChange={(e) => update('otp_settings', 'expiryMinutes', Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Resend cooldown (seconds)</label>
          <input className="input" type="number" value={otp.resendCooldownSeconds ?? ''} onChange={(e) => update('otp_settings', 'resendCooldownSeconds', Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Max attempts</label>
          <input className="input" type="number" value={otp.maxAttempts ?? ''} onChange={(e) => update('otp_settings', 'maxAttempts', Number(e.target.value))} />
        </div>
        <button className="btn-primary" onClick={() => save('otp_settings')}>Save OTP settings</button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Policy links</h2>
        <div>
          <label className="label">Privacy policy URL</label>
          <input className="input" value={policies.privacyPolicyUrl ?? ''} onChange={(e) => update('policies', 'privacyPolicyUrl', e.target.value)} />
        </div>
        <div>
          <label className="label">Terms URL</label>
          <input className="input" value={policies.termsUrl ?? ''} onChange={(e) => update('policies', 'termsUrl', e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => save('policies')}>Save policies</button>
      </div>
      {saved && <div className="text-sm text-green-600">Saved.</div>}
    </div>
  );
}
