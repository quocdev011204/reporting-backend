import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleOAuthController } from './google-oauth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'defaultSecretKey', // Dùng env: process.env.JWT_SECRET
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController, GoogleOAuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy, JwtModule],
})
export class AuthModule {}
