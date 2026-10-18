import { PassThrough, Readable } from 'node:stream';
import { writeZip } from '../../src/modules/offboarding/infrastructure/s3-export-storage';
import { PrismaTenantIdentityStore } from '../../src/modules/offboarding/infrastructure/prisma-tenant-identity.store';

async function zipBytes(entries: Parameters<typeof writeZip>[0]): Promise<Buffer> {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise((r) => sink.on('end', r));
  await writeZip(entries, sink);
  await done;
  return Buffer.concat(chunks);
}

describe('writeZip', () => {
  it('writes JSON and streamed files, in order, as a complete ZIP', async () => {
    const bytes = await zipBytes([
      { name: 'manifest.json', json: { ok: true } },
      { name: 'app-back/files/a.jpg', stream: async () => Readable.from([Buffer.from('AAAA')]) },
      { name: 'app-back/files/b.jpg', stream: async () => Readable.from([Buffer.from('BBBB')]) },
    ]);
    const text = bytes.toString('latin1');
    const positions = ['manifest.json', 'app-back/files/a.jpg', 'app-back/files/b.jpg'].map((n) =>
      text.indexOf(n),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // End of central directory record: the archive was finalized.
    expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  });

  it('fails if a file cannot be read', async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('gone'));
      },
    });
    await expect(zipBytes([{ name: 'x.jpg', stream: async () => broken }])).rejects.toThrow('gone');
  });
});

describe('PrismaTenantIdentityStore.revokeSessions', () => {
  it("revokes refresh tokens and deletes only that tenant's access-token sessions from Redis", async () => {
    const prisma = { userSession: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    const store: Record<string, string> = {
      'identity:access-token:a': JSON.stringify({ tenantId: 'T1' }),
      'identity:access-token:b': JSON.stringify({ tenantId: 'T2' }),
      'identity:access-token:c': JSON.stringify({ tenantId: 'T1' }),
      'identity:access-token:d': 'not json',
    };
    const keys = Object.keys(store);
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['7', keys.slice(0, 2)])
        .mockResolvedValueOnce(['0', keys.slice(2)]),
      mget: jest.fn(async (...ks: string[]) => ks.map((k) => store[k] ?? null)),
      del: jest.fn(async (...ks: string[]) => ks.length),
    };
    const identity = new PrismaTenantIdentityStore(prisma as never, redis as never);

    await expect(identity.revokeSessions('T1')).resolves.toEqual({
      refreshTokens: 3,
      accessTokens: 2,
    });
    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'identity:access-token:*', 'COUNT', 500);
    expect(redis.del.mock.calls.flat()).toEqual([
      'identity:access-token:a',
      'identity:access-token:c',
    ]);
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'T1', revokedAt: null } }),
    );
  });

  it('without Redis only refresh tokens are revoked (access tokens expire on their own)', async () => {
    const prisma = { userSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const identity = new PrismaTenantIdentityStore(prisma as never, null);
    await expect(identity.revokeSessions('T1')).resolves.toEqual({
      refreshTokens: 1,
      accessTokens: 0,
    });
  });
});
