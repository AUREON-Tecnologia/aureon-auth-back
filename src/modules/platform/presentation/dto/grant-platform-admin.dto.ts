import { IsEmail, MaxLength } from 'class-validator';

export class GrantPlatformAdminDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
