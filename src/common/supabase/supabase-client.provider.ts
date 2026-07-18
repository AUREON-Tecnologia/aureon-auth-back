import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = Symbol('SupabaseClient');

export const supabaseClientProvider: Provider = {
  provide: SUPABASE_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): SupabaseClient => {
    const url = configService.get<string>('supabase.url');
    const key = configService.get<string>('supabase.serviceRoleKey');
    if (!url || !key) {
      throw new Error('Supabase no configurado correctamente');
    }
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  },
};
