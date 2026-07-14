import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  CreateUsuarioData,
  IAuthRepository,
  UsuarioWithPassword,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRol } from '../../domain/entities/usuario-rol.entity';

interface UsuarioRow {
  numero_identificacion: string;
  id_tipo_numero_identificacion: string;
  contrasena: string;
  email: string;
  telefono: string;
  id_usuario_rol: string;
  activo: boolean;
  fecha_creacion: string;
  usuario_rol?: UsuarioRolRow | UsuarioRolRow[] | null;
}

interface UsuarioRolRow {
  id: string;
  nombre: string;
  nivel_permisos: number;
}

@Injectable()
export class SupabaseAuthRepository implements IAuthRepository {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const key = this.configService.get<string>('supabase.serviceRoleKey');
    if (!url || !key) {
      throw new Error('Supabase no configurado correctamente');
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('email', email)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario por email: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('email', email)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario con password: ${error.message}`);
    }
    if (!data) return null;
    return this.toEntityWithPassword(data);
  }

  async findByNumeroIdentificacion(numeroIdentificacion: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('numero_identificacion', numeroIdentificacion)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario por numero_identificacion: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async findByIdWithRol(numeroIdentificacion: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('numero_identificacion', numeroIdentificacion)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario con rol: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async create(input: CreateUsuarioData): Promise<Usuario> {
    const { data, error } = await this.client
      .from('usuario')
      .insert({
        numero_identificacion: input.numeroIdentificacion,
        id_tipo_numero_identificacion: input.idTipoNumeroIdentificacion,
        contrasena: input.passwordHash,
        email: input.email,
        telefono: input.telefono,
        id_usuario_rol: input.idUsuarioRol,
        activo: true,
        fecha_creacion: new Date().toISOString().split('T')[0],
      })
      .select('*, usuario_rol:usuario_rol(*)')
      .single<UsuarioRow>();

    if (error) {
      throw new Error(`Error creando usuario: ${error.message}`);
    }
    if (!data) {
      throw new Error('No se retorno el usuario creado');
    }
    return this.toEntity(data);
  }

  private extractRol(rol: UsuarioRow['usuario_rol']): UsuarioRol | undefined {
    if (!rol) return undefined;
    const r = Array.isArray(rol) ? rol[0] : rol;
    if (!r) return undefined;
    return new UsuarioRol(r.id, r.nombre, r.nivel_permisos);
  }

  private toEntity(row: UsuarioRow): Usuario {
    return new Usuario(
      row.numero_identificacion,
      row.id_tipo_numero_identificacion,
      row.email,
      row.telefono,
      row.id_usuario_rol,
      row.activo,
      new Date(row.fecha_creacion),
      this.extractRol(row.usuario_rol),
    );
  }

  private toEntityWithPassword(row: UsuarioRow): UsuarioWithPassword {
    const base = this.toEntity(row);
    return Object.assign(Object.create(base), base, { passwordHash: row.contrasena });
  }
}