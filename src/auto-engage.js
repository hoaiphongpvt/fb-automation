const fs = require("fs");
const path = require("path");
const readline = require("readline");
const puppeteer = require("puppeteer");

const { log, randomDelay, randomChoice } = require("./utils");
const store = require("./store");
const { fetchNewPosts } = require("./monitor");
const { reactToPost, commentOnPost } = require("./actions");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");
const PROFILE_DIR = path.resolve(__dirname, "..", ".browser-profile");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log("Không tìm thấy config.json! Hãy tạo file config trước.", "error");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function printBanner(config) {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     🤖 AUTO ENGAGEMENT BOT - Facebook       ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Page: ${config.pageUrl.substring(0, 37).padEnd(37)}║`);
  console.log(`║  Cảm xúc: ${config.reaction.padEnd(34)}║`);
  console.log(`║  Kiểm tra mỗi: ${String(config.checkIntervalMinutes + " phút").padEnd(29)}║`);
  console.log(`║  Bài đã xử lý: ${String(store.getProcessedCount()).padEnd(29)}║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
}

async function checkLogin(page) {
  log("Đang kiểm tra đăng nhập...", "info");
  await page.goto("https://www.facebook.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await randomDelay(3, 5);

  const isLoginPage = await page.evaluate(() => {
    return (
      !!document.querySelector("#email") ||
      !!document.querySelector('input[name="email"]') ||
      !!document.querySelector('[data-testid="royal_email"]')
    );
  });

  return !isLoginPage;
}

async function waitForManualLogin(page) {
  log("Chưa đăng nhập! Hãy đăng nhập thủ công trong trình duyệt.", "warn");
  log("Nhấn Enter sau khi đã đăng nhập xong...", "warn");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise((resolve) => {
    rl.question("> Nhấn Enter khi đã đăng nhập: ", () => {
      rl.close();
      resolve();
    });
  });

  // Verify login after user confirms
  const loggedIn = await checkLogin(page);
  if (!loggedIn) {
    log("Vẫn chưa đăng nhập được. Vui lòng thử lại.", "error");
    process.exit(1);
  }

  log("Đăng nhập thành công!", "success");
}

async function processNewPosts(page, config) {
  const { pageUrl, reaction, comments, delayBetweenActions } = config;

  log("Đang mở trang: " + pageUrl, "step");
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await randomDelay(4, 6);

  // Scroll to trigger lazy loading of the actual feed
  log("Đang scroll để tải bài viết...", "info");
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await randomDelay(1.5, 2.5);
  }

  // Find all Like buttons on the page using $$ to get ElementHandles
  const selectors = [
    'div[aria-label="Thích"][role="button"]',
    'div[aria-label="Like"][role="button"]',
    'div[aria-label*="Gỡ Thích"]',
    'div[aria-label*="Remove Like"]',
    'div[aria-label*="Gỡ Yêu thích"]',
    'div[aria-label*="Remove Love"]'
  ];
  
  const likeButtons = await page.$$(selectors.join(', '));
  
  let targetLikeButton = null;
  let targetPostUrl = null;
  let skippedCount = 0;
  
  for (const btn of likeButtons) {
      const box = await btn.boundingBox();
      if (!box || box.width === 0) continue;
      
      // Get absolute Y
      const absoluteY = await page.evaluate((el) => {
          return el.getBoundingClientRect().top + window.scrollY;
      }, btn);
      
      // Skip header/avatar Like buttons if any
      if (absoluteY < 600) continue; 
      
      const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), btn);
      
      if (ariaLabel.includes('Gỡ') || ariaLabel.includes('Remove')) {
          log("Đã tìm thấy 1 bài viết nhưng BỎ QUA vì phát hiện bạn đã tương tác (có nút Gỡ Thích/Gỡ Yêu thích).", "info");
          skippedCount++;
          continue;
      }
      
      // We found the first un-interacted Like button!
      targetLikeButton = btn;
      
      // Try to extract its post URL for record keeping
      targetPostUrl = await page.evaluate((el) => {
          let container = el;
          for (let i=0; i<10; i++) {
              if (container.parentElement) container = container.parentElement;
          }
          const links = container.querySelectorAll('a[href]');
          for (const link of links) {
              const href = link.getAttribute('href');
              if (href.includes('/posts/') || href.includes('/photo/') || href.includes('fbid=') || href.includes('/videos/') || href.includes('/reel/')) {
                  if (!href.includes('set=pb.') && !href.includes('set=a.') && !href.includes('makeprofile')) {
                      return href;
                  }
              }
          }
          return null;
      }, btn);
      
      break;
  }
  
  if (!targetLikeButton) {
      if (skippedCount > 0) {
          log(`Đã quét thấy ${skippedCount} bài viết trên tường, nhưng TẤT CẢ đều đã được thả cảm xúc từ trước. Bot sẽ không tương tác đúp.`, "warn");
      } else {
          log("Không tìm thấy nút Like của bài viết nào trên trang. Có thể do mạng chậm, hãy thử lại.", "warn");
      }
      return;
  }
  
  log("Đã tìm thấy bài viết mới nhất chưa tương tác. Tiến hành thả cảm xúc.", "step");
  
  // 1. Scroll it fully into view just in case
  await targetLikeButton.hover();
  await randomDelay(2, 3);
  
  // 2. Click Reaction
  const reactionMap = {
    love: ["Yêu thích", "Love"],
    like: ["Thích", "Like"],
    haha: ["Haha"],
    wow: ["Wow"],
    sad: ["Buồn", "Sad"],
    angry: ["Phẫn nộ", "Angry"]
  };
  
  const labelsToFind = reactionMap[reaction.toLowerCase()] || reactionMap.like;
  let reactionClicked = false;
  
  // Look for the reaction popup options
  for (const label of labelsToFind) {
      const rxBtn = await page.$(`div[aria-label="${label}"]`);
      if (rxBtn) {
          const rxBox = await rxBtn.boundingBox();
          if (rxBox && rxBox.width > 0) {
              await rxBtn.click();
              reactionClicked = true;
              break;
          }
      }
  }

  if (!reactionClicked) {
      log("Không mở được bảng cảm xúc, click Like thay thế.", "warn");
      await targetLikeButton.click();
  } else {
      log(`Đã thả cảm xúc "${reaction}" thành công!`, "success");
  }

  await randomDelay(2, 3);

  // 3. Find Comment button next to it
  log("Đang tìm nút bình luận...", "info");
  const commentClicked = await page.evaluate((likeBtn) => {
      let wrapper = likeBtn;
      for(let i=0; i<5; i++) {
          if (wrapper.parentElement) wrapper = wrapper.parentElement;
      }
      const btn = wrapper.querySelector('div[aria-label="Bình luận"][role="button"], div[aria-label="Comment"][role="button"]');
      if (btn) {
          btn.click();
          return true;
      }
      return false;
  }, targetLikeButton);
  
  if (commentClicked) {
      await randomDelay(2, 3);
      
      log("Đang nhập bình luận...", "info");
      const commentText = randomChoice(comments);
      
      const commentBoxFocused = await page.evaluate((likeBtn) => {
          let wrapper = likeBtn;
          // Go high enough to encompass the comment box area
          for(let i=0; i<8; i++) {
              if (wrapper.parentElement) wrapper = wrapper.parentElement;
          }
          const box = wrapper.querySelector('div[role="textbox"][aria-label*="Bình luận"], div[role="textbox"][aria-label*="Comment"], div[role="textbox"][data-lexical-editor="true"]');
          if (box) {
              box.focus();
              return true;
          }
          // Fallback to searching the whole page for the active element
          const active = document.activeElement;
          if (active && active.getAttribute('role') === 'textbox') {
              return true; // it's already focused!
          }
          return false;
      }, targetLikeButton);

      if (commentBoxFocused) {
          await randomDelay(1, 2);
          await page.keyboard.type(commentText, { delay: 50 });
          await randomDelay(1, 2);
          await page.keyboard.press("Enter");
          log(`Đã bình luận thành công: "${commentText}"`, "success");
      } else {
          // Fallback to direct typing, assuming Facebook auto-focused it
          await page.keyboard.type(commentText, { delay: 50 });
          await randomDelay(1, 2);
          await page.keyboard.press("Enter");
          log(`Đã gõ trực tiếp bình luận (fallback): "${commentText}"`, "success");
      }
  } else {
      log("Không tìm thấy nút Bình luận bên cạnh nút Like.", "error");
  }

  await randomDelay(2, 3);

  // Save to store
  const postId = extractPostId(targetPostUrl || `inline-post-${Date.now()}`);
  store.markProcessed(postId, {
    url: targetPostUrl || "inline-interaction",
    postType: "status",
    reacted: true,
    commented: true,
    reaction
  });

  log("Đã hoàn tất toàn bộ thao tác cho bài viết này!", "success");
}

