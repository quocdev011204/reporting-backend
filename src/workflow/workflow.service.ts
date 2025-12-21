import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';
import { KpiService } from '../kpi/kpi.service';
import { ChartsService } from '../charts/charts.service';
import { ReportsService } from '../reports/reports.service';
import axios from 'axios';
import { google } from 'googleapis';
import { Readable } from 'stream';
import * as nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private kpiService: KpiService,
    private chartsService: ChartsService,
    private reportsService: ReportsService,
    private configService: ConfigService,
  ) { }

  /**
   * Merge data từ Projects, Tasks, và Team Members
   * Trả về dữ liệu đã được merge và format sẵn
   */
  async mergeDataPTM() {
    const [projects, tasks, users] = await Promise.all([
      this.prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.findMany({
        include: {
          project: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              username: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      projects,
      tasks,
      teamMembers: users,
      summary: {
        totalProjects: projects.length,
        totalTasks: tasks.length,
        totalMembers: users.length,
        projectsByStatus: this.groupByStatus(projects, 'status'),
        tasksByStatus: this.groupByStatus(tasks, 'status'),
      },
    };
  }

  /**
   * Build prompt cho AI Agent từ dữ liệu đã merge - Format CSV
   */
  async buildPrompt(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
    reportType: 'daily' | 'weekly' = 'daily',
  ) {
    const mergedData = await this.mergeDataPTM();
    const kpi = await this.kpiService.calculateKPI();

    // Tạo items từ tasks để build CSV
    const items = mergedData.tasks.map((task) => ({
      json: {
        'Task Title': task.title || '',
        'Project': task.project?.name || '',
        'Assignee': task.assignedTo?.name || task.assignedTo?.username || 'Chưa gán',
        'Status': task.status || '',
        'Priority': task.priority || '',
        'Estimated Time': task.estimatedTime || 0,
        'Description': task.description || '',
      },
    }));

    if (!items.length) {
      return {
        prompt: 'No data.',
        metadata: {
          totalProjects: kpi.projects.total,
          totalTasks: kpi.tasks.total,
          totalMembers: kpi.team.totalMembers,
          completionRate: kpi.tasks.completionRate,
          chartUrl,
          dateRange,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // Build CSV
    const headers = Object.keys(items[0].json);
    const rows = items.map((i) =>
      headers.map((h) => (i.json as Record<string, any>)[h] ?? ''),
    );
    const esc = (v: any) => String(v).replace(/"/g, '""');
    const csvRows = rows.map((r) => r.map(esc).join(','));
    let csv = `${headers.join(',')}\n${csvRows.join('\n')}`;

    // Giới hạn CSV length
    if (csv.length > 20000) csv = csv.slice(0, 20000);

    // Build prompt theo chuẩn PM/Executive - Daily hoặc Weekly
    const isDaily = reportType === 'daily';
    const prompt = this.buildReportPrompt(isDaily, csv, kpi, dateRange);

    return {
      prompt,
      metadata: {
        totalProjects: kpi.projects.total,
        totalTasks: kpi.tasks.total,
        totalMembers: kpi.team.totalMembers,
        completionRate: kpi.tasks.completionRate,
        chartUrl,
        dateRange,
        reportType,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build prompt theo chuẩn PM/Executive - Daily hoặc Weekly
   */
  private buildReportPrompt(
    isDaily: boolean,
    csv: string,
    kpi: any,
    dateRange?: { start: string; end: string },
  ): string {
    const reportType = isDaily ? 'Daily' : 'Weekly';
    const timeScope = isDaily ? 'ngày hôm nay' : 'tuần này';

    if (isDaily) {
      // Template Daily Report - Ngắn gọn, tập trung vào hành động ngay
      return `Bạn là Project Manager chuyên nghiệp. Tạo báo cáo Daily Standup theo chuẩn PM/Executive.

MỤC ĐÍCH: Báo cáo ngắn gọn, tập trung vào hành động cần làm NGAY HÔM NAY.

CẤU TRÚC BÁO CÁO (theo thứ tự):

1. **EXECUTIVE SUMMARY** (2-3 dòng)
   - Tóm tắt trạng thái tổng thể: On Track / At Risk / Off Track
   - Số liệu chính: X dự án, Y tasks, Z% completion rate
   - Điểm nổi bật nhất cần lưu ý

2. **PHÂN TÍCH XU HƯỚNG** (So sánh với hôm qua)
   - Thống kê task theo trạng thái: To Do, In Progress, Done, Blocked
   - So sánh tăng/giảm: "To Do tăng +5", "In Progress giảm -2", "Done tăng +3"
   - Đánh giá: Cải thiện / Xấu đi / Không đổi
   - Nếu không có dữ liệu so sánh: Đổi thành "Phân bố trạng thái hiện tại"

3. **ĐIỂM BẤT THƯỜNG & CẢNH BÁO**
   - CHỈ liệt kê các vấn đề THỰC SỰ cần quan tâm:
     • Tỷ lệ To Do >80% → Nguy cơ dồn việc cuối kỳ
     • In Progress <2 tasks → Bottleneck nghiêm trọng
     • Tỷ lệ Done <10% → Tiến độ chậm
     • Task Blocked (nếu có) → Nguyên nhân và tác động
   - KHÔNG liệt kê "không có Blocked" nếu đó là điều bình thường
   - Mỗi điểm bất thường phải có phân tích nguyên nhân ngắn gọn

4. **RỦI RO** (Tách rõ 2 loại)

   a. **Rủi ro tiến độ:**
      • Task sắp hết hạn trong 1-2 ngày tới (kèm deadline cụ thể)
      • Task có nguy cơ trễ deadline
      • Tác động đến milestone sắp tới
   
   b. **Rủi ro nhân sự:**
      • Người chậm tiến độ (kèm task cụ thể)
      • Người có quá nhiều task To Do (>3 tasks)
      • Người thiếu hỗ trợ hoặc bị bottleneck

5. **HÀNH ĐỘNG ĐỀ XUẤT** (Ưu tiên theo mức độ)

   Format: [Priority] Action - Owner - Deadline
   
   [HIGH] - Hành động cần làm NGAY HÔM NAY, ảnh hưởng nghiêm trọng đến tiến độ
   [MEDIUM] - Hành động quan trọng, cần làm trong 1-2 ngày tới
   [LOW] - Hành động cải thiện, có thể lên kế hoạch tuần sau
   
   Ví dụ:
   [HIGH] Yêu cầu Nguyen Van Admin báo cáo tiến độ task "Gather Requirements" - Deadline: Hôm nay
   [MEDIUM] Giao Nguyen Luan hỗ trợ Nguyen Thanh Nguyen từ 21/12 đến 23/12
   [LOW] Tổ chức họp đánh giá tiến độ dự án - Deadline: 25/12

QUY TẮC VIẾT BÁO CÁO:

- KHÔNG dùng task ID (T001, T002...) - Thay bằng mô tả công việc cụ thể
- Viết ngắn gọn, súc tích - Tối đa 1500 ký tự cho Daily Report
- Tập trung vào HÀNH ĐỘNG, không chỉ mô tả tình trạng
- Mỗi phần phải có giá trị thực tế, không suy đoán mơ hồ
- Ngôn ngữ chuyên nghiệp, phù hợp với Executive/PM

ĐỊNH DẠNG:

- Không dùng markdown (*, **)
- Dùng dấu • cho bullet points
- Tên người và task in đậm (nếu có thể)
- Timeline rõ ràng: ngày/tháng cụ thể
- Số liệu phải chính xác từ dữ liệu

Data CSV:

${csv}`;
    } else {
      // Template Weekly Report - Chi tiết, phân tích sâu hơn
      return `Bạn là Project Manager chuyên nghiệp. Tạo báo cáo Weekly Review theo chuẩn PM/Executive.

MỤC ĐÍCH: Báo cáo tổng hợp tuần, phân tích xu hướng và đưa ra chiến lược cho tuần tới.

CẤU TRÚC BÁO CÁO (theo thứ tự):

1. **EXECUTIVE SUMMARY** (4-5 dòng)
   - Tóm tắt trạng thái tổng thể: On Track / At Risk / Off Track
   - Số liệu chính: X dự án, Y tasks, Z% completion rate
   - So sánh với tuần trước: Tăng/giảm bao nhiêu %
   - Điểm nổi bật và thành tựu tuần này
   - Thách thức lớn nhất cần giải quyết

2. **PHÂN TÍCH XU HƯỚNG TUẦN** (So sánh với tuần trước)
   - Thống kê task theo trạng thái: To Do, In Progress, Done, Blocked
   - So sánh chi tiết:
     • To Do: Tăng/giảm X tasks (Y%) - Phân tích nguyên nhân
     • In Progress: Tăng/giảm X tasks (Y%) - Đánh giá hiệu quả
     • Done: Tăng/giảm X tasks (Y%) - Tốc độ hoàn thành
     • Blocked: Tăng/giảm X tasks - Vấn đề cần giải quyết
   - Xu hướng tổng thể: Cải thiện / Xấu đi / Ổn định
   - Dự đoán tuần tới dựa trên xu hướng hiện tại

3. **PHÂN TÍCH CHI TIẾT**

   a. **Điểm mạnh:**
      • Những gì làm tốt trong tuần này
      • Team member nào có thành tích nổi bật
      • Dự án nào đang tiến triển tốt
   
   b. **Điểm yếu & Bất thường:**
      • Tỷ lệ To Do >80% → Nguy cơ dồn việc
      • In Progress <10% → Bottleneck nghiêm trọng
      • Tỷ lệ Done <20% → Tiến độ chậm
      • Task Blocked → Nguyên nhân sâu xa và giải pháp
      • Phân tích nguyên nhân gốc rễ (Root Cause Analysis)
   
   c. **Cơ hội:**
      • Cơ hội tăng tốc tiến độ
      • Tối ưu hóa quy trình
      • Tận dụng nguồn lực hiện có

4. **RỦI RO & THÁCH THỨC** (Phân tích sâu)

   a. **Rủi ro tiến độ:**
      • Task sắp hết hạn trong tuần tới (kèm deadline)
      • Task có nguy cơ trễ deadline cao
      • Milestone nào có nguy cơ không đạt được
      • Tác động đến timeline tổng thể của dự án
      • Xác suất xảy ra và mức độ nghiêm trọng
   
   b. **Rủi ro nhân sự:**
      • Người chậm tiến độ (kèm task cụ thể và nguyên nhân)
      • Người có workload quá cao (>5 tasks)
      • Người thiếu kỹ năng hoặc hỗ trợ
      • Bottleneck trong team
      • Đề xuất giải pháp cụ thể
   
   c. **Rủi ro kỹ thuật:**
      • Vấn đề kỹ thuật có thể ảnh hưởng đến tiến độ
      • Dependencies giữa các task
      • Technical debt cần giải quyết

5. **HÀNH ĐỘNG ĐỀ XUẤT** (Chiến lược tuần tới)

   Format: [Priority] Action - Owner - Timeline - Success Criteria
   
   [HIGH] - Hành động quan trọng nhất, cần làm ngay tuần tới
   [MEDIUM] - Hành động quan trọng, có thể lên kế hoạch
   [LOW] - Hành động cải thiện, nice-to-have
   
   Mỗi hành động phải có:
   - Mô tả cụ thể
   - Người chịu trách nhiệm
   - Timeline rõ ràng
   - Tiêu chí thành công (Success Criteria)
   
   Ví dụ:
   [HIGH] Yêu cầu Nguyen Van Admin báo cáo tiến độ hàng ngày cho task "Gather Requirements" - Timeline: 21/12-27/12 - Success: Hoàn thành 80% vào 25/12
   [MEDIUM] Giao Nguyen Luan hỗ trợ Nguyen Thanh Nguyen và Nguyen Van Admin - Timeline: 21/12-27/12 - Success: Giảm 50% workload của 2 người
   [LOW] Tổ chức họp retrospective và planning cho tuần sau - Timeline: 28/12 - Success: Có action items cụ thể

6. **METRICS & KPIs** (Nếu có)
   - Completion rate: X%
   - Velocity: X tasks/tuần
   - Average cycle time: X ngày
   - Blocked time: X giờ
   - So sánh với tuần trước và mục tiêu

QUY TẮC VIẾT BÁO CÁO:

- KHÔNG dùng task ID (T001, T002...) - Thay bằng mô tả công việc cụ thể
- Viết chi tiết nhưng súc tích - Tối đa 2500 ký tự cho Weekly Report
- Phân tích phải có căn cứ từ dữ liệu, không suy đoán
- Tập trung vào INSIGHTS và ACTIONABLE ITEMS
- Ngôn ngữ chuyên nghiệp, phù hợp với Executive/PM
- Mỗi phần phải có giá trị thực tế và đề xuất cụ thể

ĐỊNH DẠNG:

- Không dùng markdown (*, **)
- Dùng dấu • cho bullet points
- Tên người và task in đậm (nếu có thể)
- Timeline rõ ràng: ngày/tháng cụ thể
- Số liệu phải chính xác từ dữ liệu
- Dùng bảng hoặc danh sách có cấu trúc để dễ đọc

Data CSV:

${csv}`;
    }
  }

  /**
   * Prepare data tổng hợp cho n8n - tất cả dữ liệu cần thiết trong 1 API call
   */
  async prepareDataForN8n(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
    reportType: 'daily' | 'weekly' = 'daily',
  ) {
    const [mergedData, kpi, chartData, promptData] = await Promise.all([
      this.mergeDataPTM(),
      this.kpiService.calculateKPI(),
      this.chartsService.prepareChartData(),
      this.buildPrompt(chartUrl, dateRange, reportType),
    ]);

    return {
      mergedData,
      kpi,
      chartData,
      prompt: promptData.prompt,
      promptMetadata: promptData.metadata,
      readyForAI: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Xử lý AI Agent - tạo báo cáo từ prompt
   * Gọi Groq API trực tiếp để tạo báo cáo
   */
  async processAIAgent(
    prompt: string,
    chartUrl?: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ) {
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    const groqApiUrl =
      this.configService.get<string>('GROQ_API_URL') ||
      'https://api.groq.com/openai/v1/chat/completions';
    const defaultModel =
      this.configService.get<string>('GROQ_DEFAULT_MODEL') ||
      'llama-3.3-70b-versatile';
    const defaultTemperature = parseFloat(
      this.configService.get<string>('GROQ_DEFAULT_TEMPERATURE') || '0.7',
    );

    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    try {
      // Tạo prompt với chart URL nếu có
      const fullPrompt = chartUrl
        ? `${prompt}\n\nBiểu đồ KPI: ${chartUrl}`
        : prompt;

      // Build request body - không giới hạn max_tokens
      const requestBody: any = {
        model: options?.model || defaultModel,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: options?.temperature || defaultTemperature,
      };

      // Chỉ thêm max_tokens nếu được chỉ định, nếu không thì không giới hạn
      if (options?.maxTokens) {
        requestBody.max_tokens = options.maxTokens;
      }

      const response = await axios.post(
        groqApiUrl,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const aiResponse =
        response.data.choices?.[0]?.message?.content || 'No response';

      return {
        prompt: fullPrompt,
        chartUrl,
        options: options || {
          model: defaultModel,
          temperature: defaultTemperature,
        },
        aiResponse,
        model: response.data.model,
        usage: response.data.usage,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(
        `Groq API error: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Xử lý Groq Chat Model - tạo nội dung message từ AI
   * Gọi Groq API trực tiếp để tạo message
   */
  async processGroqChat(
    input1: string,
    input2?: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ) {
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    const groqApiUrl =
      this.configService.get<string>('GROQ_API_URL') ||
      'https://api.groq.com/openai/v1/chat/completions';
    const defaultModel =
      this.configService.get<string>('GROQ_DEFAULT_MODEL') ||
      'llama-3.3-70b-versatile';
    const defaultTemperature = parseFloat(
      this.configService.get<string>('GROQ_DEFAULT_TEMPERATURE') || '0.7',
    );

    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    try {
      // Build messages array
      const messages: any[] = [{ role: 'user', content: input1 }];
      if (input2) {
        messages.push({ role: 'assistant', content: input2 });
      }

      // Build request body - không giới hạn max_tokens
      const requestBody: any = {
        model: options?.model || defaultModel,
        messages: messages,
        temperature: options?.temperature || defaultTemperature,
      };

      // Chỉ thêm max_tokens nếu được chỉ định, nếu không thì không giới hạn
      if (options?.maxTokens) {
        requestBody.max_tokens = options.maxTokens;
      }

      const response = await axios.post(
        groqApiUrl,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const groqResponse =
        response.data.choices?.[0]?.message?.content || 'No response';

      return {
        input1,
        input2,
        options: options || {
          model: defaultModel,
          temperature: defaultTemperature,
        },
        groqResponse,
        model: response.data.model,
        usage: response.data.usage,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(
        `Groq API error: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Xử lý AI và tạo report - tổng hợp tất cả
   * Nhánh 1: Tự lấy data từ DB + Build Prompt + AI Agent + Create Report + Create/Update Google Docs
   */
  async processAIAndCreateReport(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
    createGoogleDoc?: boolean,
    googleDocFolderId?: string,
    reportType: 'daily' | 'weekly' = 'daily',
    chartUploadResult?: any, // Kết quả từ process-chart-and-upload (có upload, share, urls)
  ) {
    // 1. Tự lấy data từ database và build prompt
    const promptData = await this.buildPrompt(chartUrl, dateRange, reportType);

    // 2. Xử lý AI Agent
    let aiAgentResult: any;
    try {
      console.log('Calling processAIAgent...');
      aiAgentResult = await this.processAIAgent(
        promptData.prompt,
        chartUrl,
      );
      console.log('processAIAgent success, has aiResponse:', !!aiAgentResult?.aiResponse);
    } catch (error: any) {
      console.error('Error in processAIAgent:', error.message);
      console.error('Error stack:', error.stack);
      // Fallback structure nếu có lỗi
      aiAgentResult = {
        prompt: promptData.prompt,
        chartUrl,
        error: error.message,
        readyForAI: false,
      };
    }

    // 3. Xử lý Groq Chat để tạo nội dung báo cáo
    let groqResult: any;
    try {
      console.log('Calling processGroqChat...');
      groqResult = await this.processGroqChat(
        promptData.prompt,
        chartUrl,
      );
      console.log('processGroqChat success, has groqResponse:', !!groqResult?.groqResponse);
    } catch (error: any) {
      console.error('Error in processGroqChat:', error.message);
      console.error('Error stack:', error.stack);
      // Fallback structure nếu có lỗi
      groqResult = {
        input1: promptData.prompt,
        error: error.message,
        readyForGroq: false,
      };
    }

    // 4. Format nội dung cho Google Docs
    const reportTitle = `AI Report - ${new Date().toLocaleDateString('vi-VN')}`;
    const reportContent = this.formatReportContentForGoogleDocs(
      promptData,
      aiAgentResult,
      groqResult,
      chartUrl,
    );

    // 5. Tạo Google Docs document nếu được yêu cầu
    let googleDoc: any = null;

    // Lấy chart URL từ chartUploadResult nếu có (ưu tiên URL từ Google Drive đã upload)
    // Ưu tiên imageUrl vì đây là URL trực tiếp để chèn vào Google Docs
    const finalChartUrl = chartUploadResult?.urls?.imageUrl ||
      chartUploadResult?.urls?.shareUrl ||
      chartUploadResult?.chartUrl ||
      chartUploadResult?.share?.shareUrl ||
      chartUrl;

    if (createGoogleDoc) {
      try {
        // Nếu không truyền googleDocFolderId, đọc từ .env
        const folderId =
          googleDocFolderId ||
          this.configService.get<string>('GOOGLE_DRIVE_FOLDER_ID');

        console.log('📊 Chart URL for insertion:', finalChartUrl ? 'YES' : 'NO', finalChartUrl);
        console.log('📊 Chart URL source:', {
          'urls.imageUrl': chartUploadResult?.urls?.imageUrl,
          'urls.shareUrl': chartUploadResult?.urls?.shareUrl,
          'chartUrl': chartUploadResult?.chartUrl,
          'share.shareUrl': chartUploadResult?.share?.shareUrl,
          'chartUrl (param)': chartUrl,
          'finalChartUrl': finalChartUrl,
        });

        googleDoc = await this.createGoogleDocsDocument(
          reportTitle,
          reportContent,
          folderId,
          finalChartUrl, // Truyền finalChartUrl để createGoogleDocsDocument tự chèn ảnh
        );
      } catch (error: any) {
        console.error('Failed to create Google Docs:', error.message);
        console.error('Error stack:', error.stack);
        // Trả về error trong googleDoc để debug
        googleDoc = {
          error: error.message,
          errorDetails: error.stack,
        };
      }
    }

    // 6. Tạo report trong database với dữ liệu từ AI
    const reportData = {
      title: reportTitle,
      type: 'ai_report',
      data: {
        prompt: promptData.prompt,
        promptMetadata: promptData.metadata,
        aiAgent: aiAgentResult,
        groqChat: groqResult,
        chartUrl: chartUrl,
        dateRange: dateRange,
        googleDoc: googleDoc,
        generatedAt: new Date().toISOString(),
      },
      generatedAt: new Date(),
    };

    // Tạo report trong database
    const report = await this.reportsService.createReportFromAI(reportData);

    // 7. Update Google Docs nếu đã tạo và có report ID
    if (googleDoc && report.id) {
      try {
        const updatedContent = this.formatReportContentForGoogleDocs(
          promptData,
          aiAgentResult,
          groqResult,
          chartUrl,
          report.id,
        );
        await this.updateGoogleDocsDocument(
          googleDoc.documentId,
          updatedContent,
        );
        googleDoc.updatedAt = new Date().toISOString();

        // Chèn lại chart sau khi update document (vì updateGoogleDocsDocument xóa tất cả nội dung cũ)
        if (finalChartUrl) {
          try {
            console.log('📸 Re-inserting chart image after document update...');

            const reinsertResult = await this.insertImageToGoogleDocs(
              googleDoc.documentId,
              finalChartUrl,
            );

            if (reinsertResult.success) {
              console.log('✅ Chart image re-inserted successfully after update!');
              googleDoc.chartInserted = true;
              googleDoc.chartFormat = reinsertResult.format;
              googleDoc.chartObjectId = reinsertResult.objectId;
            }
          } catch (imageError: any) {
            console.warn('⚠️ Failed to re-insert chart after update:', imageError.message);
            googleDoc.chartInserted = false;
            googleDoc.chartInsertError = imageError.message;
          }
        }
      } catch (error: any) {
        console.error('Failed to update Google Docs:', error.message);
      }
    }

    return {
      success: true,
      report: {
        id: report.id,
        title: report.title,
        type: report.type,
        createdAt: report.createdAt,
      },
      googleDoc: googleDoc,
      prompt: promptData.prompt,
      promptMetadata: promptData.metadata,
      aiAgent: aiAgentResult,
      groqChat: groqResult,
      chartUrl: chartUrl,
      dateRange: dateRange,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format nội dung report cho Google Docs - Clean summary theo format mới
   */
  private formatReportContentForGoogleDocs(
    promptData: any,
    aiAgentResult: any,
    groqResult: any,
    chartUrl?: string,
    reportId?: number,
  ): string {
    // Lấy summary từ AI Agent response
    const summary = aiAgentResult?.aiResponse || groqResult?.groqResponse || '';

    // Clean và format summary theo format mới
    const cleanSummary = summary
      .replace(/[\*•]/g, '') // Bỏ bullet và *
      .replace(/:\s*:/g, ':') // Bỏ : thừa
      .replace(/[ \t]+/g, ' ') // Bỏ space thừa nhưng giữ \n
      .replace(/\n\s+/g, '\n') // Bỏ space đầu dòng
      .replace(/\s+\n/g, '\n') // Bỏ space cuối dòng
      .trim()
      // Format lại structure
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');

    let content = '';

    // Title
    content += `${promptData.metadata?.totalProjects || 0} Dự án - ${promptData.metadata?.totalTasks || 0} Nhiệm vụ\n`;
    content += `Báo cáo Tổng hợp - ${new Date().toLocaleDateString('vi-VN')}\n\n`;

    // Summary (đã clean)
    if (cleanSummary) {
      content += `${cleanSummary}\n\n`;
    }

    // Chart URL - KHÔNG chèn vào content text vì sẽ được chèn dưới dạng image trong insertFormattedContent
    // if (chartUrl) {
    //   content += `Biểu đồ KPI: ${chartUrl}\n\n`;
    // }

    // Footer - Generated at và Report ID cùng dòng, Report ID ở bên phải
    // Footer sẽ được đặt Ở TRƯỚC chart, sau đó insertImageToGoogleDocs sẽ chèn chart VÀ DI CHUYỂN footer xuống dưới
    content += ``;
    if (reportId) {
      content += `Generated at: ${new Date().toLocaleString('vi-VN')} --- Report ID: ${reportId}\n`;
    } else {
      content += `Generated at: ${new Date().toLocaleString('vi-VN')}\n`;
    }

    return content;
  }

  /**
   * Prepare data cho việc gửi message (sau khi AI xử lý)
   */
  async prepareMessageData(reportId?: number, aiResponse?: string, documentId?: string) {
    const data: any = {
      timestamp: new Date().toISOString(),
    };

    if (reportId) {
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      });
      data.report = report;
    }

    if (aiResponse) {
      data.aiResponse = aiResponse;
    }

    if (documentId) {
      data.documentId = documentId;
      data.documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    }

    return data;
  }

  private async getGoogleAuth() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('GOOGLE_REFRESH_TOKEN');

    // Ưu tiên OAuth 2.0 nếu có đầy đủ credentials
    if (clientId && clientSecret && refreshToken) {
      console.log('Using OAuth 2.0 authentication (personal Gmail account)');
      const redirectUri =
        this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI') ||
        `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/google/callback`;

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      return oauth2Client;
    }

    // Nếu có Client ID và Secret nhưng chưa có Refresh Token
    if (clientId && clientSecret && !refreshToken) {
      const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
      throw new Error(
        `OAuth 2.0 credentials found but no refresh token. Please authorize at: ${appUrl}/auth/google`,
      );
    }

    // Không có OAuth credentials -> báo lỗi
    throw new Error(
      'OAuth 2.0 credentials are required. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and authorize at /auth/google to obtain GOOGLE_REFRESH_TOKEN.',
    );
  }

  /**
   * Tạo Google Docs document từ AI response
   */
  async createGoogleDocsDocument(
    title: string,
    content: string,
    folderId?: string,
    chartUrl?: string, // URL của chart để chèn vào document
  ) {
    // Các biến cần dùng cả trong try và catch
    let useFolderId = folderId;
    let folderWarning: string | null = null;
    const serviceAccountEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');

    try {
      const auth = await this.getGoogleAuth();
      const docs = google.docs({ version: 'v1', auth });
      const drive = google.drive({ version: 'v3', auth });

      let folderOwnerEmail: string | null = null;

      if (folderId) {
        try {
          const folderInfo = await drive.files.get({
            fileId: folderId,
            fields: 'id, name, mimeType, owners',
          });
          // Lấy email của folder owner (nếu có)
          if (folderInfo.data.owners && folderInfo.data.owners.length > 0) {
            folderOwnerEmail = folderInfo.data.owners[0].emailAddress || null;
          }
        } catch (folderError: any) {
          // Nếu folder không truy cập được (404 hoặc 403), fallback tạo ở root Drive
          if (
            folderError.code === 404 ||
            folderError.code === 403 ||
            folderError.message?.includes('not found') ||
            folderError.message?.includes('permission') ||
            folderError.message?.includes('insufficient')
          ) {
            folderWarning = `Folder "${folderId}" not found or not accessible. Document will be created in root Drive. Please share the folder with Service Account (${serviceAccountEmail}) with Editor permission.`;
            console.warn(folderWarning);
            useFolderId = undefined; // Tạo ở root Drive
          } else {
            throw folderError;
          }
        }
      }

      // Tạo Google Docs document bằng Drive API với parents ngay từ đầu
      // Điều này đảm bảo document được tạo trực tiếp trong folder được share
      const fileMetadata: any = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
      };

      // Nếu có useFolderId (đã được validate), thêm vào parents ngay khi tạo
      if (useFolderId) {
        fileMetadata.parents = [useFolderId];
      }

      let file;

      try {
        file = await drive.files.create({
          requestBody: fileMetadata,
          fields: 'id, name, parents',
        });
      } catch (createError: any) {
        const createErrorMessage = createError.message || String(createError);
        const isQuotaError =
          createErrorMessage?.toLowerCase().includes('quota') ||
          createErrorMessage?.toLowerCase().includes('storage quota') ||
          createErrorMessage?.toLowerCase().includes('exceeded');

        const isFolderPermissionError =
          createError.code === 403 ||
          createError.code === 404 ||
          createErrorMessage?.includes('not found') ||
          createErrorMessage?.includes('permission') ||
          createErrorMessage?.includes('insufficient') ||
          createErrorMessage?.includes('forbidden');

        // Nếu lỗi do quota hoặc folder permission, thử tạo ở root Drive của service account
        if ((isQuotaError || isFolderPermissionError) && useFolderId) {
          console.warn(
            `Error creating file in folder "${useFolderId}": ${createErrorMessage}. Retrying in root Drive of service account.`,
          );
          const retryMetadata = {
            ...fileMetadata,
          };
          delete (retryMetadata as any).parents;
          useFolderId = undefined;
          folderWarning = isQuotaError
            ? `Folder "${folderId}" has quota issues. Document created in service account's root Drive instead.`
            : `Folder "${folderId}" not accessible. Document created in service account's root Drive instead.`;

          try {
            file = await drive.files.create({
              requestBody: retryMetadata,
              fields: 'id, name, parents',
            });
          } catch (retryError: any) {
            // Nếu retry cũng fail, throw error với message rõ ràng
            if (isQuotaError) {
              throw new Error(
                `Service Account's Drive storage quota has been exceeded. Please free up space in the service account's Drive or use a different Google account with available storage.`,
              );
            }
            throw retryError;
          }
        } else {
          throw createError;
        }
      }

      const documentId = file.data.id;

      if (!documentId) {
        throw new Error('Failed to create Google Docs document');
      }

      // Insert và format content với màu sắc và styling đẹp
      await this.insertFormattedContent(docs, documentId, content, undefined); // Không truyền chartUrl vào đây

      // Đợi một chút để đảm bảo document đã được format xong hoàn toàn
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Transfer ownership sang folder owner để giải phóng quota của service account
      // Làm TRƯỚC khi chèn chart để đảm bảo quyền truy cập đúng
      // Điều này đặc biệt quan trọng với personal Gmail (không có domain-wide delegation)
      if (folderOwnerEmail && folderOwnerEmail !== serviceAccountEmail) {
        try {
          // Tạo permission với role owner
          await drive.permissions.create({
            fileId: documentId,
            requestBody: {
              role: 'owner',
              type: 'user',
              emailAddress: folderOwnerEmail,
            },
            transferOwnership: true, // Transfer ownership parameter ở ngoài requestBody
          });
          console.log(`Transferred ownership to folder owner: ${folderOwnerEmail}`);
          // Đợi một chút sau khi transfer ownership để đảm bảo quyền đã được apply
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (transferError: any) {
          // Nếu transfer ownership fail, chỉ log warning, không throw error
          // Vì file đã được tạo thành công
          console.warn(
            `Failed to transfer ownership to ${folderOwnerEmail}: ${transferError.message}`,
          );
        }
      }

      // Chèn chart image SAU KHI transfer ownership (sử dụng logic đã được test và hoạt động tốt)
      // Điều này đảm bảo document đã được format xong và quyền đã được set đúng
      if (chartUrl) {
        try {
          console.log('📸 Auto-inserting chart image after content formatting and ownership transfer...');
          console.log('   Chart URL:', chartUrl);
          await this.insertImageToGoogleDocs(documentId, chartUrl);
          console.log('✅ Chart image auto-inserted successfully!');
        } catch (imageError: any) {
          console.warn('⚠️ Failed to auto-insert chart image:', imageError.message);
          console.warn('   Document created successfully, but chart was not inserted.');
          // Không throw error, chỉ log warning vì document đã được tạo thành công
        }
      }

      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      return {
        documentId,
        documentUrl,
        title,
        folderId: useFolderId || null,
        folderWarning: folderWarning || null,
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      const errorDetails = error.response?.data
        ? JSON.stringify(error.response.data)
        : errorMessage;

      // Log chi tiết để debug
      console.error('Google Docs creation error:', {
        message: errorMessage,
        details: errorDetails,
        code: error.code,
        status: error.response?.status,
      });

      // Kiểm tra các loại lỗi cụ thể
      const serviceAccountEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const isQuotaError =
        errorMessage?.toLowerCase().includes('quota') ||
        errorMessage?.toLowerCase().includes('storage quota') ||
        errorMessage?.toLowerCase().includes('exceeded');

      const isFolderPermissionError =
        error.code === 403 ||
        error.code === 404 ||
        errorMessage?.includes('not found') ||
        errorMessage?.includes('permission') ||
        errorMessage?.includes('insufficient') ||
        errorMessage?.includes('forbidden');

      if (isQuotaError) {
        const impersonateUser = this.configService.get<string>('GOOGLE_IMPERSONATE_USER');
        let solutionMessage = '';

        if (!impersonateUser) {
          solutionMessage = `\n\nSOLUTION: Add GOOGLE_IMPERSONATE_USER to .env file to use domain-wide delegation:\n` +
            `GOOGLE_IMPERSONATE_USER=your-email@yourdomain.com\n\n` +
            `This will use the user account's storage quota instead of the service account's quota.\n` +
            `Note: Domain-wide delegation must be enabled in Google Cloud Console for this to work.`;
        } else {
          solutionMessage = `\n\nCurrent impersonate user: ${impersonateUser}\n` +
            `If this user also has quota issues, try a different user account with more storage.`;
        }

        throw new Error(
          `Failed to create Google Docs: Service Account's Drive storage quota has been exceeded.` +
          `\nThe quota is calculated based on the Service Account's own Drive storage (${serviceAccountEmail}), not the folder owner's storage.` +
          solutionMessage
        );
      }

      if (isFolderPermissionError && useFolderId) {
        throw new Error(
          `Failed to create Google Docs: Folder not found or not accessible: ${useFolderId}. Please ensure the folder is shared with Service Account (${serviceAccountEmail}) with Editor permission.`,
        );
      }

      throw new Error(
        `Failed to create Google Docs: ${errorMessage}`,
      );
    }
  }

  /**
   * Insert và format content vào Google Docs với màu sắc và styling đẹp
   */
  private async insertFormattedContent(
    docs: any,
    documentId: string,
    content: string,
    chartUrl?: string, // URL của chart để chèn vào document
  ) {
    // Bước 1: Insert tất cả text trước
    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });

    // Bước 2: Parse content và tạo format requests
    // Tính toán index chính xác dựa trên content đã insert
    const lines = content.split('\n');
    const formatRequests: any[] = [];
    let currentIndex = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = currentIndex;
      const lineEnd = currentIndex + line.length;

      // Skip empty lines
      if (!line.trim() && i < lines.length - 1) {
        currentIndex = lineEnd + 1; // +1 for newline
        continue;
      }

      // Format title (dòng đầu tiên)
      if (i === 0 && line.trim().length > 0) {
        formatRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            paragraphStyle: {
              namedStyleType: 'HEADING_1',
              spaceAbove: { magnitude: 12, unit: 'PT' },
              spaceBelow: { magnitude: 6, unit: 'PT' },
            },
            fields: 'namedStyleType,spaceAbove,spaceBelow',
          },
        });
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.2,
                    green: 0.4,
                    blue: 0.8,
                  },
                },
              },
              bold: true,
              fontSize: {
                magnitude: 20,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,bold,fontSize',
          },
        });
      }
      // Format subtitle (dòng thứ 2)
      else if (i === 1 && line.trim().length > 0) {
        formatRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            paragraphStyle: {
              namedStyleType: 'HEADING_2',
              spaceBelow: { magnitude: 12, unit: 'PT' },
            },
            fields: 'namedStyleType,spaceBelow',
          },
        });
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.4,
                    green: 0.4,
                    blue: 0.4,
                  },
                },
              },
              fontSize: {
                magnitude: 14,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,fontSize',
          },
        });
      }
      // Format footer line - Generated at và Report ID cùng dòng, căn phải
      else if (line.includes('Generated at:') && line.includes('Report ID:')) {
        // Căn phải cả dòng
        formatRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            paragraphStyle: {
              alignment: 'END', // RIGHT alignment
            },
            fields: 'alignment',
          },
        });
        // Format phần "Generated at:" - màu xám nhạt
        const generatedAtStart = lineStart + line.indexOf('Generated at:');
        const generatedAtEnd = generatedAtStart + 'Generated at:'.length;
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: generatedAtStart,
              endIndex: generatedAtEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.5,
                    green: 0.5,
                    blue: 0.5,
                  },
                },
              },
              italic: true,
              fontSize: {
                magnitude: 9,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,italic,fontSize',
          },
        });
        // Format phần "Report ID:" - màu xám đậm hơn
        const reportIdStart = lineStart + line.indexOf('Report ID:');
        const reportIdEnd = reportIdStart + line.length - (reportIdStart - lineStart);
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: reportIdStart,
              endIndex: reportIdEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.6,
                    green: 0.6,
                    blue: 0.6,
                  },
                },
              },
              italic: true,
              fontSize: {
                magnitude: 10,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,italic,fontSize',
          },
        });
      }
      // Format Generated at nếu không có Report ID
      else if (line.includes('Generated at:') && !line.includes('Report ID:')) {
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.5,
                    green: 0.5,
                    blue: 0.5,
                  },
                },
              },
              italic: true,
              fontSize: {
                magnitude: 9,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,italic,fontSize',
          },
        });
      }
      // Format section headers (EXECUTIVE SUMMARY, PHÂN TÍCH XU HƯỜNG, etc.)
      else if (
        line.match(/^(EXECUTIVE SUMMARY|PHÂN TÍCH|ĐIỂM|RỦI RO|HÀNH ĐỘNG|METRICS)/i)
      ) {
        formatRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            paragraphStyle: {
              namedStyleType: 'HEADING_2',
              spaceAbove: { magnitude: 18, unit: 'PT' },
              spaceBelow: { magnitude: 6, unit: 'PT' },
            },
            fields: 'namedStyleType,spaceAbove,spaceBelow',
          },
        });
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.85,
                    green: 0.33,
                    blue: 0.1,
                  },
                },
              },
              bold: true,
              fontSize: {
                magnitude: 14,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,bold,fontSize',
          },
        });
      }
      // Format subsection headers (a., b., 1., 2., etc.)
      else if (line.match(/^\s*[a-z]\.\s+[A-Z]/) || line.match(/^\s*\d+\.\s+[A-Z]/)) {
        formatRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            paragraphStyle: {
              spaceAbove: { magnitude: 6, unit: 'PT' },
              spaceBelow: { magnitude: 3, unit: 'PT' },
            },
            fields: 'spaceAbove,spaceBelow',
          },
        });
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.2,
                    green: 0.5,
                    blue: 0.8,
                  },
                },
              },
              bold: true,
              fontSize: {
                magnitude: 12,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,bold,fontSize',
          },
        });
      }
      // Format priority tags [HIGH], [MEDIUM], [LOW]
      else if (line.includes('[HIGH]')) {
        const highStart = lineStart + line.indexOf('[HIGH]');
        const highEnd = highStart + 6;
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: highStart,
              endIndex: highEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.9,
                    green: 0.2,
                    blue: 0.2,
                  },
                },
              },
              bold: true,
            },
            fields: 'foregroundColor,bold',
          },
        });
      } else if (line.includes('[MEDIUM]')) {
        const mediumStart = lineStart + line.indexOf('[MEDIUM]');
        const mediumEnd = mediumStart + 8;
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: mediumStart,
              endIndex: mediumEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 1.0,
                    green: 0.65,
                    blue: 0.0,
                  },
                },
              },
              bold: true,
            },
            fields: 'foregroundColor,bold',
          },
        });
      } else if (line.includes('[LOW]')) {
        const lowStart = lineStart + line.indexOf('[LOW]');
        const lowEnd = lowStart + 5;
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lowStart,
              endIndex: lowEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.2,
                    green: 0.7,
                    blue: 0.3,
                  },
                },
              },
              bold: true,
            },
            fields: 'foregroundColor,bold',
          },
        });
      }
      // Format bullet points
      else if (line.trim().startsWith('•')) {
        formatRequests.push({
          createParagraphBullets: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
          },
        });
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              fontSize: {
                magnitude: 11,
                unit: 'PT',
              },
            },
            fields: 'fontSize',
          },
        });
      }
      // Format status indicators (On Track, At Risk, Off Track)
      else if (
        line.match(/On Track|At Risk|Off Track/i)
      ) {
        const statusMatch = line.match(/(On Track|At Risk|Off Track)/i);
        if (statusMatch) {
          const statusStart = lineStart + line.indexOf(statusMatch[0]);
          const statusEnd = statusStart + statusMatch[0].length;
          let statusColor = { red: 0.2, green: 0.7, blue: 0.3 }; // Green for On Track
          if (statusMatch[0].toLowerCase().includes('risk')) {
            statusColor = { red: 1.0, green: 0.65, blue: 0.0 }; // Orange
          } else if (statusMatch[0].toLowerCase().includes('off')) {
            statusColor = { red: 0.9, green: 0.2, blue: 0.2 }; // Red
          }
          formatRequests.push({
            updateTextStyle: {
              range: {
                startIndex: statusStart,
                endIndex: statusEnd,
              },
              textStyle: {
                foregroundColor: {
                  color: {
                    rgbColor: statusColor,
                  },
                },
                bold: true,
              },
              fields: 'foregroundColor,bold',
            },
          });
        }
      }
      // Format numbers và percentages
      else if (line.match(/\d+%|\d+\s*(tasks|dự án|người)/i)) {
        const numberMatch = line.match(/(\d+%|\d+\s*(tasks|dự án|người))/i);
        if (numberMatch) {
          const numberStart = lineStart + line.indexOf(numberMatch[0]);
          const numberEnd = numberStart + numberMatch[0].length;
          formatRequests.push({
            updateTextStyle: {
              range: {
                startIndex: numberStart,
                endIndex: numberEnd,
              },
              textStyle: {
                bold: true,
                foregroundColor: {
                  color: {
                    rgbColor: {
                      red: 0.2,
                      green: 0.4,
                      blue: 0.8,
                    },
                  },
                },
              },
              fields: 'bold,foregroundColor',
            },
          });
        }
      }
      // Format footer (Generated at, ---)
      else if (line.includes('Generated at:') || line.trim() === '---') {
        formatRequests.push({
          updateTextStyle: {
            range: {
              startIndex: lineStart,
              endIndex: lineEnd,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 0.5,
                    green: 0.5,
                    blue: 0.5,
                  },
                },
              },
              italic: true,
              fontSize: {
                magnitude: 9,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,italic,fontSize',
          },
        });
      }

      // Cập nhật currentIndex cho dòng tiếp theo (+1 cho newline character)
      currentIndex = lineEnd + 1;
    }

    // Bước 3: Execute all formatting requests trong batch
    if (formatRequests.length > 0) {
      try {
        await docs.documents.batchUpdate({
          documentId: documentId,
          requestBody: {
            requests: formatRequests,
          },
        });
        console.log(`Applied ${formatRequests.length} formatting requests`);
      } catch (formatError: any) {
        // Nếu format fail, log warning nhưng không throw error
        // Vì document đã được tạo thành công với text
        console.warn('Failed to apply formatting:', formatError.message);
        console.warn('Format error details:', formatError);
      }
    }

    // Bước 4: Chèn chart image nếu có chartUrl
    console.log('🔍 Checking chartUrl for image insertion:', chartUrl ? 'YES' : 'NO', chartUrl);
    if (chartUrl) {
      try {
        console.log('📸 Starting chart image insertion process...');
        // Lấy document để tìm vị trí chèn chart (sau title và subtitle)
        const document = await docs.documents.get({
          documentId: documentId,
        });

        // Tìm vị trí tốt nhất để chèn chart (sau title và subtitle)
        let insertIndex = 1;
        const body = document.data.body;
        if (body && body.content && body.content.length > 0) {
          // Tìm paragraph đầu tiên có text (thường là title)
          // Sau đó tìm paragraph tiếp theo để chèn chart
          let foundFirstParagraph = false;
          for (const element of body.content) {
            if (element.paragraph) {
              const paragraph = element.paragraph;
              // Kiểm tra xem paragraph có text không
              const hasText = paragraph.elements?.some(
                (el: any) => el.textRun && el.textRun.content?.trim(),
              );

              if (hasText) {
                if (!foundFirstParagraph) {
                  foundFirstParagraph = true;
                  // Tìm paragraph tiếp theo để chèn chart
                  continue;
                } else {
                  // Đây là paragraph thứ 2 có text, chèn chart trước nó
                  insertIndex = element.startIndex || element.endIndex - 1;
                  break;
                }
              }
            }
          }

          // Nếu không tìm thấy vị trí phù hợp, chèn sau content cuối cùng
          if (insertIndex === 1 && body.content.length > 0) {
            const lastElement = body.content[body.content.length - 1];
            insertIndex = lastElement.endIndex - 1;
          }
        }

        // Extract fileId từ Google Drive URL
        // Hỗ trợ nhiều formats:
        // 1. https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        // 2. https://drive.google.com/uc?export=view&id=FILE_ID
        // 3. https://drive.google.com/uc?id=FILE_ID
        let fileId: string | null = null;

        // Thử match format 1: /file/d/FILE_ID
        const fileIdMatch1 = chartUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch1) {
          fileId = fileIdMatch1[1];
        } else {
          // Thử match format 2: ?id=FILE_ID hoặc &id=FILE_ID
          const fileIdMatch2 = chartUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (fileIdMatch2) {
            fileId = fileIdMatch2[1];
          }
        }

        if (!fileId) {
          console.warn('Chart URL is not a valid Google Drive URL, cannot extract file ID:', chartUrl);
          return;
        }

        console.log('✅ Extracted file ID from chartUrl:', fileId, '(from URL:', chartUrl, ')');

        // Lấy Google Drive API để đảm bảo file đã được share public
        console.log('🔐 Getting Google Auth for Drive API...');
        const auth = await this.getGoogleAuth();
        const drive = google.drive({ version: 'v3', auth });
        console.log('✅ Google Drive API initialized');

        try {
          // Kiểm tra và đảm bảo file đã được share public
          const fileInfo = await drive.files.get({
            fileId: fileId,
            fields: 'id,name,permissions,webViewLink,mimeType',
          });

          // Kiểm tra xem file đã được share với anyone chưa
          let isPublic = false;
          if (fileInfo.data.permissions) {
            isPublic = fileInfo.data.permissions.some(
              (p: any) => p.type === 'anyone' && p.role !== undefined,
            );
          }

          // Nếu chưa public, share với anyone
          if (!isPublic) {
            try {
              await drive.permissions.create({
                fileId: fileId,
                requestBody: {
                  role: 'reader',
                  type: 'anyone',
                },
              });
              console.log('Chart file shared publicly for Google Docs insertion');
            } catch (shareError: any) {
              console.warn('Failed to share chart file publicly:', shareError.message);
              // Vẫn tiếp tục thử chèn ảnh, có thể file đã được share qua folder
            }
          }

          // Đợi một chút để đảm bảo permission được apply (nếu vừa share)
          if (!isPublic) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          // Verify file đã được share public
          const verifyFile = await drive.files.get({
            fileId: fileId,
            fields: 'id,name,permissions,webViewLink',
          });

          const isFilePublic = verifyFile.data.permissions?.some(
            (p: any) => p.type === 'anyone' && p.role !== undefined,
          );
          console.log('🔍 File public verification:', isFilePublic ? '✅ Public' : '❌ Not public');

          // Google Docs API insertInlineImage yêu cầu URL công khai và URL phải < 2KB
          // Data URI quá lớn (60KB+), không thể dùng được
          // Giải pháp: Sử dụng Google Drive direct image URL (file đã được share public)
          // Thử nhiều format URL khác nhau để tìm format hoạt động

          // Danh sách các Google Drive URL formats để thử (theo thứ tự ưu tiên)
          // Tất cả đều < 2KB và file đã được share public
          const urlFormats: Array<{ name: string; uri: string }> = [
            {
              name: 'thumbnail-large',
              uri: `https://drive.google.com/thumbnail?id=${fileId}&sz=w625-h309`
            },
            {
              name: 'thumbnail-medium',
              uri: `https://drive.google.com/thumbnail?id=${fileId}&sz=w700-h400`
            },
            {
              name: 'simple-uc',
              uri: `https://drive.google.com/uc?id=${fileId}`
            },
            {
              name: 'export-view',
              uri: `https://drive.google.com/uc?export=view&id=${fileId}`
            },
            {
              name: 'lh3-googleusercontent',
              uri: `https://lh3.googleusercontent.com/d/${fileId}`
            },
          ];

          console.log('🖼️ Available URL formats for testing:');
          urlFormats.forEach((format, index) => {
            console.log(`   ${index + 1}. ${format.name}: ${format.uri} (${format.uri.length} chars)`);
          });

          // Chèn text marker, image, và text sau
          const textMarker = '\n\n📊 Biểu đồ KPI:\n\n';
          const textAfter = '\n\n';
          const textMarkerLength = textMarker.length;

          console.log('📍 Initial insert index:', insertIndex);

          let inserted = false;
          let lastError: any = null;

          // Thử từng format cho đến khi thành công
          for (const format of urlFormats) {
            try {
              console.log(`\n🔄 Trying format: ${format.name} - ${format.uri}`);

              // BƯỚC 1: Chèn text marker trước
              console.log('📤 Step 1: Inserting text marker at index', insertIndex);
              await docs.documents.batchUpdate({
                documentId: documentId,
                requestBody: {
                  requests: [
                    {
                      insertText: {
                        location: { index: insertIndex },
                        text: textMarker,
                      },
                    },
                  ],
                },
              });

              // Tính index sau khi chèn text marker
              const imageInsertIndex = insertIndex + textMarkerLength;
              console.log('📍 Image insert index (after text marker):', imageInsertIndex);

              // BƯỚC 2: Chèn image bằng Google Drive URL
              console.log('📤 Step 2: Inserting image using Google Drive URL...');
              console.log('   - Document ID:', documentId);
              console.log('   - Image insert index:', imageInsertIndex);
              console.log('   - URL format:', format.name);
              console.log('   - URL length:', format.uri.length, 'chars (< 2KB limit)');

              const imageInsertResponse = await docs.documents.batchUpdate({
                documentId: documentId,
                requestBody: {
                  requests: [
                    {
                      insertInlineImage: {
                        location: { index: imageInsertIndex },
                        uri: format.uri,
                        objectSize: {
                          height: {
                            magnitude: 400,
                            unit: 'PT',
                          },
                          width: {
                            magnitude: 700,
                            unit: 'PT',
                          },
                        },
                      },
                    },
                  ],
                },
              });

              console.log('📥 Image insert response:', JSON.stringify(imageInsertResponse.data, null, 2));

              // Kiểm tra response để xem ảnh có được chèn thành công không
              const insertResponse = imageInsertResponse.data.replies?.[0]?.insertInlineImage;
              if (insertResponse?.objectId) {
                console.log(`✅ SUCCESS with format "${format.name}"! Chart image inserted successfully!`);
                console.log(`   - Object ID: ${insertResponse.objectId}`);
                console.log(`   - Inserted at index: ${imageInsertIndex}`);

                // Verify image đã được insert vào document
                console.log('🔍 Verifying image in document structure...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // Đợi 2 giây để Google Docs xử lý

                try {
                  const verifyDoc = await docs.documents.get({
                    documentId: documentId,
                    suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS',
                  });

                  // Tìm image object trong document
                  let imageFound = false;
                  const body = verifyDoc.data.body;
                  if (body?.content) {
                    for (const element of body.content) {
                      if (element.inlineObjectElement) {
                        const inlineObjectId = element.inlineObjectElement.inlineObjectId;
                        if (inlineObjectId === insertResponse.objectId) {
                          imageFound = true;
                          console.log('✅ Image object found in document structure at index:', element.startIndex);
                          console.log('   - Inline object ID:', inlineObjectId);
                          break;
                        }
                      }
                    }

                    // Log tất cả inline objects để debug
                    const allInlineObjects = body.content
                      .filter((el: any) => el.inlineObjectElement)
                      .map((el: any) => ({
                        startIndex: el.startIndex,
                        endIndex: el.endIndex,
                        inlineObjectId: el.inlineObjectElement?.inlineObjectId,
                      }));
                    console.log('📋 All inline objects in document:', JSON.stringify(allInlineObjects, null, 2));
                  }

                  if (!imageFound) {
                    console.warn('⚠️ Image objectId exists but not found in document structure immediately.');
                    console.warn('   This may be normal - Google Docs may need time to process the image.');
                    console.warn('   Please check the document manually after a few seconds.');
                  }
                } catch (verifyError: any) {
                  console.warn('⚠️ Failed to verify image in document:', verifyError.message);
                }

                // BƯỚC 3: Chèn text sau image
                // Image object chiếm 1 index trong document
                const textAfterIndex = imageInsertIndex + 1;
                console.log('📤 Step 3: Inserting text after image at index:', textAfterIndex);

                await docs.documents.batchUpdate({
                  documentId: documentId,
                  requestBody: {
                    requests: [
                      {
                        insertText: {
                          location: { index: textAfterIndex },
                          text: textAfter,
                        },
                      },
                    ],
                  },
                });

                console.log('✅ Chart image insertion completed successfully!');
                inserted = true;
                break; // Thành công, dừng thử các format khác
              } else {
                // Kiểm tra xem có error không
                const error = imageInsertResponse.data.replies?.[0]?.error;
                if (error) {
                  console.error(`❌ Format "${format.name}" failed with error:`, JSON.stringify(error));
                  lastError = error;
                } else {
                  console.warn(`⚠️ Format "${format.name}" - No objectId in response:`, JSON.stringify(imageInsertResponse.data.replies));
                  lastError = { message: 'No objectId in response' };
                }
              }
            } catch (formatError: any) {
              console.error(`❌ Format "${format.name}" threw error:`, formatError.message);
              console.error('Error stack:', formatError.stack);
              lastError = formatError;
              continue; // Thử format tiếp theo
            }
          }

          if (!inserted) {
            console.error('❌ All URL formats failed to insert image');
            console.error('Last error:', lastError);
            console.warn('⚠️ Image insertion failed, but document was created successfully.');
            console.warn('   You may need to manually insert the image or use a different hosting service.');
            // Không throw error, chỉ log warning vì document đã được tạo thành công
          }
        } catch (driveError: any) {
          console.error('❌ Failed to download and insert chart image:', driveError.message);
          console.error('Error details:', driveError);
          // Không throw error, chỉ log warning vì document đã được tạo thành công
        }
      } catch (imageError: any) {
        console.warn('Failed to insert chart image:', imageError.message);
        console.warn('Error details:', imageError);
        // Không throw error, chỉ log warning vì document đã được tạo thành công
      }
    }
  }

  /**
   * Chèn ảnh vào Google Docs document đã tồn tại
   * Dùng cho n8n workflow khi document đã được tạo trước đó
   */
  async insertImageToGoogleDocs(
    documentId: string,
    chartUrl: string,
    insertAfterIndex?: number,
  ) {
    try {
      const auth = await this.getGoogleAuth();
      const docs = google.docs({ version: 'v1', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Extract file ID từ chartUrl
      let fileId: string | null = null;
      const fileIdMatch1 = chartUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch1) {
        fileId = fileIdMatch1[1];
      } else {
        const fileIdMatch2 = chartUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch2) {
          fileId = fileIdMatch2[1];
        }
      }

      if (!fileId) {
        throw new Error('Cannot extract file ID from chartUrl');
      }

      // Đảm bảo file đã được share public
      const fileInfo = await drive.files.get({
        fileId: fileId,
        fields: 'id,name,permissions',
      });

      let isPublic = false;
      if (fileInfo.data.permissions) {
        isPublic = fileInfo.data.permissions.some(
          (p: any) => p.type === 'anyone' && p.role !== undefined,
        );
      }

      if (!isPublic) {
        await drive.permissions.create({
          fileId: fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Lấy document để tìm vị trí chèn
      const document = await docs.documents.get({
        documentId: documentId,
      });

      // Tìm vị trí chèn (sử dụng insertAfterIndex nếu có, nếu không tự động tìm)
      let insertIndex = insertAfterIndex || 1;
      if (!insertAfterIndex) {
        const body = document.data.body;
        if (body && body.content && body.content.length > 0) {
          let foundFooter = false;

          // Tìm footer text "Generated at:" để chèn ảnh TRƯỚC footer
          for (const element of body.content) {
            if (element.paragraph) {
              const paragraph = element.paragraph;
              const hasFooterText = paragraph.elements?.some(
                (el: any) =>
                  el.textRun && el.textRun.content?.includes('Generated at:')
              );

              if (hasFooterText && element.startIndex) {
                // Chèn TRƯỚC footer (tại startIndex của footer)
                insertIndex = element.startIndex;
                foundFooter = true;
                console.log('🔍 Footer found at index:', insertIndex);
                break;
              }
            }
          }

          // Nếu không tìm thấy footer, fallback về logic cũ (chèn ở cuối document)
          if (!foundFooter && body.content.length > 0) {
            const lastElement = body.content[body.content.length - 1];
            insertIndex = lastElement.endIndex ? lastElement.endIndex - 1 : insertIndex;
          }
        }
      }

      // Danh sách các Google Drive URL formats để thử
      const urlFormats: Array<{ name: string; uri: string }> = [
        {
          name: 'thumbnail-large',
          uri: `https://drive.google.com/thumbnail?id=${fileId}&sz=w625-h309`,
        },
        // {
        //   name: 'thumbnail-medium',
        //   uri: `https://drive.google.com/thumbnail?id=${fileId}&sz=w700-h400`,
        // },
        // {
        //   name: 'simple-uc',
        //   uri: `https://drive.google.com/uc?id=${fileId}`,
        // },
        {
          name: 'export-view',
          uri: `https://drive.google.com/uc?export=view&id=${fileId}`,
        },
        {
          name: 'lh3-googleusercontent',
          uri: `https://lh3.googleusercontent.com/d/${fileId}`,
        },
      ];

      const textMarker = '📊 Biểu đồ KPI:\n\n';
      const textAfter = '\n\n';
      const textMarkerLength = textMarker.length;

      // Chèn text marker
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: insertIndex },
                text: textMarker,
              },
            },
          ],
        },
      });

      const imageInsertIndex = insertIndex + textMarkerLength;

      // Thử từng format URL
      for (const format of urlFormats) {
        try {
          const imageInsertResponse = await docs.documents.batchUpdate({
            documentId: documentId,
            requestBody: {
              requests: [
                {
                  insertInlineImage: {
                    location: { index: imageInsertIndex },
                    uri: format.uri,
                    objectSize: {
                      height: {
                        magnitude: 933,
                        unit: 'PT',
                      },
                      width: {
                        magnitude: 462,
                        unit: 'PT',
                      },
                    },
                  },
                },
              ],
            },
          });

          const insertResponse =
            imageInsertResponse.data.replies?.[0]?.insertInlineImage;
          if (insertResponse?.objectId) {
            // Chèn text sau image
            await docs.documents.batchUpdate({
              documentId: documentId,
              requestBody: {
                requests: [
                  {
                    insertText: {
                      location: { index: imageInsertIndex + 1 },
                      text: textAfter,
                    },
                  },
                ],
              },
            });

            console.log('✅ Chart inserted successfully before footer');

            return {
              success: true,
              objectId: insertResponse.objectId,
              format: format.name,
              message: 'Image inserted successfully',
            };
          }
        } catch (formatError: any) {
          console.warn(`Format ${format.name} failed:`, formatError.message);
          continue;
        }
      }

      throw new Error('All URL formats failed to insert image');
    } catch (error: any) {
      console.error('Failed to insert image to Google Docs:', error.message);
      throw error;
    }
  }

  /**
   * Update Google Docs document với nội dung mới
   */
  async updateGoogleDocsDocument(documentId: string, content: string) {
    try {
      const auth = await this.getGoogleAuth();
      const docs = google.docs({ version: 'v1', auth });

      // Lấy document hiện tại để xóa nội dung cũ
      const document = await docs.documents.get({
        documentId: documentId,
      });

      const endIndex = document.data.body?.content?.[
        document.data.body.content.length - 1
      ]?.endIndex;

      if (!endIndex || endIndex <= 1) {
        throw new Error('Invalid document structure');
      }

      // Xóa nội dung cũ
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  startIndex: 1,
                  endIndex: endIndex - 1,
                },
              },
            },
          ],
        },
      });

      // Insert và format nội dung mới với styling đẹp
      await this.insertFormattedContent(docs, documentId, content);

      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      return {
        documentId,
        documentUrl,
        updatedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(
        `Failed to update Google Docs: ${error.message || error}`,
      );
    }
  }

  /**
   * Upload file lên Google Drive
   * Backend xử lý upload file (biểu đồ, document, etc.) lên Google Drive
   */
  async uploadFileToGoogleDrive(
    fileData: {
      name: string;
      content: Buffer | string;
      mimeType?: string;
      folderId?: string;
    },
  ) {
    try {
      const auth = await this.getGoogleAuth();
      const drive = google.drive({ version: 'v3', auth });

      // Convert content to Buffer nếu là string
      const bufferContent =
        typeof fileData.content === 'string'
          ? Buffer.from(
            fileData.content.startsWith('data:')
              ? fileData.content.split(',')[1]
              : fileData.content,
            'base64',
          )
          : fileData.content;

      const fileMetadata: any = {
        name: fileData.name,
      };

      if (fileData.folderId) {
        fileMetadata.parents = [fileData.folderId];
      }

      // Convert Buffer to stream for Google Drive API
      const stream = Readable.from(bufferContent);

      const media = {
        mimeType: fileData.mimeType || 'image/png',
        body: stream,
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink',
      });

      return {
        fileId: file.data.id,
        fileName: file.data.name || fileData.name,
        mimeType: fileData.mimeType || 'image/png',
        folderId: fileData.folderId || null,
        webViewLink: file.data.webViewLink || `https://drive.google.com/file/d/${file.data.id}/view`,
        webContentLink: file.data.webContentLink || `https://drive.google.com/uc?id=${file.data.id}&export=download`,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(
        `Failed to upload file to Google Drive: ${error.message || error}`,
      );
    }
  }

  /**
   * Share file trên Google Drive
   * Backend xử lý chia sẻ file đã upload
   */
  async shareFileOnGoogleDrive(
    fileId: string,
    options?: {
      role?: 'reader' | 'writer' | 'commenter';
      type?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
    },
  ) {
    try {
      const auth = await this.getGoogleAuth();
      const drive = google.drive({ version: 'v3', auth });

      const permissionOptions = {
        role: options?.role || 'reader',
        type: options?.type || 'anyone',
        ...(options?.emailAddress && { emailAddress: options.emailAddress }),
      };

      await drive.permissions.create({
        fileId: fileId,
        requestBody: permissionOptions,
      });

      return {
        fileId,
        shared: true,
        shareUrl: `https://drive.google.com/file/d/${fileId}/view`,
        permissions: permissionOptions,
        sharedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(
        `Failed to share file on Google Drive: ${error.message || error}`,
      );
    }
  }

  /**
   * Build Google Drive URL từ fileId
   */
  async buildGoogleDriveUrl(fileId: string) {
    return {
      fileId,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      editUrl: `https://drive.google.com/file/d/${fileId}/edit`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      shareUrl: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
      // Image URL để insert vào Google Docs (theo n8n format)
      imageUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
    };
  }

  /**
   * Upload và share file trong 1 lần gọi
   */
  async uploadAndShareFile(
    fileData: {
      name: string;
      content: Buffer | string;
      mimeType?: string;
      folderId?: string;
    },
    shareOptions?: {
      role?: 'reader' | 'writer' | 'commenter';
      type?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
    },
  ) {
    const uploadResult = await this.uploadFileToGoogleDrive(fileData);
    const fileId = uploadResult?.fileId;

    if (!fileId) {
      throw new Error('Upload failed: fileId is missing');
    }

    const shareResult = await this.shareFileOnGoogleDrive(fileId, shareOptions);
    const urlResult = await this.buildGoogleDriveUrl(fileId);

    return {
      upload: uploadResult,
      share: shareResult,
      urls: urlResult,
    };
  }

  /**
   * Tính KPI chi tiết theo logic từ JavaScript code
   * Enrich tasks với các trường: due_date, days_to_due, is_overdue, is_risky, etc.
   */
  async calculateDetailedKPI(dateRange?: { start: string; end: string }) {
    // Lấy tất cả tasks từ database
    const tasks = await this.prisma.task.findMany({
      include: {
        assignedTo: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            endDate: true, // Cần endDate để tính due date
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const today = this.stripTime(new Date());

    // Enrich tasks
    const enrichedTasks = tasks.map((task) => {
      // Sử dụng project endDate nếu có, hoặc null nếu không có due date
      const dueDate = task.project?.endDate
        ? this.stripTime(new Date(task.project.endDate))
        : null;
      const days = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
        : null;

      const status = (task.status || '').toLowerCase();
      const blocked = /blocked|bị chặn/.test(status);

      const priority = (task.priority || '').toLowerCase();
      const high = priority.includes('high');
      const medium = priority.includes('medium');
      const low = priority.includes('low');

      const overdue = days !== null && days < 0;
      const risky = !overdue && high && days !== null && days <= 2;

      const normalizedStatus =
        status.includes('done') || status.includes('completed')
          ? 'Done'
          : status.includes('in progress')
            ? 'In Progress'
            : status.includes('assigned')
              ? 'Assigned'
              : task.status || 'Unknown';

      const normalizedPriority = high
        ? 'High'
        : medium
          ? 'Medium'
          : low
            ? 'Low'
            : task.priority || 'N/A';

      const assignee = task.assignedTo?.name || task.assignedTo?.username || 'Unknown';
      const dueWeek = dueDate ? this.isoWeek(dueDate) : '';

      return {
        ...task,
        due_date_iso: dueDate ? this.toISODate(dueDate) : '',
        days_to_due: days,
        is_blocked: blocked,
        is_overdue: overdue,
        is_risky: risky,
        _priority: normalizedPriority,
        _status: normalizedStatus,
        _assignee: assignee,
        _dueWeek: dueWeek,
      };
    });

    // Tính totals
    const totals = {
      total: enrichedTasks.length,
      done: enrichedTasks.filter((t) => t._status === 'Done').length,
      overdue: enrichedTasks.filter((t) => t.is_overdue).length,
      highPriority: enrichedTasks.filter(
        (t) => t._priority.toLowerCase() === 'high',
      ).length,
      blocked: enrichedTasks.filter((t) => t.is_blocked).length,
      risky: enrichedTasks.filter((t) => t.is_risky).length,
    };

    // Breakdown theo Priority / Status
    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const task of enrichedTasks) {
      byPriority[task._priority] = (byPriority[task._priority] || 0) + 1;
      byStatus[task._status] = (byStatus[task._status] || 0) + 1;
    }

    // Breakdown theo Assignee
    const byAssignee: Record<
      string,
      { total: number; done: number; overdue: number; blocked: number; risky: number; high: number }
    > = {};

    for (const task of enrichedTasks) {
      const assignee = task._assignee;
      if (!byAssignee[assignee]) {
        byAssignee[assignee] = {
          total: 0,
          done: 0,
          overdue: 0,
          blocked: 0,
          risky: 0,
          high: 0,
        };
      }
      const group = byAssignee[assignee];
      group.total++;
      if (task._status === 'Done') group.done++;
      if (task.is_overdue) group.overdue++;
      if (task.is_blocked) group.blocked++;
      if (task.is_risky) group.risky++;
      if (task._priority.toLowerCase() === 'high') group.high++;
    }

    // Overdue buckets
    const overdueBuckets: Record<string, number> = {
      '≤ -1d': 0,
      '-2…-7d': 0,
      '-8…-14d': 0,
      '< -14d': 0,
      '0…2d': 0,
      '3…7d': 0,
      '> 7d': 0,
    };

    for (const task of enrichedTasks) {
      const days = task.days_to_due;
      if (days === null) continue;

      if (days < -14) overdueBuckets['< -14d']++;
      else if (days < -7) overdueBuckets['-8…-14d']++;
      else if (days < 0) overdueBuckets['-2…-7d']++;
      else if (days <= 2) overdueBuckets['0…2d']++;
      else if (days <= 7) overdueBuckets['3…7d']++;
      else overdueBuckets['> 7d']++;
    }

    // Weekly trend theo due week
    const trend: Record<string, number> = {};
    for (const task of enrichedTasks) {
      if (!task._dueWeek) continue;
      trend[task._dueWeek] = (trend[task._dueWeek] || 0) + 1;
    }

    const trendKeys = Object.keys(trend).sort().slice(-8);
    const trendData = trendKeys.map((k) => trend[k]);

    // Top lists
    const topOverdue = enrichedTasks
      .filter((t) => t.is_overdue)
      .sort((a, b) => (a.days_to_due ?? 0) - (b.days_to_due ?? 0))
      .slice(0, 5)
      .map((t) => ({
        assignee: t._assignee,
        title: t.title || 'Task',
        due: t.due_date_iso,
        days_to_due: t.days_to_due,
      }));

    const topRisky = enrichedTasks
      .filter((t) => t.is_risky)
      .sort((a, b) => (a.days_to_due ?? 0) - (b.days_to_due ?? 0))
      .slice(0, 5)
      .map((t) => ({
        assignee: t._assignee,
        title: t.title || 'Task',
        due: t.due_date_iso,
        days_to_due: t.days_to_due,
      }));

    return {
      totals,
      byPriority,
      byStatus,
      byAssignee,
      overdueBuckets,
      trend: {
        labels: trendKeys,
        data: trendData,
      },
      topOverdue,
      topRisky,
      tasks: enrichedTasks,
    };
  }

  /**
   * Prepare Chart Data cho QuickChart
   * Tạo doughnut chart config từ KPI data
   */
  async prepareChartDataFromKPI(kpiData: any) {
    const done = kpiData.totals.done || 0;
    const inProgress = kpiData.byStatus['In Progress'] || 0;
    const assigned = kpiData.byStatus['Assigned'] || 0;
    const overdue = kpiData.totals.overdue || 0;
    const blocked = kpiData.totals.blocked || 0;
    const risky = kpiData.totals.risky || 0;

    // Tạo arrays động - chỉ include items có giá trị > 0
    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];
    const borderColors: string[] = [];

    if (done > 0) {
      labels.push('Done');
      data.push(done);
      colors.push('#4caf50');
      borderColors.push('#4caf50');
    }
    if (inProgress > 0) {
      labels.push('In Progress');
      data.push(inProgress);
      colors.push('#2196f3');
      borderColors.push('#2196f3');
    }
    if (assigned > 0) {
      labels.push('Assigned');
      data.push(assigned);
      colors.push('#9e9e9e');
      borderColors.push('#9e9e9e');
    }
    if (overdue > 0) {
      labels.push('Overdue');
      data.push(overdue);
      colors.push('#f44336');
      borderColors.push('#f44336');
    }
    if (blocked > 0) {
      labels.push('Blocked');
      data.push(blocked);
      colors.push('#9c27b0');
      borderColors.push('#9c27b0');
    }
    if (risky > 0) {
      labels.push('Risky');
      data.push(risky);
      colors.push('#ff9800');
      borderColors.push('#ff9800');
    }

    // Tạo chart config object
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        layout: { padding: 30 },
        cutout: '60%',
        responsive: true,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: '📊 Task Status Overview - Task Scheduler API Project',
            font: {
              size: 20,
              weight: 'bold',
            },
            color: '#333333',
            padding: 20,
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 16,
              usePointStyle: true,
              font: { size: 14 },
              padding: 15,
            },
          },
        },
      },
    };

    return {
      chart: JSON.stringify(chartConfig),
      backgroundColor: 'white',
      width: 1000,
      height: 500,
      format: 'png',
    };
  }

  /**
   * Xử lý nhánh 2: KPI + Chart + Upload + Share
   * Tính KPI chi tiết, prepare chart data, gọi QuickChart, upload và share file
   */
  async processChartAndUpload(
    chartUrl?: string,
    chartImage?: string, // Base64 hoặc URL
    dateRange?: { start: string; end: string },
    shareOptions?: {
      role?: 'reader' | 'writer' | 'commenter';
      type?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
    },
    folderId?: string, // Folder ID để lưu file (optional, sẽ đọc từ .env nếu không có)
  ) {
    // 1. Tính KPI chi tiết (tự lấy data từ DB)
    const kpiData = await this.calculateDetailedKPI(dateRange);

    // 2. Prepare Chart Data từ KPI
    const chartData = await this.prepareChartDataFromKPI(kpiData);

    // 3. Gọi QuickChart API để tạo chart image
    let quickChartUrl = chartUrl;
    let chartImageData: string | null = null;

    if (!chartUrl && chartData.chart) {
      // Gọi QuickChart API
      const quickChartApiUrl = 'https://quickchart.io/chart';
      const chartConfig = chartData.chart;

      // Tạo URL cho QuickChart
      quickChartUrl = `${quickChartApiUrl}?c=${encodeURIComponent(chartConfig)}&width=${chartData.width}&height=${chartData.height}&format=${chartData.format}&backgroundColor=${chartData.backgroundColor}`;

      // TODO: Có thể fetch chart image và convert sang base64 nếu cần
      // const response = await axios.get(quickChartUrl, { responseType: 'arraybuffer' });
      // chartImageData = Buffer.from(response.data, 'binary').toString('base64');
    }

    // 4. Upload và share file nếu có chart image hoặc URL
    let uploadResult: any = null;
    let shareResult: any = null;
    let urlResult: any = null;

    if (chartImage || quickChartUrl) {
      let fileContent: Buffer | string | null = null;

      // Nếu có chartImage, upload trực tiếp
      if (chartImage) {
        if (chartImage.startsWith('data:')) {
          // Data URL - extract base64 part
          const base64Data = chartImage.split(',')[1];
          fileContent = Buffer.from(base64Data, 'base64');
        } else if (chartImage.startsWith('http')) {
          // HTTP URL - download first
          try {
            const response = await axios.get(chartImage, {
              responseType: 'arraybuffer',
            });
            fileContent = Buffer.from(response.data, 'binary');
          } catch (error: any) {
            console.warn('Failed to download chart image from URL:', error.message);
          }
        } else {
          // Base64 string
          fileContent = Buffer.from(chartImage, 'base64');
        }
      } else if (quickChartUrl) {
        // Download từ quickChartUrl và upload
        try {
          console.log('Downloading chart from QuickChart URL...');
          const response = await axios.get(quickChartUrl, {
            responseType: 'arraybuffer',
            timeout: 30000, // 30 seconds timeout
          });
          fileContent = Buffer.from(response.data, 'binary');
          console.log('Chart downloaded successfully, size:', fileContent.length, 'bytes');
        } catch (error: any) {
          console.warn('Failed to download chart from QuickChart URL:', error.message);
        }
      }

      if (fileContent) {
        // Nếu không truyền folderId, đọc từ .env
        const finalFolderId =
          folderId || this.configService.get<string>('GOOGLE_DRIVE_FOLDER_ID');

        try {
          uploadResult = await this.uploadFileToGoogleDrive({
            name: `KPI_Chart_${new Date().toISOString().split('T')[0]}.png`,
            content: fileContent,
            mimeType: 'image/png',
            folderId: finalFolderId,
          });

          const fileId = uploadResult?.fileId;
          if (fileId) {
            // Share file - tự động share với default options nếu không có shareOptions
            const finalShareOptions = shareOptions && (shareOptions.role || shareOptions.type)
              ? shareOptions
              : {
                role: 'reader' as const,
                type: 'anyone' as const,
              };

            try {
              shareResult = await this.shareFileOnGoogleDrive(fileId, finalShareOptions);
            } catch (shareError: any) {
              console.warn('Failed to share file:', shareError.message);
            }

            // Build URL - dùng imageUrl thay vì shareUrl để insert vào Google Docs
            try {
              urlResult = await this.buildGoogleDriveUrl(fileId);
              // Dùng imageUrl (format cho Google Docs API) thay vì shareUrl (view URL)
              quickChartUrl = urlResult?.imageUrl || urlResult?.shareUrl || quickChartUrl;
              console.log('✅ Using imageUrl for chart insertion:', urlResult?.imageUrl);
            } catch (urlError: any) {
              console.warn('Failed to build Google Drive URL:', urlError.message);
            }
          }
        } catch (uploadError: any) {
          console.error('Failed to upload chart to Google Drive:', uploadError.message);
        }
      }
    }

    return {
      kpi: kpiData,
      chartData: {
        ...chartData,
        quickChartUrl: quickChartUrl,
      },
      chartUrl: quickChartUrl,
      upload: uploadResult,
      share: shareResult,
      urls: urlResult,
      dateRange,
      processedAt: new Date().toISOString(),
    };
  }

  // Helper methods
  private stripTime(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private toISODate(d: Date): string {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  private isoWeek(d: Date): string {
    const date = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
    );
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Gửi notifications (Slack và Gmail)
   * Nhận kết quả từ 2 nhánh và format thành message gửi Slack và Gmail
   */
  async sendNotifications(
    aiReportResult?: any,
    chartResult?: any,
    slackWebhookUrl?: string,
    slackChannel?: string,
    emailTo?: string | string[],
    emailSubject?: string,
    documentId?: string, // Google Docs document ID
  ) {
    // Format message từ kết quả 2 nhánh
    const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });


    // Format cho Slack (Markdown)
    let slackMessage = '';

    // Nếu có documentId, hiển thị link Google Docs ở đầu
    if (documentId) {
      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      slackMessage = `🤖 *AI Analysis Report:*\n📄 *Báo cáo chi tiết:* ${documentUrl}\n\n`;
    } else {
      slackMessage = '📊 *Báo cáo Tổng hợp*\n\n';
    }

    // Luôn hiển thị summary nếu có dữ liệu
    if (aiReportResult) {
      slackMessage += '🤖 *AI Report:*\n';
      if (aiReportResult.prompt) {
        slackMessage += `- Prompt đã được tạo\n`;
      }
      if (aiReportResult.aiAgent) {
        slackMessage += `- AI Agent đã xử lý\n`;
      }
      if (aiReportResult.groqChat) {
        slackMessage += `- Groq Chat đã hoàn thành\n`;
      }
      slackMessage += '\n';
    }

    if (chartResult) {
      slackMessage += '📈 *KPI & Chart:*\n';
      if (chartResult.kpi) {
        slackMessage += `- Tổng dự án: ${chartResult.kpi.projects?.total || 0}\n`;
        slackMessage += `- Tổng nhiệm vụ: ${chartResult.kpi.tasks?.total || 0}\n`;
        slackMessage += `- Tỷ lệ hoàn thành: ${chartResult.kpi.tasks?.completionRate || 0}%\n`;
      }
      if (chartResult.chartUrl) {
        slackMessage += `- Chart URL: ${chartResult.chartUrl}\n`;
      }
      if (chartResult.urls?.shareUrl) {
        slackMessage += `- Share URL: ${chartResult.urls.shareUrl}\n`;
      }
      slackMessage += '\n';
    }

    slackMessage += `📅 Generated: ${timestamp}\n | 🤖 AI Automated Reporting System`;

    // Format cho Email (HTML)
    let emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #4CAF50;">📊 AI Analysis Report</h2>
    `;

    // Nếu có documentId, hiển thị link báo cáo ở đầu
    if (documentId) {
      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      emailHtml += `
        <div style="background: #E8F5E9; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h3 style="color: #2E7D32; margin-top: 0;">📄 Báo cáo chi tiết</h3>
          <p style="margin: 5px 0;">
            <a href="${documentUrl}" style="color: #1976D2; text-decoration: none; font-weight: bold;">
              ➜ Xem báo cáo đầy đủ tại Google Docs
            </a>
          </p>
        </div>
      `;
    }

    if (aiReportResult) {
      emailHtml += `
        <h3 style="color: #2196F3;">🤖 AI Report</h3>
        <ul>
      `;
      if (aiReportResult.prompt) {
        emailHtml += `<li>Prompt đã được tạo</li>`;
      }
      if (aiReportResult.aiAgent) {
        emailHtml += `<li>AI Agent đã xử lý</li>`;
      }
      if (aiReportResult.groqChat) {
        emailHtml += `<li>Groq Chat đã hoàn thành</li>`;
      }
      emailHtml += `</ul>`;
    }

    if (chartResult) {
      emailHtml += `
        <h3 style="color: #FF9800;">📈 KPI & Chart</h3>
        <ul>
      `;
      if (chartResult.kpi) {
        emailHtml += `<li>Tổng dự án: <strong>${chartResult.kpi.projects?.total || 0}</strong></li>`;
        emailHtml += `<li>Tổng nhiệm vụ: <strong>${chartResult.kpi.tasks?.total || 0}</strong></li>`;
        emailHtml += `<li>Tỷ lệ hoàn thành: <strong>${chartResult.kpi.tasks?.completionRate || 0}%</strong></li>`;
      }
      if (chartResult.chartUrl) {
        emailHtml += `<li>Chart URL: <a href="${chartResult.chartUrl}">${chartResult.chartUrl}</a></li>`;
      }
      if (chartResult.urls?.shareUrl) {
        emailHtml += `<li>Share URL: <a href="${chartResult.urls.shareUrl}">${chartResult.urls.shareUrl}</a></li>`;
      }
      emailHtml += `</ul>`;
    }

    emailHtml += `
          <hr style="border: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">📅 Generated: ${timestamp}</p>
          <p style="color: #999; font-size: 11px;">🤖 AI Automated Reporting System</p>
        </body>
      </html>
    `;

    const emailText = `
Báo cáo Tổng hợp

${aiReportResult ? 'AI Report:\n- Prompt đã được tạo\n- AI Agent đã xử lý\n- Groq Chat đã hoàn thành\n' : ''}
${chartResult ? `KPI & Chart:\n- Tổng dự án: ${chartResult.kpi?.projects?.total || 0}\n- Tổng nhiệm vụ: ${chartResult.kpi?.tasks?.total || 0}\n- Tỷ lệ hoàn thành: ${chartResult.kpi?.tasks?.completionRate || 0}%\n${chartResult.chartUrl ? `- Chart URL: ${chartResult.chartUrl}\n` : ''}${chartResult.urls?.shareUrl ? `- Share URL: ${chartResult.urls.shareUrl}\n` : ''}` : ''}

Generated at: ${timestamp}
    `.trim();

    // Gửi Slack notification thực tế
    let slackSent = false;
    let slackError: string | undefined;

    if (slackWebhookUrl) {
      try {
        const webhook = new IncomingWebhook(slackWebhookUrl);
        await webhook.send({
          text: slackMessage,
        });
        slackSent = true;
        console.log('✅ Slack notification sent successfully');
      } catch (error: any) {
        slackError = error.message;
        console.error('❌ Failed to send Slack notification:', error.message);
      }
    } else {
      // Fallback: lấy từ .env nếu không truyền vào
      const defaultWebhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
      if (defaultWebhookUrl) {
        try {
          const webhook = new IncomingWebhook(defaultWebhookUrl);
          await webhook.send({
            text: slackMessage,
          });
          slackSent = true;
          console.log('✅ Slack notification sent successfully (using default webhook)');
        } catch (error: any) {
          slackError = error.message;
          console.error('❌ Failed to send Slack notification:', error.message);
        }
      }
    }

    // Gửi Email notification thực tế
    let emailSent = false;
    let emailError: string | undefined;

    // Lấy email admin từ .env hoặc từ parameter
    const adminEmail = this.configService.get<string>('EMAIL_ADMIN');
    const recipients = emailTo
      ? (Array.isArray(emailTo) ? emailTo : [emailTo])
      : (adminEmail ? [adminEmail] : []);

    if (recipients.length > 0) {
      try {
        // Tạo nodemailer transporter
        const transporter = nodemailer.createTransport({
          host: this.configService.get<string>('SMTP_HOST'),
          port: this.configService.get<number>('SMTP_PORT'),
          secure: this.configService.get<string>('SMTP_SECURE') === 'true', // true for 465, false for other ports
          auth: {
            user: this.configService.get<string>('SMTP_USER'),
            pass: this.configService.get<string>('SMTP_PASS'),
          },
        });

        // Gửi email
        await transporter.sendMail({
          from: this.configService.get<string>('EMAIL_FROM') || this.configService.get<string>('SMTP_USER'),
          to: recipients.join(', '),
          subject: emailSubject || '📊 AI Analysis Report - Báo cáo Tổng hợp',
          html: emailHtml,
          text: emailText,
        });

        emailSent = true;
        console.log('✅ Email sent successfully to:', recipients.join(', '));
      } catch (error: any) {
        emailError = error.message;
        console.error('❌ Failed to send email:', error.message);
      }
    }

    return {
      success: true,
      slack: {
        message: slackMessage,
        webhookUrl: slackWebhookUrl,
        channel: slackChannel,
        sent: slackSent,
        error: slackError,
      },
      email: {
        to: recipients,
        subject: emailSubject || '📊 AI Analysis Report - Báo cáo Tổng hợp',
        html: emailHtml,
        text: emailText,
        sent: emailSent,
        error: emailError,
      },
      sentAt: new Date().toISOString(),
    };
  }

  private groupByStatus(items: any[], statusField: string) {
    const grouped: Record<string, number> = {};
    items.forEach((item) => {
      const status = item[statusField] || 'Unknown';
      grouped[status] = (grouped[status] || 0) + 1;
    });
    return grouped;
  }
}
