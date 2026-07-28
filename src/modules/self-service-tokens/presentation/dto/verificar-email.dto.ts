import { IsNotEmpty, IsString } from 'class-validator';

export class VerificarEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
