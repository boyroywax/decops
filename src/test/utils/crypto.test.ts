import { describe, it, expect } from 'vitest';
import { encryptPassword } from '../../utils/crypto';

describe('crypto utils', () => {
    describe('encryptPassword', () => {
        it('should return a base64 encoded string', () => {
            const password = 'password123';
            // Current implementation just does btoa
            const expected = btoa(password);
            const encrypted = encryptPassword(password);
            expect(encrypted).toBe(expected);
        });

        it('should handle empty strings', () => {
            const password = '';
            const expected = btoa(password);
            const encrypted = encryptPassword(password);
            expect(encrypted).toBe(expected);
        });

        it('should handle special characters', () => {
            const password = '!@#$%^&*()';
            const expected = btoa(password);
            const encrypted = encryptPassword(password);
            expect(encrypted).toBe(expected);
        });
    });
});
