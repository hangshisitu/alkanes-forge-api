> 1
>
> SUBFROST: A Native Bitcoin L0 Protocol with FROST Threshold Signatures
>
> SUBFROST Research Team Subzero Research Inc inquiries@subfrost.io
> March 17th 2025
>
> ✦

**Abstract**—This paper presents SUBFROST, a native Bitcoin L0 **1.1**
**SUBFROST** **Ecosystem** **and** **Asset** **Structure**

protocol that leverages FROST (Flexible Round-Optimized Schnorr
Threshold) signatures with on-chain slashing mechanics imple-mented
through Bitcoin L1 smart contracts. SUBFROST combines cryptographic
security from threshold signatures with economic se-curity from staked
positions to create a robust, trustless system for Bitcoin custody.
While the technology can be applied to various use cases, its canonical
implementation enables the creation of frBTC and dxBTC - synthetic
Bitcoin representations that maintain the security properties of native
Bitcoin while enabling smart contract functionality and yield generation
on the ALKANES metaprotocol and other programmable Bitcoin layers. We
detail the FROST im-plementation as a Proof-of-Stake network, the P2P
network archi-tecture, the Distributed Key Generation (DKG) process,
signature production, and the subrail runtime that powers the consensus
program for decentralized multisignature operations. Additionally, we
explore cross-metaprotocol applications, economic incentives, and the
mechanics of the synthetic assets, including atomic per-missionless
wrapping via the ALKANES metaprotocol and trustless unwrapping via the
SUBFROST P2P framework.

**Index** **Terms**—Bitcoin, threshold signatures, FROST, zero-knowledge
proofs, synthetic assets, decentralized finance, WASM, metaprotocol,
economic security, yield generation, Bitcoin staking

> **1** **INTRODUCTION**

Bitcoin’s limited programmability has historically con-strained its
utility in decentralized finance applications. While Bitcoin’s design
prioritizes security and simplicity, these same characteristics make it
challenging to utilize Bitcoin in more complex financial operations
without in-troducing centralized trust assumptions \[1\].

Over the past several years, projects which aspire to
connectBitcointoexternalconsensusengineshavetypically accomplished this
using a multisignature custody mech-anism, with supplementary incentive
mechanisms which, theoretically, create decentralized governance and
over-sight. However, these approaches often involve tradeoffs or limited
trust assumptions \[2\]–\[4\].

SUBFROSTaddressesthischallengebycreatingadecen-tralized custody
mechanism built on threshold signatures that functions as an L0 layer -
a consensus engine that allows the transfer of Bitcoin into another
representation on the ALKANES metaprotocol \[5\], which operates
directly on Bitcoin’s L1. By combining the FROST signature scheme \[6\]
with a Proof-of-Stake network and zero-knowledge proofs \[7\], SUBFROST
enables trustless Bitcoin synthetics while maintaining Bitcoin’s
security guarantees.

While the SUBFROST technology can be used for a variety of applications,
its canonical distribution is designed to service a comprehensive
ecosystem of Bitcoin-native assets:

> • **frBTC**: A synthetic 1:1 Bitcoin representation on ALKANES (and
> soon other programmable metaproto-cols) that serves as the gateway
> between native BTC currency and the DeFi ecosystem native to Bitcoin
> metaprotocols. frBTC maintains all the security prop-erties of native
> Bitcoin while enabling smart contract functionality.
>
> • **dxBTC**: A yield-generating variant of frBTC where the governance
> of the SUBFROST system performs the role of strategist to maximize
> overall yield on native BTC currency itself. dxBTC enables trustless
> Bitcoin staking through the combined stack, including the ALKANES
> metaprotocol.
>
> • **FROST**: The governance token of the SUBFROST sys-tem. FROST
> holders receive profits from all bridge activity between BTC and
> frBTC, and by extension, all
> activitywherenativeBTCisswappedtootherassetson the metaprotocol layer
> (as they must bridge to frBTC first). This captures throughput from
> the largest dor-mant reserve of capital in cryptocurrency - the
> entirety of Bitcoin.
>
> • **dxFROST**: A yield-generating asset available to active signers in
> the signing group that provides economic security and incentives to
> the BTC custody system. dxFROST stakers have the power to oust
> malicious actors within the active signing group and can in-tervene
> manually when excluding known adversaries who attempt to overwhelm the
> system with a Sybil attack.
>
> This ecosystem creates a virtuous cycle where:
>
> • Native BTC holders can access DeFi functionality through frBTC
> without sacrificing security
>
> • Yield-seeking BTC holders can stake through dxBTC to earn additional
> returns
>
> • FROST holders benefit from all bridge activity and DeFi interactions
>
> • dxFROST stakers secure the system and earn rewards for honest
> participation

The SUBFROST system captures value from the throughput of Bitcoin moving
into DeFi applications \[8\], creating strong economic incentives for
all participants while maintaining the security and decentralization
that Bitcoin users expect.

> Copyright © 2025 Subzero Research Inc. All rights reserved.

**1.2** **Yield** **Generation** **and** **Economic** **Security**

The SUBFROST system incorporates multiple yield sources to benefit
different participants:

> 1\) **dxBTC** **Yield** **Sources**:
>
> • Lending yields from Bitcoin deployed in various DeFi protocols
>
> • Strategic positioning in liquidity pools to maximize returns
>
> • AMM protocol tokens custodied by the vault from projects native to
> metaprotocols such as the OYL protocol AMM
>
> 2\) **dxFROST** **Yield** **Sources**:
>
> • Bridge fees from BTC/frBTC conversions
>
> • A portion of yields generated by dxBTC strategies • Slashing
> penalties from malicious actors

This economic model ensures that honest participants are well-rewarded,
while malicious behavior is severely penalized through the slashing
mechanism. The system’s security is reinforced by both cryptographic
guarantees (threshold signatures) and economic incentives (staking and
slashing), creating a robust, trustless custody solution for Bitcoin.

**1.3** **Key** **Innovations**

Unlike scenarios where Bitcoin is bridged to other blockchain systems,
SUBFROST leverages the shared space of the Bitcoin L1 data layer,
allowing asset representations to coexist on the same layer. This
approach enables atomic wrapping of Bitcoin to frBTC without trust
assumptions, while unwrapping requires the decentralized multisig
co-ordinated through the SUBFROST P2P network \[9\].

> The key innovations of SUBFROST include:
>
> 1\) A P2P network architecture optimized for distributed signing and
> consensus
>
> 2\) FROST implementation as a Proof-of-Stake network with economic
> incentives
>
> 3\) Efficient Distributed Key Generation (DKG) and signa-ture
> production
>
> 4\) The subrail runtime for consensus and execution 5)
> Cross-metaprotocol applications and exchanges
>
> 6\) Synthetic assets (frBTC, dxBTC) with atomic permis-sionless
> wrapping and trustless unwrapping
>
> 7\) Bitcoin restaking capabilities through the SUBFROST protocol
>
> 8\) Economic security model with multiple yield sources and slashing
> penalties
>
> **2** **FROST** **AS** **A** **PROOF-OF-STAKE** **NETWORK**

SUBFROST implements FROST (Flexible Round-Optimized Schnorr Threshold)
signatures \[6\] within a Proof-of-Stake framework \[13\], creating a
dual-layer security model that combines cryptographic security with
economic incentives.

**2.1** **Staking** **Mechanism**

> 2
>
> 3\) **Validator** **Selection**: Determines the top signers based on
> stake amount
>
> 4\) **Slashing** **Enforcement**: Provides assets that can be slashed
> for violations

2.1.1 The Staking Process

The staking process works as follows:

