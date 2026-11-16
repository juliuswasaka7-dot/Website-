import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type DeviceOS =
  | 'android'
  | 'ios'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'chromeos'
  | 'other';

export type BrowserEngine =
  | 'chrome'
  | 'edge'
  | 'samsung'
  | 'safari'
  | 'firefox'
  | 'opera'
  | 'brave'
  | 'webview'
  | 'other';

export interface DeviceEnvironment {
  os: DeviceOS;
  osLabel: string;
  browser: BrowserEngine;
  browserLabel: string;
  isPreviewHost: boolean;
}

// Module-level capture ensures beforeinstallprompt is never lost before React mounts
let capturedPrompt: BeforeInstallPromptEvent | null = null;
let capturedInstalled = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    capturedPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    capturedInstalled = true;
    notifyListeners();
  });
}

export function detectIsPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { origin, hostname } = window.location;
  return (
    !origin.startsWith('https://') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app') ||
    hostname.includes('aistudio.google.com')
  );
}

export function detectIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const matchStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return Boolean(matchStandalone || iosStandalone);
}

export function detectDeviceEnvironment(): DeviceEnvironment {
  if (typeof navigator === 'undefined') {
    return {
      os: 'other',
      osLabel: 'Your Device',
      browser: 'other',
      browserLabel: 'Browser',
      isPreviewHost: false,
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  let os: DeviceOS = 'other';
  let osLabel = 'Your Device';

  const isIpadOSDesktopUA = /Macintosh/i.test(ua) && maxTouchPoints > 1;

  if (/iPhone|iPad|iPod/i.test(ua) || isIpadOSDesktopUA) {
    os = 'ios';
    osLabel = /iPad/i.test(ua) || isIpadOSDesktopUA ? 'iPad' : 'iPhone';
  } else if (/Android/i.test(ua)) {
    os = 'android';
    osLabel = 'Android';
  } else if (/CrOS/i.test(ua)) {
    os = 'chromeos';
    osLabel = 'ChromeOS';
  } else if (/Windows/i.test(ua) || /Win/i.test(platform)) {
    os = 'windows';
    osLabel = 'Windows';
  } else if (/Mac/i.test(ua) || /Mac/i.test(platform)) {
    os = 'macos';
    osLabel = 'macOS';
  } else if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    os = 'linux';
    osLabel = 'Linux';
  }

  let browser: BrowserEngine = 'other';
  let browserLabel = 'Browser';

  const isInAppWebView =
    /FBAN|FBAV|Instagram|BytedanceWebview|Musical_ly|TikTok|WhatsApp|Snapchat|Line\//i.test(
      ua
    ) ||
    (os === 'android' && /; wv\)/i.test(ua));

  if (isInAppWebView) {
    browser = 'webview';
    browserLabel = 'In-App Browser';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'samsung';
    browserLabel = 'Samsung Internet';
  } else if (/EdgA|EdgiOS|Edg\//i.test(ua)) {
    browser = 'edge';
    browserLabel = 'Microsoft Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'opera';
    browserLabel = 'Opera';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'firefox';
    browserLabel = 'Firefox';
  } else if (
    (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } })
      .brave ||
    /Brave/i.test(ua)
  ) {
    browser = 'brave';
    browserLabel = 'Brave';
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = 'chrome';
    browserLabel = 'Google Chrome';
  } else if (/Safari/i.test(ua)) {
    browser = 'safari';
    browserLabel = 'Safari';
  }

  return {
    os,
    osLabel,
    browser,
    browserLabel,
    isPreviewHost: detectIsPreviewHost(),
  };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(() => capturedPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(
    () => capturedInstalled
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    detectIsStandalone()
  );
  const [isPrompting, setIsPrompting] = useState(false);
  const [environment] = useState<DeviceEnvironment>(() =>
    detectDeviceEnvironment()
  );

  useEffect(() => {
    const syncFromGlobal = () => {
      setDeferredPrompt(capturedPrompt);
      if (capturedInstalled) {
        setIsInstalled(true);
      }
    };

    listeners.add(syncFromGlobal);
    syncFromGlobal();

    const mql =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    const handleDisplayChange = () => {
      setIsStandalone(detectIsStandalone());
    };

    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handleDisplayChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(handleDisplayChange);
      }
    }

    // Check installed related web apps on supported Android/Desktop browsers (public origin only)
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
    };
    if (!environment.isPreviewHost && typeof nav.getInstalledRelatedApps === 'function') {
      nav
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            capturedInstalled = true;
            setIsInstalled(true);
          }
        })
        .catch(() => {
          // Ignore unsupported platform errors silently
        });
    }

    return () => {
      listeners.delete(syncFromGlobal);
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handleDisplayChange);
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(handleDisplayChange);
        }
      }
    };
  }, [environment.isPreviewHost]);

  const promptNativeInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    if (environment.isPreviewHost) {
      return 'unavailable';
    }
    const promptEvent = capturedPrompt || deferredPrompt;
    if (!promptEvent) {
      return 'unavailable';
    }

    setIsPrompting(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        capturedPrompt = null;
        capturedInstalled = true;
        setDeferredPrompt(null);
        setIsInstalled(true);
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    } finally {
      setIsPrompting(false);
    }
  }, [deferredPrompt, environment.isPreviewHost]);

  const canTriggerNativePrompt =
    !environment.isPreviewHost && Boolean(deferredPrompt);

  return {
    environment,
    isStandalone,
    isInstalled,
    isPrompting,
    canTriggerNativePrompt,
    promptNativeInstall,
  };
}
