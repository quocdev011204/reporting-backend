import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { Public } from '../auth/public.decorator';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) { }

  /**
   * API để merge data từ Projects, Tasks, Team Members
   * n8n gọi API này để lấy dữ liệu đã được merge
   */
  @Public()
  @Get('merge-data')
  async getMergedData() {
    return this.workflowService.mergeDataPTM();
  }

  /**
   * API để build prompt cho AI Agent
   * n8n gọi API này để lấy prompt đã được build sẵn
   */
  @Public()
  @Get('build-prompt')
  async buildPrompt(
    @Query('chartUrl') chartUrl?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('reportType') reportType?: 'daily' | 'weekly',
  ) {
    const dateRange =
      startDate && endDate ? { start: startDate, end: endDate } : undefined;
    return this.workflowService.buildPrompt(
      chartUrl,
      dateRange,
      reportType || 'daily',
    );
  }

  /**
   * API tổng hợp - trả về tất cả dữ liệu cần thiết trong 1 lần gọi
   * n8n chỉ cần gọi API này là có đủ dữ liệu để xử lý tiếp
   */
  @Public()
  @Get('prepare-data')
  async prepareData(
    @Query('chartUrl') chartUrl?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('reportType') reportType?: 'daily' | 'weekly',
  ) {
    const dateRange =
      startDate && endDate ? { start: startDate, end: endDate } : undefined;
    return this.workflowService.prepareDataForN8n(
      chartUrl,
      dateRange,
      reportType || 'daily',
    );
  }

  /**
   * API để xử lý AI Agent - tạo báo cáo từ prompt
   * Backend xử lý AI, n8n chỉ cần gọi và nhận kết quả
   */
  @Public()
  @Post('process-ai')
  async processAI(
    @Body()
    body: {
      prompt?: string;
      chartUrl?: string;
      startDate?: string;
      endDate?: string;
      reportType?: 'daily' | 'weekly';
      options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };
    },
  ) {
    // Nếu không có prompt, tự động build từ data
    if (!body.prompt) {
      const dateRange =
        body.startDate && body.endDate
          ? { start: body.startDate, end: body.endDate }
          : undefined;
      const promptData = await this.workflowService.buildPrompt(
        body.chartUrl,
        dateRange,
        body.reportType || 'daily',
      );
      if (!promptData || !promptData.prompt) {
        throw new Error('Failed to build prompt');
      }
      return this.workflowService.processAIAgent(
        promptData.prompt,
        body.chartUrl,
        body.options,
      );
    }

    return this.workflowService.processAIAgent(
      body.prompt,
      body.chartUrl,
      body.options,
    );
  }

  /**
   * API để xử lý Groq Chat Model - tạo nội dung message
   * Backend xử lý Groq, n8n chỉ cần gọi và nhận kết quả
   */
  @Public()
  @Post('process-groq')
  async processGroq(
    @Body()
    body: {
      input1: string;
      input2?: string;
      options?: {
        model?: string;
        temperature?: number;
      };
    },
  ) {
    return this.workflowService.processGroqChat(
      body.input1,
      body.input2,
      body.options,
    );
  }

  /**
   * API tổng hợp - xử lý AI và tạo report trong 1 lần gọi
   * Backend xử lý tất cả: prepare data + AI Agent + Groq Chat + Create Report + Create/Update Google Docs
   */
  @Public()
  @Post('process-ai-report')
  async processAIAndReport(
    @Body()
    body: {
      chartUrl?: string;
      startDate?: string;
      endDate?: string;
      createGoogleDoc?: boolean; // Tạo Google Docs document
      googleDocFolderId?: string; // Folder ID để lưu Google Docs
      reportType?: 'daily' | 'weekly'; // Loại báo cáo: daily hoặc weekly
      chartUploadResult?: any; // Kết quả từ process-chart-and-upload (có upload, share, urls)
    },
  ) {
    const dateRange =
      body.startDate && body.endDate
        ? { start: body.startDate, end: body.endDate }
        : undefined;
    return this.workflowService.processAIAndCreateReport(
      body.chartUrl,
      dateRange,
      body.createGoogleDoc || false,
      body.googleDocFolderId,
      body.reportType || 'daily',
      body.chartUploadResult, // Truyền chartUploadResult để chèn chart vào document
    );
  }

  /**
   * API để upload file lên Google Drive
   * Backend xử lý upload file (biểu đồ, document, etc.)
   */
  @Public()
  @Post('upload-file')
  async uploadFile(
    @Body()
    body: {
      name: string;
      content: string; // Base64 encoded hoặc URL
      mimeType?: string;
      folderId?: string;
    },
  ) {
    // Convert base64 hoặc fetch từ URL nếu cần
    const fileContent =
      body.content.startsWith('data:') || body.content.startsWith('http')
        ? body.content
        : Buffer.from(body.content, 'base64');

    return this.workflowService.uploadFileToGoogleDrive({
      name: body.name,
      content: fileContent,
      mimeType: body.mimeType,
      folderId: body.folderId,
    });
  }

  /**
   * API để share file trên Google Drive
   * Backend xử lý chia sẻ file đã upload
   */
  @Public()
  @Post('share-file')
  async shareFile(
    @Body()
    body: {
      fileId: string;
      role?: 'reader' | 'writer' | 'commenter';
      type?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
    },
  ) {
    return this.workflowService.shareFileOnGoogleDrive(body.fileId, {
      role: body.role,
      type: body.type,
      emailAddress: body.emailAddress,
    });
  }

  /**
   * API để build Google Drive URL
   */
  @Public()
  @Get('build-drive-url')
  async buildDriveUrl(@Query('fileId') fileId: string) {
    return this.workflowService.buildGoogleDriveUrl(fileId);
  }

  /**
   * API tổng hợp - upload và share file trong 1 lần gọi
   */
  @Public()
  @Post('upload-and-share')
  async uploadAndShare(
    @Body()
    body: {
      name: string;
      content: string;
      mimeType?: string;
      folderId?: string;
      shareRole?: 'reader' | 'writer' | 'commenter';
      shareType?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
    },
  ) {
    const fileContent =
      body.content.startsWith('data:') || body.content.startsWith('http')
        ? body.content
        : Buffer.from(body.content, 'base64');

    return this.workflowService.uploadAndShareFile(
      {
        name: body.name,
        content: fileContent,
        mimeType: body.mimeType,
        folderId: body.folderId,
      },
      {
        role: body.shareRole,
        type: body.shareType,
        emailAddress: body.emailAddress,
      },
    );
  }

  /**
   * API tổng hợp nhánh 2: KPI + Chart + Upload + Share
   * Xử lý tất cả: tính KPI, prepare chart data, upload và share file
   */
  @Public()
  @Post('process-chart-and-upload')
  async processChartAndUpload(
    @Body()
    body: {
      chartUrl?: string; // URL từ QuickChart
      chartImage?: string; // Base64 hoặc data URL của chart image
      startDate?: string;
      endDate?: string;
      shareRole?: 'reader' | 'writer' | 'commenter';
      shareType?: 'user' | 'group' | 'domain' | 'anyone';
      emailAddress?: string;
      folderId?: string; // Folder ID để lưu file (optional, sẽ đọc từ .env nếu không có)
      reportType?: 'daily' | 'weekly'; // Report type để truyền qua cho Process AI Report
    },
  ) {
    const dateRange =
      body.startDate && body.endDate
        ? { start: body.startDate, end: body.endDate }
        : undefined;

    const shareOptions = {
      role: body.shareRole,
      type: body.shareType,
      emailAddress: body.emailAddress,
    };

    const result = await this.workflowService.processChartAndUpload(
      body.chartUrl,
      body.chartImage,
      dateRange,
      shareOptions,
      body.folderId, // Truyền folderId nếu có
    );

    // Thêm reportType vào response để truyền qua cho Process AI Report
    if (body.reportType) {
      return {
        ...result,
        reportType: body.reportType,
      };
    }

    return result;
  }

  /**
   * API tổng hợp - Gộp kết quả và gửi notifications (Slack và Gmail)
   * Nhận kết quả từ 2 nhánh, merge và gửi Slack message + Email
   */
  @Public()
  @Post('merge-and-send-notifications')
  async mergeAndSendNotifications(
    @Body()
    body: {
      aiReportResult?: any; // Kết quả từ process-ai-report
      chartResult?: any; // Kết quả từ process-chart-and-upload
      slackWebhookUrl?: string; // Slack Webhook URL
      slackChannel?: string; // Slack channel (optional)
      emailTo?: string | string[]; // Email người nhận
      emailSubject?: string; // Subject email (optional)
      documentId?: string; // Google Docs document ID (optional)
    },
  ) {
    return this.workflowService.sendNotifications(
      body.aiReportResult,
      body.chartResult,
      body.slackWebhookUrl,
      body.slackChannel,
      body.emailTo,
      body.emailSubject,
      body.documentId,
    );
  }

  /**
   * API để prepare data cho việc gửi message
   * n8n gọi sau khi AI xử lý xong
   */
  @Public()
  @Post('prepare-message')
  async prepareMessage(
    @Body() body: { reportId?: number; aiResponse?: string; documentId?: string },
  ) {
    return this.workflowService.prepareMessageData(
      body.reportId,
      body.aiResponse,
      body.documentId,
    );
  }

  /**
   * API để chèn ảnh vào Google Docs document đã tồn tại
   * Dùng cho n8n workflow khi document đã được tạo trước đó
   * Ví dụ: Sau khi tạo document, upload chart, sau đó chèn chart vào document
   */
  @Public()
  @Post('insert-image-to-doc')
  async insertImageToDoc(
    @Body()
    body: {
      documentId: string; // Google Docs document ID
      chartUrl: string; // Google Drive URL của chart image
      insertAfterIndex?: number; // Vị trí chèn (optional, tự động tìm nếu không có)
    },
  ) {
    return this.workflowService.insertImageToGoogleDocs(
      body.documentId,
      body.chartUrl,
      body.insertAfterIndex,
    );
  }

  /**
   * API để lấy danh sách tasks quá hạn và thống kê
   * Trả về tasks đã được enrich với isOverdue field
   */
  @Public()
  @Get('overdue-tasks')
  async getOverdueTasks() {
    return this.workflowService.getOverdueTasks();
  }

  /**
   * API để lấy tasks quá hạn được nhóm theo member
   * Trả về summary và tasks được nhóm theo từng thành viên
   */
  @Public()
  @Get('overdue-tasks-by-member')
  async getOverdueTasksByMember() {
    return this.workflowService.getOverdueTasksByMember();
  }

  /**
   * API để gửi thông báo nhắc trễ đến từng thành viên qua Gmail
   * Mỗi thành viên sẽ nhận được email riêng với danh sách task quá hạn của họ
   */
  @Public()
  @Post('send-overdue-notifications')
  async sendOverdueNotifications(
    @Body()
    body: {
      emailTo?: string | string[]; // Email người nhận (optional, sẽ dùng email từ member nếu không có)
      options?: {
        sendToAllMembers?: boolean; // Gửi cho tất cả members (kể cả không có task quá hạn)
        includeSummary?: boolean; // Bao gồm summary tổng hợp
        emailSubject?: string; // Subject của email
      };
    },
  ) {
    return this.workflowService.sendOverdueNotificationsToMembers(body.emailTo, body.options);
  }

  /**
   * API TỔNG HỢP: Tự động thực hiện tất cả các bước từ đầu đến cuối
   * 
   * Quy trình tự động:
   * 1. Query TẤT CẢ tasks từ DB
   * 2. Tính toán các trạng thái cho từng task (quá hạn, sắp hết hạn, risky, blocked...)
   * 3. Nhóm tasks theo member
   * 4. Query lại User từ DB để lấy email
   * 5. Format thông báo cụ thể cho từng member
   * 6. Gửi email với thông tin chi tiết
   * 
   * Tái sử dụng các API/method có sẵn:
   * - getOverdueTasks() - Query tasks và tính toán
   * - getOverdueTasksByMember() - Nhóm theo member
   * - sendOverdueNotificationsToMembers() - Gửi email
   */
  @Public()
  @Post('process-and-send-overdue-notifications')
  async processAndSendOverdueNotifications(
    @Body()
    body?: {
      options?: {
        sendToAllMembers?: boolean; // Gửi cho tất cả members (kể cả không có task quá hạn)
        includeSummary?: boolean; // Bao gồm summary tổng hợp
        emailSubject?: string; // Subject của email
      };
    },
  ) {
    return this.workflowService.processAndSendOverdueNotifications(body?.options);
  }

  /**
   * API lấy thông tin trạng thái từ Jira
   * 
   * Có thể:
   * 1. Lấy thông tin một issue cụ thể (qua issueKey)
   * 2. Tìm kiếm issues bằng JQL query
   * 3. Lấy tất cả issues được assign cho user hiện tại (nếu không có issueKey và JQL)
   */
  @Public()
  @Post('jira-status')
  async getJiraStatus(
    @Body()
    body?: {
      issueKey?: string; // Jira issue key (VD: PROJ-123) - để lấy 1 issue cụ thể
      jql?: string; // JQL query để tìm kiếm nhiều issues (VD: "project = PROJ AND status = 'In Progress'")
      jiraUrl?: string; // Optional - sẽ dùng từ .env nếu không có
      jiraEmail?: string; // Optional - sẽ dùng từ .env nếu không có
      jiraApiToken?: string; // Optional - sẽ dùng từ .env nếu không có
      jiraUsername?: string; // Optional - alternative auth
      jiraPassword?: string; // Optional - alternative auth
    },
  ) {
    try {
      return await this.workflowService.getJiraStatus(body || {});
    } catch (error: any) {
      console.error('❌ Lỗi trong getJiraStatus:', error.message);
      throw error;
    }
  }

  /**
   * API lấy thông tin một issue cụ thể từ Jira
   */
  @Public()
  @Get('jira-status/:issueKey')
  async getJiraIssueStatus(
    @Param('issueKey') issueKey: string,
    @Body()
    body?: {
      jiraUrl?: string;
      jiraEmail?: string;
      jiraApiToken?: string;
      jiraUsername?: string;
      jiraPassword?: string;
    },
  ) {
    return this.workflowService.getJiraIssueStatus(issueKey, body);
  }

  /**
   * API đồng bộ thông tin từ Jira vào database
   * Cập nhật tasks trong DB dựa trên thông tin từ Jira
   */
  @Public()
  @Post('jira-sync')
  async syncJiraToDatabase(
    @Body()
    body?: {
      issueKey?: string; // Sync một issue cụ thể
      jql?: string; // Sync nhiều issues theo JQL
      updateAll?: boolean; // Sync tất cả tasks có jiraIssueId trong DB
      jiraUrl?: string;
      jiraEmail?: string;
      jiraApiToken?: string;
      jiraUsername?: string;
      jiraPassword?: string;
    },
  ) {
    return this.workflowService.syncJiraToDatabase(body);
  }

  /**
   * API TỔNG HỢP: Lấy status từ Project → Task, kiểm tra thay đổi ở Jira và cập nhật DB
   * Tự động sync tất cả projects và tasks có jiraIssueId
   * Chỉ cập nhật những gì có thay đổi
   */
  @Public()
  @Post('jira-sync-all')
  async syncAllJiraChanges(
    @Body()
    body?: {
      jiraUrl?: string;
      jiraEmail?: string;
      jiraApiToken?: string;
      jiraUsername?: string;
      jiraPassword?: string;
      projectKey?: string; // Project key để sync (VD: PROJ)
      issueKeys?: string[]; // Danh sách issueKeys cụ thể để sync (VD: ["PROJ-1", "PROJ-2"])
    },
  ) {
    return this.workflowService.syncAllJiraChanges(body);
  }

  /**
   * API helper: Lấy danh sách tất cả issueKeys từ Jira
   * Giúp bạn biết có những issueKeys nào trong Jira để sử dụng
   */
  @Public()
  @Get('jira-list-issues')
  async listJiraIssues(
    @Query('project') project?: string,
    @Query('maxResults') maxResults?: string,
  ) {
    return this.workflowService.listAllJiraIssues(project, maxResults ? parseInt(maxResults) : 50);
  }
}
