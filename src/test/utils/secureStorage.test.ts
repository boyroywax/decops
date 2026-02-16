import { describe, it, expect } from 'vitest';
import { encryptData, decryptData } from '../../utils/secureStorage';

describe('secureStorage', () => {
    it('should encrypt and decrypt data with the same password', async () => {
        const data = 'secret-message';
        const password = 'my-password';

        const encrypted = await encryptData(data, password);
        const decrypted = await decryptData(encrypted, password);

        expect(decrypted).toBe(data);
    });

    it('should fail to decrypt with the wrong password', async () => {
        const data = 'secret-message';
        const password = 'correct-password';
        const wrongPassword = 'wrong-password';

        const encrypted = await encryptData(data, password);

        await expect(decryptData(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should generate different ciphertext for the same data (salt/iv check)', { timeout: 20000 }, async () => {
        const data = 'secret-message';
        const password = 'my-password';

        const encrypted1 = await encryptData(data, password);
        const encrypted2 = await encryptData(data, password);

        expect(encrypted1).not.toBe(encrypted2);

        // both should decrypt to the same data
        const decrypted1 = await decryptData(encrypted1, password);
        const decrypted2 = await decryptData(encrypted2, password);

        expect(decrypted1).toBe(data);
        expect(decrypted2).toBe(data);
    });
});
