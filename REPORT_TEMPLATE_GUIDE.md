# Hướng dẫn Template Báo cáo Daily vs Weekly

## Tổng quan

Hệ thống hỗ trợ 2 loại báo cáo theo chuẩn PM/Executive:
- **Daily Report**: Ngắn gọn, tập trung vào hành động ngay
- **Weekly Report**: Chi tiết, phân tích sâu và chiến lược

## Daily Report Template

### Đặc điểm
- **Độ dài**: Tối đa 1500 ký tự
- **Mục đích**: Báo cáo ngắn gọn, tập trung vào hành động cần làm NGAY HÔM NAY
- **Đối tượng**: Team lead, PM, quản lý cần cập nhật nhanh

### Cấu trúc

1. **EXECUTIVE SUMMARY** (2-3 dòng)
   - Trạng thái tổng thể: On Track / At Risk / Off Track
   - Số liệu chính: X dự án, Y tasks, Z% completion rate
   - Điểm nổi bật nhất

2. **PHÂN TÍCH XU HƯỚNG** (So sánh với hôm qua)
   - Thống kê task theo trạng thái
   - So sánh tăng/giảm: "To Do tăng +5", "Done tăng +3"
   - Đánh giá: Cải thiện / Xấu đi / Không đổi

3. **ĐIỂM BẤT THƯỜNG & CẢNH BÁO**
   - Chỉ liệt kê vấn đề THỰC SỰ cần quan tâm
   - Tỷ lệ To Do >80% → Nguy cơ dồn việc
   - In Progress <2 tasks → Bottleneck
   - Phân tích nguyên nhân ngắn gọn

4. **RỦI RO** (Tách rõ 2 loại)
   - **Rủi ro tiến độ**: Task sắp hết hạn trong 1-2 ngày
   - **Rủi ro nhân sự**: Người chậm tiến độ, bottleneck

5. **HÀNH ĐỘNG ĐỀ XUẤT** (Có mức độ ưu tiên)
   - [HIGH] - Cần làm NGAY HÔM NAY
   - [MEDIUM] - Cần làm trong 1-2 ngày tới
   - [LOW] - Có thể lên kế hoạch tuần sau

### Ví dụ Daily Report

```
EXECUTIVE SUMMARY
Trạng thái: At Risk - 9 dự án, 19 tasks, 5% completion rate. Tỷ lệ To Do quá cao (90%) là điểm đáng lo ngại nhất.

PHÂN TÍCH XU HƯỜNG
• To Do: 17 tasks (tăng +5 so với hôm qua) - Dấu hiệu dồn việc
• In Progress: 1 task (không đổi) - Bottleneck nghiêm trọng
• Done: 1 task (tăng +1) - Tiến độ chậm
Đánh giá: Xấu đi - Cần hành động ngay

ĐIỂM BẤT THƯỜNG & CẢNH BÁO
• Tỷ lệ To Do chiếm 90% tổng task → Nguy cơ dồn việc cuối kỳ
• Chỉ 1 task đang thực hiện → Bottleneck nghiêm trọng, cần phân bổ lại workload

RỦI RO

Rủi ro tiến độ:
• Gather Requirements (40h) - Deadline: 22/12 - Nguy cơ trễ
• Develop Core Backend API (40h) - Deadline: 23/12 - Tác động đến milestone

Rủi ro nhân sự:
• Nguyen Van Admin - Chậm tiến độ task "Gather Requirements"
• Nguyen Thanh Nguyen - Quá nhiều task To Do (4 tasks)

HÀNH ĐỘNG ĐỀ XUẤT
[HIGH] Yêu cầu Nguyen Van Admin báo cáo tiến độ task "Gather Requirements" - Deadline: Hôm nay
[HIGH] Phân bổ lại workload cho Nguyen Thanh Nguyen - Deadline: Hôm nay
[MEDIUM] Giao Nguyen Luan hỗ trợ Nguyen Van Admin và Nguyen Thanh Nguyen từ 21/12 đến 23/12
[LOW] Tổ chức họp đánh giá tiến độ dự án - Deadline: 25/12
```

