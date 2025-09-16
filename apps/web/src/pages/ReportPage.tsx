import { useEffect, useMemo, useState } from 'react';

import type { IntegrityReport, ProctorEvent, ReportCountsByType } from '@focus-proctor/types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { getReport, getSession } from '../lib/api';

interface ReportPageProps {
  sessionId: string;
}

const toCsv = (events: ProctorEvent[]) => {
  const header = ['id', 'ts', 'type', 'duration'];
  const rows = events.map((e) => [e.id, e.ts, e.type, e.duration ?? '']);
  const lines = [header.join(','), ...rows.map((r) => r.join(','))];
  return new Blob([lines.join('\n')], { type: 'text/csv' });
};

const ReportPage = ({ sessionId }: ReportPageProps) => {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [counts, setCounts] = useState<ReportCountsByType | null>(null);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [candidateName, setCandidateName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, s] = await Promise.all([getReport(sessionId), getSession(sessionId)]);
        if (cancelled) return;
        setReport(r);
        setCounts(r.countsByType);
        setEvents(s.events);
        setCandidateName(s.candidateName);
      } catch (e) {
        // noop minimal error handling
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleExportCsv = () => {
    const blob = toCsv(events);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-report-${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ report, events }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-report-${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const durationText = useMemo(() => {
    if (!report) return '';
    const seconds = Math.round(report.durationMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }, [report]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 print:bg-white print:text-black">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Proctoring Report</h1>
            <p className="text-sm text-slate-400">Session: {sessionId}</p>
            <p className="text-sm text-slate-400">Candidate: {candidateName}</p>
          </div>
          {report && (
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">
                Integrity: {report.integrityScore}
              </span>
              <button className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={handleExportCsv}>
                Export CSV
              </button>
              <button className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={handleExportJson}>
                Export JSON
              </button>
              <button
                className="rounded bg-slate-800 px-3 py-1 text-sm"
                onClick={() => window.print()}
              >
                Print PDF
              </button>
            </div>
          )}
        </header>

        {report ? (
          <section className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 p-4 md:col-span-1">
              <h2 className="mb-2 text-sm font-medium text-slate-300">Summary</h2>
              <ul className="text-sm">
                <li>Duration: {durationText}</li>
                <li>LookingAway: {counts?.LookingAway ?? 0}</li>
                <li>NoFace: {counts?.NoFace ?? 0}</li>
                <li>MultipleFaces: {counts?.MultipleFaces ?? 0}</li>
                <li>PhoneDetected: {counts?.PhoneDetected ?? 0}</li>
                <li>NotesDetected: {counts?.NotesDetected ?? 0}</li>
                <li>ExtraDeviceDetected: {counts?.ExtraDeviceDetected ?? 0}</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-800 p-4 md:col-span-2">
              <h2 className="mb-2 text-sm font-medium text-slate-300">Focus timeline</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={report.timeline}
                    margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="ts"
                      tickFormatter={(v) => new Date(v as number).toLocaleTimeString()}
                      stroke="#94a3b8"
                    />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(v) => new Date(v as number).toLocaleTimeString()}
                      formatter={(value) => [String(value), 'Score']}
                    />
                    <Line type="monotone" dataKey="score" stroke="#22c55e" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-slate-800 p-6 text-sm text-slate-400">
            Loading…
          </div>
        )}

        <section className="rounded-xl border border-slate-800 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Events</h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="p-2">Time</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Duration</th>
                  <th className="p-2">Thumb</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-slate-800">
                    <td className="p-2">{new Date(e.ts).toLocaleTimeString()}</td>
                    <td className="p-2">{e.type}</td>
                    <td className="p-2">{e.duration ?? '-'}</td>
                    <td className="p-2">
                      {e.frameThumb ? (
                        <img
                          src={e.frameThumb}
                          alt="thumb"
                          className="h-10 w-16 rounded object-cover"
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};

export default ReportPage;
