import { Camera, Mic, Settings, ShieldAlert, X } from 'lucide-react';
import {
  getBrowserSiteSettingsSteps,
  type MediaRequestFailure,
} from '../services/mediaPermissionService';

interface CallPermissionModalProps {
  failure: MediaRequestFailure;
  partnerName: string;
  retrying: boolean;
  onEnablePermissions: () => void;
  onClose: () => void;
}

export function CallPermissionModal({
  failure,
  partnerName,
  retrying,
  onEnablePermissions,
  onClose,
}: CallPermissionModalProps) {
  const isVoiceOnly = failure.callType === 'audio';
  const guidance = getBrowserSiteSettingsSteps(failure.callType);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        isVoiceOnly
          ? 'Microphone permission required'
          : 'Camera and microphone permissions required'
      }
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#190F29] border border-purple-950/15 dark:border-white/15 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-[#6B21A8] dark:text-purple-200 flex items-center justify-center shrink-0">
              {isVoiceOnly ? (
                <Mic className="w-5 h-5" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#2E1065] dark:text-white truncate">
                {isVoiceOnly
                  ? 'Microphone Access Required'
                  : 'Camera & Microphone Required'}
              </h2>
              <p className="text-xs text-purple-950/65 dark:text-purple-200/70 truncate">
                {isVoiceOnly ? 'Voice call' : 'Video call'} with {partnerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close permission dialog"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-purple-950/60 dark:text-purple-200/70 hover:bg-purple-50 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-700/40 p-3.5 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-100 leading-relaxed">
              {failure.message}
            </p>
          </div>

          <div className="rounded-xl bg-purple-50/75 dark:bg-white/5 border border-purple-950/10 dark:border-white/10 p-3.5 space-y-2">
            <p className="text-xs font-bold text-[#2E1065] dark:text-purple-100 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-[#6B21A8] dark:text-purple-300 shrink-0" />
              <span>How to enable in {guidance.browserLabel}:</span>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-purple-950/80 dark:text-purple-200/85 leading-relaxed">
              {guidance.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-purple-950/15 dark:border-white/15 text-xs sm:text-sm font-semibold text-[#2E1065] dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={retrying}
              onClick={onEnablePermissions}
              className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#2E1065] to-[#6B21A8] hover:opacity-95 disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm inline-flex items-center justify-center gap-2"
            >
              {isVoiceOnly ? (
                <Mic className="w-4 h-4" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              <span>
                {retrying ? 'Requesting Access...' : 'Enable Permissions'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
