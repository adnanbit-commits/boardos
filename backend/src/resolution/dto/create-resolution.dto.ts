import { IsString, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';
export class CreateResolutionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  title: string;
  @IsString()
  @MinLength(50)
  text: string;
  @IsOptional()
  @IsUUID()
  agendaItemId?: string;
}
