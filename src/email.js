/**
 * Email digest sender via Resend.
 */

import { Resend } from 'resend';

// Resend is only instantiated when actually sending (not in dry-run mode)
let resend;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}
const TO = process.env.ALERT_EMAIL;
const FROM = `CoverDraft Monitor <${process.env.FROM_EMAIL || 'hello@coverdraft.app'}>`;

/**
 * Build the HTML email body.
 */
function buildHtml(posts, stats) {
  const date = new Date().toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const postCards = posts
    .map(
      (p, i) => `
    <div style="margin-bottom:32px;padding:20px;background:#f9fafb;border-radius:8px;border-left:4px solid #6366f1;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">
        #${i + 1} &nbsp;·&nbsp; r/${p.subreddit} &nbsp;·&nbsp; Score: <strong>${p.relevanceScore}/10</strong> &nbsp;·&nbsp; ↑${p.score} &nbsp;·&nbsp; 💬${p.comments}
      </div>
      <h3 style="margin:0 0 8px;font-size:16px;color:#111827;">
        <a href="${p.url}" style="color:#6366f1;text-decoration:none;">${escapeHtml(p.title)}</a>
      </h3>
      ${p.body ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(p.body.slice(0, 300))}${p.body.length > 300 ? '…' : ''}</p>` : ''}

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-top:12px;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
          Suggested Reply (copy &amp; adapt)
        </div>
        <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.6;white-space:pre-wrap;">${escapeHtml(p.suggestedReply || 'Reply generation failed.')}</p>
      </div>

      <div style="margin-top:10px;">
        <a href="${p.url}" style="display:inline-block;padding:6px 14px;background:#6366f1;color:#fff;border-radius:5px;font-size:13px;text-decoration:none;">
          Open Thread →
        </a>
      </div>
    </div>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CoverDraft Reddit Digest</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;color:#fff;">
      <div style="font-size:22px;font-weight:700;">CoverDraft Reddit Monitor</div>
      <div style="font-size:14px;opacity:.85;margin-top:4px;">${date}</div>
    </div>

    <!-- Summary -->
    <div style="padding:20px 32px;background:#eef2ff;border-bottom:1px solid #e0e7ff;">
      <span style="font-size:14px;color:#4338ca;">
        📋 <strong>${posts.length}</strong> relevante Thread${posts.length !== 1 ? 's' : ''} gefunden
        &nbsp;·&nbsp; ${stats.subredditsScanned} Subreddits gescannt
        &nbsp;·&nbsp; ${stats.totalFetched} Posts geprüft
      </span>
    </div>

    <!-- Posts -->
    <div style="padding:24px 32px;">
      ${postCards}
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      CoverDraft Monitor läuft täglich um 09:00 Uhr via GitHub Actions.<br>
      Replies immer leicht anpassen bevor du postest — echte Antworten wirken am besten.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send the daily digest email.
 */
export async function sendDigest(posts, stats) {
  if (!posts.length) {
    console.log('[email] No posts to send — skipping email');
    return;
  }

  const subject = `🎯 ${posts.length} Reddit thread${posts.length !== 1 ? 's' : ''} to engage with today`;

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to: TO,
    subject,
    html: buildHtml(posts, stats),
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`[email] Digest sent → ${TO} (id: ${data?.id})`);
}

/**
 * Send a "nothing found today" notification.
 */
export async function sendEmptyDigest(stats) {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: TO,
    subject: '📭 Reddit Monitor: No relevant threads today',
    html: `<p>Heute wurden keine relevanten Threads gefunden.</p>
           <p>Gescannt: ${stats.subredditsScanned} Subreddits, ${stats.totalFetched} Posts.</p>`,
  });

  if (error) console.warn('[email] Empty digest send failed:', error);
}
