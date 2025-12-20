# Hướng dẫn cấu hình HTTP Request Nodes trong N8N Workflow

## Base URL
```
http://localhost:3000
```

---

## 1. **HTTP Request: Merge Data PTM** (sau node "Merge")
**Mục đích:** Gọi API để merge data từ Projects, Tasks, Team Members

### Cấu hình:
- **Method:** `GET`
- **URL:** `http://localhost:3000/workflow/merge-data`
- **Authentication:** None (Public endpoint)
- **Response Format:** JSON

### Response mẫu:
```json
{
  "projects": [...],
  "tasks": [...],
  "teamMembers": [...],
  "summary": {
    "totalProjects": 10,
    "totalTasks": 50,
    "totalMembers": 5
  }
}
```

---

## 2. **HTTP Request: Build Prompt** (sau "Merge Data PTM")
**Mục đích:** Build prompt cho AI Agent

### Cấu hình:
- **Method:** `GET`
- **URL:** `http://localhost:3000/workflow/build-prompt`
- **Query Parameters:**
  - `chartUrl` (optional): URL của chart từ QuickChart
  - `startDate` (optional): Ngày bắt đầu (format: YYYY-MM-DD)
  - `endDate` (optional): Ngày kết thúc (format: YYYY-MM-DD)
- **Authentication:** None (Public endpoint)

### Ví dụ URL:
```
http://localhost:3000/workflow/build-prompt?chartUrl=https://quickchart.io/chart?c=...&startDate=2024-01-01&endDate=2024-01-31
```

### Response mẫu:
```json
{
  "prompt": "# Báo cáo Tổng hợp...",
  "metadata": {
    "totalProjects": 10,
    "totalTasks": 50,
    "completionRate": 75.5
  }
}
```

---

## 3. **HTTP Request: Prepare Data** (thay thế cho việc gọi nhiều API riêng lẻ)
**Mục đích:** Lấy tất cả dữ liệu cần thiết trong 1 lần gọi

### Cấu hình:
- **Method:** `GET`
- **URL:** `http://localhost:3000/workflow/prepare-data`
- **Query Parameters:**
  - `chartUrl` (optional): URL của chart
  - `startDate` (optional): Ngày bắt đầu
  - `endDate` (optional): Ngày kết thúc
- **Authentication:** None (Public endpoint)

### Response mẫu:
```json
{
  "mergedData": {...},
  "kpi": {...},
  "chartData": {...},
  "prompt": "...",
  "readyForAI": true
}
```

---

## 4. **HTTP Request: Process AI Report** (sau AI Agent)
**Mục đích:** Xử lý AI và tạo report

### Cấu hình:
- **Method:** `POST`
- **URL:** `http://localhost:3000/workflow/process-ai-report`
- **Headers:**
  - `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "chartUrl": "https://quickchart.io/chart?c=...",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```
- **Authentication:** None (Public endpoint)

---

## 5. **HTTP Request: Upload File to Google Drive** (sau "Prepare Chart Data")
**Mục đích:** Upload chart lên Google Drive

### Cấu hình:
- **Method:** `POST`
- **URL:** `http://localhost:3000/workflow/upload-file`
- **Headers:**
  - `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "name": "KPI_Chart_2024-01-31.png",
  "content": "data:image/png;base64,iVBORw0KG...", // hoặc URL
  "mimeType": "image/png",
  "folderId": "your-folder-id" // optional
}
```
- **Authentication:** None (Public endpoint)

### Response mẫu:
```json
{
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "fileName": "KPI_Chart_2024-01-31.png",
  "mimeType": "image/png",
  "uploadedAt": "2024-01-31T10:00:00.000Z"
}
```

---

## 6. **HTTP Request: Share File** (sau "Upload file")
**Mục đích:** Share file trên Google Drive

### Cấu hình:
- **Method:** `POST`
- **URL:** `http://localhost:3000/workflow/share-file`
- **Headers:**
  - `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "fileId": "1a2b3c4d5e6f7g8h9i0j", // từ response của upload-file
  "role": "reader", // "reader" | "writer" | "commenter"
  "type": "anyone", // "user" | "group" | "domain" | "anyone"
  "emailAddress": "user@example.com" // optional, nếu type = "user"
}
```
- **Authentication:** None (Public endpoint)

