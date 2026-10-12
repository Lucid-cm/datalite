import { fmtBytes, fmtNaira, hostOf } from './format.js';

/** Draws a 1080x1350 share card and downloads it as a PNG. */
export function downloadCard({ url, originalBytes, liteBytes, pct, naira }) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  g.fillStyle = '#12212b';
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#e8eef2';
  g.font = `800 56px ${sans}`;
  g.fillText('DataLite', 80, 130);

  g.fillStyle = '#9db0ba';
  g.font = `500 40px ${sans}`;
  g.fillText(hostOf(url).slice(0, 36), 80, 210);

  g.fillStyle = '#e8eef2';
  g.font = `800 120px ${sans}`;
  g.fillText(`${pct}% less`, 80, 420);
  g.fillText('data used', 80, 550);

  const barX = 80;
  const barW = W - 160;
  const row = (label, value, ratio, color, y) => {
    g.fillStyle = '#e8eef2';
    g.font = `600 44px ${sans}`;
    g.fillText(label, barX, y);
    g.textAlign = 'right';
    g.fillText(value, barX + barW, y);
    g.textAlign = 'left';
    g.fillStyle = '#243743';
    g.fillRect(barX, y + 24, barW, 72);
    g.fillStyle = color;
    g.fillRect(barX, y + 24, Math.max(10, barW * ratio), 72);
  };
  row('Original page', `${fmtBytes(originalBytes)}+`, 1, '#e8501a', 760);
  row('With DataLite', fmtBytes(liteBytes), liteBytes / originalBytes, '#3ddc8a', 940);

  g.fillStyle = '#9db0ba';
  g.font = `500 40px ${sans}`;
  g.fillText(`Roughly ${fmtNaira(naira)} of data saved on this one page`, 80, 1150);
  g.fillText('Built on a phone, in Termux.', 80, 1230);

  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `datalite-${hostOf(url)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
