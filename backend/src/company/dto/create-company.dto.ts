import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, {
    message: 'CIN must be in the format U12345MH2020PTC123456',
  })
  cin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  registeredAt?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
