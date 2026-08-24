import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformMembershipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleCode!: string;
}