> 1\) Participants acquire FROST tokens and frBTC
>
> 2\) They provide liquidity to the FROST/frBTC pool, re-ceiving LP
> tokens (dxFROST)
>
> 3\) These LP tokens are staked in the staking-controller contract
>
> 4\) The top 255 stakers by stake amount are selected as signers
>
> 5\) A 2/3 threshold (170 of 255) is required for signing operations

**2.2** **Economic** **Security** **Model** **&** **Slashing**
**Mechanism**

SUBFROST implements a graduated slashing mechanism \[14\] based on
violation severity:

> • **Major** **Violations** (e.g., share manipulation): 50-100% of
> stake slashed
>
> • **Moderate** **Violations** (e.g., protocol violations): 20-50% of
> stake slashed
>
> • **Minor** **Violations** (e.g., timeout violations): 5-20% of stake
> slashed

2.2.1 The Slashing Process

When slashing occurs, the following process is executed:

> 1\) LP tokens are unwrapped to separate FROST and frBTC
>
> 2\) frBTC is used to buy additional FROST on the AMM \[15\]
>
> 3\) All FROST is burned (incl. FROST just purchased on AMM), reducing
> supply and penalizing violators

This mechanism ensures that malicious behavior has significant economic
consequences \[16\], aligning incentives with protocol security.

**2.3** **Validator** **Selection** **and** **Rotation**

SUBFROST implements a dynamic validator selection pro-cess based on
stake amount:

> 1\) The top 255 stakers are selected as potential signers
>
> 2\) For each signing operation, a deterministic subset of 170 signers
> is selected
>
> 3\) Validator sets are rotated periodically to prevent collu-sion
>
> 4\) Emergency rotations can be triggered if malicious be-havior is
> detected

This rotation mechanism ensures that the system re-mains secure even if
some validators become compromised, while the economic incentives
discourage malicious behav-ior.

Participants in the SUBFROST network must stake dxFROST tokens
(FROST/frBTC LP tokens) to become signers. This staking mechanism serves
several purposes:

**3** **P2P** **PROTOCOL** **ARCHITECTURE**

> 1\) **Economic** **Security**: Creates financial incentives for honest
> behavior
>
> 2\) **Sybil** **Resistance**: Prevents attackers from creating
> multiple identities

The SUBFROST P2P protocol forms the foundation of the network’s
communication layer, enabling secure and efficient coordination between
nodes for distributed key generation, threshold signing, and consensus.

**3.1** **Protocol** **Stack**

SUBFROST implements a comprehensive protocol stack us-ing libp2p \[9\],
with each protocol serving a specific purpose in the network:

3.1.1 Transport Protocols

> • **/quic-v1**: QUIC Version 1 transport protocol (RFC 9000)
>
> **–** Provides encrypted, reliable, multiplexed connec-tions over UDP
>
> **–** Supports 0-RTT connection establishment for faster reconnections
>
> **–** Offers connection migration for network changes
>
> **–** Configured with extended idle timeouts (120s) and keep-alive
> intervals (30s)
>
> • **/quic/draft-29**: Legacy QUIC draft version for back-ward
> compatibility
>
> **–** Maintained for compatibility with older libp2p im-plementations
>
> **–** Automatically negotiated when connecting to older peers

3.1.2 Discovery and Routing Protocols

> • **/ipfs/kad/1.0.0**: Kademlia DHT for peer discovery \[10\]
>
> **–** Maintains a distributed routing table of network participants
>
> **–** Provides efficient peer lookup with O(log n) com-plexity
>
> **–** Performs periodic bootstrap operations every 300 seconds
>
> **–** Uses a query timeout of 60 seconds for lookup oper-ations
>
> • **/ipfs/id/1.0.0**: Peer identity protocol
>
> **–** Exchanges peer information including supported protocols
>
> **–** Provides cryptographic verification of peer identities **–**
> Establishesthefoundationforsecurecommunication
>
> • **/subfrost/identity/1.0.0**: Bitcoin address identity proto-col
>
> **–** Custom protocol for Bitcoin address verification
>
> **–** Implements challenge-response mechanism for ad-dress ownership
> proof
>
> **–** Associates libp2p peer IDs with Bitcoin addresses for staking
> verification
>
> • **/ipfs/mdns/1.0.0**: Multicast DNS for local network dis-covery
>
> **–** Discovers peers on the local network without requir-ing
> bootstrap nodes
>
> **–** Broadcasts presence announcements every 5 seconds **–**
> Automatically connects to discovered local peers

3.1.3 NAT Traversal Protocols

> • **/libp2p/circuit/relay/0.2.0**: Circuit relay protocol
>
> **–** Enables connectivity between peers behind NATs **–** Provides
> store-and-forward message relay
>
> **–** Supports relay reservations with configurable time-outs
>
> **–** Default relay server at p2p.subfrost.io:8443
>
> • **/libp2p/dcutr/1.0.0**: Direct Connection Upgrade Through Relay
>
> **–** Attempts to establish direct connections between peers initially
> connected via relay
>
> **–** Uses hole punching techniques to traverse NATs
>
> 3
>
> **–** Improves performance by eliminating relay over-head when
> successful

3.1.4 Messaging Protocols

> • **/meshsub/1.1.0**: Gossipsub mesh-based publish/sub-scribe \[11\]
>
> **–** Forms a partial mesh network for efficient message propagation
>
> **–** Configured with mesh size parameters (min: 1, tar-get: 4, max:
> 8)
>
> **–** Uses aggressive gossip parameters for reliable mes-sage delivery
>
> **–** Topic: "/subfrost/main/1.0.0" for primary protocol messages
>
> • **/subfrost/direct/1.0.0**: Direct message protocol
>
> **–** Fallback mechanism when gossipsub mesh is not fully established
>
> **–** Provides reliable point-to-point messaging
>
> **–** Used for critical protocol messages that cannot be delayed

**3.2** **Protocol** **Handlers** **and** **Message** **Types**

The P2P protocol defines specific message types and han-dlers for
different aspects of the system:

3.2.1 Message Structure

All messages use a common envelope format serialized with protobuf:

> 1 message SubfrostMessage { 2 enum MessageType {
>
> 3 IDENTITY = 0;
>
> 4 IDENTITY_REQUEST = 1; 5 DIRECT_IDENTITY = 2;
>
> 6 DIRECT_IDENTITY_REQUEST = 3; 7 DKG = 4;
>
> 8 SIGNING = 5; 9 BUNDLE = 6;
>
> 10 FAULT = 7; 11 }
>
> 12
>
> 13 MessageType type = 1; 14 bytes payload = 2;
>
> 15 bytes signature = 3; 16 }
>
> Listing 1: Common Message Envelope Format

Each message type has its own specific payload struc-ture, also defined
in protobuf.

3.2.2 Bitcoin Address Identity Verification

Nodes identify themselves using Bitcoin addresses through a
challenge-response protocol:

> 1\) **Identity** **Request**: A node sends an IDENTITY_REQUEST message
> to a peer
>
> 1 // Pseudocode for identity request 2 **function**
> requestIdentity(peerId) {
>
> 3 message = createMessage(MessageType. IDENTITY_REQUEST)
>
> 4 sendToPeer(peerId, message) 5 }
>
> 6
>
> Listing 2: Identity Request Pseudocode
>
> 2\) **Identity** **Response**: The peer responds with an IDENTITY
> message containing:
>
> 1 message IdentityMessage {
>
> 2 string bitcoin_address = 1; 3 bytes signature = 2;
>
> 4 bytes signed_message = 3; 5 }
>
> 6
>
> Listing 3: Identity Message Structure
>
> 3\) **Verification**: The receiving node verifies the signature using
> Bitcoin’s signature verification:
>
> 1 // Pseudocode for identity verification
>
> 2 **function** verifyIdentity(peerId, identityMessage) {
>
> 3 isValid = bitcoinVerifyMessage(
>
> 4 identityMessage.bitcoin_address, 5 identityMessage.signature,
>
> 6 identityMessage.signed_message 7 )
>
> 8
>
> 9 **if** (isValid) {
>
> 10 updatePeerIdentity(peerId, identityMessage)
>
> 11 } **else** {
>
> 12 rejectPeer(peerId, "Invalid signature") 13 }
>
> 14 }
>
> 15
>
> Listing 4: Identity Verification Pseudocode

