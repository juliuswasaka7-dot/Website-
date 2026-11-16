import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Laptop,
  Share,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePWAInstall, type DeviceOS } from '../hooks/usePWAInstall';
import { copyUrlToClipboard, getPublicWebsiteUrl } from '../lib/share';
import type { ViewRoute } from '../types/app';

interface InstallGuideViewProps {
  onNavigate: (route: ViewRoute, initialAuthMode?: 'login' | 'register') => void;
}

type InstallTab = 'android' | 'iphone' | 'computer';

function getDefaultTab(os: DeviceOS): InstallTab {
  if (os === 'ios') return 'iphone';
  if (
    os === 'windows' ||
    os === 'macos' ||
    os === 'linux' ||
    os === 'chromeos'
  ) {
    return 'computer';
  }
  return 'android';
}

export function InstallGuideView({ onNavigate }: InstallGuideViewProps) {
  const { user } = useAuth();
  const {
    environment,
    isStandalone,
    isInstalled,
    isPrompting,
    canTriggerNativePrompt,
    promptNativeInstall,
  } = usePWAInstall();

  const [activeTab, setActiveTab] = useState<InstallTab>(() =>
    getDefaultTab(environment.os)
  );
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  const publicUrl = getPublicWebsiteUrl();
  const showOpenApp = !environment.isPreviewHost && (isStandalone || isInstalled);

  const handleCopyLink = async () => {
    setCopyError(null);
    const ok = await copyUrlToClipboard(publicUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3500);
    } else {
      setCopyError(
        'Automatic copy was blocked by this browser. Tap and hold the public link above to copy it manually.'
      );
    }
  };

  const handleNativeInstall = async () => {
    setInstallNotice(null);
    if (canTriggerNativePrompt) {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') {
        setInstallNotice(
          'FIND YOUR LOVE is being added to your device! You can open it directly from your Home Screen or Apps.'
        );
        return;
      }
      if (outcome === 'dismissed') {
        setInstallNotice(
          'Install prompt dismissed. You can use the steps below anytime to Add to Home Screen.'
        );
        return;
      }
    }
    setInstallNotice(
      'Your current browser did not expose a one-tap popup here. Follow the quick 3-step guide below for your device.'
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 md:pb-16">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-semibold text-[#6B21A8] hover:text-[#2E1065] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Hero Header & Copy Public Link Card */}
      <section className="bg-gradient-to-br from-[#2B1040] via-[#3B135C] to-[#1A0A26] text-white rounded-3xl p-6 sm:p-10 mb-8 border border-white/10">
        <div className="max-w-3xl">
          <p className="text-pink-300 text-xs sm:text-sm font-semibold tracking-wide mb-2">
            Public Website · Works Free in Any Browser
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold leading-tight text-balance mb-3">
            Install FIND YOUR LOVE on your phone or computer
          </h1>
          <p className="text-purple-100/90 text-sm sm:text-base leading-relaxed mb-6">
            Open FIND YOUR LOVE directly in Google Chrome, Microsoft Edge, Safari, or Samsung Internet—no Google AI Studio sign-in, no app store fees, and instant startup on Android 11 and older phones.
          </p>
        </div>

        {/* Public Link Box + Working Actions */}
        <div className="bg-white/10 border border-white/15 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-purple-200 flex items-center gap-1.5 mb-1">
                <Globe className="w-3.5 h-3.5 text-pink-300 shrink-0" />
                <span>Public Website URL (No AI Studio Login Required)</span>
              </p>
              <p className="text-sm sm:text-base font-mono text-white break-all select-all">
                {publicUrl}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white text-[#2E1065] hover:bg-purple-50 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Copy Website Link</span>
                  </>
                )}
              </button>

              {showOpenApp ? (
                <button
                  type="button"
                  onClick={() => onNavigate(user ? 'discover' : 'auth')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>OPEN APP</span>
                </button>
              ) : environment.isPreviewHost ? (
                <a
                  href={publicUrl}
                  target="_top"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#9333EA] hover:from-[#BE185D] hover:to-[#7E22CE] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>Open Public Website</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleNativeInstall()}
                  disabled={isPrompting}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#9333EA] hover:from-[#BE185D] hover:to-[#7E22CE] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-70"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>
                    {isPrompting
                      ? 'Opening Installer...'
                      : 'Add to Home Screen'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {environment.isPreviewHost && (
            <p className="text-xs text-amber-200 bg-amber-950/50 border border-amber-400/25 rounded-xl px-3.5 py-2.5 leading-relaxed">
              You are currently viewing inside the Google AI Studio preview. Copy the public link above or click <strong>Open Public Website</strong> in Chrome or Safari to install FIND YOUR LOVE for free without an AI Studio account.
            </p>
          )}

          {copied && (
            <p
              role="status"
              className="text-xs sm:text-sm font-semibold text-emerald-100 bg-emerald-900/60 border border-emerald-400/35 rounded-xl px-3.5 py-2.5"
            >
              Website link copied successfully! Share it via WhatsApp, SMS, or paste it directly into Chrome, Edge, or Safari.
            </p>
          )}

          {copyError && (
            <p className="text-xs font-medium text-rose-100 bg-rose-950/70 border border-rose-400/35 rounded-xl px-3.5 py-2.5">
              {copyError}
            </p>
          )}

          {installNotice && (
            <p
              role="status"
              className="text-xs font-medium text-purple-100 bg-purple-900/60 border border-white/15 rounded-xl px-3.5 py-2.5"
            >
              {installNotice}
            </p>
          )}
        </div>
      </section>

      {/* 3-Tab Device Installation Guide */}
      <section className="bg-white rounded-3xl border border-purple-950/10 p-5 sm:p-8 shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#2E1065]">
              Step-by-Step Installation Guide
            </h2>
            <p className="text-sm text-purple-950/70 mt-1">
              Detected device: <span className="font-semibold text-[#2E1065]">{environment.osLabel} · {environment.browserLabel}</span>
            </p>
          </div>

          {/* Segmented Tab Controls */}
          <div
            role="tablist"
            aria-label="Choose your device platform"
            className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#FAF7FC] border border-purple-950/10 rounded-2xl w-full sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'android'}
              onClick={() => setActiveTab('android')}
              className={`min-h-[44px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'android'
                  ? 'bg-[#2E1065] text-white shadow-sm'
                  : 'text-purple-950/75 hover:text-[#2E1065] hover:bg-white'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Android</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'iphone'}
              onClick={() => setActiveTab('iphone')}
              className={`min-h-[44px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'iphone'
                  ? 'bg-[#2E1065] text-white shadow-sm'
                  : 'text-purple-950/75 hover:text-[#2E1065] hover:bg-white'
              }`}
            >
              <TabletSmartphone className="w-4 h-4 shrink-0" />
              <span>iPhone / iPad</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'computer'}
              onClick={() => setActiveTab('computer')}
              className={`min-h-[44px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'computer'
                  ? 'bg-[#2E1065] text-white shadow-sm'
                  : 'text-purple-950/75 hover:text-[#2E1065] hover:bg-white'
              }`}
            >
              <Laptop className="w-4 h-4 shrink-0" />
              <span>Computer</span>
            </button>
          </div>
        </div>

        {/* Android Tab Panel */}
        {activeTab === 'android' && (
          <div role="tabpanel" aria-label="Android Installation Instructions" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-purple-950/10">
              <div>
                <h3 className="text-lg font-bold text-[#2E1065]">
                  Android Phones & Tablets (Android 11 & Newer)
                </h3>
                <p className="text-sm text-purple-950/75 mt-1">
                  Recommended browsers: Google Chrome, Samsung Internet, or Microsoft Edge.
                </p>
              </div>
              {canTriggerNativePrompt && (
                <button
                  type="button"
                  onClick={() => void handleNativeInstall()}
                  disabled={isPrompting}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>{isPrompting ? 'Opening...' : 'Install App Now'}</span>
                </button>
              )}
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  1
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base">
                  Open in Google Chrome
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Visit <span className="font-mono text-xs break-all">{publicUrl}</span> in Google Chrome. If you clicked a link inside WhatsApp, TikTok, or Facebook, tap the corner menu (⋮) and choose <strong>Open in Chrome</strong> first.
                </p>
              </li>

              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  2
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base">
                  Tap "Add to Home screen" or "Install app"
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Tap the <strong>Add to Home Screen</strong> button at the top of this page, or tap Chrome’s top-right menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
              </li>

              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  3
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base">
                  Launch from Your Home Screen
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Tap <strong>Install</strong> to confirm. FIND YOUR LOVE installs as a lightweight full-screen app icon on your Android home screen and app drawer.
                </p>
              </li>
            </ol>

            <div className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-4 text-xs sm:text-sm text-purple-950/80 space-y-1.5">
              <p className="font-semibold text-[#2E1065]">
                Using Samsung Internet or Microsoft Edge on Android?
              </p>
              <p>
                <strong>Samsung Internet:</strong> Tap the bottom-right menu (≡) → <em>Add page to</em> → <em>Home screen</em>.{' '}
                <span aria-hidden="true">·</span>{' '}
                <strong>Microsoft Edge:</strong> Tap the bottom menu (⋯) → <em>Add to phone</em>.
              </p>
            </div>
          </div>
        )}

        {/* iPhone / iPad Tab Panel */}
        {activeTab === 'iphone' && (
          <div role="tabpanel" aria-label="iPhone and iPad Installation Instructions" className="space-y-6">
            <div className="pb-5 border-b border-purple-950/10">
              <h3 className="text-lg font-bold text-[#2E1065]">
                iPhone & iPad (iOS / iPadOS Safari)
              </h3>
              <p className="text-sm text-purple-950/75 mt-1">
                Apple iOS and iPadOS add web apps to the Home Screen exclusively through the Safari browser.
              </p>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  1
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base">
                  Open Public URL in Safari
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Tap <strong>Copy Website Link</strong> above, open <strong>Safari</strong> on your iPhone or iPad, paste the link, and open the page. (In-app browsers inside WhatsApp or Instagram do not show the Add option.)
                </p>
              </li>

              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  2
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base flex items-center gap-1.5">
                  <span>Tap the Share Button</span>
                  <Share className="w-4 h-4 text-[#DB2777]" />
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Tap the <strong>Share</strong> icon (the square with an upward arrow) in Safari’s bottom toolbar on iPhone or top-right toolbar on iPad.
                </p>
              </li>

              <li className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-2">
                <span className="w-7 h-7 rounded-full bg-[#2E1065] text-white text-xs font-bold inline-flex items-center justify-center">
                  3
                </span>
                <h4 className="font-bold text-[#2E1065] text-sm sm:text-base">
                  Tap "Add to Home Screen"
                </h4>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Scroll down the Share sheet, tap <strong>Add to Home Screen</strong>, keep the name <em>FindLove</em>, and tap <strong>Add</strong> in the top-right corner.
                </p>
              </li>
            </ol>
          </div>
        )}

        {/* Computer Tab Panel */}
        {activeTab === 'computer' && (
          <div role="tabpanel" aria-label="Computer Installation Instructions" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-purple-950/10">
              <div>
                <h3 className="text-lg font-bold text-[#2E1065]">
                  Windows 10/11, macOS, Linux & ChromeOS
                </h3>
                <p className="text-sm text-purple-950/75 mt-1">
                  Launch FIND YOUR LOVE in its own standalone desktop window via Google Chrome, Microsoft Edge, or macOS Safari.
                </p>
              </div>
              {canTriggerNativePrompt && (
                <button
                  type="button"
                  onClick={() => void handleNativeInstall()}
                  disabled={isPrompting}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>{isPrompting ? 'Opening...' : 'Install Desktop App'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-[#2E1065] text-base">
                  Google Chrome & Microsoft Edge
                </h4>
                <ol className="space-y-2 text-sm text-purple-950/80 list-decimal list-inside leading-relaxed">
                  <li>
                    Open <span className="font-mono text-xs break-all">{publicUrl}</span> in Chrome or Edge.
                  </li>
                  <li>
                    Look for the <strong>Install icon</strong> (computer monitor with a downward arrow) at the right end of the address bar.
                  </li>
                  <li>
                    Or open the browser menu (<strong>⋮</strong> in Chrome / <strong>⋯</strong> in Edge) → <strong>Cast, save, and share</strong> / <strong>Apps</strong> → <strong>Install FIND YOUR LOVE</strong>.
                  </li>
                  <li>Click <strong>Install</strong> to pin it to your Desktop, Start Menu, or Dock.</li>
                </ol>
              </div>

              <div className="bg-[#FAF7FC] border border-purple-950/10 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-[#2E1065] text-base">
                  macOS Safari (Sonoma & Newer)
                </h4>
                <ol className="space-y-2 text-sm text-purple-950/80 list-decimal list-inside leading-relaxed">
                  <li>
                    Open <span className="font-mono text-xs break-all">{publicUrl}</span> in Safari on your Mac.
                  </li>
                  <li>
                    In the top macOS menu bar, click <strong>File → Add to Dock...</strong> (or click the <strong>Share</strong> icon in Safari → <strong>Add to Dock</strong>).
                  </li>
                  <li>Confirm the title and click <strong>Add</strong>.</li>
                  <li>Open FIND YOUR LOVE anytime straight from your macOS Dock or Spotlight.</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Assurance Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-purple-950/10 p-5 space-y-2">
          <h3 className="text-sm font-bold text-[#2E1065]">
            100% Public & Free to Open
          </h3>
          <p className="text-xs sm:text-sm text-purple-950/75 leading-relaxed">
            Anyone with the public link can open, browse, register, and install FIND YOUR LOVE directly without Google AI Studio or paid subscriptions.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-purple-950/10 p-5 space-y-2">
          <h3 className="text-sm font-bold text-[#2E1065]">
            Accounts & Chats Stay Synced
          </h3>
          <p className="text-xs sm:text-sm text-purple-950/75 leading-relaxed">
            Your existing member account, profile verification, Blue Tick badge, matches, voice notes, and video calls work identically on web and installed app.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-purple-950/10 p-5 space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[#2E1065]">
            <ShieldCheck className="w-4 h-4 text-pink-600 shrink-0" />
            <span>Fast on Android 11</span>
          </div>
          <p className="text-xs sm:text-sm text-purple-950/75 leading-relaxed">
            Service worker caching (`sw.js`) keeps core screens lightweight and responsive even on 2GB RAM smartphones and slow connections.
          </p>
        </div>
      </section>
    </div>
  );
}
