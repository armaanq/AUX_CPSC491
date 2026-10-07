import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

export function jwtOptions(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short in server/.env. Generate one with: openssl rand -hex 32',
    );
  }
  return {
    secret,
    // Pinning the algorithm stops a token from choosing a weaker one.
    signOptions: { algorithm: 'HS256', expiresIn: '30d' },
    verifyOptions: { algorithms: ['HS256'] },
  };
}

@Module({
  imports: [UsersModule, JwtModule.registerAsync({ useFactory: jwtOptions })],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
