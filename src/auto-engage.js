const fs = require("fs");
const path = require("path");
const readline = require("readline");
const puppeteer = require("puppeteer");

const { log, randomDelay, randomChoice, extractPostId } = require("./utils");
const store = require("./store");

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

  // Cuộn xuống một chút để kích hoạt tải feed, rồi cuộn ngược lên đầu trang
  // Lý do: Facebook dùng virtual DOM - khi cuộn xuống quá xa, bài viết mới nhất
  // ở trên cùng sẽ bị XÓA khỏi DOM để tiết kiệm bộ nhớ.
  log("Đang tải feed...", "info");
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await randomDelay(1.5, 2);
  }
  // Cuộn về đầu trang để bài mới nhất hiện trong DOM
  await page.evaluate(() => window.scrollTo(0, 0));
  await randomDelay(2, 3);
  // Cuộn xuống vừa đủ để qua phần header/ảnh bìa và thấy bài đầu tiên
  await page.evaluate(() => window.scrollBy(0, 700));
  await randomDelay(1, 2);

  // Tìm bài viết mới nhất và xác định nút Like của Fanpage
  const targetLikeBtnInfo = await page.evaluate(() => {
      // Tìm tất cả các bài viết (feed units)
      const feedUnits = document.querySelectorAll('[aria-posinset]');
      for (const unit of feedUnits) {
          // Lên vài cấp để bao trọn cả bài viết (phòng trường hợp action bar nằm ngoài thẻ aria-posinset một chút)
          let wrapper = unit;
          for(let i=0; i<3; i++) {
             if(wrapper.parentElement) wrapper = wrapper.parentElement;
          }
          
          const likeBtns = wrapper.querySelectorAll(
              'div[aria-label="Thích"][role="button"], ' +
              'div[aria-label="Like"][role="button"], ' +
              'div[aria-label*="Gỡ Thích"], ' +
              'div[aria-label*="Remove Like"], ' +
              'div[aria-label*="Gỡ Yêu thích"], ' +
              'div[aria-label*="Remove Love"]'
          );
          
          if (likeBtns.length === 0) continue;
          
          // Lọc bỏ các nút Like CỦA BÌNH LUẬN (Comment Like buttons).
          // Nút Like của bài viết thường to (height ~ 32px), không nằm trong thẻ <ul> hay <li>.
          // Nút Like của bình luận là dạng text nhỏ (height ~ 12px-16px) và thường nằm trong <ul>/<li>.
          const validPostLikeBtns = Array.from(likeBtns).filter(btn => {
              const r = btn.getBoundingClientRect();
              if (r.height < 24) return false; // Loại bỏ nút quá nhỏ (nút của comment)
              
              // Kiểm tra xem có nằm trong danh sách bình luận không
              let cur = btn;
              for(let i=0; i<8; i++) {
                 if(!cur) break;
                 const tag = cur.tagName.toLowerCase();
                 if(tag === 'li' || tag === 'ul') return false;
                 cur = cur.parentElement;
              }
              return true;
          });
          
          if (validPostLikeBtns.length === 0) continue;
          
          // Lấy nút Like NGOÀI CÙNG của BÀI VIẾT (thuộc về Fanpage hiện tại chứ không phải bài bị share bên trong).
          // Nút ngoài cùng luôn nằm ở cuối cùng trong DOM của bài viết đó.
          const targetBtn = validPostLikeBtns[validPostLikeBtns.length - 1];
          
          const rect = targetBtn.getBoundingClientRect();
          if (rect.width === 0) continue;
          
          const absoluteY = rect.top + window.scrollY;
          
          // Bỏ qua nút Like nằm trong header/avatar
          if (absoluteY < 600) continue;
          
          // Đánh dấu nút này để Puppeteer lấy ElementHandle ở bước sau
          targetBtn.setAttribute('data-bot-target', 'true');
          
          return {
             y: absoluteY,
             label: targetBtn.getAttribute('aria-label')
          };
      }
      return null;
  });
  
  if (!targetLikeBtnInfo) {
      log("Không tìm thấy nút Like của bài viết nào trên trang. Có thể do mạng chậm, hãy thử lại.", "warn");
      return;
  }
  
  // Kiểm tra bài mới nhất đã được tương tác chưa
  if (targetLikeBtnInfo.label.includes('Gỡ') || targetLikeBtnInfo.label.includes('Remove')) {
      log("Bài viết MỚI NHẤT đã được tương tác rồi. Không làm gì thêm.", "info");
      return;
  }
  
  // Lấy ElementHandle của nút Like đã được đánh dấu
  const targetLikeButton = await page.$('[data-bot-target="true"]');
  
  // Trích xuất URL bài viết để lưu lịch sử
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
  }, targetLikeButton);
  
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

  // 3. Tìm nút bình luận (chỉ 2 cấp trên từ nút Like)
  log("Đang tìm nút bình luận...", "info");
  const commentClicked = await page.evaluate((likeBtn) => {
      let wrapper = likeBtn;
      // Chỉ cần lên 2-3 cấp là đến container chứa cả nút Like và nút Bình luận
      for(let i=0; i<3; i++) {
          if (wrapper.parentElement) wrapper = wrapper.parentElement;
      }
      const btn = wrapper.querySelector(
          'div[aria-label="Viết bình luận"][role="button"], ' +
          'div[aria-label="Leave a comment"][role="button"], ' +
          'div[aria-label="Bình luận"][role="button"], ' +
          'div[aria-label="Comment"][role="button"]'
      );
      if (btn) { btn.click(); return true; }
      return false;
  }, targetLikeButton);
  
  if (commentClicked) {
      // Chờ Facebook mở và auto-focus ô bình luận
      await randomDelay(2, 3);
      
      log("Đang nhập bình luận...", "info");
      const commentText = randomChoice(comments);
      
      // Lấy chính xác ô textbox đang được focus (Facebook tự động focus sau khi bấm Viết bình luận)
      const activeElementHandle = await page.evaluateHandle(() => {
          return document.activeElement;
      });

      const isActiveTextbox = await page.evaluate((el) => {
          return el && el.getAttribute('role') === 'textbox';
      }, activeElementHandle);

      if (isActiveTextbox) {
          // Bấm thêm 1 lần cho chắc chắn
          await activeElementHandle.click();
          await randomDelay(1, 2);
          await page.keyboard.type(commentText, { delay: 60 });
          await randomDelay(1, 2);
          await page.keyboard.press("Enter");
          log(`Đã bình luận thành công: "${commentText}"`, "success");
      } else {
          // Fallback: Tìm textbox gần nút Like nhất
          log("Không thấy ô bình luận auto-focus, tìm xung quanh bài viết...", "warn");
          const fallbackBox = await page.evaluateHandle((likeBtn) => {
              let wrapper = likeBtn;
              for(let i=0; i<8; i++) {
                  if(wrapper.parentElement) wrapper = wrapper.parentElement;
              }
              return wrapper.querySelector('div[role="textbox"]');
          }, targetLikeButton);
          
          const hasFallback = await page.evaluate(el => el !== null, fallbackBox);
          if (hasFallback) {
              await fallbackBox.click();
              await randomDelay(1, 2);
              await page.keyboard.type(commentText, { delay: 60 });
              await randomDelay(1, 2);
              await page.keyboard.press("Enter");
              log(`Đã bình luận thành công (fallback): "${commentText}"`, "success");
          } else {
              log("Hoàn toàn không tìm thấy ô bình luận nào!", "error");
          }
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
