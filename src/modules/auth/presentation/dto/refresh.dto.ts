import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RefreshDto {
  /**
   * Optional in the body: if the client sends the `refresh_token` cookie
   * (browser flow), it does not need to be repeated here. Non-browser
   * consumers (Postman, scripts) keep sending it in the body as before.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