This process ensures that each node can cryptographi-cally prove control
of a Bitcoin address, which is essential for the staking and economic
security model.

> 4

3.2.4 Signing Message Mechanics

The FROST signing protocol uses the following message structure:

> 1 message SigningMessage {
>
> 2 string session_id = 1; 3 uint32 round = 2;
>
> 4 bytes data = 3;
>
> 5 uint32 participant_index = 4; 6 }
>
> Listing 6: Signing Message Structure

The signing process involves two rounds of communi-cation:

> 1\) **Round** **1** **(Commitment)**:
>
> • The coordinator initiates a signing session with a unique session_id
>
> • Each participant generates a random nonce pair and commits to it
>
> • Participants broadcast their commitments in SigningMessage with
> round = 1
>
> 1 // Pseudocode for commitment generation 2 **function**
> generateCommitment(sessionId) { 3 (commitment, nonceSecret) =
>
> generateNonceCommitment()
>
> 4
>
> 5 commitmentMsg = {
>
> 6 session_id: sessionId, 7 round: 1,
>
> 8 data: serialize(commitment), 9 participant_index: myIndex
>
> 10 }

3.2.3 DKG Message Mechanics

DKG coordination uses the following message structure:

11

12 broadcastMessage(MessageType.SIGNING, commitmentMsg)

13 **return** nonceSecret 14 }

> 1 message DkgMessage {
>
> 2 uint32 round = 1; 3 bytes data = 2;
>
> 4 uint32 participant_index = 3; 5 }
>
> Listing 5: DKG Message Structure

The DKG protocol proceeds through several rounds, with specific message
flows:

> 1\) **Round** **0** **(Initialization)**:
>
> • Eachparticipantbroadcaststheirpubliccommitment • Message contains
> Pedersen commitments \[12\] to
>
> polynomial coefficients
>
> 2\) **Round** **1** **(Share** **Distribution)**:
>
> • Each participant sends encrypted shares to all other participants
>
> • Messages include zero-knowledge proofs of share validity
>
> 3\) **Round** **2** **(Complaint** **Resolution)**:
>
> • Participants broadcast complaints about invalid shares
>
> • Accused participants must respond with proofs or be disqualified
>
> 4\) **Round** **3** **(Key** **Derivation)**:
>
> • Participants compute their final key shares
>
> • The group public key is derived and verified by all participants
>
> 15
>
> Listing 7: Commitment Generation Pseudocode

2\) **Round** **2** **(Response)**:

> • After receiving commitments from a threshold of participants, each
> signer:
>
> **–** Computes the group commitment
>
> **–** Calculates the challenge using the message and group commitment
>
> **–** Computes their signature share
>
> **–** Broadcasts their signature share in SigningMessage with round =
> 2
>
> 1 // Pseudocode for signature share generation 2 **function**
> generateSignatureShare(sessionId,
>
> message, commitments, nonceSecret) {
>
> 3 groupCommitment = computeGroupCommitment( commitments)
>
> 4 challenge = computeChallenge(message, groupCommitment)
>
> 5
>
> 6 signatureShare = computeShare( 7 message,
>
> 8 groupCommitment, 9 mySecretKeyShare,
>
> 10 nonceSecret, 11 challenge
>
> 12 )
>
> 13
>
> 14 shareMsg = {
>
> 15 session_id: sessionId, 16 round: 2,
>
> 17 data: serialize(signatureShare), 18 participant_index: myIndex
>
> 19 }

Each message is signed by the sender’s libp2p identity key and verified
by recipients before processing.

20

21 broadcastMessage(MessageType.SIGNING, shareMsg)

> 5
>
> 22 } 16 } 23 17 }
>
> Listing 8: Signature Share Generation Pseudocode
>
> 3\) **Aggregation**:
>
> • The coordinator collects signature shares and aggre-gates them
>
> • The final signature is verified against the group public key
>
> 1 // Pseudocode for signature aggregation 2 **function**
> aggregateSignature(shares,
>
> groupCommitment) {
>
> 3 signature = combineShares(shares, groupCommitment)
>
> 4
>
> 5 **if** (!verifySignature(groupPublicKey, message, signature)) {
>
> 6 **throw** "Invalid aggregated signature" 7 }
>
> 8
>
> 9 **return** signature 10 }
>
> 11
>
> Listing 9: Signature Aggregation Pseudocode
>
> Listing 10: Message Delivery with Fallback Pseudocode
>
> This ensures that critical protocol messages are deliv-ered even when
> the gossipsub mesh is not fully established.
>
> **3.4** **Peer** **Management** **and** **Information** **Tracking**
>
> SUBFROST implements comprehensive peer information tracking to
> maintain network health:
>
> 3.4.1 Peer Information Structure
>
> The system maintainsdetailed information about each peer:
>
> 1 struct PeerInfo {
>
> 2 PeerId peer_id; 3 bool connected;
>
> 4 ConnectionType connection_type; // Direct, Relay , RelayUpgraded,
> Local
>
> 5 Optional\<String\> bitcoin_address; 6 Timestamp last_seen;
>
> 7 List\<Multiaddr\> addresses; 8 bool identity_verified;

9 Optional\<IdentityMessage\> identity_message; 10 bool
in_gossipsub_mesh;

11 bool in_kademlia; 12 }

> Listing 11: Peer Information Structure **3.3** **Message**
> **Propagation** **and** **Reliability**
>
> SUBFROST implements a sophisticated message delivery system with
> fallback mechanisms:
>
> 3.3.1 Gossipsub Configuration
>
> The gossipsub protocol is configured with parameters opti-mized for
> the FROST protocol:
>
> • **Heartbeat** **Interval**: 1 second (frequent heartbeats for faster
> mesh formation)
>
> • **Validation** **Mode**: Permissive (less strict validation for
> better throughput)
>
> • **Mesh** **Size** **Parameters**:
>
> **–** Minimum: 1 peer (lower mesh requirements) **–** Target: 4 peers
> (balanced connectivity)
>
> **–** Maximum: 8 peers (higher mesh maximum)
>
> • **Gossip** **Parameters**:
>
> **–** Lazy Push Factor: 3 (aggressive gossip for reliability) **–**
> History Length: 10 messages (shorter history)
>
> **–** History Gossip: 3 (gossip history more aggressively)
>
> • **Publishing** **Mode**: Flood (enable flood publishing for critical
> messages)
>
> These settings ensure reliable message delivery even in challenging
> network conditions.

3.4.2 Peer Event Handling

This information is updated in response to network events: 1)
**Connection** **Established**:

