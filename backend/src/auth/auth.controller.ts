// src/auth/auth.controller.ts

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService, RegisterDto, LoginDto }           from './auth.service';
import { IsEmail, IsString, MinLength }                 from 'class-validator';

class RegisterBody implements RegisterDto {
  @IsString()  name:     string;
  @IsEmail()   email:    string;
  @IsString() @MinLength(8) password: string;
}

class LoginBody implements LoginDto {
  @IsEmail()   email:    string;
  @IsString()  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterBody) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginBody) {
    return this.auth.login(body);
  }
}
