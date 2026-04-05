/**
 * Claude AI integration — scores post relevance and generates reply suggestions.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COVERDRAFT_CONTEXT = `
CoverDraft (coverdraft.app) is an AI-powered cover letter generator for job seekers.
It helps people write professional, personalized cover letters in minutes.
Key selling points:
- Generates tailored cover letters based on job description + CV
- Works in German and English
- Free to start, no account required
- Used by thousands of job seekers in DACH and beyond
`.trim();

/**
 * Score a post's relevance for CoverDraft (0–10).
 * Returns null if the API call fails.
 */
export async function scoreRelevance(post) {
  try {
    const prompt = `You are evaluating Reddit posts for marketing relevance to CoverDraft, an AI cover letter tool.

Score this post from 0 to 10:
- 10 = person explicitly struggling with cover letters / job applications, perfect opportunity to mention CoverDraft
- 7-9 = strong relevance (asking for application help, CV advice, etc.)
- 4-6 = moderate relevance (job search discussion, career advice)
- 0-3 = low/no relevance

Post subreddit: r/${post.subreddit}
Post title: ${post.title}
Post body: ${post.body || '(no body)'}

Respond with ONLY a single integer 0-10. Nothing else.`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const score = parseInt(msg.content[0].text.trim(), 10);
    return isNaN(score) ? null : Math.min(10, Math.max(0, score));
  } catch (err) {
    console.warn(`[claude] Score failed for post ${post.id}:`, err.message);
    return null;
  }
}

/**
 * Generate a human-sounding Reddit reply suggestion for a post.
 */
export async function generateReply(post) {
  try {
    const isGerman = /r\/(germany|austria|Finanzen)/i.test(post.subreddit) ||
      /[äöüÄÖÜß]|bewerbung|anschreiben|lebenslauf/i.test(`${post.title} ${post.body}`);

    const lang = isGerman ? 'German' : 'English';

    const prompt = `${COVERDRAFT_CONTEXT}

Write a helpful Reddit reply to this post. The reply should:
1. Be genuinely helpful and empathetic — address the person's actual problem
2. Naturally mention CoverDraft as a tool that might help (don't be pushy)
3. Sound like a real person, NOT a bot or marketing copy
4. Be 3-5 sentences max — concise and friendly
5. Written in ${lang}
6. Include the URL coverdraft.app naturally (not as a sales pitch)

DO NOT:
- Start with "As an AI..."
- Sound like an advertisement
- Be overly enthusiastic with exclamation marks
- Promise results you can't guarantee

Post title: ${post.title}
Post body: ${post.body || '(no body)'}
Subreddit: r/${post.subreddit}

Write the reply now:`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    return msg.content[0].text.trim();
  } catch (err) {
    console.warn(`[claude] Reply failed for post ${post.id}:`, err.message);
    return null;
  }
}

/**
 * Process a batch of posts: score them, filter low-relevance ones,
 * generate reply suggestions for the rest.
 * Returns enriched posts sorted by relevance score desc.
 */
export async function enrichPosts(posts, minScore = 5) {
  const enriched = [];

  for (const post of posts) {
    const score = await scoreRelevance(post);

    if (score === null || score < minScore) {
      console.log(`[claude] r/${post.subreddit} "${post.title.slice(0, 50)}" — score ${score ?? 'err'}, skipped`);
      continue;
    }

    console.log(`[claude] r/${post.subreddit} "${post.title.slice(0, 50)}" — score ${score}, generating reply…`);
    const reply = await generateReply(post);

    enriched.push({ ...post, relevanceScore: score, suggestedReply: reply });

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  return enriched.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
