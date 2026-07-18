import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthQueryService } from '../../src/modules/auth/application/queries/auth-query.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';

const buildUsuario = (id: string): Usuario =>
  new Usuario(id, 'u@taller.com', 'Ana', 'Perez', null, true, null, 0, null, null, new Date());

describe('AuthQueryService', () => {
  let service: AuthQueryService;
  let repo: jest.Mocked<IAuthRepository>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
      marcarEmailVerificado: jest.fn(),
      actualizarPassword: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AuthQueryService, { provide: AUTH_REPOSITORY, useValue: repoMock }],
    }).compile();

    service = moduleRef.get(AuthQueryService);
    repo = moduleRef.get(AUTH_REPOSITORY);
  });

  describe('getById', () => {
    it('retorna el usuario cuando existe', async () => {
      const user = buildUsuario('123');
      repo.findById.mockResolvedValue(user);
      const result = await service.getById('123');
      expect(result).toBe(user);
      expect(result.email).toBe('u@taller.com');
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
