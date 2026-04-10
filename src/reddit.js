/**
 * Reddit API client — uses OAuth2 Client Credentials (no user login needed).
 * Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars.
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

// Must follow Reddit's required format: platform:appId:version (by /u/username)
const USER_AGENT = process.env.REDDIT_USER_AGENT ||
  'node:coverdraft-monitor:1.0.0 (by /u/coverdraft_app)';

let _accessToken = null;
let _tokenExpiry = 0;

/**
 * Get a valid OAuth access token, refreshing if needed.
 */
async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET. ' +
      'Create a Reddit app at https://www.reddit.com/prefs/apps (type: script)'
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _accessToken = data.access_token;
  // Expire 60s early to be safe
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  console.log('[reddit] OAuth token obtained');
  return _accessToken;
}

/**
 * Fetch up to `limit` new posts from a subreddit.
 */
async function fetchSubreddit(subreddit, limit = 25) {
  const token = await getAccessToken();
  const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
    },
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
