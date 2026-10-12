import { useState } from 'react';
import { SUPPORT } from '../config.js';
import { fmtNaira } from '../lib/format.js';

export default function Support() {
  const { goal, raised, paymentLink, usdcAddress, usdcNetwork, githubUrl } = SUPPORT;
  const [copied, setCopied] = useState(false);

  if (!paymentLink && !usdcAddress) return null;

  const pct = Math.min(100, Math.round((raised / goal) * 100));

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(usdcAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked; address is visible so it can be copied by hand */
    }
  }

  return (
    <section className="support" aria-labelledby="support-title">
      <h2 id="support-title">I built this on a phone because my laptop screen died.</h2>
      <p>
        DataLite was written in Termux on an Android phone, on mobile data. If it saved you some data,
        help me fix the screen and the next project gets built on a real keyboard.
      </p>

      <div
        className="goal"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={raised}
        aria-label="Laptop screen repair fund"
      >
        <div className="goal-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="goal-text">
        {fmtNaira(raised)} of {fmtNaira(goal)} for the screen repair
      </p>

      <div className="actions">
        {paymentLink && (
          <a className="btn btn-solid" href={paymentLink} target="_blank" rel="noopener noreferrer">
            Chip in for the screen
          </a>
        )}
        {usdcAddress && (
          <button type="button" className="btn btn-ghost" onClick={copyAddress}>
            {copied ? 'Address copied' : `Copy USDC address${usdcNetwork ? ` (${usdcNetwork})` : ''}`}
          </button>
        )}
        {githubUrl && (
          <a className="btn btn-ghost" href={githubUrl} target="_blank" rel="noopener noreferrer">
            View source
          </a>
        )}
      </div>
    </section>
  );
}
