import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Laptop,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  usePWAInstall,
  type BrowserEngine,
  type DeviceOS,
} from '../hooks/usePWAInstall';
import { copyUrlToClipboard, getPublicWebsiteUrl } from '../lib/share';

interface InstallAppButtonProps {
  variant?: 'hero' | 'surface' | 'subtle';
  className?: string;
  /** Called when OPEN APP is pressed while already inside standalone mode */
  onOpenInApp?: () => void;
  /** Opens the full 3-tab installation guide page */
  onOpenGuide?: () => void;
  /** Hide the install button on inner screens once already running as an installed standalone app */
  hideWhenStandalone?: boolean;
}

interface InstallGuide {
  title: string;
  subtitle: string;
  steps: string[];
  badge: string;
}

function getInstallGuide(
  os: DeviceOS,
  browser: BrowserEngine,
  osLabel: string,
  browserLabel: string,
  isPreviewHost: boolean
): InstallGuide {
  if (isPreviewHost) {
    return {
      title: 'Install from the Public Website',
      subtitle:
        'Apps cannot be installed from the Google AI Studio preview. Open the live public website below to install FIND YOUR LOVE on your device.',
      badge: `${osLabel} · ${browserLabel}`,
      steps: [
        'Tap "Open Public Website" below (or copy the link).',
        'Open the link in Chrome (Android / Desktop) or Safari (iPhone / iPad).',
        'Tap "INSTALL APP" on the live website to add FIND YOUR LOVE to your home screen or desktop.',
      ],
    };
  }

  if (os === 'ios') {
    if (browser === 'safari') {
      return {
        title: `Install on ${osLabel}`,
        subtitle:
          'Add FIND YOUR LOVE directly to your Home Screen using Safari.',
        badge: `${osLabel} · Safari`,
        steps: [
          'Tap the Share button (square with an upward arrow) in Safari’s toolbar.',
          'Scroll down the menu and tap "Add to Home Screen".',
          'Tap "Add" in the top-right corner to install the app.',
        ],
      };
    }

    return {
      title: `Open in Safari to Install on ${osLabel}`,
      subtitle:
        'Apple iOS and iPadOS only allow Home Screen app installation from Safari.',
      badge: `${osLabel} · ${browserLabel}`,
      steps: [
        'Tap "Copy Public Link" below.',
        'Open the Safari browser on your iPhone or iPad and paste the link.',
        'Tap the Share icon in Safari → "Add to Home Screen" → "Add".',
      ],
    };
  }

  if (os === 'android') {
    if (browser === 'webview') {
      return {
        title: 'Open in Chrome to Install',
        subtitle:
          'In-app browsers do not support direct app installation on Android.',
        badge: 'Android · In-App Browser',
        steps: [
          'Tap the menu icon (⋮ or ⋯) in the top corner of this screen.',
          'Choose "Open in Chrome" or "Open in Browser".',
          'Once the page loads in Chrome, tap "INSTALL APP" (or Menu ⋮ → Install app).',
        ],
      };
    }

    if (browser === 'firefox') {
      return {
        title: 'Install on Android Firefox',
        subtitle:
          'Use Firefox’s built-in menu or open in Google Chrome for full app installation.',
        badge: 'Android · Firefox',
        steps: [
          'Tap the three-dot menu (⋮) in Firefox.',
          'Select "Install" or "Add to Home screen".',
          'Or copy the link below and open it in Google Chrome for the native Android app prompt.',
        ],
      };
    }

    return {
      title: 'Install on Android',
      subtitle: `Use ${browserLabel} to add FIND YOUR LOVE directly to your home screen and app drawer.`,
      badge: `Android · ${browserLabel}`,
      steps: [
        `Tap the browser menu (⋮ or ≡) in ${browserLabel}.`,
        'Select "Install app" or "Add to Home screen".',
        'Confirm by tapping "Install".',
      ],
    };
  }

  if (os === 'macos' && browser === 'safari') {
    return {
      title: 'Install on macOS Safari',
      subtitle: 'Add FIND YOUR LOVE as a standalone desktop app in your Dock.',
      badge: 'macOS · Safari',
      steps: [
        'In Safari’s top menu bar, click File → "Add to Dock..." (or click the Share icon → "Add to Dock").',
        'Confirm the app name "FIND YOUR LOVE" and click "Add".',
        'Launch FIND YOUR LOVE anytime from your Dock or Spotlight.',
      ],
    };
  }

  if (
    (os === 'windows' || os === 'macos' || os === 'linux' || os === 'chromeos') &&
    (browser === 'chrome' ||
      browser === 'edge' ||
      browser === 'brave' ||
      browser === 'opera')
  ) {
    return {
      title: `Install on ${osLabel}`,
      subtitle: `Install FIND YOUR LOVE as a fast standalone desktop app using ${browserLabel}.`,
      badge: `${osLabel} · ${browserLabel}`,
      steps: [
        `Look for the Install icon (monitor with downward arrow) at the right side of ${browserLabel}’s address bar.`,
        `Or open ${browserLabel}’s menu (⋮ or ⋯) → "Save and share" / "Apps" → "Install FIND YOUR LOVE".`,
        'Click "Install" to launch it in its own window.',
      ],
    };
  }

  return {
    title: `Install on ${osLabel}`,
    subtitle: `${browserLabel} on ${osLabel} does not currently support one-click PWA installation.`,
    badge: `${osLabel} · ${browserLabel}`,
    steps: [
      'Copy the public website link below.',
      'Open it in Google Chrome or Microsoft Edge (Windows, macOS, Linux, ChromeOS, Android) or Safari (iPhone/iPad/macOS).',
      'Click "INSTALL APP" or use the browser’s Install option to add FIND YOUR LOVE.',
    ],
  };
}

