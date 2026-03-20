import { useState, useCallback, useEffect, useRef } from 'react';
import BarcodeScanner from '../components/BarcodeScanner';
import OcrScanner from '../components/OcrScanner';
import { createVisitorEntryApi, getVisitorEntriesApi, processScanApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineCamera,
  HiOutlinePause,
  HiOutlineUserAdd,
  HiOutlineOfficeBuilding,
  HiOutlineClock,
} from 'react-icons/hi';
import { getCategoryLabel } from '../utils/studentOptions';
import entryBeepUrl from '../assets/entry-single-beep.wav';
import exitBeepUrl from '../assets/exit-double-beep.wav';
import unauthorizedWarningUrl from '../assets/unauthorized-access-warning.wav';

const createInitialVisitorForm = () => ({
  visitorName: '',
  phoneNumber: '',
  personToMeet: '',
  meetingReason: '',
  organization: '',
  idProof: '',
  remarks: '',
});

const AUDIO_FILES = {
  entry: entryBeepUrl,
  exit: exitBeepUrl,
  unauthorized: unauthorizedWarningUrl,
};

export default function Scanner() {
  const [scanning, setScanning] = useState(true);
  const [mode, setMode] = useState('barcode'); // barcode | ocr
  const [lastScan, setLastScan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [visitorForm, setVisitorForm] = useState(createInitialVisitorForm);
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [recentVisitors, setRecentVisitors] = useState([]);
  const [audioReady, setAudioReady] = useState(false);
  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef({});

  const loadVisitors = useCallback(async () => {
    try {
      const res = await getVisitorEntriesApi({ limit: 5 });
      setRecentVisitors(res.data.visitors || []);
    } catch (err) {
      console.error('Visitor load error:', err);
    }
  }, []);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  useEffect(() => {
    let cancelled = false;

    const loadAudioBuffers = async () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          console.warn('Web Audio API is not supported in this browser.');
          return;
        }

        const context = new AudioContextClass();
        audioContextRef.current = context;

        const entries = await Promise.all(
          Object.entries(AUDIO_FILES).map(async ([key, url]) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
            return [key, buffer];
          })
        );

        if (!cancelled) {
          audioBuffersRef.current = Object.fromEntries(entries);
        }
      } catch (err) {
        console.error('Audio buffer load failed:', err);
      }
    };

    void loadAudioBuffers();

    return () => {
      cancelled = true;
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  const unlockAudio = useCallback(async () => {
    const context = audioContextRef.current;
    if (!context) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
      setAudioReady(true);
    } catch (err) {
      console.warn('Audio unlock failed:', err);
    }
  }, []);

  useEffect(() => {
    void unlockAudio();

    const tryUnlock = () => {
      void unlockAudio();
    };

    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock);
    window.addEventListener('touchstart', tryUnlock, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
      window.removeEventListener('touchstart', tryUnlock);
    };
  }, [unlockAudio]);

  const playSound = useCallback(async (soundKey) => {
    const context = audioContextRef.current;
    const buffer = audioBuffersRef.current[soundKey];
    if (!context || !buffer) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
      setAudioReady(true);
    } catch (err) {
      console.error('Sound playback failed:', err);
    }
  }, []);

  const enableScannerAudio = useCallback(async (nextMode = null) => {
    await unlockAudio();
    if (nextMode) {
      setMode(nextMode);
    }
    setScanning(true);
  }, [unlockAudio]);

  const handleScan = useCallback(
    async (sapId) => {
      if (processing) return;

      setProcessing(true);
      try {
        const res = await processScanApi(sapId);
        setLastScan(res.data);

        if (res.data.authorized) {
          const isEntry = res.data.action === 'entry';
          const action = isEntry ? 'ENTRY recorded' : 'EXIT recorded';
          await playSound(isEntry ? 'entry' : 'exit');
          toast.success(`${res.data.student.name} - ${action}`);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setLastScan(err.response.data);
          await playSound('unauthorized');
          toast.error('UNAUTHORIZED ID scanned!');
        } else {
          toast.error('Scan failed: ' + (err.response?.data?.message || err.message));
        }
      } finally {
        setTimeout(() => setProcessing(false), 2000);
      }
    },
    [playSound, processing]
  );

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleScan(manualInput.trim());
      setManualInput('');
    }
  };

  const handleVisitorChange = (field, value) => {
    setVisitorForm((current) => ({ ...current, [field]: value }));
  };

  const handleVisitorSubmit = async (e) => {
    e.preventDefault();
    setAddingVisitor(true);

    try {
      const res = await createVisitorEntryApi(visitorForm);
      toast.success('Visitor entry recorded');
      setVisitorForm(createInitialVisitorForm());
      setRecentVisitors((current) => [res.data.visitor, ...current].slice(0, 5));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save visitor entry');
    } finally {
      setAddingVisitor(false);
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
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                void enableScannerAudio('barcode');
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'barcode' ? 'bg-white shadow text-primary-700' : 'text-gray-600'
              }`}
            >
              Barcode
            </button>
            <button
              onClick={() => {
                void enableScannerAudio('ocr');
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'ocr' ? 'bg-white shadow text-yellow-700' : 'text-gray-600'
              }`}
            >
              Read Number
            </button>
          </div>

          <button
            onClick={() => {
              if (!scanning) {
                void enableScannerAudio();
                return;
              }
              setScanning(false);
            }}
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
        {!audioReady && (
          <p className="mt-3 text-center text-xs text-amber-600">
            Sound is preparing. If your browser blocks autoplay, your first tap anywhere will enable it.
          </p>
        )}

        {mode === 'ocr' && (
          <p className="mt-3 text-sm text-gray-500 text-center">
            Point the camera at the teal strip with the SAP ID - auto-scans every 2s, or click
            the button
          </p>
        )}
      </div>

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <HiOutlineUserAdd className="w-5 h-5 text-primary-600" />
              Visitor Entry
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Record walk-in visitors coming for meetings, office work, or deliveries.
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Saved entries are timestamped automatically at the gate.
          </div>
        </div>

        <form onSubmit={handleVisitorSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Visitor Name</label>
            <input
              type="text"
              value={visitorForm.visitorName}
              onChange={(e) => handleVisitorChange('visitorName', e.target.value)}
              placeholder="Enter full name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Phone Number</label>
            <input
              type="tel"
              value={visitorForm.phoneNumber}
              onChange={(e) => handleVisitorChange('phoneNumber', e.target.value)}
              placeholder="Enter contact number"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Person To Meet</label>
            <input
              type="text"
              value={visitorForm.personToMeet}
              onChange={(e) => handleVisitorChange('personToMeet', e.target.value)}
              placeholder="Faculty, office, or student name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Meeting Reason</label>
            <input
              type="text"
              value={visitorForm.meetingReason}
              onChange={(e) => handleVisitorChange('meetingReason', e.target.value)}
              placeholder="Admission, meeting, delivery, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Organization</label>
            <input
              type="text"
              value={visitorForm.organization}
              onChange={(e) => handleVisitorChange('organization', e.target.value)}
              placeholder="Company or institution"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">ID Proof</label>
            <input
              type="text"
              value={visitorForm.idProof}
              onChange={(e) => handleVisitorChange('idProof', e.target.value)}
              placeholder="Aadhaar, PAN, license, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">Remarks</label>
            <textarea
              value={visitorForm.remarks}
              onChange={(e) => handleVisitorChange('remarks', e.target.value)}
              placeholder="Extra notes for gate security"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={addingVisitor}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-60"
            >
              {addingVisitor ? 'Saving...' : 'Save Visitor Entry'}
            </button>
          </div>
        </form>

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 mb-3 text-gray-700">
            <HiOutlineClock className="w-5 h-5 text-primary-600" />
            <h4 className="font-medium">Recent Visitor Entries</h4>
          </div>
          {recentVisitors.length === 0 ? (
            <p className="text-sm text-gray-400">No visitor entries recorded today.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentVisitors.map((visitor) => (
                <div
                  key={visitor._id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800">{visitor.visitorName}</p>
                      <p className="text-gray-500">{visitor.phoneNumber}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(visitor.checkInTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-gray-600">
                    <p>
                      <span className="font-medium text-gray-700">Meeting:</span>{' '}
                      {visitor.personToMeet}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Reason:</span>{' '}
                      {visitor.meetingReason}
                    </p>
                    {visitor.organization && (
                      <p className="flex items-center gap-1">
                        <HiOutlineOfficeBuilding className="w-4 h-4" />
                        <span>{visitor.organization}</span>
                      </p>
                    )}
                    {visitor.idProof && (
                      <p>
                        <span className="font-medium text-gray-700">ID:</span> {visitor.idProof}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lastScan && (
        <div
          className={`rounded-xl shadow-sm border-2 p-6 ${
            lastScan.authorized ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
          }`}
        >
          {lastScan.authorized ? (
            <div className="flex items-start gap-4">
              <HiOutlineCheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-green-800">{lastScan.student.name}</h3>
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
                  <p>
                    <span className="font-medium">SAP ID:</span> {lastScan.student.sapId}
                  </p>
                  <p>
                    <span className="font-medium">Category:</span>{' '}
                    {getCategoryLabel(lastScan.student.category)}
                  </p>
                  <p>
                    <span className="font-medium">Department:</span> {lastScan.student.department}
                  </p>
                  <p>
                    <span className="font-medium">Year:</span> {lastScan.student.year}
                  </p>
                  {lastScan.log.entryTime && (
                    <p>
                      <span className="font-medium">Entry:</span>{' '}
                      {new Date(lastScan.log.entryTime).toLocaleTimeString()}
                    </p>
                  )}
                  {lastScan.log.exitTime && (
                    <p>
                      <span className="font-medium">Exit:</span>{' '}
                      {new Date(lastScan.log.exitTime).toLocaleTimeString()}
                    </p>
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
