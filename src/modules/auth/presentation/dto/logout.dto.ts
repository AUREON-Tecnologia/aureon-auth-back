import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LogoutDto {
  /** Optional in the body: see RefreshDto — same cookie-or-body logic. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
