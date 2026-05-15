/**
 * Delegation-matcher tests for libp2pBot and studioBot.
 *
 * Validates the routing heuristics that decide which sub-bot handles a
 * user message. Importing these modules also registers their delegations
 * at module load time; the test verifies registration succeeds without
 * throwing (no real LLM calls).
 */

import { describe, it, expect } from "vitest";
import { shouldDelegateToLibp2pBot } from "@/toolkits/libp2p/libp2pBot";
import { shouldDelegateToStudioBot } from "@/toolkits/studio/studioBot";

describe("libp2pBot delegation matcher [§2.1]", () => {
    it.each([
        "start the libp2p node",
        "ping a peer at /ip4/...",
        "what is my peer id?",
        "subscribe to a topic",
        "show gossipsub stats",
        "set up circuit relay",
    ])("delegates for: %s", (msg) => {
        expect(shouldDelegateToLibp2pBot(msg)).toBe(true);
    });

    it.each([
        "create a job that summarizes the transcript",
        "what time is it?",
        "make a new agent named Alice",
        "draft an email reply",
        "deploy the studio canvas",
    ])("does NOT delegate for: %s", (msg) => {
        expect(shouldDelegateToLibp2pBot(msg)).toBe(false);
    });
});

describe("studioBot delegation matcher [§2.1]", () => {
    it.each([
        "create a job that runs nightly",
        "build a job to summarize messages",
        "auto-layout the canvas",
        "add a step that calls the api",
        "save the job",
        "open the studio",
    ])("delegates for: %s", (msg) => {
        expect(shouldDelegateToStudioBot(msg)).toBe(true);
    });

    it.each([
        "ping a peer",
        "what's my libp2p peer id?",
        "send a message to channel #general",
        "subscribe to a pubsub topic",
    ])("does NOT delegate for: %s", (msg) => {
        expect(shouldDelegateToStudioBot(msg)).toBe(false);
    });

    it("does not double-delegate (libp2p + studio matchers should be disjoint for typical libp2p phrasing)", () => {
        const libp2pMessages = [
            "start the libp2p node",
            "ping peer 12D3KooW...",
            "subscribe to a topic",
        ];
        for (const m of libp2pMessages) {
            expect(shouldDelegateToLibp2pBot(m)).toBe(true);
            expect(shouldDelegateToStudioBot(m)).toBe(false);
        }
    });
});
