/**
 * CoverDraft Reddit Monitor — main entry point.
 *
 * Pipeline:
 *   1. Find relevant Reddit posts via Google Custom Search (site:reddit.com + keywords)
 *   2. Score relevance 0–10 with Claude Haiku (filter < 5)
 *   3. Generate a human-sounding reply suggestion per post
 *   4. Send HTML digest email via Resend
 *
 * Environment variables required:
 *   ANTHROPIC_API_KEY   — Anthropic API key
 *   GOOGLE_API_KEY      — Google Cloud API key (Custom Search API enabled)
 *   GOOGLE_CSE_ID       — Google Custom Search Engine ID (cx)
 *   RESEND_API_KEY      — Resend API key
 *   ALERT_EMAIL         — recipient email address
 *   FROM_EMAIL          — (optional) sender address, default: hello@coverdraft.app
 *
 * Set DRY_RUN=true to skip sending email and print results to stdout.
 */

import { fetchRelevantPosts, formatPost, SEARCH_QUERIES_COUNT } from './reddit.js';
import { enrichPosts } from './claude.js';
import { sendDigest, sendEmptyDigest } from './email.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const MIN_RELEVANCE_SCORE = parseInt(process.env.MIN_RELEVANCE_SCORE || '5', 10);
const MAX_POSTS_IN_EMAIL = parseInt(process.env.MAX_POSTS_IN_EMAIL || '10', 10);

async function main() {
  console.log('=== CoverDraft Reddit Monitor ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('[mode] DRY RUN — email will not be sent');

  // Validate required env vars
  const required = ['ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CSE_ID', 'RESEND_API_KEY', 'ALERT_EMAIL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Step 1: Fetch + keyword-filter
  console.log('\n[1/3] Fetching Reddit posts…');
  const rawPosts = await fetchRelevantPosts();
  console.log(`      → ${rawPosts.length} posts found`);

  const posts = rawPosts.map(formatPost);

  const stats = {
    subredditsScanned: SEARCH_QUERIES_COUNT,
    totalFetched: rawPosts.length,
  };

  if (!posts.length) {
    console.log('\nNo relevant posts found today.');
    if (!DRY_RUN) await sendEmptyDigest(stats);
    return;
  }

  // Step 2: Score + generate replies via Claude
  console.log(`\n[2/3] Scoring and generating replies for ${posts.length} posts…`);
  const enriched = await enrichPosts(posts, MIN_RELEVANCE_SCORE);
  console.log(`      → ${enriched.length} posts passed relevance threshold (>= ${MIN_RELEVANCE_SCORE})`);

  const topPosts = enriched.slice(0, MAX_POSTS_IN_EMAIL);

  // Step 3: Send digest
  console.log('\n[3/3] Sending digest email…');

  if (DRY_RUN) {
    console.log('\n--- DRY RUN OUTPUT ---');
    topPosts.forEach((p, i) => {
      console.log(`\n[${i + 1}] r/${p.subreddit} (score ${p.relevanceScore}/10)`);
      console.log(`    Title: ${p.title}`);
      console.log(`    URL:   ${p.url}`);
      console.log(`    Reply: ${p.suggestedReply}`);
    });
    console.log('\n--- END DRY RUN ---');
  } else {
    await sendDigest(topPosts, stats);
  }

  console.log(`\nDone. ${topPosts.length} threads included in digest.`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
