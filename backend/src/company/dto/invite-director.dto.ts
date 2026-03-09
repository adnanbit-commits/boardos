import { IsEmail, IsEnum, IsOptional, IsBoolean } from 'class-validator';
export class InviteDirectorDto {
  @IsEmail()
  email: string;
  @IsEnum(['ADMIN', 'DIRECTOR', 'OBSERVER', 'PARTNER'])
  role: string;
  @IsOptional()
  @IsBoolean()
  isChairman?: boolean;
}