### Response mẫu:
```json
{
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "shared": true,
  "shareUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view",
  "sharedAt": "2024-01-31T10:00:00.000Z"
}
```

---

## 7. **HTTP Request2: Build Google Drive URL** (sau "Upload file")
**Mục đích:** Build URL để share file

### Cấu hình:
- **Method:** `GET`
- **URL:** `http://localhost:3000/workflow/build-drive-url`
- **Query Parameters:**
  - `fileId`: File ID từ response của upload-file
- **Authentication:** None (Public endpoint)

### Ví dụ URL:
```
http://localhost:3000/workflow/build-drive-url?fileId=1a2b3c4d5e6f7g8h9i0j
```

### Response mẫu:
```json
{
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "viewUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view",
  "editUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/edit",
  "downloadUrl": "https://drive.google.com/uc?export=download&id=1a2b3c4d5e6f7g8h9i0j",
  "shareUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view?usp=sharing"
}
```

---

## 8. **HTTP Request: Upload and Share** (thay thế cho upload + share riêng)
**Mục đích:** Upload và share file trong 1 lần gọi

### Cấu hình:
- **Method:** `POST`
- **URL:** `http://localhost:3000/workflow/upload-and-share`
- **Headers:**
  - `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "name": "KPI_Chart_2024-01-31.png",
  "content": "data:image/png;base64,iVBORw0KG...",
  "mimeType": "image/png",
  "folderId": "your-folder-id",
  "shareRole": "reader",
  "shareType": "anyone"
}
```
- **Authentication:** None (Public endpoint)

---

## 9. **HTTP Request3: Prepare Message** (trước "Send a message2")
**Mục đích:** Prepare data cho việc gửi message

### Cấu hình:
- **Method:** `POST`
- **URL:** `http://localhost:3000/workflow/prepare-message`
- **Headers:**
  - `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "reportId": 123, // optional, ID của report đã tạo
  "aiResponse": "Báo cáo đã được tạo..." // optional, response từ AI
}
```
- **Authentication:** None (Public endpoint)

### Response mẫu:
```json
{
  "timestamp": "2024-01-31T10:00:00.000Z",
  "report": {
    "id": 123,
    "title": "Báo cáo tháng 1",
    "project": {...}
  },
  "aiResponse": "..."
}
```

---

## 10. **QuickChart - KPI Chart** (External Service)
**Mục đích:** Tạo chart từ QuickChart.io (không phải backend này)

### Cấu hình:
- **Method:** `GET`
- **URL:** `https://quickchart.io/chart`
- **Query Parameters:**
  - `c`: Chart configuration (JSON encoded)
  - `width`: Width của chart (optional)
  - `height**: Height của chart (optional)

### Ví dụ:
```
https://quickchart.io/chart?c={"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"Data","data":[1,2]}]}}
```

---

## Các API khác có thể dùng:

### Get Chart Data
- **Method:** `GET`
- **URL:** `http://localhost:3000/charts/data`
- **Response:** Dữ liệu cho biểu đồ (tasksByStatus, tasksByPriority, etc.)

### Get KPI
- **Method:** `GET`
- **URL:** `http://localhost:3000/kpi`
- **Response:** KPI metrics

### Get KPI by Date Range
- **Method:** `GET`
- **URL:** `http://localhost:3000/kpi/range?start=2024-01-01&end=2024-01-31`

### Create Report
- **Method:** `POST`
- **URL:** `http://localhost:3000/reports`
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`
- **Body:**
```json
{
  "title": "Báo cáo tháng 1",
  "value": 100
}
```

### Create Report from AI
- **Method:** `POST`
- **URL:** `http://localhost:3000/reports/ai`
- **Body:**
```json
{
  "projectId": 1,
  "userId": 1,
  "title": "Báo cáo AI",
  "type": "weekly",
  "data": {...}
}
```

---

## Lưu ý:
1. Tất cả các endpoint `/workflow/*` đều là **Public** (không cần JWT)
2. Các endpoint khác có thể cần JWT token (xem trong controller có `@UseGuards(JwtAuthGuard)`)
3. Để lấy JWT token, gọi `POST /auth/login` với username/password
4. Base URL có thể thay đổi tùy môi trường (dev/prod)

