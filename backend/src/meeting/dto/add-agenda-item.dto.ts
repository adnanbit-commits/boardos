import { IsString, IsOptional } from 'class-validator';

export class AddAgendaItemDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
