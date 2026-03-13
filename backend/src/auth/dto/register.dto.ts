// src/auth/dto/register.dto.ts
import { IsEmail, IsString, IsArray, IsOptional, IsEnum, MinLength } from 'class-validator';

export enum PlatformRole {
  DIRECTOR   = 'DIRECTOR',
  CS         = 'CS',
  CA         = 'CA',
  COST_ACCOUNTANT = 'COST_ACCOUNTANT',
}

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PlatformRole, { each: true })
  platformRoles?: string[];
}
