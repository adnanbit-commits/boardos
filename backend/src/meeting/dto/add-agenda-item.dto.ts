import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AddAgendaItemDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Typed item fields — set by template application
  // Controls which specialised UI surface renders for this item in the meeting workspace.
  @IsOptional()
  @IsString()
  itemType?: string;      // STANDARD | ROLL_CALL | QUORUM_CONFIRMATION | CHAIRPERSON_ELECTION | COMPLIANCE_NOTING | VAULT_DOC_NOTING | ELECTRONIC_CONSENT

  @IsOptional()
  @IsString()
  legalBasis?: string;    // shown to CS as guidance, never in minutes

  @IsOptional()
  @IsString()
  guidanceNote?: string;  // operational note for CS, never in minutes
}
