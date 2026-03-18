import { useState, useCallback } from 'react';
import BarcodeScanner from '../components/BarcodeScanner';
import OcrScanner from '../components/OcrScanner';
import { processScanApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineCamera,
  HiOutlinePause,
} from 'react-icons/hi';
import { getCategoryLabel } from '../utils/studentOptions';

export default function Scanner() {
  const [scanning, setScanning] = useState(true);
  const [mode, setMode] = useState('barcode'); // barcode | ocr
  const [lastScan, setLastScan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const handleScan = useCallback(
    async (sapId) => {
      if (processing) return;

      setProcessing(true);
      try {
        const res = await processScanApi(sapId);
        setLastScan(res.data);

        if (res.data.authorized) {
          const action = res.data.action === 'entry' ? 'ENTRY recorded' : 'EXIT recorded';
          toast.success(`${res.data.student.name} — ${action}`);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setLastScan(err.response.data);
          toast.error('UNAUTHORIZED ID scanned!');
        } else {
          toast.error('Scan failed: ' + (err.response?.data?.message || err.message));
        }
      } finally {
        setTimeout(() => setProcessing(false), 2000);
      }
    },
    [processing]
  );

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleScan(manualInput.trim());
      setManualInput('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gate Scanner</h1>
          <p className="text-gray-500">Scan student ID card barcode or printed number</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setMode('barcode'); setScanning(true); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'barcode' ? 'bg-white shadow text-primary-700' : 'text-gray-600'
              }`}
            >
              Barcode
            </button>
            <button
              onClick={() => { setMode('ocr'); setScanning(true); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'ocr' ? 'bg-white shadow text-yellow-700' : 'text-gray-600'
              }`}
            >
              Read Number
            </button>
          </div>

          <button
            onClick={() => setScanning(!scanning)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              scanning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {scanning ? (
              <>
                <HiOutlinePause className="w-5 h-5" /> Pause
              </>
            ) : (
              <>
                <HiOutlineCamera className="w-5 h-5" /> Start
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scanner area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        {mode === 'barcode' ? (
          <BarcodeScanner onScan={handleScan} enabled={scanning} />
        ) : (
          <OcrScanner onScan={handleScan} enabled={scanning} />
        )}
        {processing && (
          <div className="mt-3 text-center text-primary-600 font-medium animate-pulse">
            Processing scan...
          </div>
        )}

        {mode === 'ocr' && (
          <p className="mt-3 text-sm text-gray-500 text-center">
            Point the camera at the teal strip with the SAP ID — auto-scans every 2s, or click the button
          </p>
        )}
      </div>

      {/* Manual Input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="font-medium text-gray-700 mb-3">Manual Entry</h3>
        <form onSubmit={handleManualSubmit} className="flex gap-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Enter SAP ID manually"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={processing}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-60"
          >
            Submit
          </button>
        </form>
      </div>

      {/* Scan Result */}
      {lastScan && (
        <div
          className={`rounded-xl shadow-sm border-2 p-6 ${
            lastScan.authorized
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          }`}
        >
          {lastScan.authorized ? (
            <div className="flex items-start gap-4">
              <HiOutlineCheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-green-800">
                    {lastScan.student.name}
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      lastScan.action === 'entry'
                        ? 'bg-green-200 text-green-800'
                        : 'bg-blue-200 text-blue-800'
                    }`}
                  >
                    {lastScan.action === 'entry' ? 'ENTRY' : 'EXIT'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
                  <p><span className="font-medium">SAP ID:</span> {lastScan.student.sapId}</p>
                  <p><span className="font-medium">Category:</span> {getCategoryLabel(lastScan.student.category)}</p>
                  <p><span className="font-medium">Department:</span> {lastScan.student.department}</p>
                  <p><span className="font-medium">Year:</span> {lastScan.student.year}</p>
                  {lastScan.log.entryTime && (
                    <p><span className="font-medium">Entry:</span> {new Date(lastScan.log.entryTime).toLocaleTimeString()}</p>
                  )}
                  {lastScan.log.exitTime && (
                    <p><span className="font-medium">Exit:</span> {new Date(lastScan.log.exitTime).toLocaleTimeString()}</p>
                  )}
                </div>
                {lastScan.log.lateReturn && (
                  <p className="mt-2 text-red-600 font-medium">Late return detected!</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <HiOutlineExclamationCircle className="w-12 h-12 text-red-600 flex-shrink-0 animate-pulse" />
              <div>
                <h3 className="text-xl font-bold text-red-800">UNAUTHORIZED SCAN</h3>
                <p className="text-red-700 mt-1">
                  Scanned value: <span className="font-mono font-bold">{lastScan.scannedValue}</span>
                </p>
                <p className="text-red-600 text-sm mt-1">
                  This ID is not registered in the system. Admin has been notified.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
