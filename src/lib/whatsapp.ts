const DEFAULT_PREMIUM_WHATSAPP_URL =
  'https://wa.me/256746899575?text=Hello%2C%20I%20am%20interested%20in%20FIND%20YOUR%20LOVE%20Premium%20membership.';

export function getPremiumWhatsAppEnquiryUrl(): string {
  const envUrl = import.meta.env.VITE_PREMIUM_WHATSAPP_URL;
  if (typeof envUrl === 'string') {
    const trimmed = envUrl.trim();
    if (trimmed.startsWith('https://wa.me/')) {
      return trimmed;
    }
  }
  return DEFAULT_PREMIUM_WHATSAPP_URL;
}
