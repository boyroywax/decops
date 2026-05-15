import '@testing-library/jest-dom';

// jsdom doesn't implement Element.scrollIntoView (used by chat scrolling, etc.).
// Stub it so components that auto-scroll don't crash under test.
if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () { /* no-op in jsdom */ };
}
