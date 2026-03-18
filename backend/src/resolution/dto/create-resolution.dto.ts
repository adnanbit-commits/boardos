import { IsString, IsOptional, IsUUID, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateResolutionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  title: string;

  @IsString()
  @MinLength(10)
  motionText: string;

  @IsOptional()
  @IsString()
  resolutionText?: string;

  @IsOptional()
  @IsUUID()
  agendaItemId?: string;

  @IsOptional()
  @IsIn(['MEETING', 'NOTING', 'CIRCULAR'])
  type?: 'MEETING' | 'NOTING' | 'CIRCULAR';

  @IsOptional()
  @IsString()
  vaultDocId?: string;

  @IsOptional()
  @IsString()
  meetingDocId?: string;
}
