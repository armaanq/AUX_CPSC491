import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  AuthService,
  type AuthResponse,
  type LoginBody,
  type SignupBody,
} from './auth.service.js';
import { Public } from './public.decorator.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/signup { email, username, password } */
  @Post('signup')
  signup(@Body() body: SignupBody | undefined): Promise<AuthResponse> {
    return this.auth.signup(body ?? {});
  }

  /** POST /auth/login { identifier: email or username, password } */
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginBody | undefined): Promise<AuthResponse> {
    return this.auth.login(body ?? {});
  }
}