## Weekly Report Template

### Đặc điểm
- **Độ dài**: Tối đa 2500 ký tự
- **Mục đích**: Báo cáo tổng hợp tuần, phân tích xu hướng và đưa ra chiến lược
- **Đối tượng**: Executive, PM, stakeholders cần cái nhìn tổng quan

### Cấu trúc

1. **EXECUTIVE SUMMARY** (4-5 dòng)
   - Trạng thái tổng thể
   - Số liệu chính và so sánh với tuần trước
   - Điểm nổi bật và thành tựu
   - Thách thức lớn nhất

2. **PHÂN TÍCH XU HƯỚNG TUẦN** (So sánh với tuần trước)
   - Thống kê chi tiết theo trạng thái
   - So sánh % tăng/giảm
   - Xu hướng tổng thể
   - Dự đoán tuần tới

3. **PHÂN TÍCH CHI TIẾT**
   - **Điểm mạnh**: Những gì làm tốt
   - **Điểm yếu & Bất thường**: Vấn đề và nguyên nhân gốc rễ
   - **Cơ hội**: Tối ưu hóa và tăng tốc

4. **RỦI RO & THÁCH THỨC** (Phân tích sâu)
   - **Rủi ro tiến độ**: Task sắp hết hạn, milestone có nguy cơ
   - **Rủi ro nhân sự**: Người chậm tiến độ, workload, bottleneck
   - **Rủi ro kỹ thuật**: Vấn đề kỹ thuật, dependencies

5. **HÀNH ĐỘNG ĐỀ XUẤT** (Chiến lược tuần tới)
   - Format: [Priority] Action - Owner - Timeline - Success Criteria
   - Mỗi hành động có tiêu chí thành công rõ ràng

6. **METRICS & KPIs** (Nếu có)
   - Completion rate, Velocity, Cycle time
   - So sánh với tuần trước và mục tiêu

### Ví dụ Weekly Report

```
EXECUTIVE SUMMARY
Trạng thái: At Risk - 9 dự án, 19 tasks, 5% completion rate. So với tuần trước, số task To Do tăng 30%, tiến độ chậm đáng kể. Thành tựu: Hoàn thành setup infrastructure. Thách thức: Bottleneck nhân sự và dồn việc cuối kỳ.

PHÂN TÍCH XU HƯỚNG TUẦN
• To Do: 17 tasks (tăng +5, +42%) - Nguyên nhân: Thiếu phân bổ workload
• In Progress: 1 task (giảm -2, -67%) - Hiệu quả làm việc giảm
• Done: 1 task (tăng +1, +100%) - Tốc độ hoàn thành chậm
• Blocked: 0 tasks (không đổi)
Xu hướng: Xấu đi - Cần can thiệp ngay. Dự đoán tuần tới: Nếu không hành động, số task To Do sẽ tiếp tục tăng.

PHÂN TÍCH CHI TIẾT

Điểm mạnh:
• Infrastructure setup hoàn thành đúng hạn
• Team có tinh thần hợp tác tốt

Điểm yếu & Bất thường:
• Tỷ lệ To Do >90% → Nguy cơ dồn việc cuối kỳ
• In Progress <5% → Bottleneck nghiêm trọng, thiếu người làm việc
• Tỷ lệ Done <10% → Tiến độ chậm, cần tăng tốc
Nguyên nhân gốc rễ: Phân bổ workload không đều, thiếu hỗ trợ cho team members

Cơ hội:
• Tận dụng Nguyen Luan để hỗ trợ các task đang chậm
• Tối ưu hóa quy trình phân bổ task

RỦI RO & THÁCH THỨC

Rủi ro tiến độ:
• Gather Requirements (40h) - Deadline: 22/12 - Xác suất trễ: 70% - Tác động: Trễ milestone Phase 1
• Develop Core Backend API (40h) - Deadline: 23/12 - Xác suất trễ: 60% - Tác động: Block các task phụ thuộc

Rủi ro nhân sự:
• Nguyen Van Admin - Chậm tiến độ task "Gather Requirements" - Nguyên nhân: Thiếu kinh nghiệm, cần hỗ trợ
• Nguyen Thanh Nguyen - Workload quá cao (4 tasks) - Nguyên nhân: Phân bổ không đều
Giải pháp: Giao hỗ trợ và phân bổ lại workload

Rủi ro kỹ thuật:
• Dependencies giữa "Gather Requirements" và "Develop Core Backend API" → Nếu trễ sẽ ảnh hưởng chuỗi

HÀNH ĐỘNG ĐỀ XUẤT

[HIGH] Yêu cầu Nguyen Van Admin báo cáo tiến độ hàng ngày cho task "Gather Requirements" - Owner: PM - Timeline: 21/12-27/12 - Success: Hoàn thành 80% vào 25/12

[HIGH] Phân bổ lại workload cho Nguyen Thanh Nguyen, giảm từ 4 xuống 2 tasks - Owner: PM - Timeline: 21/12 - Success: Nguyen Thanh Nguyen chỉ còn 2 tasks

[MEDIUM] Giao Nguyen Luan hỗ trợ Nguyen Van Admin và Nguyen Thanh Nguyen - Owner: PM - Timeline: 21/12-27/12 - Success: Giảm 50% workload của 2 người

[MEDIUM] Tổ chức họp đánh giá tiến độ và planning tuần tới - Owner: PM - Timeline: 28/12 - Success: Có action items cụ thể và timeline rõ ràng

[LOW] Điều chỉnh phân công Tran Bao Quoc tập trung vào task "Core Feature Development" - Owner: PM - Timeline: 22/12-29/12 - Success: Hoàn thành task đúng hạn

METRICS & KPIs
• Completion rate: 5% (giảm 2% so với tuần trước)
• Velocity: 1 task/tuần (mục tiêu: 5 tasks/tuần)
• Average cycle time: 15 ngày (mục tiêu: 7 ngày)
• Blocked time: 0 giờ
```

