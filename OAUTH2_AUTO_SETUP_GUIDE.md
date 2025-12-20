# Hướng dẫn Setup OAuth 2.0 Tự Động (Giống n8n)

## Giới thiệu

Giờ đây bạn chỉ cần **Client ID** và **Client Secret**, không cần lấy refresh token thủ công nữa! Hệ thống sẽ tự động redirect bạn đến Google để authorize và lấy refresh token.

## Các bước setup

### Bước 1: Setup OAuth Client trong Google Cloud Console

1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project của bạn
3. Vào **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. **Application type**: Chọn **Web application**
6. **Name**: Đặt tên bất kỳ (ví dụ: "My App")
7. **Authorized redirect URIs**: Thêm:
   ```
   http://localhost:3000/auth/google/callback
   ```
   (Nếu deploy production, thay bằng domain của bạn)
8. Click **Create**
9. **Lưu lại**:
   - **Client ID** (copy)
   - **Client Secret** (copy)

### Bước 2: Thêm vào file .env

Thêm các biến sau vào file `.env`:

```env
# OAuth 2.0 Credentials (chỉ cần 2 dòng này!)
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Optional: Nếu deploy production, thêm:
# APP_URL=https://yourdomain.com
# GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/auth/google/callback
```

**Lưu ý**: KHÔNG cần `GOOGLE_REFRESH_TOKEN` nữa! Hệ thống sẽ tự động lấy.

### Bước 3: Authorize để lấy Refresh Token

1. **Restart server**:
   ```bash
   npm run start:dev
   ```

2. **Mở browser** và vào:
   ```
   http://localhost:3000/auth/google
   ```

3. Bạn sẽ được redirect đến Google để đăng nhập và authorize

4. Sau khi authorize, bạn sẽ được redirect về và thấy thông báo thành công

5. **Refresh token đã được tự động lưu vào file `.env`**

### Bước 4: Test lại

Sau khi authorize, bạn có thể test lại API tạo Google Docs. Refresh token đã được lưu tự động, không cần làm gì thêm!

## So sánh với n8n

| Tính năng | n8n | NestJS (mới) |
|-----------|-----|--------------|
| Client ID | ✅ Cần | ✅ Cần |
| Client Secret | ✅ Cần | ✅ Cần |
| Refresh Token | ❌ Tự động | ❌ Tự động |
| Authorize | Click "Connect" | Vào `/auth/google` |

## Troubleshooting

### Lỗi: "redirect_uri_mismatch"
- Kiểm tra redirect URI trong OAuth Client đúng chưa
- Phải là: `http://localhost:3000/auth/google/callback` (hoặc domain của bạn)

### Lỗi: "No refresh token received"
- Đảm bảo bạn đã tick tất cả permissions khi authorize
- Thử lại bằng cách vào `/auth/google` lại

### Lỗi: "OAuth 2.0 credentials found but no refresh token"
- Bạn cần authorize lần đầu tại `/auth/google`
- Sau khi authorize, refresh token sẽ được lưu tự động

## Lưu ý quan trọng

1. **Chỉ cần authorize một lần**: Sau khi authorize, refresh token được lưu vào `.env` và tự động dùng cho các lần sau
2. **Refresh token không hết hạn**: Trừ khi bạn revoke quyền trong Google Account settings
3. **Nếu revoke quyền**: Chỉ cần vào `/auth/google` lại để authorize lại

## Production Deployment

Khi deploy production, nhớ:
1. Thêm redirect URI production vào OAuth Client
2. Set `APP_URL` và `GOOGLE_OAUTH_REDIRECT_URI` trong `.env`
3. Đảm bảo HTTPS được enable (Google yêu cầu HTTPS cho production)

