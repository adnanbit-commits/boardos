import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
export class UpdateMemberRoleDto {
  @IsOptional()
  @IsEnum(['ADMIN', 'DIRECTOR', 'OBSERVER', 'PARTNER'])
  role?: string;
  @IsOptional()
  @IsBoolean()
  isChairman?: boolean;
}
