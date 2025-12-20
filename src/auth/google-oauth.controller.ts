import { Controller, Get, Query, Res, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { google } from 'googleapis';
import { Public } from './public.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Controller('auth/google')
@Public()
export class GoogleOAuthController {
  private oauth2Client: any;

  constructor(private configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>(
      'GOOGLE_OAUTH_REDIRECT_URI',
    ) || `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/google/callback`;

    if (clientId && clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );
    }
  }

  /**
   * Initiate OAuth flow - redirect user to Google
   */
  @Get()
  async initiateOAuth(@Res() res: Response) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured',
      });
    }

    const redirectUri =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI') ||
      `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    res.redirect(authUrl);
  }

  /**
   * OAuth callback - receive authorization code and exchange for tokens
   */
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p><a href="/auth/google">Try again</a></p>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>No authorization code received</p>
            <p><a href="/auth/google">Try again</a></p>
          </body>
        </html>
      `);
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI') ||
      `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);
      const refreshToken = tokens.refresh_token;

      if (!refreshToken) {
        return res.status(400).send(`
          <html>
            <body>
              <h1>Authorization Failed</h1>
              <p>No refresh token received. Make sure you granted all permissions.</p>
              <p><a href="/auth/google">Try again</a></p>
            </body>
          </html>
        `);
      }

      // Save refresh token to .env file
      await this.saveRefreshTokenToEnv(refreshToken);

      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #4CAF50;">✅ Authorization Successful!</h1>
            <p>Refresh token has been saved to your .env file.</p>
            <p><strong>Refresh Token:</strong></p>
            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">${refreshToken}</pre>
            <p style="margin-top: 30px;">
              <a href="/" style="background: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Go Back
              </a>
            </p>
          </body>
        </html>
      `);
    } catch (err: any) {
      return res.status(500).send(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${err.message}</p>
            <p><a href="/auth/google">Try again</a></p>
          </body>
        </html>
      `);
    }
  }

  /**
   * Save refresh token to .env file
   */
  private async saveRefreshTokenToEnv(refreshToken: string): Promise<void> {
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      // Check if GOOGLE_REFRESH_TOKEN already exists
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        // Replace existing refresh token
        envContent = envContent.replace(
          /GOOGLE_REFRESH_TOKEN=.*/g,
          `GOOGLE_REFRESH_TOKEN=${refreshToken}`,
        );
      } else {
        // Add new refresh token
        if (envContent && !envContent.endsWith('\n')) {
          envContent += '\n';
        }
        envContent += `GOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('Refresh token saved to .env file');
    } catch (error) {
      console.error('Failed to save refresh token to .env:', error);
      throw error;
    }
  }
}

