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

  // SS-1 Rule 3(1) — deemed venue is mandatory for virtual/hybrid meetings.
  // Usually the registered office address. Recorded in notice and minutes.
  @IsOptional()
  @IsString()
  deemedVenue?: string;

  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  videoProvider?: string;
}
