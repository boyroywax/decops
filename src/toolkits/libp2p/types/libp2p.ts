/**
 * Re-exports of the libp2p toolkit's runtime types.
 *
 * Defined alongside the {@link "../service"} singleton; this barrel
 * mirrors studio's `types/` layout so consumers can import shape-only
 * dependencies without pulling in the service implementation.
 */

export type {
    Libp2pStatus,
    Libp2pSnapshot,
    Libp2pStartOptions,
    Libp2pServiceToggles,
    Libp2pDiscoveryToggles,
    Libp2pTransportToggles,
    ManagerSnapshot,
    PeerInfo,
    PubsubMessage,
} from "../service";
