import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class MicrosoftTokenCryptoService {
  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString(
      'base64',
    )}`;
  }

  decrypt(value: string) {
    const [ivPart, authTagPart, payloadPart] = value.split('.');
    if (!ivPart || !authTagPart || !payloadPart) {
      throw new InternalServerErrorException(
        'Stored Microsoft credentials are not readable.',
      );
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivPart, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadPart, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private key() {
    const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
    if (!secret) {
      throw new InternalServerErrorException(
        'INTEGRATIONS_ENCRYPTION_KEY is not configured on the backend.',
      );
    }

    return createHash('sha256').update(secret).digest();
  }
}
