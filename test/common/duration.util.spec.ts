import { parseDurationToMs } from '../../src/common/utils/duration.util';

describe('parseDurationToMs', () => {
  it('interpreta una cadena de solo digitos como segundos', () => {
    expect(parseDurationToMs('30')).toBe(30_000);
  });

  it('interpreta segundos (s)', () => {
    expect(parseDurationToMs('45s')).toBe(45_000);
  });

  it('interpreta minutos (m)', () => {
    expect(parseDurationToMs('30m')).toBe(30 * 60_000);
  });

  it('interpreta horas (h)', () => {
    expect(parseDurationToMs('2h')).toBe(2 * 3_600_000);
  });

  it('interpreta dias (d)', () => {
    expect(parseDurationToMs('7d')).toBe(7 * 86_400_000);
  });

  it('lanza error con un formato invalido', () => {
    expect(() => parseDurationToMs('abc')).toThrow('Formato de duracion invalido');
  });

  it('lanza error con una unidad no soportada', () => {
    expect(() => parseDurationToMs('5w')).toThrow('Formato de duracion invalido');
  });
});
