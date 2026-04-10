/**
 * Reddit RSS client — uses public RSS feeds, no API key or auth required.
 * RSS feeds are separate from Reddit's Data API and remain publicly accessible.
 */

import Parser from 'rss-parser';

const SUBREDDITS = [
  'jobs',
  'careerguidance',
  'resumes',
  'jobsearch',
  'cscareerquestions',
  'recruitinghell',
  'germany',
  'austria',
  'Finanzen',
];

const KEYWORDS = [
  // English
  'cover letter',
  'covering letter',
  'application letter',
  'job application',
  'resume help',
  'cv help',
  'ai cover letter',
  'cover letter generator',
  'cover letter tool',
  'cover letter template',
  'cover letter tips',
  'write cover letter',
  'cover letter example',
  'motivation letter',
  'motivationsschreiben',
  // German
  'bewerbungsschreiben',
  'bewerbung schreiben',
  'anschreiben',
  'lebenslauf hilfe',
  'ki bewerbung',
  'bewerbung ki',
  'bewerbung tool',
  'bewerbungshelfer',
  'bewerbungsgenerator',
  'job bewerbung',
  'stellenbewerbung',
];

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; CoverDraft-Monitor/1.0; +https://coverdraft.app)',
  },
  timeout: 10000,
});

/**
 * Fetch up to 25 new posts from a subreddit via RSS.
 */
async function fetchSubreddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/new.rss?limit=25`;

  const feed = await parser.parseURL(url);

  return (feed.items || []).map((item) => ({
    id: item.id || item.guid || item.link,
    subreddit,
    title: item.title || '',
    // RSS body is HTML — strip tags for plain text
    selftext: (item.content || item.contentSnippet || item['content:encoded'] || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    permalink: item.link || '',
    score: 0,       // not available in RSS
    num_comments: 0,
    author: item.author || item.creator || 'unknown',
    created_utc: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : 0,
  }));
}

/**
 * Check whether a post is relevant based on keyword matching.
 */
function isRelevant(post) {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Fetch and filter relevant posts from all monitored subreddits.
 */
export async function fetchRelevantPosts() {
  const results = [];

  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchSubreddit(sub);
      const relevant = posts.filter(isRelevant);
      console.log(`[reddit] r/${sub}: ${posts.length} posts fetched, ${relevant.length} relevant`);
      results.push(...relevant);
    } catch (err) {
      console.warn(`[reddit] Error fetching r/${sub}:`, err.message);
    }

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 600));
  }

  // Deduplicate by post ID
  const seen = new Set();
  const unique = results.filter((p) => {
    const key = p.id || p.permalink;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first (score not available in RSS), take top 30
  return unique
    .sort((a, b) => b.created_utc - a.created_utc)
    .slice(0, 30);
}

/**
 * Format a post for display / AI input.
 */
export function formatPost(post) {
  return {
    id: post.id,
    subreddit: post.subreddit,
    title: post.title,
    body: post.selftext?.slice(0, 800) || '',
    url: post.permalink,
    score: post.score,
    comments: post.num_comments,
    author: post.author,
    created: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : new Date().toISOString(),
  };
}
