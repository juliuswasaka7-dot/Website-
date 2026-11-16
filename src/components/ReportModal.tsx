import { AlertTriangle, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { submitSafetyReport } from '../services/datingService';
import type { ReportCategory } from '../types/app';

interface ReportModalProps {
  reporterUid: string;
  reportedUid: string;
  reportedName: string;
  contextType: 'profile' | 'message' | 'photo';
  contextId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'scam_money', label: 'Romance scam or request for money' },
  { value: 'inappropriate_photo', label: 'Inappropriate or offensive photo' },
  { value: 'harassment', label: 'Harassment, threats, or abusive language' },
  { value: 'fake_profile', label: 'Impersonation or fake profile' },
  { value: 'underage', label: 'Suspected user under 18' },
  { value: 'other', label: 'Other safety concern' },
];

export function ReportModal({
  reporterUid,
  reportedUid,
  reportedName,
  contextType,
  contextId,
  onClose,
  onSubmitted,
}: ReportModalProps) {
  const [category, setCategory] = useState<ReportCategory>('scam_money');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (details.trim().length < 5) {
      setError('Please describe what happened (at least 5 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitSafetyReport({
        reporterUid,
        reportedUid,
        category,
        contextType,
        contextId,
        details,
      });
      onSubmitted();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not submit report. Please verify your email and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 bg-[#1A0A26]/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white dark:bg-[#190F29] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-purple-950/10 dark:border-white/10 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5 text-purple-950 dark:text-purple-50">
            <AlertTriangle className="w-5 h-5 text-pink-600 dark:text-pink-400 shrink-0" />
            <h3 id="report-modal-title" className="text-lg font-bold">
              Report {reportedName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-purple-950/60 dark:text-purple-200/70 hover:bg-purple-50 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-purple-950/75 dark:text-purple-200/80 mb-4">
          Your report goes directly to the FIND YOUR LOVE moderation team. Reported members are never told who submitted a report.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="report-category"
              className="block text-sm font-semibold text-purple-950 dark:text-purple-100 mb-1.5"
            >
              Reason for report
            </label>
            <select
              id="report-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 dark:border-white/15 px-3 py-2 text-sm text-purple-950 dark:text-white bg-white dark:bg-[#24163B] focus:outline-none focus:ring-2 focus:ring-purple-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-details"
              className="block text-sm font-semibold text-purple-950 dark:text-purple-100 mb-1.5"
            >
              Details
            </label>
            <textarea
              id="report-details"
              rows={4}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Explain what occurred (e.g. asked for money, inappropriate photo, fake identity)..."
              className="w-full rounded-xl border border-purple-950/20 dark:border-white/15 px-3 py-2.5 text-sm text-purple-950 dark:text-white bg-white dark:bg-[#24163B] placeholder:text-purple-950/40 dark:placeholder:text-purple-200/45 focus:outline-none focus:ring-2 focus:ring-purple-700"
              required
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 dark:border-white/20 text-sm font-semibold text-purple-950 dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
