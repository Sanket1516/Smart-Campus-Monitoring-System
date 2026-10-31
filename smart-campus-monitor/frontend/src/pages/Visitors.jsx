import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { getVisitorEntriesApi } from '../services/api';
import PageHeader from '../components/brand/PageHeader';

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Visitor register (read view). New visitors are registered from the Gate Scanner. */
export default function Visitors() {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ visitors: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVisitorEntriesApi({ date, page, limit: 25 });
      setData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load visitors');
    } finally {
      setLoading(false);
    }
  }, [date, page]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data.visitors.filter((v) =>
    [v.visitorName, v.personToMeet, v.organization, v.meetingReason].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Visitor register"
        title="Every Guest. Logged at the Gate."
        description="Visitors registered by security at the gate scanner. Pick a day to review who came in, whom they met and why."
        motif="aurora"
        actions={
          <Link to="/scanner" className="btn-accent">
            Register a visitor
          </Link>
        }
        aside={
          <div className="text-right">
            <div className="metric text-5xl text-white">{data.total}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">visitors on {date}</div>
          </div>
        }
      />
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <label className="text-sm text-ink-300" htmlFor="visitor-date">
            Date
          </label>
          <input
            id="visitor-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this page by name, host, organisation…"
            className="min-w-[220px] flex-1 rounded-lg border px-3 py-2 text-sm"
            aria-label="Filter visitors"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                {['Visitor', 'Phone', 'Meeting', 'Reason', 'Organisation', 'ID proof', 'Check-in'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-400">
                    No visitors recorded for this day.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((v) => (
                  <tr key={v._id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{v.visitorName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-200">{v.phoneNumber}</td>
                    <td className="px-4 py-3 text-ink-200">{v.personToMeet}</td>
                    <td className="px-4 py-3 text-ink-200">{v.meetingReason}</td>
                    <td className="px-4 py-3 text-ink-200">{v.organization || '—'}</td>
                    <td className="px-4 py-3 text-ink-200">{v.idProof || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-200">
                      {v.checkInTime ? new Date(v.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data.pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-white/5 p-3 text-sm">
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="font-mono text-xs text-ink-300">
              {page} / {data.pages}
            </span>
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
