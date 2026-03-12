import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export class InviteDirectorDto {
  @IsEmail()
  email: string;

  @IsEnum(['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'])
  role: string;
}