export function InstallAppButton({
  variant = 'surface',
  className = '',
  onOpenInApp,
  onOpenGuide,
  hideWhenStandalone = false,
}: InstallAppButtonProps) {
  const {
    environment,
    isStandalone,
    isInstalled,
    isPrompting,
    canTriggerNativePrompt,
    promptNativeInstall,
  } = usePWAInstall();

  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (hideWhenStandalone && isStandalone) {
    return null;
  }

  const publicUrl = getPublicWebsiteUrl();
  const showOpenApp = !environment.isPreviewHost && (isStandalone || isInstalled);

  const buttonStyles =
    variant === 'hero'
      ? 'min-h-[48px] px-5 py-3 rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 text-white text-sm sm:text-base font-semibold'
      : variant === 'subtle'
        ? 'min-h-[42px] px-4 py-2 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-[#2E1065] text-xs sm:text-sm font-semibold'
        : 'min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] text-white text-sm font-semibold';

  const handleInstallClick = async () => {
    setCopyError(null);
    if (canTriggerNativePrompt) {
      const result = await promptNativeInstall();
      if (result === 'accepted' || result === 'dismissed') {
        return;
      }
    }
    setGuideOpen(true);
  };

  const handleCopyPublicUrl = async () => {
    setCopyError(null);
    const ok = await copyUrlToClipboard(publicUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3500);
    } else {
      setCopyError(
        'Could not copy automatically. Please highlight and copy the link above.'
      );
    }
  };

  const guide = getInstallGuide(
    environment.os,
    environment.browser,
    environment.osLabel,
    environment.browserLabel,
    environment.isPreviewHost
  );

  const isDesktop =
    environment.os === 'windows' ||
    environment.os === 'macos' ||
    environment.os === 'linux' ||
    environment.os === 'chromeos';

  return (
    <>
      {showOpenApp ? (
        isStandalone && onOpenInApp ? (
          <button
            type="button"
            onClick={onOpenInApp}
            className={`inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${buttonStyles} ${className}`}
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>OPEN APP</span>
          </button>
        ) : (
          <a
            href={publicUrl}
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${buttonStyles} ${className}`}
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>OPEN APP</span>
          </a>
        )
      ) : (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          disabled={isPrompting}
          className={`inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-70 ${buttonStyles} ${className}`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>
            {isPrompting
              ? 'Opening...'
              : environment.os === 'ios' || environment.os === 'android'
                ? 'Add to Home Screen'
                : 'Install App'}
          </span>
        </button>
      )}

      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-dialog-title"
          className="fixed inset-0 z-50 bg-[#1A0A26]/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white text-[#1E102E] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-purple-950/10 p-6 shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2E1065] to-[#DB2777] text-white flex items-center justify-center shrink-0">
                  {isDesktop ? (
                    <Laptop className="w-5 h-5" />
                  ) : (
                    <Smartphone className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B21A8] bg-purple-50 border border-purple-200 rounded-md px-2 py-0.5 mb-1">
                    {guide.badge}
                  </span>
                  <h2
                    id="install-app-dialog-title"
                    className="text-lg sm:text-xl font-bold text-[#2E1065]"
                  >
                    {guide.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(false);
                  setCopied(false);
                  setCopyError(null);
                }}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-purple-950/60 hover:bg-purple-50 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-purple-950/75 leading-relaxed mb-4">
              {guide.subtitle}
            </p>

            <ol className="space-y-2.5 mb-5">
              {guide.steps.map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-3 bg-purple-50/70 border border-purple-950/10 rounded-xl p-3 text-sm text-[#1E102E]"
                >
                  <span className="w-6 h-6 rounded-full bg-[#2E1065] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="leading-snug">{step}</span>
                </li>
              ))}
            </ol>

            {environment.os === 'ios' && environment.browser === 'safari' && (
              <div className="flex items-center gap-2 text-xs text-[#6B21A8] bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 mb-4">
                <Share className="w-4 h-4 shrink-0" />
                <span>
                  Look for the <strong>Share</strong> icon in Safari, then choose{' '}
                  <strong>Add to Home Screen</strong>.
                </span>
              </div>
            )}

            <div className="bg-purple-50/80 border border-purple-950/15 rounded-xl p-3 mb-3">
              <p className="text-[11px] font-semibold text-purple-950/60 mb-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                <span>Official Public App URL</span>
              </p>
              <p className="text-xs font-mono text-[#2E1065] break-all select-all">
                {publicUrl}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {environment.isPreviewHost && (
                <a
                  href={publicUrl}
                  target="_top"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Public Website</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => void handleCopyPublicUrl()}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#2E1065] hover:bg-[#4C1D95] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Website Link</span>
                  </>
                )}
              </button>
            </div>

            {onOpenGuide && (
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(false);
                  onOpenGuide();
                }}
                className="w-full min-h-[44px] mt-2.5 px-4 py-2 rounded-xl border border-purple-950/15 bg-purple-50/70 hover:bg-purple-100/70 text-[#2E1065] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Open Full Install Guide (Android · iPhone · Computer)</span>
              </button>
            )}

            {copied && (
              <p
                role="status"
                className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 text-center mt-3"
              >
                Public website link copied! Paste it into your browser to install.
              </p>
            )}

            {copyError && (
              <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
                {copyError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
