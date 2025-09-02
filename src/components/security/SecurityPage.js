import React, { useCallback, useMemo, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const SecurityPage = () => {
  const [scanText, setScanText] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); // { valid:boolean, reason?:string, data?:object }

  const handleQrResult = useCallback(async (qrText) => {
    const text = typeof qrText === 'string' ? qrText : (qrText?.text || '');
    if (!text || text === scanText) return; // avoid duplicate processing

    setScanText(text);
    setVerifying(true);
    setResult(null);

    try {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        setResult({ valid: false, reason: 'Invalid QR payload (not JSON)' });
        setVerifying(false);
        return;
      }

      const { leaveId, studentId } = payload || {};
      if (!leaveId) {
        setResult({ valid: false, reason: 'Missing leaveId in QR payload' });
        setVerifying(false);
        return;
      }

      const ref = doc(db, 'leaveRequests', leaveId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setResult({ valid: false, reason: 'Leave not found' });
        setVerifying(false);
        return;
      }

      const data = snap.data();
      const approved = data.status === 'approved';

      // Student ref check (optional, only if studentId present in QR)
      const matchesStudent = studentId
        ? (data.studentId && data.studentId.id === studentId)
        : true;

      if (approved && matchesStudent) {
        setResult({
          valid: true,
          data: {
            leaveId,
            studentId: data.studentId?.id || '-',
            status: data.status,
            studentName: data.studentName || '-',
            leaveType: data.leaveType || '-',
            startDate: data.startDate,
            endDate: data.endDate,
            destination: data.destination || '-',
          },
        });
      } else if (!approved) {
        setResult({ valid: false, reason: `Leave is ${data.status}` });
      } else {
        setResult({ valid: false, reason: 'Student mismatch' });
      }
    } catch (err) {
      console.error('QR verify error:', err);
      setResult({ valid: false, reason: 'Unexpected error during verification' });
    } finally {
      setVerifying(false);
    }
  }, [scanText]);

  const statusBlock = useMemo(() => {
    if (verifying) {
      return (
        <div className="mt-4 text-gray-600">Verifying...</div>
      );
    }
    if (!result) return null;
    if (result.valid) {
      const d = result.data;
      const fmt = (v) => {
        const dt = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
        return dt && !isNaN(dt.getTime()) ? dt.toLocaleString() : '-';
      };
      return (
        <div className="mt-4 p-4 border border-green-300 bg-green-50 rounded">
          <div className="text-green-700 font-semibold mb-2">Valid Leave</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-600">Leave ID:</span> <span className="font-mono">{d.leaveId}</span></div>
            <div><span className="text-gray-600">Student ID:</span> <span className="font-mono">{d.studentId}</span></div>
            <div><span className="text-gray-600">Type:</span> {d.leaveType}</div>
            <div><span className="text-gray-600">Destination:</span> {d.destination}</div>
            <div><span className="text-gray-600">From:</span> {fmt(d.startDate)}</div>
            <div><span className="text-gray-600">To:</span> {fmt(d.endDate)}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-4 p-4 border border-red-300 bg-red-50 rounded">
        <div className="text-red-700 font-semibold">Invalid Leave</div>
        <div className="text-sm text-gray-700 mt-1">{result.reason}</div>
      </div>
    );
  }, [result, verifying]);

  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Security Verification</h1>
        <p className="text-sm text-gray-600 mb-4">Scan a student's approved leave QR to validate authenticity.</p>

        <div className="bg-white rounded shadow p-4">
          <div className="w-full max-w-md mx-auto">
            <Scanner
              onScan={(text) => {
                if (text) handleQrResult(text);
              }}
              onError={() => { /* ignore noisy scan errors */ }}
              components={{
                audio: false,
              }}
              style={{ width: '100%' }}
            />
          </div>
          {statusBlock}
        </div>

        {scanText && (
          <div className="mt-4">
            <div className="text-xs text-gray-500">Last scanned payload:</div>
            <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto border">{scanText}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityPage;
