import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TerminateTenantDto {
  /** Why the contract ended (kept in the record). */
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class PurgeTenantDto {
  /** Required only before day 30 (e.g. the client asked in writing): kept in the record. */
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  earlyReason?: string;
}
