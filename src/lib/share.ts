const FIREBASE_HOSTING_PUBLIC_URL = 'https://favorable-cell-p5gvv.web.app';

export function getPublicWebsiteUrl(): string {
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    const isPreviewOrLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.run.app') ||
      hostname.includes('aistudio.google.com');
    if (!isPreviewOrLocal && origin.startsWith('https://')) {
      return origin;
    }
  }
  return FIREBASE_HOSTING_PUBLIC_URL;
}

export async function copyUrlToClipboard(url: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback below for restricted webviews / Android 11 browsers
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function getShareAppLinks(publicUrl: string) {
  const message =
    'Join FIND YOUR LOVE — Two Countries, One Heart. Connecting adults 18+ across Uganda, Jeddah, and worldwide.';
  const encodedTextWithUrl = encodeURIComponent(`${message} ${publicUrl}`);
  const encodedUrl = encodeURIComponent(publicUrl);
  const encodedText = encodeURIComponent(message);

  return {
    whatsapp: `https://wa.me/?text=${encodedTextWithUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    sms: `sms:?body=${encodedTextWithUrl}`,
  };
}
