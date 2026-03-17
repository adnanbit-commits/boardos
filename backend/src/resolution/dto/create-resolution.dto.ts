import { IsString, IsOptional, IsUUID, IsIn, IsBoolean, IsUrl, MinLength, MaxLength } from 'class-validator';

export class CreateResolutionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  title: string;

  @IsString()
  @MinLength(10)
  text: string;

  /**
   * Optional enacted wording ("RESOLVED THAT…").
   * NOT stored as a separate DB column — the backend merges this into `text`
   * before the Prisma write (see sanitizeResolutionInput in resolution.service.ts).
   * Kept here so the frontend can keep sending it without TS errors.
   */
  @IsOptional()
  @IsString()
  resolutionText?: string;

  @IsOptional()
  @IsUUID()
  agendaItemId?: string;

  @IsOptional()
  @IsIn(['MEETING', 'NOTING'])
  type?: 'MEETING' | 'NOTING';

  // Path A — vault document exhibit
  @IsOptional()
  @IsString()
  vaultDocId?: string;

  @IsOptional()
  @IsString()
  meetingDocId?: string;
}
