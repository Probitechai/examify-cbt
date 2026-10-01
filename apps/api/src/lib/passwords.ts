// Temporary passwords for new accounts: random from the crypto generator,
// easy to read out or type (no 0/O, 1/l/I), e.g. "Kx7m-Qp4r-Zt9w"
import { randomInt } from 'crypto'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newTempPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${group()}-${group()}-${group()}`
}
