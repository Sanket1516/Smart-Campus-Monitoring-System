import { useState } from 'react';

export default function SettingsAcademicTab({ settings, setSettings, saving, onSave }) {
  const [departmentDraft, setDepartmentDraft] = useState('');
  const [holidayDraft, setHolidayDraft] = useState({ name: '', date: '' });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Academic Settings</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Academic Year</label>
            <input type="text" value={settings.academicYear || ''} onChange={(e) => setSettings((current) => ({ ...current, academicYear: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="2026-2027" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">SAP ID Format Rule</label>
            <input type="text" value={settings.sapIdFormatRule || ''} onChange={(e) => setSettings((current) => ({ ...current, sapIdFormatRule: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="^\\d{11}$" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Semester Start Date</label>
            <input type="date" value={settings.semesterStartDate || ''} onChange={(e) => setSettings((current) => ({ ...current, semesterStartDate: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Semester End Date</label>
            <input type="date" value={settings.semesterEndDate || ''} onChange={(e) => setSettings((current) => ({ ...current, semesterEndDate: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Departments</h3>
        <div className="mt-4 flex gap-3">
          <input value={departmentDraft} onChange={(e) => setDepartmentDraft(e.target.value)} placeholder="Add department" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => {
              if (!departmentDraft.trim()) return;
              setSettings((current) => ({
                ...current,
                departments: Array.from(new Set([...(current.departments || []), departmentDraft.trim()])),
              }));
              setDepartmentDraft('');
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Add
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(settings.departments || []).map((department) => (
            <span key={department} className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">
              {department}
              <button type="button" onClick={() => setSettings((current) => ({ ...current, departments: (current.departments || []).filter((item) => item !== department) }))}>x</button>
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Holiday Calendar</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr,180px,auto]">
          <input value={holidayDraft.name} onChange={(e) => setHolidayDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Holiday name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input type="date" value={holidayDraft.date} onChange={(e) => setHolidayDraft((current) => ({ ...current, date: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => {
              if (!holidayDraft.name.trim() || !holidayDraft.date) return;
              setSettings((current) => ({
                ...current,
                holidayCalendar: [...(current.holidayCalendar || []), { name: holidayDraft.name.trim(), date: holidayDraft.date }],
              }));
              setHolidayDraft({ name: '', date: '' });
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Add Holiday
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {(settings.holidayCalendar || []).map((holiday, index) => (
            <div key={`${holiday.name}-${holiday.date}-${index}`} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm">
              <span className="font-medium text-gray-700">{holiday.name} - {holiday.date}</span>
              <button type="button" onClick={() => setSettings((current) => ({ ...current, holidayCalendar: (current.holidayCalendar || []).filter((_, itemIndex) => itemIndex !== index) }))} className="text-red-600 hover:text-red-700">Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button type="button" onClick={onSave} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
            Save Academic Settings
          </button>
        </div>
      </div>
    </div>
  );
}
