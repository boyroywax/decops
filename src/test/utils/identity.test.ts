import { describe, it, expect } from 'vitest';
import { generateDID, generateKeyPair, generateGroupDID, generateNetworkDID } from '../../utils/identity';

describe('identity utils', () => {
    describe('generateDID', () => {
        it('returns a string starting with did:peer:', () => {
            const did = generateDID();
            expect(did).toMatch(/^did:peer:/);
        });

        it('returns unique values', () => {
            const did1 = generateDID();
            const did2 = generateDID();
            expect(did1).not.toBe(did2);
        });
    });

    describe('generateKeyPair', () => {
        it('returns an object with pub and priv keys', () => {
            const keyPair = generateKeyPair();
            expect(keyPair).toHaveProperty('pub');
            expect(keyPair).toHaveProperty('priv');
        });

        it('keys are non-empty strings', () => {
            const { pub, priv } = generateKeyPair();
            expect(pub).toBeTruthy();
            expect(priv).toBeTruthy();
        });
    });

    describe('generateGroupDID', () => {
        it('returns a string starting with did:group:', () => {
            const did = generateGroupDID();
            expect(did).toMatch(/^did:group:/);
        });
    });

    describe('generateNetworkDID', () => {
        it('returns a string starting with did:network:', () => {
            const did = generateNetworkDID();
            expect(did).toMatch(/^did:network:/);
        });
    });
});
