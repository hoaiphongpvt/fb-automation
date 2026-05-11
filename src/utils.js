const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m"
};

function log(message, level = "info") {
  const now = new Date().toLocaleString("vi-VN", { hour12: false });
  const prefixes = {
    info: `${COLORS.cyan}[INFO]`,
    success: `${COLORS.green}[OK]`,
    warn: `${COLORS.yellow}[WARN]`,
    error: `${COLORS.red}[ERROR]`,
    step: `${COLORS.magenta}[>>>]`
  };
  const prefix = prefixes[level] || prefixes.info;
  console.log(`${COLORS.dim}${now}${COLORS.reset} ${prefix} ${message}${COLORS.reset}`);
}

function randomDelay(minSeconds, maxSeconds) {
  const ms = (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
  log(`Chờ ${(ms / 1000).toFixed(1)}s...`, "info");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function extractPostId(url) {
  try {
    const u = new URL(url);

    // Query param based IDs
    const storyFbid = u.searchParams.get("story_fbid");
    if (storyFbid) return storyFbid;

    const fbid = u.searchParams.get("fbid");
    if (fbid) return fbid;

    // Path based IDs: /posts/xxx, /videos/xxx, /reel/xxx, /photos/xxx, /share/xxx
    const pathPatterns = [
      /\/posts\/([^/?]+)/,
      /\/videos\/([^/?]+)/,
      /\/reel\/([^/?]+)/,
      /\/photos\/[^/]+\/([^/?]+)/,
      /\/photo\/?\?fbid=(\d+)/,
      /\/share\/([^/?]+)/,
      /\/permalink\/(\d+)/
    ];

    for (const pattern of pathPatterns) {
      const match = u.pathname.match(pattern) || u.href.match(pattern);
      if (match) return match[1];
    }

    // pfbid format (modern Facebook post IDs like pfbid02abc...)
    const pfbidMatch = u.href.match(/pfbid([a-zA-Z0-9]+)/);
    if (pfbidMatch) return "pfbid" + pfbidMatch[1];

    // Fallback: use cleaned pathname as unique ID
    const cleanPath = u.pathname.replace(/\/+$/, "");
    return cleanPath || u.href;
  } catch {
    return url;
  }
}

function cleanPostUrl(url) {
  try {
    const u = new URL(url);
    // Remove tracking params
    u.searchParams.delete("__cft__[0]");
    u.searchParams.delete("__tn__");
    u.searchParams.delete("__cft__");
    u.searchParams.delete("mibextid");
    u.searchParams.delete("ref");
    return u.href;
  } catch {
    return url;
  }
}

module.exports = { log, randomDelay, randomChoice, extractPostId, cleanPostUrl };
