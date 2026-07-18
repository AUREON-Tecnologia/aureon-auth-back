import { Module } from '@nestjs/common';
import { OTP_REPOSITORY } from './domain/repositories/otp.repository.interface';
import { SupabaseOtpRepository } from './infrastructure/repositories/supabase-otp.repository';
import { OtpService } from './application/services/otp.service';
import { OtpController } from './presentation/controllers/otp.controller';

@Module({
  controllers: [OtpController],
  providers: [{ provide: OTP_REPOSITORY, useClass: SupabaseOtpRepository }, OtpService],
})
export class OtpModule {}
