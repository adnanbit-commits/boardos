import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsOptional()
  @IsEnum(['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'])
  role?: string;

  @IsOptional()
  @IsEnum([
    'EXECUTIVE_DIRECTOR', 'NON_EXECUTIVE_DIRECTOR', 'INDEPENDENT_DIRECTOR',
    'NOMINEE_DIRECTOR', 'MANAGING_DIRECTOR', 'DIRECTOR_SIMPLICITOR',
    'WHOLE_TIME_CS', 'CS_IN_PRACTICE', 'CS_AS_KMP',
    'STATUTORY_AUDITOR', 'INTERNAL_AUDITOR', 'COST_AUDITOR',
  ])
  additionalDesignation?: string;

  @IsOptional()
  @IsString()
  designationLabel?: string;
}
