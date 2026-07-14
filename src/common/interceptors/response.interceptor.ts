import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

interface SuccessResponseBody<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponseBody<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponseBody<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const statusCode = context.switchToHttp().getResponse().statusCode;
    return next.handle().pipe(
      map((data: T) => ({
        success: true,
        statusCode,
        data,
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }
}