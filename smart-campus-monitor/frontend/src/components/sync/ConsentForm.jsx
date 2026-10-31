import { useState } from 'react';
import toast from 'react-hot-toast';
import { recordConsentApi } from '../../services/api';
import { btnPrimary, errorMessage, input } from './syncUi';

/** Record biometric consent (DPDP Act 2023; parent/guardian for under-18s). */
export default function ConsentForm({ studentId, onSaved }) {
  const [form, setForm] = useState({ isMinor: true, givenBy: 'parent', giverName: '', giverContact: '', method: 'paper', documentRef: '', noticeVersion: '' });
  const [saving, setSaving] = useState(false);
  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'isMinor' && value && next.givenBy === 'self') next.givenBy = 'parent';
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await recordConsentApi(studentId, form);
      toast.success('Consent recorded');
      onSaved?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-medium text-amber-800 dark:text-amber-200">
        No biometric consent on record. Enrolment is blocked until consent is recorded.
      </p>
      <label className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
        <input type="checkbox" checked={form.isMinor} onChange={update('isMinor')} />
        Student is under 18 (parent or guardian must consent)
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={input} value={form.givenBy} onChange={update('givenBy')}>
          {!form.isMinor && <option value="self">Given by the student</option>}
          <option value="parent">Given by parent</option>
          <option value="guardian">Given by lawful guardian</option>
        </select>
        <input className={input} required placeholder="Name of person consenting" value={form.giverName} onChange={update('giverName')} />
        <input className={input} placeholder="Contact (optional)" value={form.giverContact} onChange={update('giverContact')} />
        <select className={input} value={form.method} onChange={update('method')}>
          <option value="paper">Signed paper form</option>
          <option value="electronic">Electronic</option>
        </select>
        <input className={input} placeholder="Form / file reference" value={form.documentRef} onChange={update('documentRef')} />
        <input className={input} placeholder="Notice version (e.g. v1.0)" value={form.noticeVersion} onChange={update('noticeVersion')} />
      </div>
      <button type="submit" className={btnPrimary} disabled={saving || !form.giverName.trim()}>
        {saving ? 'Saving…' : 'Record consent'}
      </button>
    </form>
  );
}
