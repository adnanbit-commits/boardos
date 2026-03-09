
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CastVoteDto {
  @IsEnum(['APPROVE', 'REJECT', 'ABSTAIN'])
  value: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
