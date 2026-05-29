import { describe, it, expect } from "vitest";
import { isSlashCommand } from "@/hooks/chat/useChatSend";

describe("isSlashCommand", () => {
    it("accepts a bare command", () => {
        expect(isSlashCommand("/help")).toBe(true);
    });

    it("accepts a command with args", () => {
        expect(isSlashCommand("/list_agents tag=ops")).toBe(true);
        expect(isSlashCommand("/create_network {\"name\":\"x\"}")).toBe(true);
    });

    it("accepts dotted and dashed command identifiers", () => {
        expect(isSlashCommand("/sys.reset")).toBe(true);
        expect(isSlashCommand("/long-running-cmd")).toBe(true);
    });

    it("rejects multiaddrs and other path-like inputs", () => {
        expect(isSlashCommand("/dnsaddr/bootstrap.libp2p.io/p2p/QmNn")).toBe(false);
        expect(isSlashCommand("/ip4/1.2.3.4/tcp/4001")).toBe(false);
        expect(isSlashCommand("/etc/hosts")).toBe(false);
        expect(isSlashCommand("//doubled")).toBe(false);
    });

    it("rejects a multiline paste whose first line is a path", () => {
        const paste = [
            "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
            "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
        ].join("\n");
        expect(isSlashCommand(paste)).toBe(false);
    });

    it("rejects non-slash input", () => {
        expect(isSlashCommand("hello /world")).toBe(false);
        expect(isSlashCommand("@agent ping")).toBe(false);
        expect(isSlashCommand("")).toBe(false);
    });
});