async function main() {
  const config = loadConfig();
  printBanner(config);

  log("Đang khởi động trình duyệt...", "step");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: PROFILE_DIR,
    args: ["--start-maximized", "--no-sandbox"]
  });

  const [page] = await browser.pages();

  // Check login status
  const isLoggedIn = await checkLogin(page);
  if (!isLoggedIn) {
    await waitForManualLogin(page);
  } else {
    log("Đã đăng nhập sẵn!", "success");
  }

  // Main loop
  log("Bot đã sẵn sàng! Bắt đầu theo dõi...", "success");

  let cycleCount = 0;
  const runCycle = async () => {
    cycleCount++;
    log(`\n${"═".repeat(50)}`, "info");
    log(`Chu kỳ #${cycleCount} - Đang kiểm tra bài viết mới...`, "step");
    log(`${"═".repeat(50)}`, "info");

    try {
      await processNewPosts(page, config);
    } catch (err) {
      log(`Lỗi trong chu kỳ kiểm tra: ${err.message}`, "error");
    }
  };

  // Run first cycle immediately
  await runCycle();

  // Schedule subsequent cycles
  const intervalMs = config.checkIntervalMinutes * 60 * 1000;
  log(`\nChờ ${config.checkIntervalMinutes} phút cho chu kỳ tiếp theo...`, "info");

  const interval = setInterval(async () => {
    await runCycle();
    log(`\nChờ ${config.checkIntervalMinutes} phút cho chu kỳ tiếp theo...`, "info");
  }, intervalMs);

  // Handle graceful shutdown
  const shutdown = async () => {
    log("\nĐang tắt bot...", "warn");
    clearInterval(interval);
    await browser.close();
    log("Bot đã dừng. Tạm biệt!", "info");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((err) => {
  log(`Lỗi nghiêm trọng: ${err.message}`, "error");
  console.error(err);
  process.exitCode = 1;
});
