const { log, randomDelay } = require("./utils");
const { dismissPopups } = require("./monitor");

/**
 * React to a post with the specified reaction type.
 * Navigates to the post, hovers over Like to open reaction picker, clicks desired reaction.
 */
async function reactToPost(page, postUrl, reactionType) {
  log(`Đang mở bài viết để thả cảm xúc: ${postUrl}`, "step");
  await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await randomDelay(3, 5);
  await dismissPopups(page);

  // Do not scroll blindly! In video feeds, scrolling down moves to the next video,
  // causing us to interact with the wrong post. Puppeteer will auto-scroll when interacting.
  await randomDelay(1, 2);

  // Check if already reacted
  const alreadyReacted = await isAlreadyReacted(page);
  if (alreadyReacted) {
    log("Bài viết này đã được thả cảm xúc từ trước. Bỏ qua toàn bộ tương tác.", "info");
    return 'already_interacted';
  }

  // Find the Like button
  const likeButton = await findLikeButton(page);
  if (!likeButton) {
    log("Không tìm thấy nút Like, bỏ qua thả cảm xúc", "warn");
    return false;
  }

  // Hover over Like button to trigger reaction picker
  log("Đang hover để mở bảng cảm xúc...", "info");
  
  // Use Puppeteer's hover() which ensures the element is scrolled into view first
  await likeButton.hover();
  await randomDelay(2, 3); // Wait for reaction picker to appear

  // Try to find the specific reaction in the picker popup
  const reactionClicked = await clickReaction(page, reactionType);

  if (reactionClicked) {
    log(`Đã thả cảm xúc "${reactionType}" thành công!`, "success");
    return true;
  }

  // Fallback: just click Like
  log("Không tìm thấy bảng cảm xúc, click Like thay thế", "warn");
  await likeButton.click();
  await randomDelay(1, 2);
  return true;
}

/**
 * Comment on a post with the given text.
 */
async function commentOnPost(page, postUrl, commentText) {
  log(`Đang xử lý bình luận...`, "info");

  // We assume reactToPost just ran and we are already on the correct page.
  // Re-navigating or scrolling blindly here can cause us to lose context 
  // or scroll into the next post in a video feed.
  
  await randomDelay(1, 2);

  // Try to click the "Comment" button first to open comment section
  await clickCommentButton(page);
  await randomDelay(1, 2);

  // Find the comment input box
  const commentBox = await findCommentBox(page);
  if (!commentBox) {
    log("Không tìm thấy ô bình luận, bỏ qua", "warn");
    return false;
  }

  // Click to focus the comment box
  await commentBox.click();
  await randomDelay(0.5, 1);

  // Type the comment with natural typing speed
  log(`Đang gõ bình luận: "${commentText}"`, "info");
  await page.keyboard.type(commentText, { delay: 80 + Math.random() * 60 });
  await randomDelay(1, 2);

  // Press Enter to submit
  await page.keyboard.press("Enter");
  await randomDelay(2, 3);

  log(`Đã bình luận thành công: "${commentText}"`, "success");
  return true;
}

// ─── Helper functions ───────────────────────────────────────────

async function findLikeButton(page) {
  const selectors = [
    'div[aria-label="Thích"][role="button"]',
    'div[aria-label="Like"][role="button"]',
    'span[aria-label="Thích"]',
    'span[aria-label="Like"]',
    'div[aria-label="Thích"]',
    'div[aria-label="Like"]'
  ];

  for (const sel of selectors) {
    const elements = await page.$$(sel);
    for (const el of elements) {
      const box = await el.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        return el;
      }
    }
  }
  return null;
}

async function isAlreadyReacted(page) {
  const selectors = [
    'div[aria-label*="Gỡ Thích"]',
    'div[aria-label*="Gỡ Yêu thích"]',
    'div[aria-label*="Gỡ cảm xúc"]',
    'div[aria-label*="Remove Like"]',
    'div[aria-label*="Remove Love"]',
    'span[aria-label*="Gỡ Thích"]',
    'span[aria-label*="Gỡ Yêu thích"]',
    'span[aria-label*="Remove Like"]'
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const box = await el.boundingBox();
      if (box && box.width > 0) return true;
    }
  }
  return false;
}

async function clickReaction(page, reactionType) {
  const reactionMap = {
    love: ["Yêu thích", "Love"],
    like: ["Thích", "Like"],
    haha: ["Haha"],
    wow: ["Wow"],
    sad: ["Buồn", "Sad"],
    angry: ["Phẫn nộ", "Angry"]
  };

  const labels = reactionMap[reactionType.toLowerCase()] || reactionMap.love;

  for (const label of labels) {
    // Try multiple selector patterns for the reaction button
    const selectors = [
      `div[aria-label="${label}"][role="button"]`,
      `span[aria-label="${label}"]`,
      `img[aria-label="${label}"]`,
      `div[aria-label="${label}"]`
    ];

    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        const box = await el.boundingBox();
        if (box && box.width > 0) {
          await el.click();
          await randomDelay(1, 2);
          return true;
        }
      }
    }
  }

  return false;
}

async function clickCommentButton(page) {
  const selectors = [
    'div[aria-label="Viết bình luận"][role="button"]',
    'div[aria-label="Leave a comment"][role="button"]',
    'div[aria-label="Comment"][role="button"]'
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const box = await el.boundingBox();
      if (box) {
        await el.click();
        return true;
      }
    }
  }
  return false;
}

async function findCommentBox(page) {
  const selectors = [
    'div[contenteditable="true"][role="textbox"][aria-label*="bình luận"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="Viết"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="comment"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="Write"]',
    'div[contenteditable="true"][role="textbox"]'
  ];

  for (const sel of selectors) {
    const elements = await page.$$(sel);
    for (const el of elements) {
      const box = await el.boundingBox();
      if (box && box.width > 20 && box.height > 10) {
        return el;
      }
    }
  }
  return null;
}

module.exports = { reactToPost, commentOnPost };
