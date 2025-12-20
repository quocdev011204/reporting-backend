# Hướng dẫn Share Folder để Document được tạo đúng vị trí

## Vấn đề

Document được tạo ở root Drive thay vì trong folder vì folder chưa được share với account đang dùng.

## Giải pháp

### Bước 1: Xác định account đang được dùng

Code sẽ ưu tiên OAuth 2.0 nếu có đầy đủ credentials. Để kiểm tra:

1. Xem log của server khi tạo document:
   - Nếu thấy: `"Using OAuth 2.0 authentication (personal Gmail account)"` → Đang dùng OAuth 2.0
   - Nếu thấy: `"Using Service Account authentication (fallback)"` → Đang dùng Service Account

### Bước 2: Share folder với account phù hợp

#### Nếu đang dùng OAuth 2.0 (Personal Gmail):

1. Vào Google Drive: https://drive.google.com/
2. Tìm folder có ID: `1xfpLi71tSuli_xUWBhtKN9xldbpyjvwE`
   - Hoặc vào trực tiếp: `https://drive.google.com/drive/folders/1xfpLi71tSuli_xUWBhtKN9xldbpyjvwE`
3. Click chuột phải vào folder → **"Share"** (Chia sẻ)
4. Trong ô "Add people and groups", nhập **email Gmail của bạn** (email bạn dùng để authorize OAuth)
5. **QUAN TRỌNG:** Chọn quyền là **"Editor"**
6. **Bỏ tick** "Notify people" (không cần gửi email)
7. Click **"Share"** hoặc **"Send"**

#### Nếu đang dùng Service Account (Fallback):

1. Vào Google Drive: https://drive.google.com/
2. Tìm folder có ID: `1xfpLi71tSuli_xUWBhtKN9xldbpyjvwE`
3. Click chuột phải vào folder → **"Share"**
4. Trong ô "Add people and groups", nhập email Service Account:
   ```
   tl-156@tl12-481814.iam.gserviceaccount.com
   ```
5. **QUAN TRỌNG:** Chọn quyền là **"Editor"**
6. **Bỏ tick** "Notify people"
7. Click **"Share"**

### Bước 3: Kiểm tra folder đã được Share

1. Click vào folder
2. Click nút **"Share"** lại
3. Kiểm tra trong danh sách "People with access":
   - Phải thấy email bạn đã thêm
   - Quyền phải là: **"Editor"** hoặc **"Content manager"**

### Bước 4: Test lại API

Sau khi share folder, đợi 10-30 giây rồi test lại API tạo Google Docs. Document sẽ được tạo trong folder thay vì root Drive.

## Lưu ý quan trọng

1. **Quyền phải là Editor**: 
   - ✅ **Editor** - Có thể tạo, chỉnh sửa, xóa files
   - ❌ **Viewer** - Chỉ xem, không tạo được
   - ❌ **Commenter** - Chỉ comment, không tạo được

2. **Email phải đúng**:
   - Nếu dùng OAuth 2.0: Dùng email Gmail bạn đã authorize
   - Nếu dùng Service Account: `tl-156@tl12-481814.iam.gserviceaccount.com`

3. **Đợi vài giây**: Sau khi share, Google cần vài giây để sync quyền

## Troubleshooting

### Vẫn tạo ở root Drive sau khi share

1. Kiểm tra lại email đã share đúng chưa
2. Kiểm tra quyền là Editor chưa
3. Đợi thêm 30 giây rồi test lại
4. Kiểm tra log server xem đang dùng account nào

### Không biết email nào đang được dùng

Kiểm tra log server khi tạo document để xem:
- `Using OAuth 2.0 authentication` → Dùng email Gmail bạn authorize
- `Using Service Account authentication` → Dùng Service Account email

