/**
 * Attribute join/leave events to the posts that most likely caused them.
 *
 * memberChanges is day-bucketed (admin log gives day-level totals), so a 24h
 * window effectively means "same-day or previous-day posts." The most recent
 * post within the window gets full credit; ties are broken by timestamp.
 *
 * @param {Array} posts  - channel posts: { id, date (ISO), text, ... }
 * @param {Object} memberChanges - { "YYYY-MM-DD": { joins, leaves, net } }
 * @param {number} windowHours - window size in hours (default 24)
 * @returns {{
 *   attributedLeaves: Array<{postId, postDate, postText, leaves, post}>,
 *   attributedJoins:  Array<{postId, postDate, postText, joins, post}>,
 *   ambientLeaves: number,
 *   ambientJoins: number,
 *   trend: Array<{date, joins, leaves, net}>
 * }}
 */
export function attributeEvents(posts, memberChanges, windowHours = 24) {
  const windowMs = windowHours * 3600 * 1000;
  const postsByTime = [...(posts || [])]
    .filter(p => p && p.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const perPost = new Map(); // postId -> { post, joins, leaves }
  let ambientLeaves = 0;
  let ambientJoins = 0;
  const trend = [];

  const days = Object.keys(memberChanges || {}).sort();

  for (const day of days) {
    const { joins = 0, leaves = 0, net = 0 } = memberChanges[day] || {};
    trend.push({ date: day, joins, leaves, net });

    if (joins === 0 && leaves === 0) continue;

    // End-of-day is our reference point for "most recent post within window".
    // Window extends windowMs before the start of the day so that prior-day
    // posts also count (24h window => same-day OR previous-day posts).
    const endOfDay = new Date(`${day}T23:59:59+00:00`).getTime();
    const startOfDay = new Date(`${day}T00:00:00+00:00`).getTime();
    const windowStart = startOfDay - windowMs;

    // Find most recent post whose date is within [windowStart, endOfDay]
    let bestPost = null;
    for (let i = postsByTime.length - 1; i >= 0; i--) {
      const t = new Date(postsByTime[i].date).getTime();
      if (t > endOfDay) continue;
      if (t < windowStart) break;
      bestPost = postsByTime[i];
      break;
    }

    if (bestPost) {
      const entry = perPost.get(bestPost.id) || { post: bestPost, joins: 0, leaves: 0 };
      entry.joins += joins;
      entry.leaves += leaves;
      perPost.set(bestPost.id, entry);
    } else {
      ambientJoins += joins;
      ambientLeaves += leaves;
    }
  }

  const toEntry = (kind) => (e) => ({
    postId: e.post.id,
    postDate: e.post.date,
    postText: (e.post.text || "").slice(0, 200),
    [kind]: e[kind],
    post: e.post,
  });

  const attributedLeaves = [...perPost.values()]
    .filter(e => e.leaves > 0)
    .sort((a, b) => b.leaves - a.leaves)
    .map(toEntry("leaves"));

  const attributedJoins = [...perPost.values()]
    .filter(e => e.joins > 0)
    .sort((a, b) => b.joins - a.joins)
    .map(toEntry("joins"));

  return { attributedLeaves, attributedJoins, ambientLeaves, ambientJoins, trend };
}