## Cách sử dụng

### API Endpoint

**GET `/workflow/build-prompt`**
- Query params:
  - `reportType`: `daily` hoặc `weekly` (mặc định: `daily`)
  - `chartUrl`: (optional)
  - `startDate`: (optional)
  - `endDate`: (optional)

**POST `/workflow/process-ai-report`**
- Body:
  ```json
  {
    "reportType": "daily", // hoặc "weekly"
    "chartUrl": "...",
    "startDate": "...",
    "endDate": "...",
    "createGoogleDoc": true,
    "googleDocFolderId": "..."
  }
  ```

### Ví dụ Request

**Daily Report:**
```bash
POST /workflow/process-ai-report
{
  "reportType": "daily",
  "createGoogleDoc": true,
  "googleDocFolderId": "1eqyn5vSSkYNU8LS7fBN2iO4OoIJpmPho"
}
```

**Weekly Report:**
```bash
POST /workflow/process-ai-report
{
  "reportType": "weekly",
  "startDate": "2025-12-14",
  "endDate": "2025-12-20",
  "createGoogleDoc": true,
  "googleDocFolderId": "1eqyn5vSSkYNU8LS7fBN2iO4OoIJpmPho"
}
```

## So sánh Daily vs Weekly

| Tiêu chí | Daily Report | Weekly Report |
|----------|-------------|---------------|
| **Độ dài** | ~1500 ký tự | ~2500 ký tự |
| **Mục đích** | Hành động ngay | Chiến lược tuần tới |
| **So sánh** | Với hôm qua | Với tuần trước |
| **Phân tích** | Ngắn gọn | Chi tiết, sâu |
| **Rủi ro** | 1-2 ngày tới | Tuần tới |
| **Hành động** | Ưu tiên cao | Có Success Criteria |
| **Metrics** | Không có | Có KPIs |

## Best Practices

1. **Daily Report**: Dùng cho standup meeting, cập nhật nhanh
2. **Weekly Report**: Dùng cho weekly review, báo cáo executive
3. **Chọn reportType phù hợp**: Daily cho hàng ngày, Weekly cho cuối tuần
4. **Kết hợp cả 2**: Daily để theo dõi, Weekly để đánh giá tổng thể

