import { MailCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function EmailVerificationBanner() {
  const { user, resendVerificationEmail, refreshVerificationState } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await resendVerificationEmail();
      setNotice('Verification email sent. Check your inbox and spam folder.');
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : 'Could not resend email right now.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const verified = await refreshVerificationState();
      if (!verified) {
        setNotice(
          'Your email is not marked verified yet. Click the link in your inbox, then tap Refresh.'
        );
      }
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Could not refresh status. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-purple-950 text-white border-b border-pink-500/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 text-sm">
          <MailCheck className="w-5 h-5 text-pink-300 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <p className="font-semibold">
              Verify your email to unlock likes and private messaging
            </p>
            {notice && <p className="text-xs text-pink-200 mt-0.5">{notice}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleResend}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Resend Email
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleRefresh}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>I Verified — Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
}