> 1 // Pseudocode for connection established event 2 **function**
> handleConnectionEstablished(peerId,
>
> endpoint) {
>
> 3 peerInfo = getPeerInfo(peerId) or createNewPeerInfo(peerId)
>
> 4 peerInfo.connected = **true** 5 peerInfo.updateLastSeen()
>
> 6
>
> 7 // Determine connection type based on endpoint
>
> 8 **if** (endpoint.isRelay()) {
>
> 9 peerInfo.connection_type = ConnectionType .RELAY
>
> 10 } **else** **if** (endpoint.isLocal()) {
>
> 11 peerInfo.connection_type = ConnectionType .LOCAL
>
> 12 } **else** {
>
> 13 peerInfo.connection_type = ConnectionType .DIRECT
>
> 14 }
>
> 15
>
> 16 // Request identity if not already verified 17 **if**
> (!peerInfo.identity_verified) {
>
> 18 requestIdentity(peerId) 19 }
>
> 20 }
>
> 21
>
> 3.3.2 Direct Message Fallback Listing 12: Connection Established Event
> Handling
>
> When gossipsub fails due to insufficient peers, the system falls back
> to direct message delivery:
>
> 1 // Pseudocode for message delivery with fallback 2 **function**
> sendMessage(peerId, message) {
>
> 3 **try** {
>
> 4 // Try gossipsub first
>
> 5 publishToGossipsub(topic, message) 6 } **catch** (error) {
>
> 7 **if** (error == "InsufficientPeers") { 8 // Fall back to direct
> delivery 9 **if** (isPeerConnected(peerId)) {

10 log("Connected but not in gossipsub mesh, using direct delivery")

11 sendDirectMessage(peerId, message) 12 **return** success

13 } 14 }

15 **throw** error

2\) **Identity** **Received**:

> 1 // Pseudocode for identity received event 2 **function**
> handleIdentityReceived(peerId,
>
> identityMessage) {
>
> 3 **if** (verifyBitcoinSignature(identityMessage)) {
>
> 4 peerInfo = getPeerInfo(peerId) 5 peerInfo.bitcoin_address =
>
> identityMessage.address
>
> 6 peerInfo.identity_verified = **true** 7 peerInfo.identity_message =
>
> identityMessage
>
> 8 peerInfo.updateLastSeen() 9 }
>
> 10 }
>
> 11
>
> Listing 13: Identity Received Event Handling
>
> 3\) **Periodic** **Updates**:
>
> 1 // Pseudocode for periodic peer information updates
>
> 2 **function** updatePeerInformation() {
>
> 3 **for** each connectedPeer **in** getConnectedPeers() {
>
> 4 peerInfo = getPeerInfo(connectedPeer) 5 peerInfo.connected =
> **true**
>
> 6 peerInfo.updateLastSeen()
>
> 7
>
> 8 // Check gossipsub mesh participation 9 peerInfo.in_gossipsub_mesh =
>
> isInGossipsubMesh(connectedPeer)
>
> 10
>
> 11 // Check kademlia participation 12 peerInfo.in_kademlia =
>
> isInKademliaRoutingTable(connectedPeer) 13 }
>
> 14 }
>
> 15
>
> Listing 14: Periodic Peer Information Updates
>
> This comprehensive peer tracking system enables the network to make
> informed decisions about peer selection for DKG and signing
> operations, ensuring optimal perfor-mance and security.
>
> 6
>
> 5
>
> 6 // Initialize memory with current state 7 initializeMemory(subrail)
>
> 8
>
> 9 // Call the sync function to update state 10 subrail.exports.sync()
>
> 11
>
> 12 // Call getbundle to compute the transaction bundle
>
> 13 let bundlePtr = subrail.exports.getbundle()
>
> 14
>
> 15 // Extract the bundle from WASM memory
>
> 16 let bundle = extractBundle(subrail.memory, bundlePtr)
>
> 17
>
> 18 **return** bundle 19 }
>
> 20
>
> Listing 16: Bundle Computation Pseudocode

2\) **Bundle** **Agreement**: Nodes exchange bundle hashes to verify
consensus:

> 1 // Pseudocode for bundle agreement
>
> 2 async **function** verifyBundleConsensus(localBundle) {
>
> 3 // Compute local bundle hash
>
> 4 let localHash = sha256(localBundle)
>
> **3.5** **Integration** **with** **FROST** **Protocol** **and**
> **Consensus** **Process**
>
> The P2P layer integrates tightly with both the FROST pro-tocol and the
> consensus process, providing the communi-cation infrastructure needed
> for distributed key generation, threshold signing, and agreement on
> transaction bundles:
>
> 5
>
> 6 // Broadcast bundle hash
>
> 7 broadcastMessage(MessageType.BUNDLE, { 8 bundle_hash: localHash,
>
> 9 chain_height: getCurrentHeight(),

10 mempool_version: getMempoolVersion() 11 })

12

13 // Collect bundle hashes from other nodes

14 let bundleHashes = await collectBundleHashes( threshold)

> 3.5.1 Protocol Message Routing and Consensus Flow
>
> Messages are routed to the appropriate protocol handlers based on
> their type, with a specific flow for consensus-related operations:
>
> 1 // Pseudocode for message routing
>
> 2 **function** handleMessage(from, message) { 3 **switch**
> (message.type) {
>
> 4 **case** MessageType.DKG:
>
> 5 dkgProtocol.handleMessage(from, message. payload)
>
> 6 **break**
>
> 15
>
> 16 // Verify consensus (all hashes should match) 17 let consensus =
> bundleHashes.every(hash =\>
>
> hash === localHash)
>
> 18
>
> 19 **return** consensus 20 }
>
> 21
>
> Listing 17: Bundle Agreement Pseudocode

3\) **Signing** **Initiation**: Once consensus is reached, the signing
process begins:

> 7
>
> 8 **case** MessageType.SIGNING:
>
> 9 signingProtocol.handleMessage(from, message.payload)

10 **break**

11

12 **case** MessageType.BUNDLE:

13 // Handle bundle agreement messages 14
bundleProtocol.handleMessage(from,

message.payload) 15 **break**

16

17 **case** MessageType.FAULT:

18 faultProtocol.handleMessage(from, message .payload)

19 **break**

> 1 // Pseudocode for signing initiation
>
> 2 **function** initiateSigningProcess(bundle) { 3 **if**
> (verifyBundleConsensus(bundle)) { 4 // Create signing session
>
> 5 let sessionId = createUniqueSessionId()
>
> 6
>
> 7 // Start the FROST signing protocol 8 startFrostSigning(sessionId,
> bundle) 9 } **else** {

10 // Handle consensus failure 11 logConsensusFailure()

12 triggerResync() 13 }

14 }

15

20

21 // Handle other message types 22 }

23 }

> Listing 15: Message Routing Pseudocode
>
> The consensus flow involves these key steps:
>
> 1\) **Bundle** **Computation**: Each node independently com-putes the
> same bundle using the subrail WASM run-time:
>
> 1 // Pseudocode for bundle computation 2 **function** computeBundle()
> {
>
> 3 // Load the subrail WASM module
>
> 4 let subrail = loadWasmModule("subrail.wasm")
>
> Listing 18: Signing Initiation Pseudocode
>
> This integration of P2P communication with the con-sensus process
> ensures that all nodes agree on the same transaction bundle before
> initiating the threshold signing process.
>
> 3.5.2 Participant Selection
>
> The system selects participants for DKG and signing based on peer
> information and stake amounts:

1 // Pseudocode for participant selection 2 **function**
selectDkgParticipants() {

> 3 // Filter for connected peers with verified identities
>
> 4 eligiblePeers = getAllPeers()
>
> 5 .filter(p =\> p.connected && p. identity_verified)
>
> 6
>
> 7 // Sort by stake amount
>
> 8 eligiblePeers.sortByDescending(p =\>
> getStakeAmount(p.bitcoin_address))
>
> 9

10 // Take the top 255 peers

11 **return** eligiblePeers.take(255) 12 }

> 7

35 } 36 }

37

38 // Proceed with available commitments if we have enough

39 **if** (commitments.size \>= threshold) { 40 **return** commitments

41 } **else** {

42 **throw** "Insufficient commitments received" 43 }

44 }

