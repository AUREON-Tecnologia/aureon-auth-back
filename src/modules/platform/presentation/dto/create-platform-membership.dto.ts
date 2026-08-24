import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePlatformMembershipDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenantCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleCode!: string;
}
