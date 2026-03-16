import { IsString, IsOptional, IsUUID, IsIn, IsBoolean, IsUrl, MinLength, MaxLength } from 'class-validator';

export class CreateResolutionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  title: string;

  @IsString()
  @MinLength(10)
  text: string;

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