> Listing 21: Timeout Handling with Consensus Awareness
>
> Listing 19: Participant Selection Pseudocode
>
> For signing operations, a deterministic subset of partici-pants is
> selected based on the transaction bundle:
>
> 1 // Pseudocode for signing participant selection 2 **function**
> selectSigningParticipants(bundle) {
>
> 3 // Get all eligible participants
>
> 4 let allParticipants = selectDkgParticipants()
>
> 5
>
> 6 // Create a deterministic seed from the bundle 7 let seed =
> sha256(bundle)
>
> 8

9 // Use the seed to select a deterministic subset 10 let
selectedParticipants = deterministicSelection

> (

11 allParticipants,

12 threshold, // 170 out of 255 13 seed

14 )

15

16 **return** selectedParticipants 17 }

> Listing 20: Signing Participant Selection Pseudocode
>
> The system also includes synchronization mechanisms to ensure all
> nodes have the same view of the blockchain state:
>
> 1 // Pseudocode for metashrew synchronization 2 async **function**
> synchronizeWithMetashrew() { 3 // Get current metashrew height
>
> 4 let metashrewHeight = await getMetashrewHeight()
>
> 5
>
> 6 // Get current local height
>
> 7 let localHeight = getCurrentHeight()
>
> 8
>
> 9 **if** (localHeight \< metashrewHeight) {

10 // Need to sync up to the latest height

11 **for** (let height = localHeight + 1; height \<= metashrewHeight;
height++) {

12 await syncHeight(height) 13 }

14

15 // Update local state

16 setCurrentHeight(metashrewHeight)

17

18 // Recompute bundle after sync 19 **return** computeBundle()

20 }

> 3.5.3 Timeout Handling and Synchronization

21

22 **return** **null** // No sync needed 23 }

> The system manages timeouts for protocol steps to ensure progress,
> with specific handling for consensus-related op-erations:
>
> 1 // Pseudocode for timeout handling with consensus awareness
>
> 2 async **function** waitForCommitments(sessionId, timeout) {
>
> 3 commitments = **new** Map()
>
> 4
>
> 5 // Start timer
>
> 6 timer = startTimer(timeout)
>
> 7
>
> 8 **while** (!timer.expired()) {
>
> 9 // Wait for next commitment or timer expiration

10 result = await Promise.race(\[ 11 waitForNextCommitment(), 12
timer.wait()

13 \])

14

15 **if** (result.isCommitment) { 16 // Process commitment

17 commitments.set(result.peerId, result. commitment)

18

19 // Check if we have enough commitments 20 **if** (commitments.size
\>= threshold) {

21 **return** commitments 22 }

23 } **else** {

24 // Timer expired

25 log("Timeout waiting for commitments")

> Listing 22: Metashrew Synchronization Pseudocode
>
> 3.5.4 Fault Detection and Consensus Verification
>
> The system monitors for protocol violations and generates proofs, with
> additional checks for consensus-related issues:
>
> 1 // Pseudocode for fault detection with consensus verification
>
> 2 **function** verifySignatureShare(peerId, share, commitment,
> message, expectedBundle) {
>
> 3 // First verify that the message matches our expected bundle
>
> 4 **if** (!verifyMessageMatchesBundle(message, expectedBundle)) {
>
> 5 log("Detected bundle mismatch from peer", peerId)
>
> 6
>
> 7 // Generate bundle mismatch proof
>
> 8 proof = generateBundleMismatchProof(message, expectedBundle)
>
> 9

10 // Broadcast fault message 11 faultMsg = {

12 fault_type: BUNDLE_MISMATCH_FAULT,

13 offender_id: getParticipantIndex(peerId), 14 proof_data:
serialize(proof),

15 verification_data: serialize({

16 expected_bundle: expectedBundle, 17 actual_message: message

18 }) 19 }

26

27 // Check if we need to resync with metashrew

28 **if** (needsResync()) {

29 await performResync()

30 // Restart the process after resync 31 **return**
waitForCommitments(sessionId,

timeout) 32 }

33

34 **break**

20

21 broadcastMessage(MessageType.FAULT, faultMsg) 22 **return** **false**

23 }

24

25 // Then verify the signature share itself

26 **if** (!isValidShare(share, commitment, message)) { 27 log("Detected
invalid signature share from

> peer", peerId)

28

29 // Generate fraud proof

30 proof = generateFraudProof(share, commitment, message)

31

32 // Broadcast fault message 33 faultMsg = {

34 fault_type: INVALID_SHARE_FAULT,

35 offender_id: getParticipantIndex(peerId), 36 proof_data:
serialize(proof),

37 verification_data: serialize({ 38 share: share,

39 commitment: commitment, 40 message: message

41 }) 42 }

43

44 broadcastMessage(MessageType.FAULT, faultMsg) 45 **return** **false**

46 }

47

48 **return** **true** 49 }

> Listing 23: Fault Detection with Consensus Verification
>
> 8
>
> • Participants who receive valid complaints must re-veal the correct
> share or be excluded
>
> • The consensus layer validates complaint resolution • Exclusions are
> recorded and propagated through the
>
> network
>
> 5\) **Key** **Computation**:
>
> • Each participant computes their final secret share by summing the
> valid shares they received
>
> • The group public key is computed as the sum of the individual public
> keys
>
> • The subrail runtime verifies that all honest partici-pants derive
> the same group public key

The DKG protocol is designed to be secure against up to
t-1maliciousparticipants,ensuringthatnocoalitionsmaller than the
threshold can learn the secret key or disrupt the process.

> This tight integration ensures that the P2P layer pro-vides the
> reliable, secure communication needed for both the FROST protocol and
> the consensus process to oper-ate correctly, even in challenging
> network conditions with
>
> potentially malicious participants. The system’s ability to 4.1.2
> Consensus Integration in DKG detect and prove violations, combined
> with the economic
>
> incentives from staking, creates a robust security model that can
> withstand various attack vectors.
>
> **4** **DISTRIBUTED** **KEY** **GENERATION** **AND** **SIGNATURE**
> **PRODUCTION**
>
> **4.1** **Distributed** **Key** **Generation** **(DKG)** **and**
> **Consensus** **Integration**
>
> SUBFROST implements a secure Distributed Key Gener-ation protocol
> \[17\] that creates a shared public key and individual key shares
> without requiring a trusted dealer. The DKG process is integrated with
> the consensus layer via the WASM runtime, ensuring all participants
> agree on the same key generation parameters.
>
> 4.1.1 DKG Process
>
> The DKG process consists of the following steps: 1)
> **Initialization**:
>
> • The process begins with a consensus check using metashrew \[18\] as
> the backend
>
> • All nodes independently compute the same set of eligible
> participants
>
> • Each participant generates a random polynomial of degree t-1 (where
> t is the threshold) and computes commitments to the coefficients
>
> 2\) **Sharing**:
>
> • Each participant sends a point on their polynomial to every other
> participant
>
> • 10 zero-knowledge proofs \[19\] are included to verify that the
> point lies on the committed polynomial
>
> • All messages are recorded in the P2P network for accountability
>
> 3\) **Verification**:
>
> • Participants verify the received shares against the commitments
>
> • Complaints are broadcast if any verification fails
>
> • The subrail runtime tracks the verification status across the
> network
>
> 4\) **Complaint** **Resolution**:
>
> The DKG process is tightly integrated with the consensus layer:
>
> 1 // Pseudocode for consensus-integrated DKG 2 **function**
> performDKG() {
>
> 3 // Get the current state from metashrew 4 let currentState =
> getMetashrewState()
>
> 5
>
> 6 // Compute the set of eligible participants deterministically
>
> 7 let participants = computeEligibleParticipants( currentState)
>
> 8

9 // Initialize the DKG with consensus parameters 10 let dkg =
initializeDKG(participants, threshold)

11

12 // Execute the DKG protocol

13 let result = executeDKGProtocol(dkg)

14

15 // Verify that all honest participants have the same view

16 **if** (!verifyConsensus(result)) { 17 // Handle consensus failure 18
handleConsensusFailure()

19 **return** **null** 20 }

21

22 // Return the DKG result 23 **return** {

24 groupPublicKey: result.groupPublicKey, 25 secretKeyShare:
result.secretKeyShare, 26 participantInfo: result.participantInfo 27 }

