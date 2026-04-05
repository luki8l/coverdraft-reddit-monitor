/**
 * Reddit API client — no auth required, uses public JSON endpoints.
 * Fetches recent posts from job-seeker subreddits and scores relevance.
 */

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

const USER_AGENT = 'CoverDraft-Monitor/1.0 (automated digest; contact hello@coverdraft.app)';

/**
 * Fetch up to `limit` new posts from a subreddit.
 */
async function fetchSubreddit(subreddit, limit = 25) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    console.warn(`[reddit] r/${subreddit} returned ${res.status} — skipping`);
    return [];
  }

  const json = await res.json();
  return json?.data?.children?.map((c) => c.data) ?? [];
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
 * Returns posts sorted by score (upvotes) descending.
 */
export async function fetchRelevantPosts(maxPerSubreddit = 25) {
  const results = [];

  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchSubreddit(sub, maxPerSubreddit);
      const relevant = posts.filter(isRelevant);
      console.log(`[reddit] r/${sub}: ${posts.length} posts fetched, ${relevant.length} relevant`);
      results.push(...relevant);
    } catch (err) {
      console.warn(`[reddit] Error fetching r/${sub}:`, err.message);
    }

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 500));
  }

  // Deduplicate by post ID
  const seen = new Set();
  const unique = results.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Sort by score descending, take top 30
  return unique.sort((a, b) => b.score - a.score).slice(0, 30);
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
    url: `https://reddit.com${post.permalink}`,
    score: post.score,
    comments: post.num_comments,
    author: post.author,
    created: new Date(post.created_utc * 1000).toISOString(),
  };
}
