// Maps Amazon marketplace codes to country flag emojis.
// Codes are uppercased before lookup.
const FLAGS: Record<string, string> = {
  USA: '🇺🇸',
  US: '🇺🇸',
  UK: '🇬🇧',
  GB: '🇬🇧',
  CA: '🇨🇦',
  AU: '🇦🇺',
  DE: '🇩🇪',
  FR: '🇫🇷',
  ES: '🇪🇸',
  IT: '🇮🇹',
  JP: '🇯🇵',
  MX: '🇲🇽',
  BR: '🇧🇷',
  IN: '🇮🇳',
  NL: '🇳🇱',
  SE: '🇸🇪',
  PL: '🇵🇱',
  TR: '🇹🇷',
  AE: '🇦🇪',
  SA: '🇸🇦',
  EG: '🇪🇬',
  SG: '🇸🇬',
  BE: '🇧🇪',
  ZA: '🇿🇦',
};

export function flagFor(marketplace: string | null | undefined): string {
  if (!marketplace) return '';
  return FLAGS[marketplace.toUpperCase()] ?? '';
}
