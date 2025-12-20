import { Injectable } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { KpiService } from '../kpi/kpi.service';
import { ChartsService } from '../charts/charts.service';

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private kpiService: KpiService,
    private chartsService: ChartsService,
  ) {}

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
   * Build prompt cho AI Agent từ dữ liệu đã merge
   */
  async buildPrompt(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
  ) {
    const mergedData = await this.mergeDataPTM();
    const kpi = await this.kpiService.calculateKPI();
    const chartData = await this.chartsService.prepareChartData();

    const prompt = `
# Báo cáo Tổng hợp Dự án và Nhiệm vụ

## Tổng quan
- Tổng số dự án: ${kpi.projects.total}
- Tổng số nhiệm vụ: ${kpi.tasks.total}
- Tổng số thành viên: ${kpi.team.totalMembers}
- Tỷ lệ hoàn thành: ${kpi.tasks.completionRate}%

## Chi tiết Dự án
${mergedData.projects
  .map(
    (p, idx) => `
${idx + 1}. **${p.name}**
   - Trạng thái: ${p.status || 'N/A'}
   - Mô tả: ${p.description || 'N/A'}
   - Ngày bắt đầu: ${p.startDate ? new Date(p.startDate).toLocaleDateString('vi-VN') : 'N/A'}
   - Ngày kết thúc: ${p.endDate ? new Date(p.endDate).toLocaleDateString('vi-VN') : 'N/A'}
`,
  )
  .join('')}

## Chi tiết Nhiệm vụ
${mergedData.tasks
  .slice(0, 20)
  .map(
    (t, idx) => `
${idx + 1}. **${t.title}**
   - Dự án: ${t.project?.name || 'N/A'}
   - Người phụ trách: ${t.assignedTo?.name || t.assignedTo?.username || 'Chưa gán'}
   - Trạng thái: ${t.status || 'N/A'}
   - Ưu tiên: ${t.priority || 'N/A'}
   - Thời gian ước tính: ${t.estimatedTime || 0} giờ
`,
  )
  .join('')}

## Chỉ số KPI
- Dự án đang hoạt động: ${kpi.projects.active}
- Nhiệm vụ đã hoàn thành: ${kpi.tasks.completed}
- Nhiệm vụ đang thực hiện: ${kpi.tasks.inProgress}
- Trung bình nhiệm vụ/dự án: ${kpi.metrics.avgTasksPerProject}
- Trung bình nhiệm vụ/thành viên: ${kpi.metrics.avgTasksPerMember}

${chartUrl ? `## Biểu đồ KPI\nXem biểu đồ tại: ${chartUrl}\n` : ''}

${dateRange ? `## Khoảng thời gian\nTừ: ${dateRange.start} đến ${dateRange.end}\n` : ''}

Hãy phân tích dữ liệu trên và tạo báo cáo chi tiết với các đề xuất cải thiện.
`;

    return {
      prompt,
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

  /**
   * Prepare data tổng hợp cho n8n - tất cả dữ liệu cần thiết trong 1 API call
   */
  async prepareDataForN8n(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
  ) {
    const [mergedData, kpi, chartData, promptData] = await Promise.all([
      this.mergeDataPTM(),
      this.kpiService.calculateKPI(),
      this.chartsService.prepareChartData(),
      this.buildPrompt(chartUrl, dateRange),
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
   * Backend sẽ gọi AI service (Groq hoặc AI service khác) để tạo báo cáo
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
    // TODO: Implement actual AI service call (Groq, OpenAI, etc.)
    // Hiện tại trả về structure để n8n có thể gọi AI service bên ngoài
    // Hoặc có thể implement trực tiếp ở đây nếu có API key

    return {
      prompt,
      chartUrl,
      options: options || {},
      readyForAI: true,
      // Có thể thêm logic gọi AI service trực tiếp ở đây
      // Ví dụ: await this.callGroqAPI(prompt, options)
    };
  }

  /**
   * Xử lý Groq Chat Model - tạo nội dung message từ AI
   */
  async processGroqChat(
    input1: string,
    input2?: string,
    options?: {
      model?: string;
      temperature?: number;
    },
  ) {
    // TODO: Implement Groq API call
    // Hiện tại trả về structure để n8n có thể gọi Groq bên ngoài
    // Hoặc có thể implement trực tiếp ở đây nếu có API key

    return {
      input1,
      input2,
      options: options || {},
      readyForGroq: true,
      // Có thể thêm logic gọi Groq API trực tiếp ở đây
      // Ví dụ: await this.callGroqAPI(input1, input2, options)
    };
  }

  /**
   * Xử lý AI và tạo report - tổng hợp tất cả
   */
  async processAIAndCreateReport(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
  ) {
    // Lấy prompt đã build sẵn
    const promptData = await this.buildPrompt(chartUrl, dateRange);

    // Xử lý AI Agent
    const aiAgentResult = await this.processAIAgent(
      promptData.prompt,
      chartUrl,
    );

    // Xử lý Groq Chat (song song)
    const groqResult = await this.processGroqChat(
      promptData.prompt,
      chartUrl,
    );

    return {
      prompt: promptData.prompt,
      promptMetadata: promptData.metadata,
      aiAgent: aiAgentResult,
      groqChat: groqResult,
      readyForReport: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Prepare data cho việc gửi message (sau khi AI xử lý)
   */
  async prepareMessageData(reportId?: number, aiResponse?: string) {
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

    return data;
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
    // TODO: Implement Google Drive API integration
    // Cần: Google Drive API credentials, OAuth2 setup
    // Ví dụ sử dụng googleapis package:
    // const drive = google.drive({ version: 'v3', auth: oauth2Client });
    // const file = await drive.files.create({ ... });

    return {
      fileId: 'mock-file-id', // Sẽ là fileId thực từ Google Drive
      fileName: fileData.name,
      mimeType: fileData.mimeType || 'image/png',
      folderId: fileData.folderId,
      uploadedAt: new Date().toISOString(),
      // Có thể thêm logic upload thực tế ở đây khi có credentials
    };
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
    // TODO: Implement Google Drive sharing API
    // Ví dụ: await drive.permissions.create({ fileId, requestBody: { ... } });

    return {
      fileId,
      shared: true,
      shareUrl: `https://drive.google.com/file/d/${fileId}/view`,
      permissions: options || { role: 'reader', type: 'anyone' },
      sharedAt: new Date().toISOString(),
      // Có thể thêm logic share thực tế ở đây khi có credentials
    };
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
    const shareResult = await this.shareFileOnGoogleDrive(
      uploadResult.fileId,
      shareOptions,
    );
    const urlResult = await this.buildGoogleDriveUrl(uploadResult.fileId);

    return {
      upload: uploadResult,
      share: shareResult,
      urls: urlResult,
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
