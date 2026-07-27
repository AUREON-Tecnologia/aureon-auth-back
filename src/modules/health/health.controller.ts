import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  health() {
    return {
      status: 'ok ready!',
      service: this.configService.get<string>('app.serviceName') ?? 'auth-service',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}