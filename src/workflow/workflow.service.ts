import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';
import { KpiService } from '../kpi/kpi.service';
import { ChartsService } from '../charts/charts.service';
import { ReportsService } from '../reports/reports.service';
import axios from 'axios';
import { google } from 'googleapis';

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private kpiService: KpiService,
    private chartsService: ChartsService,
    private reportsService: ReportsService,
    private configService: ConfigService,
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
   * Build prompt cho AI Agent từ dữ liệu đã merge - Format CSV
   */
  async buildPrompt(
    chartUrl?: string,
    dateRange?: { start: string; end: string },
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

    // Build prompt theo format mới
    const prompt = `Bạn là chuyên gia phân tích dự án. Phân tích chi tiết dữ liệu KPI và đưa ra báo cáo toàn diện.

YÊU CẦU:

1. **Phân tích xu hướng:** Thống kê số lượng task theo trạng thái (Pending, In Progress, Done, Blocked)

2. **Điểm bất thường:** Liệt kê cụ thể task nào bị Blocked, ai phụ trách, nguyên nhân có thể

3. **Rủi ro:** Task nào sắp hết hạn, ai chậm tiến độ, tác động đến dự án

4. **Hành động cụ thể:** Đề xuất 3-5 hành động với tên người cụ thể và timeline

QUAN TRỌNG - QUY TẮC VIẾT BÁO CÁO:

- KHÔNG sử dụng task ID (T001, T002, T003...) trong báo cáo

- Thay thế bằng mô tả công việc cụ thể (ví dụ: "Thiết kế API endpoints" thay vì "T001")

- Sử dụng tên dự án hoặc mô tả ngắn gọn để nhận diện task

- Tập trung vào nội dung công việc, không phải mã số

ĐỊNH DẠNG:

- Không dùng ký tự * hoặc markdown

- Dùng dấu • cho bullet points

- Tên người in đậm

- Timeline rõ ràng (ngày/tháng)

- Tối đa 2000 ký tự

Data CSV:

${csv}`;

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
  ) {
    // 1. Tự lấy data từ database và build prompt
    const promptData = await this.buildPrompt(chartUrl, dateRange);

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
    if (createGoogleDoc) {
      try {
        // Nếu không truyền googleDocFolderId, đọc từ .env
        const folderId =
          googleDocFolderId ||
          this.configService.get<string>('GOOGLE_DRIVE_FOLDER_ID');
        googleDoc = await this.createGoogleDocsDocument(
          reportTitle,
          reportContent,
          folderId,
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
    if (reportId) {
      content += `Report ID: ${reportId}\n\n`;
    }

    // Summary (đã clean)
    if (cleanSummary) {
      content += `${cleanSummary}\n\n`;
    }

    // Chart URL
    if (chartUrl) {
      content += `Biểu đồ KPI: ${chartUrl}\n\n`;
    }

    // Footer
    content += `\n---\n`;
    content += `Generated at: ${new Date().toLocaleString('vi-VN')}\n`;

    return content;
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
   * Authenticate với Google Service Account
   */
  private async getGoogleAuth() {
    const serviceAccountEmail = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    );
    const privateKey = this.configService
      .get<string>('GOOGLE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!serviceAccountEmail || !privateKey) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be configured',
      );
    }

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
      ],
    });

    return auth;
  }

  /**
   * Tạo Google Docs document từ AI response
   */
  async createGoogleDocsDocument(
    title: string,
    content: string,
    folderId?: string,
  ) {
    try {
      const auth = await this.getGoogleAuth();
      const docs = google.docs({ version: 'v1', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Kiểm tra folder tồn tại và có quyền truy cập trước
      let useFolderId = folderId;
      let folderWarning: string | null = null;
      const serviceAccountEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      
      if (folderId) {
        try {
          await drive.files.get({
            fileId: folderId,
            fields: 'id, name, mimeType',
          });
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

      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, parents',
      });

      const documentId = file.data.id;

      if (!documentId) {
        throw new Error('Failed to create Google Docs document');
      }

      // Insert content vào document
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: content,
              },
            },
          ],
        },
      });

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

      // Kiểm tra nếu lỗi liên quan đến folder permission
      const serviceAccountEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const isFolderPermissionError = 
        error.code === 403 ||
        error.code === 404 ||
        errorMessage?.includes('not found') ||
        errorMessage?.includes('permission') ||
        errorMessage?.includes('insufficient') ||
        errorMessage?.includes('forbidden');

      if (isFolderPermissionError && folderId) {
        throw new Error(
          `Failed to create Google Docs: Folder not found or not accessible: ${folderId}. Please ensure the folder is shared with Service Account (${serviceAccountEmail}) with Editor permission.`,
        );
      }

      throw new Error(
        `Failed to create Google Docs: ${errorMessage}`,
      );
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

      // Xóa nội dung cũ và insert nội dung mới
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
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: content,
              },
            },
          ],
        },
      });

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

      const media = {
        mimeType: fileData.mimeType || 'image/png',
        body: bufferContent,
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink',
      });

      return {
        fileId: file.data.id,
        fileName: file.data.name,
        mimeType: fileData.mimeType || 'image/png',
        folderId: fileData.folderId,
        webViewLink: file.data.webViewLink,
        webContentLink: file.data.webContentLink,
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
      // Nếu có chartImage, upload trực tiếp
      // Nếu không, có thể download từ quickChartUrl rồi upload
      const fileContent = chartImage
        ? chartImage.startsWith('data:') || chartImage.startsWith('http')
          ? chartImage
          : Buffer.from(chartImage, 'base64')
        : null;

      if (fileContent) {
        // Nếu không truyền folderId, đọc từ .env
        const finalFolderId =
          folderId || this.configService.get<string>('GOOGLE_DRIVE_FOLDER_ID');

        uploadResult = await this.uploadFileToGoogleDrive({
          name: `KPI_Chart_${new Date().toISOString().split('T')[0]}.png`,
          content: fileContent,
          mimeType: 'image/png',
          folderId: finalFolderId,
        });

        const fileId = uploadResult?.fileId;
        if (fileId) {
          // Share file
          shareResult = await this.shareFileOnGoogleDrive(fileId, shareOptions);

          // Build URL
          urlResult = await this.buildGoogleDriveUrl(fileId);
          quickChartUrl = urlResult?.shareUrl || quickChartUrl;
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
  ) {
    // Format message từ kết quả 2 nhánh
    const timestamp = new Date().toLocaleString('vi-VN');
    
    // Format cho Slack (Markdown)
    let slackMessage = '📊 *Báo cáo Tổng hợp*\n\n';

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

    slackMessage += `⏰ Generated at: ${timestamp}`;

    // Format cho Email (HTML)
    let emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #4CAF50;">📊 Báo cáo Tổng hợp</h2>
    `;

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
          <p style="color: #666; font-size: 12px;">⏰ Generated at: ${timestamp}</p>
        </body>
      </html>
    `;

    const emailText = `
Báo cáo Tổng hợp

${aiReportResult ? 'AI Report:\n- Prompt đã được tạo\n- AI Agent đã xử lý\n- Groq Chat đã hoàn thành\n' : ''}
${chartResult ? `KPI & Chart:\n- Tổng dự án: ${chartResult.kpi?.projects?.total || 0}\n- Tổng nhiệm vụ: ${chartResult.kpi?.tasks?.total || 0}\n- Tỷ lệ hoàn thành: ${chartResult.kpi?.tasks?.completionRate || 0}%\n${chartResult.chartUrl ? `- Chart URL: ${chartResult.chartUrl}\n` : ''}${chartResult.urls?.shareUrl ? `- Share URL: ${chartResult.urls.shareUrl}\n` : ''}` : ''}

Generated at: ${timestamp}
    `.trim();

    // TODO: Implement actual Slack API call
    // const slackResponse = await axios.post(slackWebhookUrl, {
    //   text: slackMessage,
    //   channel: slackChannel,
    // });

    // TODO: Implement actual Email sending (using nodemailer, sendgrid, etc.)
    // const emailResponse = await this.sendEmail({
    //   to: emailTo,
    //   subject: emailSubject || 'Báo cáo Tổng hợp',
    //   html: emailHtml,
    //   text: emailText,
    // });

    return {
      success: true,
      slack: {
        message: slackMessage,
        webhookUrl: slackWebhookUrl,
        channel: slackChannel,
        sent: !!slackWebhookUrl,
      },
      email: {
        to: Array.isArray(emailTo) ? emailTo : emailTo ? [emailTo] : [],
        subject: emailSubject || 'Báo cáo Tổng hợp',
        html: emailHtml,
        text: emailText,
        sent: !!emailTo,
      },
      sentAt: new Date().toISOString(),
      // Có thể thêm logic gửi thực tế ở đây khi có credentials
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