28 }

> Listing 24: Consensus-Integrated DKG Pseudocode
>
> This integration ensures that all honest participants agree on the
> same set of participants, the same threshold parameters, and
> ultimately derive the same group public key, even though each
> participant only knows their own secret key share.
>
> 9
>
> Participant 1 Participant 2 Participant 3 2) **Round** **2**
> **(Response)**:
>
> Commitment
>
> Commitment
>
> Commitment
>
> Commitment
>
> Share & Proof
>
> Share & Proof
>
> Share & Proof
>
> Share & Proof
>
> Complaint (if any)
>
> Commitment
>
> Commitment

Share & Proof

Share & Proof

• After receiving commitments from a threshold of participants, each
signer:

> **–** Computes a group commitment
>
> **–** Calculates the challenge using the message and group commitment
>
> **–** Computes their signature share using their secret key share and
> nonce
>
> **–** Broadcasts their signature share

• The consensus layer validates that all shares are for the agreed-upon
message

> Complaint (if any)
>
> Complaint (if any) Complaint (if any)

3\) **Aggregation**:

> Key Key Key Computation Computation Computation
>
> Fig. 1: DKG Communication Flow Between Participants
>
> **4.2** **Signature** **Production** **with** **Consensus-Driven**
> **Mes-sage** **Selection**
>
> SUBFROST uses FROST’s two-round signing protocol \[6\], optimized for
> efficiency and security, with an additional layer of consensus to
> determine what message to sign:
>
> 4.2.1 Consensus-Driven Message Selection
>
> Before the signing process begins, all nodes must agree on the message
> to be signed:
>
> 1 // Pseudocode for consensus-driven message selection 2 async
> **function** determineMessageToSign() {
>
> 3 // Each node independently computes the bundle using the subrail
> runtime
>
> 4 let bundle = await computeBundle()
>
> 5
>
> 6 // Convert the bundle to a Bitcoin transaction 7 let transaction =
> createTransactionFromBundle(
>
> bundle)
>
> 8
>
> 9 // Compute the message to be signed (transaction hash)

10 let message = computeSigningMessage(transaction)

11

12 // Verify consensus on the message 13 let consensusReached = await

> verifyMessageConsensus(message)

14

15 **if** (!consensusReached) {

16 **throw** **new** Error("Failed to reach consensus on message to
sign")

17 }

18

19 **return** message 20 }

> Listing 25: Consensus-Driven Message Selection Pseudocode
>
> This consensus step ensures that all signers are signing the same
> transaction, preventing attacks where malicious participants might try
> to trick honest nodes into signing different transactions.
>
> 4.2.2 FROST Signing Protocol
>
> Once consensus on the message is reached, the FROST signing protocol
> proceeds:
>
> 1\) **Round** **1** **(Commitment)**:
>
> • Each participant generates a random nonce pair and commits to it
>
> • These commitments are broadcast to all participants • The subrail
> runtime tracks received commitments
>
> • Any participant can aggregate the signature shares to create a
> complete threshold signature
>
> • The resulting signature is indistinguishable from a standard Schnorr
> signature \[20\]
>
> • Thesignatureisverifiedagainstthegrouppublickey before broadcasting
> to the Bitcoin network
>
> The signing process includes several security measures:
>
> • **Binding** **Factor**: Prevents rogue key attacks by binding each
> signature share to the signer’s identity
>
> • **Deterministic** **Nonce** **Generation**: Reduces the risk of
> nonce reuse while maintaining security
>
> • **Timeout** **Mechanisms**: Ensures progress even if some signers
> are unresponsive
>
> • **Consensus** **Verification**: Ensures all signers are signing the
> same message
>
> 4.2.3 Integration with Subrail Runtime
>
> The signing process is tightly integrated with the subrail runtime:
>
> 1 // Pseudocode for subrail-integrated signing 2 async **function**
> signWithFROST() {
>
> 3 // Determine the message to sign through consensus
>
> 4 let message = await determineMessageToSign()
>
> 5
>
> 6 // Create a signing session
>
> 7 let sessionId = createUniqueSessionId()
>
> 8

9 // Round 1: Generate and broadcast commitment 10 let commitment =
generateCommitment(sessionId) 11 broadcastCommitment(sessionId,
commitment)

12

13 // Collect commitments from other participants 14 let commitments =
await collectCommitments(

> sessionId, threshold)

15

16 // Compute group commitment

17 let groupCommitment = computeGroupCommitment( commitments)

18

19 // Round 2: Generate and broadcast signature share

20 let signatureShare = generateSignatureShare( 21 message,

22 groupCommitment, 23 mySecretKeyShare 24 )

25 broadcastSignatureShare(sessionId, signatureShare )

26

27 // Collect signature shares from other participants

28 let signatureShares = await collectSignatureShares(sessionId,
threshold)

29

30 // Aggregate signature shares

31 let signature = aggregateSignatureShares( 32 signatureShares,

33 groupCommitment 34 )

35

36 // Verify the signature

37 **if** (!verifySignature(groupPublicKey, message, signature)) {

38 **throw** **new** Error("Invalid aggregated signature ")

39 }

40

41 // Broadcast the signed transaction to the Bitcoin network

42 broadcastTransaction(createSignedTransaction( message, signature))

43

44 **return** signature 45 }

> Listing 26: Subrail-Integrated Signing Pseudocode
>
> 10

12 // Generate the proof

13 let proof = circuit.generateProof(publicInputs, privateInputs)

14

15 // Create the complete fault evidence 16 let faultEvidence = {

17 faultType: faultType,

18 publicInputs: publicInputs, 19 proof: proof,

20 metadata: {

21 timestamp: getCurrentTimestamp(), 22 prover: getNodeIdentity(),

23 consensusHeight: getCurrentHeight() 24 }

25 }

> This efficient two-round protocol minimizes communi-cation overhead
> while maintaining security against mali-cious participants, with the
> added security of consensus-driven message selection.

26

27 **return** faultEvidence 28 }

> Listing 27: ZK Proof Generation Pseudocode
>
> 4.3.3 Consensus Verification and Slashing
>
> **4.3** **Fault** **Detection,** **Proof** **Generation,** **and**
> **Consensus** **Verification**
>
> SUBFROST implements comprehensive fault detection mechanisms using
> zero-knowledge proofs \[7\], \[21\], \[22\], with additional consensus
> verification:
>
> 4.3.1 Fault Types and Detection
>
> The fault proofs are verified through the consensus layer:

1 // Pseudocode for consensus-based fault verification 2 async
**function** verifyAndSlashFault(faultEvidence) {

3 // Verify the proof using the appropriate circuit 4 let circuit =
getCircuit(faultEvidence.faultType) 5 let isValid = circuit.verifyProof(

6 faultEvidence.publicInputs, 7 faultEvidence.proof

8 )

> The system detects various types of faults: 1) **Share**
> **Verification** **Faults**:
>
> • Invalid signature shares that don’t match commit-ments
>
> • Inconsistent shares that would lead to invalid signa-tures
>
> • Mathematical relationship violations in the shares
>
> 2\) **Protocol** **Order** **Faults**:
>
> • Sending responses before commitments • Participating without being
> selected
>
> • Double participation in the same session
>
> 3\) **Timing** **Faults**:
>
> • Excessive delays in responding
>
> • Premature broadcasting of messages • Timeout violations
>
> 4\) **Commitment** **Consistency** **Faults**:
>
> • Malformed commitments
>
> • Inconsistent commitment structures • Binding violations
>
> 9

10 **if** (!isValid) {

11 // Reject invalid proof 12 **return** **false**

13 }

14

15 // Verify consensus context

