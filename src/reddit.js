/**
 * Reddit post finder via Google Custom Search API.
 *
 * Instead of hitting Reddit directly (blocked from data-center IPs),
 * we search Google for site:reddit.com + relevant keywords.
 * Free tier: 100 queries/day — we use ~8.
 *
 * Setup: https://developers.google.com/custom-search/v1/introduction
 *   1. Create API key at https://console.cloud.google.com (Custom Search API)
 *   2. Create a search engine at https://cse.google.com — set "Search the entire web"
 *   3. Copy the cx (Search engine ID)
 */

// Each entry becomes one Google search: site:reddit.com <query>
// Grouped to stay well within the 100/day free tier.
const SEARCH_QUERIES = [
  '"cover letter" help',
  '"cover letter" AI OR generator OR tool',
  '"resume help" OR "cv help"',
  '"job application" advice OR help',
  '"motivation letter" OR "motivationsschreiben"',
  'bewerbungsschreiben OR anschreiben hilfe',
  '"ki bewerbung" OR "bewerbung ki" OR bewerbungsgenerator',
  '"cover letter" example OR template OR tips',
];

export const SEARCH_QUERIES_COUNT = SEARCH_QUERIES.length;

const CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

/**
 * Run one Google CSE query and return raw result items.
 */
async function searchGoogle(query) {
  const params = new URLSearchParams({
    key: process.env.GOOGLE_API_KEY,
    cx: process.env.GOOGLE_CSE_ID,
    q: `site:reddit.com ${query}`,
    dateRestrict: 'd2',   // last 48 hours
    num: '10',
  });

  const res = await fetch(`${CSE_ENDPOINT}?${params}`);

  if (res.status === 429) {
    console.warn('[google] Rate limit hit — skipping query');
    return [];
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google CSE ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Convert a Google CSE result item to our post format.
 */
function itemToPost(item) {
  const subredditMatch = item.link?.match(/reddit\.com\/r\/([^/]+)/);
  return {
    id: item.link,
    subreddit: subredditMatch?.[1] ?? 'reddit',
    title: item.title?.replace(/\s*:\s*reddit$/, '').trim() || '',
    selftext: item.snippet || '',
    permalink: item.link,
    score: 0,
    num_comments: 0,
    author: 'unknown',
    created_utc: Math.floor(Date.now() / 1000),
  };
}

/**
 * Fetch relevant Reddit posts via Google Custom Search.
 */
export async function fetchRelevantPosts() {
  const results = [];

  for (const query of SEARCH_QUERIES) {
    try {
      const items = await searchGoogle(query);
      // Filter: only actual Reddit post pages (not subreddit/user/wiki pages)
      const posts = items
        .filter((i) => /reddit\.com\/r\/\w+\/comments\//.test(i.link))
        .map(itemToPost);

      console.log(`[google] "${query}": ${items.length} results, ${posts.length} post links`);
      results.push(...posts);
    } catch (err) {
      console.warn(`[google] Query failed — "${query}":`, err.message);
    }

    // Stay polite with the API
    await new Promise((r) => setTimeout(r, 300));
  }

  // Deduplicate by URL
  const seen = new Set();
  return results.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * Format a post for display / AI input (passthrough — already in correct shape).
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
    created: new Date(post.created_utc * 1000).toISOString(),
  };
}
