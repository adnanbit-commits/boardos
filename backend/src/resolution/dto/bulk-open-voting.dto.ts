import { IsOptional, IsArray, IsUUID } from 'class-validator';
export class BulkOpenVotingDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  resolutionIds?: string[];
}