16 let consensusValid = verifyConsensusContext( 17
faultEvidence.metadata.consensusHeight

18 )

19

20 **if** (!consensusValid) {

21 // Reject proof with invalid consensus context

22 **return** **false** 23 }

24

25 // Determine slashing amount based on fault type 26 let
slashingAmount = calculateSlashingAmount(

> faultEvidence.faultType)

27

28 // Execute slashing through the staking-controller

29 let slashingResult = await executeSlashing( 30
faultEvidence.publicInputs.offender,

31 slashingAmount, 32 faultEvidence

33 )

> 5\) **Consensus** **Faults**:
>
> • Signing different messages than agreed upon • Attempting to create
> conflicting transactions
>
> • Deviating from the consensus-determined bundle
>
> 4.3.2 Zero-Knowledge Proof Generation
>
> When a fault is detected, a zero-knowledge proof is gener-ated:
>
> 1 // Pseudocode for ZK proof generation
>
> 2 **function** generateFaultProof(faultType, evidence) { 3 // Create a
> Noir circuit instance for the
>
> specific fault type
>
> 4 let circuit = createCircuit(faultType)
>
> 5
>
> 6 // Prepare the public inputs
>
> 7 let publicInputs = preparePublicInputs(evidence)
>
> 8
>
> 9 // Prepare the private inputs (known only to the prover)

10 let privateInputs = preparePrivateInputs(evidence )

11

34

35 **return** slashingResult.success 36 }

> Listing 28: Consensus-Based Fault Verification Pseudocode
>
> This comprehensive fault detection and slashing system, integrated
> with the consensus layer, ensures that malicious behavior is quickly
> detected, proven, and penalized,
> main-tainingthesecurityandintegrityoftheSUBFROSTprotocol even in the
> presence of Byzantine actors.
>
> **5** **SUBRAIL** **RUNTIME**
>
> The subrail runtime is the consensus program that pow-ers SUBFROST’s
> decentralized multisignature operations. It provides a deterministic
> execution environment for the pro-tocol logic, ensuring consistent
> behavior across all nodes. Importantly, the subrail runtime is
> external to SUBFROST but serves as the consensus layer via its WASM
> runtime \[23\], computing in memory the pending work that needs to be
> completed.
>
> **5.1** **Runtime** **Architecture** **and** **Consensus** **Process**
> The subrail runtime consists of several key components:
>
> 1\) **WASM** **Execution** **Environment**: Provides sandboxed,
> deterministic execution of smart contracts
>
> 2\) **State** **Management**: Handles persistent storage with
> snapshots and rollbacks
>
> 3\) **Message** **Processing**: Manages protocol message han-dling and
> routing
>
> 4\) **Cryptographic** **Primitives**: Implements necessary
> cryptographic operations
>
> 5\) **Consensus** **Logic**: Ensures agreement on state transi-tions
>
> Subrail Runtime

||
||
||

||
||
||

> Fig. 2: Subrail Runtime Architecture
>
> The consensus process works as follows:
>
> 1\) **External** **Trigger**: The process begins external to SUB-FROST
>
> 2\) **Metashrew** **Backend**: Uses metashrew as the backend for
> indexing and querying the Bitcoin blockchain
>
> 3\) **Bundle** **Computation**: All nodes compute the same bundle
> using the getbundle function
>
> 4\) **Deterministic** **Agreement**: The signing group agrees on what
> message to sign with a threshold signature
>
> 5\) **Memory-Based** **Computation**: All computation hap-pens in
> memory within the WASM runtime
>
> This approach ensures that all nodes reach the same conclusion
> independently, providing a trustless consensus mechanism without
> requiring a separate blockchain.
>
> **5.2** **Context** **System** **and** **External** **Data**
> **Integration**
>
> The \_\_context host function plays a crucial role in the subrail
> runtime by providing a mechanism to supply arbi-trary data to the
> consensus program. This enables powerful integration with external
> data sources and oracles:
>
> 1 // Context access in WASM program
>
> 2 pub fn context() -\> Result\<Vec\<u8\>\> { 3 unsafe {
>
> 4 let length = imports::\_\_context(); 5 if length \<= 0 {
>
> 6 return Err(anyhow!("Context returned invalid length: {}", length));
>
> 7 }
>
> 8 let mut buffer = vec\![0u8; length as usize\]; 9
> imports::\_\_load(buffer.as_mut_ptr() as i32);

10 Ok(buffer) 11 }

12 }

> Listing 29: Context Access in WASM Program
>
> The context system is complemented by the subrail_setcontext JSON-RPC
> method, which allows external systems to provide data to the consensus
> program:
>
> 1 // JSON-RPC handler for setting context 2 async fn
> handle_subrail_setcontext(
>
> 3 state: &AppState, 4 params: &\[Value\],
>
> 5 id: jsonrpsee::types::Id\<'static\>,
>
> 11
>
> 6 ) -\> Result\<jsonrpsee::types::Response\<'static, Value \>\> {
>
> 7 // Extract hex-encoded context data and optional block height
>
> 8 let hex_str = params\[0\].as_str()?;
>
> 9 let block_height = params\[1\].as_u64(); // Optional height or
> "latest"

10

11 // Update the context in the runtime

12 let mut context = state.context.write().unwrap(); 13 \*context =
(hex::decode(hex_str)?, block_height); 14

15 // Also update the context in the WASM runtime 16 let mut
runtime_guard = state.runtime.write().

> unwrap();

17 let runtime_data = runtime_guard.store.data_mut() ;

18 \*runtime_data.context.write().unwrap() = state.
context.read().unwrap().clone();

19

20 Ok(create_success_response(Value::Null, id)) 21 }

> Listing 30: JSON-RPC Handler for Setting Context
>
> This powerful mechanism enables a wide range of ap-plications:
>
> 1\) **Oracle** **Integration**: Consensus programs can act as oracles
> for data like BTC/USD price feeds. Signing nodes query the same source
> of information, then use subrail_setcontext to provide that data to
> the consensus program, which can then make it available on-chain to
> alkanes.
>
> 2\) **AI** **Agent** **Piloting**: A standalone subrail system can
> pilot an AI agent by accepting an object in the context that describes
> a concrete layout, which can be directly transcoded to a list of PSBTs
> for construction and signing.
>
> 3\) **Automated** **Decision** **Making**: The context can contain
> decision parameters that influence how the consen-sus program
> constructs transactions, enabling sophisti-cated automation logic.
>
> 4\) **External** **Trigger** **Integration**: Systems can trigger
> spe-cific actions in the consensus program by providing appropriate
> context data, creating event-driven au-tomation.
>
> For the frBTC consensus program specifically, this con-text system
> enables the coordination of signing nodes to accomplish automated
> unwrapping of frBTC to native Bit-coin in a deterministic manner.
>
> **5.3** **Required** **WASM** **Exports**
>
> For a WASM program to be loaded into the subrail runtime, it must
> export specific functions that implement the Rail trait:
>
> 1 // Required exports from the WASM program 2 \#\[no_mangle\]
>
> 3 pub fn sync() {
>
> 4 // Synchronize state with the blockchain
>
> 5 // This function is called at each new block height
>
> 6 }
>
> 7
>
> 8 \#\[no_mangle\]
>
> 9 pub fn getbundle() -\> i32 {

10 // Generate a bundle of transactions to process 11 // Returns a
pointer to serialized transaction

data 12 }

> Listing 31: Required WASM Exports
>
> The Rail trait defines the core interface that all subrail programs
> must implement:

1 pub trait Rail: **Clone** {

2 // Synchronize state with the blockchain 3 fn sync(&mut self) -\>
Result\<()\>;

4

5 // Generate a bundle of transactions to process 6 fn getbundle(&self)
-\> Result\<Vec\<Psbt\>\>;

7 }

