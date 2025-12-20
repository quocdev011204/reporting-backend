import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { Public } from '../auth/public.decorator';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

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
  ) {
    const dateRange =
      startDate && endDate ? { start: startDate, end: endDate } : undefined;
    return this.workflowService.buildPrompt(chartUrl, dateRange);
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
  ) {
    const dateRange =
      startDate && endDate ? { start: startDate, end: endDate } : undefined;
    return this.workflowService.prepareDataForN8n(chartUrl, dateRange);
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
      );
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
   * Backend xử lý tất cả: prepare data + AI Agent + Groq Chat
   */
  @Public()
  @Post('process-ai-report')
  async processAIAndReport(
    @Body()
    body: {
      chartUrl?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const dateRange =
      body.startDate && body.endDate
        ? { start: body.startDate, end: body.endDate }
        : undefined;
    return this.workflowService.processAIAndCreateReport(
      body.chartUrl,
      dateRange,
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
   * API để prepare data cho việc gửi message
   * n8n gọi sau khi AI xử lý xong
   */
  @Public()
  @Post('prepare-message')
  async prepareMessage(
    @Body() body: { reportId?: number; aiResponse?: string },
  ) {
    return this.workflowService.prepareMessageData(
      body.reportId,
      body.aiResponse,
    );
  }
}
