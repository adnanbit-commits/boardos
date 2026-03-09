import { IsString, IsDateString, IsOptional, IsUrl } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  title: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  videoProvider?: string;
}

