// src/auth/auth.controller.ts

import {
  Controller, Post, Get, Body, HttpCode, HttpStatus,
  UseGuards, Req, Res,
} from '@nestjs/common';
import { AuthGuard }                        from '@nestjs/passport';
import { AuthService, RegisterDto, LoginDto } from './auth.service';
import { JwtAuthGuard }                     from './jwt-auth.guard';
import { Public }                           from './public.decorator';
import { IsEmail, IsString, IsArray, IsOptional, MinLength } from 'class-validator';

class RegisterBody implements RegisterDto {
  @IsString()  name: string;
  @IsEmail()   email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsArray() platformRoles?: string[];
}
class LoginBody implements LoginDto {
  @IsEmail()  email: string;
  @IsString() password: string;
}
class OnboardingBody {
  @IsString() intent: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterBody) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginBody) {
    return this.auth.login(body);
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google — nothing to do here
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
    const { token, user } = this.auth.signForOAuth(req.user);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    // Redirect to frontend with token + onboarding flag in query string
    const params = new URLSearchParams({
      token,
      onboarding: user.onboardingDone ? '0' : '1',
    });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ── Onboarding ──────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  onboarding(@Req() req: any, @Body() body: OnboardingBody) {
    return this.auth.updateOnboarding(req.user.userId, body.intent);
  }

  // ── Me ──────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.userId);
  }
}
