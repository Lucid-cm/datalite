export function fmtBytes(n) {
  const v = Math.max(0, Math.round(n));
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtNaira(n) {
  if (n < 1) return 'under \u20A61';
  return `\u20A6${Math.round(n).toLocaleString('en-NG')}`;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