> Listing 32: Rail Trait Definition
>
> The declare_rail! macro automatically implements the required WASM
> exports for any type that implements the Rail trait, handling the
> serialization, deserialization, and state management details:

1 // Example of using the declare_rail! macro 2
declare_rail!(SubfrostRail);

3

4 // This expands to implement the required exports: 5 // - sync()
function that loads the instance, calls

> sync(), and saves state

6 // - getbundle() function that loads the instance and calls
getbundle()

7 // - Automatic state persistence between calls

> Listing 33: Using the declare_rail! Macro
>
> This design makes SUBFROST a powerful tool for gen-eral automations on
> Bitcoin, extending far beyond just frBTC unwrapping to enable a wide
> range of deterministic, consensus-driven applications.
>
> **6** **CONCLUSION**
>
> SUBFROST represents a significant advancement in Bit-coin’s
> capabilities, enabling trustless synthetic assets while maintaining
> Bitcoin’s security guarantees. By combining FROST threshold signatures
> with a Proof-of-Stake network, zero-knowledge proofs, and the subrail
> runtime, SUB-FROST creates a comprehensive framework for
> decentral-ized Bitcoin custody and programmability.
>
> The P2P protocol, DKG process, signature production, and unwrapping
> logic work together to create a secure, efficient system that expands
> Bitcoin’s utility without com-promising its fundamental security
> properties. The frBTC synthetic asset provides a bridge between
> Bitcoin’s store of value properties and the programmability needed for
> modern decentralized finance applications.
>
> As the ecosystem continues to evolve, SUBFROST will enable
> increasingly sophisticated applications that leverage Bitcoin’s
> security and liquidity, contributing to the growth and maturation of
> the broader blockchain ecosystem.
>
> **REFERENCES**
>
> 12

\[8\] F. Schär, “Decentralized Finance: On Blockchain- and Smart
Contract-Based Financial Markets,” Federal Reserve Bank of St. Louis
Review, vol. 103, no. 2, pp. 153–174, 2021.

\[9\] Protocol Labs, “libp2p: A modular network stack,” Techni-cal
report, Protocol Labs, 2021. \[Online\]. Available:
[https:](https://libp2p.io/) [//libp2p.io/](https://libp2p.io/)

\[10\] P. Maymounkov and D. Mazières, “Kademlia: A Peer-to-Peer
Information System Based on the XOR Metric,” in Peer-to-Peer Systems:
First International Workshop, IPTPS 2002, 2002, pp. 53–65.

\[11\] D. Vyzovitis, Y. Napora, D. McCormick, D. Dias, and Y. Psaras,
“GossipSub: Attack-Resilient Message Propagation in the Filecoin and
ETH2.0 Networks,” in Proceedings of the 1st ACM Conference on Advances
in Financial Technologies, 2020, pp. 154–168.

\[12\] T. P. Pedersen, “Non-Interactive and Information-Theoretic Secure
Verifiable Secret Sharing,” in Advances in Cryptology — CRYPTO ’91,
1992, pp. 129–140.

\[13\] A. Kiayias, A. Russell, B. David, and R. Oliynykov, “Ouroboros: A
Provably Secure Proof-of-Stake Blockchain Protocol,” Advances in
Cryptology – CRYPTO 2017, pp. 357– 388, 2017.

\[14\] V. Buterin and V. Griffith, “Casper the Friendly Finality
Gadget,” in ArXiv e-prints, 2017. \[Online\]. Available:
[https:](https://arxiv.org/abs/1710.09437)
[//arxiv.org/abs/1710.09437](https://arxiv.org/abs/1710.09437)

\[15\] G. Angeris and T. Chitra, “Improved Price Oracles: Constant
Function Market Makers,” Proceedings of the 2nd ACM Con-ference on
Advances in Financial Technologies, pp. 80–91, 2020.

\[16\] J. Bonneau, “Why Buy When You Can Rent? Bribery Attacks on
Bitcoin-Style Consensus,” Financial Cryptography and Data Security, pp.
19–26, 2016.

\[17\] R. Gennaro, S. Goldfeder, and A. Narayanan, “Threshold-Optimal
DSA/ECDSA Signatures and an Application to Bit-coin Wallet Security,”
Applied Cryptography and Network Security, pp. 156–174, 2016.

\[18\] Sandshrew Inc, “METASHREW: A WASM Bitcoin In-dexer,“ 2023.
\[Online\]. Available:
[https://github.com/](https://github.com/sandshrewmetaprotocols/metashrew)
[sandshrewmetaprotocols/metashrew](https://github.com/sandshrewmetaprotocols/metashrew)

\[19\] E. Ben-Sasson, A. Chiesa, E. Tromer, and M. Virza, “Succinct
Non-Interactive Zero Knowledge for a von Neumann Archi-tecture,” in 23rd
USENIX Security Symposium, 2014, pp. 781– 796.

\[20\] C.P.Schnorr,“EfficientIdentificationandSignaturesforSmart Cards,”
in Advances in Cryptology — CRYPTO’ 89 Proceed-ings, 1990, pp. 239–252.

\[21\] A. Gabizon, Z. J. Williamson, and O. Ciobotaru, “PLONK:
Permutations over Lagrange-bases for Oecumenical Noninter-active
arguments of Knowledge,” in Advances in Cryptology – EUROCRYPT 2021,
2021, pp. 643–673.

\[22\] Aztec Network, “Noir: A Universal ZK Circuit Language,” in
Technical Documentation, 2023. \[Online\]. Available:
[https:](https://noir-lang.org/)
[//noir-lang.org/](https://noir-lang.org/)

\[23\] A.Haasetal.,“BringingthewebuptospeedwithWebAssem-bly,” in
Proceedings of the 38th ACM SIGPLAN Conference
onProgrammingLanguageDesignandImplementation,2017, pp. 185–200.

> \[1\] S. Nakamoto, “Bitcoin: A Peer-to-Peer Electronic Cash Sys-tem,”
> 2008. \[Online\]. Available:
> [https://bitcoin.org/bitcoin.](https://bitcoin.org/bitcoin.pdf)
> [pdf](https://bitcoin.org/bitcoin.pdf)
>
> \[2\] BitGo, “Wrapped Bitcoin (WBTC),” 2019. \[Online\]. Available:
> <https://wbtc.network/>
>
> \[3\] Ren Project, “RenBTC: A Decentralized Bridge to Bitcoin,” 2020.
> \[Online\]. Available: <https://renproject.io/>
>
> \[4\] Threshold Network, “tBTC: A Trustless Bitcoin Bridge,” 2022.
> \[Online\]. Available: <https://threshold.network/tbtc>
>
> \[5\] flex, “ALKANES: Smart Contracts on Bitcoin UTXOs,” dev.to, 2023.
> \[Online\]. Available:
> [https://dev.to/kungfuflex/](https://dev.to/kungfuflex/alkanes-smart-contracts-on-bitcoin-utxos-4k28)
> [alkanes-smart-contracts-on-bitcoin-utxos-4k28](https://dev.to/kungfuflex/alkanes-smart-contracts-on-bitcoin-utxos-4k28)
>
> \[6\] C. Komlo and I. Goldberg, “FROST: Flexible Round-Optimized
> Schnorr Threshold Signatures,” in Selected Areas in Cryptography
> (SAC), 2020, pp. 34–65.
>
> \[7\] A. Gabizon, Z. J. Williamson, and O. Ciobotaru, “PLONK:
> Permutations over Lagrange-bases for Oecumenical Noninter-active
> arguments of Knowledge,” Cryptology ePrint Archive, Report 2019/953,
> 2019. \[Online\]. Available:
> [https://eprint.](https://eprint.iacr.org/2019/953)
> [iacr.org/2019/953](https://eprint.iacr.org/2019/953)
