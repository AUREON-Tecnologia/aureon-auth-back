import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthQueryService } from '../../src/modules/auth/application/queries/auth-query.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { UsuarioRol } from '../../src/modules/auth/domain/entities/usuario-rol.entity';

const buildUsuario = (id: string): Usuario =>
  new Usuario(
    id,
    '1234567890',
    'tipo-cc',
    'u@taller.com',
    '+573001234567',
    'rol-admin',
    true,
    0,
    null,
    null,
    new Date(),
    new UsuarioRol('rol-admin', 'administrador', 10),
  );

describe('AuthQueryService', () => {
  let service: AuthQueryService;
  let repo: jest.Mocked<IAuthRepository>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByNumeroIdentificacion: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AuthQueryService, { provide: AUTH_REPOSITORY, useValue: repoMock }],
    }).compile();

    service = moduleRef.get(AuthQueryService);
    repo = moduleRef.get(AUTH_REPOSITORY);
  });

  describe('getById', () => {
    it('retorna el usuario con su rol cuando existe', async () => {
      const user = buildUsuario('123');
      repo.findById.mockResolvedValue(user);
      const result = await service.getById('123');
      expect(result).toBe(user);
      expect(result.rol?.nombre).toBe('administrador');
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('calcula totalPaginas a partir del total y del tamanio de pagina', async () => {
      const usuarios = [buildUsuario('1'), buildUsuario('2')];
      repo.findAll.mockResolvedValue({ data: usuarios, total: 25 });

      const result = await service.listar({}, { pagina: 2, tamanioPagina: 10 });

      expect(repo.findAll).toHaveBeenCalledWith({}, { pagina: 2, tamanioPagina: 10 });
      expect(result.data).toBe(usuarios);
      expect(result.meta).toEqual({ pagina: 2, tamanioPagina: 10, total: 25, totalPaginas: 3 });
    });

    it('totalPaginas es al menos 1 aunque no haya resultados', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const result = await service.listar({}, { pagina: 1, tamanioPagina: 20 });
      expect(result.meta.totalPaginas).toBe(1);
    });
  });
});
