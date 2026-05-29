import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom doesn't implement Element.scrollIntoView (used by chat scrolling, etc.).
// Stub it so components that auto-scroll don't crash under test.
if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () { /* no-op in jsdom */ };
}

// The `didcomm` package ships a WASM binding initialised via top-level
// await; under vitest's jsdom worker that initialisation hangs the
// process. Tests don't exercise real DIDComm packing yet, so stub the
// module with no-op constructors that satisfy the lazy `import("didcomm")`
// in src/services/didcomm/index.ts.
vi.mock('didcomm', () => {
    class StubMessage {
        constructor(public value: unknown) { }
        as_value() { return this.value; }
        async pack_encrypted() { return ['{}', {}] as const; }
        async pack_plaintext() { return '{}'; }
        async pack_signed() { return ['{}', {}] as const; }
    }
    return {
        Message: Object.assign(StubMessage, {
            async unpack() {
                return [new StubMessage({ id: 'stub', typ: 'application/didcomm-plain+json', type: 'stub', body: {} }), { encrypted: false, authenticated: false }];
            },
            async wrap_in_forward() { return '{}'; },
        }),
        FromPrior: class { constructor(public value: unknown) { } as_value() { return this.value; } },
        ParsedForward: class { },
    };
});

