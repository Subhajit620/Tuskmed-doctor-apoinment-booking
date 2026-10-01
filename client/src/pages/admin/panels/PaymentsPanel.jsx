import { useEffect, useState } from 'react';
import api from '../../../api/client';

export default function PaymentsPanel() {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    api.get('/admin/payments').then((res) => setPayments(res.data.payments));
  }, []);

  return (
    <div className="card">
      <h2 className="font-semibold mb-3">Payments ({payments.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200">
              <th className="py-2">Patient</th>
              <th>Doctor</th>
              <th>Amount</th>
              <th>Promo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2">{p.appointment?.patient?.name}</td>
                <td>{p.appointment?.doctor?.name}</td>
                <td>₹{Number(p.amount).toFixed(2)}</td>
                <td>{p.promo?.code || '—'}</td>
                <td><span className="badge bg-slate-100 text-slate-600">{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
