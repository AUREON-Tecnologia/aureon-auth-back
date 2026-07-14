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
  new Usuario(id, 'tipo-cc', 'u@taller.com', '+573001234567', 'rol-admin', true, new Date(), new UsuarioRol('rol-admin', 'ADMIN', 1));

describe('AuthQueryService', () => {
  let service: AuthQueryService;
  let repo: jest.Mocked<IAuthRepository>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByNumeroIdentificacion: jest.fn(),
      findByIdWithRol: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthQueryService,
        { provide: AUTH_REPOSITORY, useValue: repoMock },
      ],
    }).compile();

    service = moduleRef.get(AuthQueryService);
    repo = moduleRef.get(AUTH_REPOSITORY);
  });

  describe('getById', () => {
    it('retorna el usuario con su rol cuando existe', async () => {
      const user = buildUsuario('123');
      repo.findByIdWithRol.mockResolvedValue(user);
      const result = await service.getById('123');
      expect(result).toBe(user);
      expect(result.rol?.nombre).toBe('ADMIN');
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      repo.findByIdWithRol.mockResolvedValue(null);
      await expect(service.getById('999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});