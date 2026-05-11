# 🤖 Auto Engagement Bot - Facebook

Tự động theo dõi Facebook Page, thả cảm xúc và bình luận khi có bài viết mới từ tài khoản cá nhân.

## Tính năng

- ✅ Theo dõi 1 Facebook Page, kiểm tra bài viết mới theo chu kỳ
- ✅ Tự động thả cảm xúc (Like, Love, Haha, Wow, Sad, Angry)
- ✅ Tự động bình luận với nội dung tùy chỉnh
- ✅ Lưu lại bài đã xử lý, tránh tương tác trùng
- ✅ Delay ngẫu nhiên giữa các thao tác cho tự nhiên
- ✅ Sử dụng browser profile để giữ phiên đăng nhập

## Cài đặt

```bash
npm install
```

## Cấu hình

Chỉnh sửa file `config.json`:

```json
{
  "pageUrl": "https://www.facebook.com/profile.php?id=61583868984109",
  "checkIntervalMinutes": 60,
  "reaction": "love",
  "comments": [
    "Tuyệt vời 🥰"
  ],
  "maxPostsPerCheck": 3,
  "delayBetweenActions": {
    "minSeconds": 5,
    "maxSeconds": 12
  }
}
```

| Tham số | Mô tả |
|---------|--------|
| `pageUrl` | URL Facebook Page cần theo dõi |
| `checkIntervalMinutes` | Thời gian giữa các lần kiểm tra (phút) |
| `reaction` | Loại cảm xúc: `like`, `love`, `haha`, `wow`, `sad`, `angry` |
| `comments` | Danh sách bình luận (bot sẽ random chọn 1) |
| `maxPostsPerCheck` | Số bài tối đa xử lý mỗi lần kiểm tra |
| `delayBetweenActions` | Thời gian chờ giữa các thao tác (giây) |

## Chạy

```bash
npm start
```

Lần đầu chạy, bot sẽ mở trình duyệt. Nếu chưa đăng nhập, hãy đăng nhập thủ công, sau đó nhấn Enter trong terminal. Phiên đăng nhập sẽ được lưu lại cho lần sau.

## Cấu trúc

```
src/
├── auto-engage.js   # File chính, điều phối chương trình
├── monitor.js       # Theo dõi page, phát hiện bài mới
├── actions.js       # Thả cảm xúc & bình luận
├── store.js         # Lưu trữ bài đã xử lý
└── utils.js         # Tiện ích (delay, log, random)
```

## Dừng bot

Nhấn `Ctrl+C` trong terminal để dừng bot an toàn.

## Lưu ý

⚠️ Tool này sử dụng tự động hóa trình duyệt. Sử dụng với tần suất hợp lý để tránh bị hạn chế tài khoản.
