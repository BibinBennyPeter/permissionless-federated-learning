// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Minimal on-chain registry for commits and published models (relayer-driven)
contract ModelRegistry is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint256 private _commitCounter;
    uint256 private _modelCounter;

    struct Commit {
        bytes32 commitHash;
        address contributor;
        uint256 roundId;
        uint256 timestamp;
    }

    struct Model {
        uint256 modelId;
        string ipfsCID;
        bytes32 metadataHash;
        uint256 qualityScore;
        uint256 dpEpsilon;
        address[] contributors;
        uint256 publishTimestamp;
        address publisher;
    }

    mapping(uint256 => Commit) public commits;
    mapping(uint256 => Model) private models;
    mapping(bytes32 => bool) public usedCommitHashes;
    mapping(uint256 => mapping(address => uint256)) public nftLinks; // modelId => nftContract => tokenId

    event CommitRegistered(uint256 indexed commitId, bytes32 indexed commitHash, address indexed contributor, uint256 roundId);
    event BatchCommitsRegistered(uint256 indexed firstCommitId, uint256 count, uint256 indexed roundId);
    event ModelPublished(uint256 indexed modelId, string ipfsCID, bytes32 metadataHash, uint256 qualityScore, uint256 dpEpsilon, address indexed publisher);
    event NFTLinked(uint256 indexed modelId, address indexed nftContract, uint256 indexed tokenId);

    constructor(address admin) {
        require(admin != address(0), "ModelRegistry: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    /// @notice Register a single round commit (called by contributor or relayer on their behalf)
    function registerRoundCommit(bytes32 commitHash, uint256 roundId) external returns (uint256 commitId) {
        require(commitHash != bytes32(0), "ModelRegistry: invalid hash");
        require(!usedCommitHashes[commitHash], "ModelRegistry: hash used");

        commitId = _commitCounter++;
        usedCommitHashes[commitHash] = true;

        commits[commitId] = Commit({
            commitHash: commitHash,
            contributor: msg.sender,
            roundId: roundId,
            timestamp: block.timestamp
        });

        emit CommitRegistered(commitId, commitHash, msg.sender, roundId);
    }

    /// @notice Batch register commits (relayer-only). Demo limit: 100 items per batch.
    function registerRoundCommits(
        bytes32[] calldata commitHashes,
        uint256[] calldata roundIds,
        address[] calldata contributors
    ) external onlyRole(RELAYER_ROLE) {
        uint256 len = commitHashes.length;
        require(len > 0, "ModelRegistry: empty");
        require(len == roundIds.length && len == contributors.length, "ModelRegistry: array mismatch");
        require(len <= 100, "ModelRegistry: batch too large");

        uint256 firstId = _commitCounter;
        uint256 roundId = roundIds[0];

        for (uint256 i = 0; i < len; ++i) {
            bytes32 h = commitHashes[i];
            require(h != bytes32(0), "ModelRegistry: invalid hash");
            require(!usedCommitHashes[h], "ModelRegistry: hash used");
            require(contributors[i] != address(0), "ModelRegistry: invalid contributor");

            uint256 id = _commitCounter++;
            usedCommitHashes[h] = true;

            commits[id] = Commit({
                commitHash: h,
                contributor: contributors[i],
                roundId: roundIds[i],
                timestamp: block.timestamp
            });

            emit CommitRegistered(id, h, contributors[i], roundIds[i]);
        }

        emit BatchCommitsRegistered(firstId, len, roundId);
    }

    /// @notice Publish model (relayer-only). Off-chain aggregation/validation expected before this call.
    function publishModel(
        string calldata ipfsCID,
        bytes32 metadataHash,
        uint256 qualityScore,
        uint256 dpEpsilon,
        address[] calldata contributors
    ) external onlyRole(RELAYER_ROLE) returns (uint256 modelId) {
        require(bytes(ipfsCID).length > 0, "ModelRegistry: empty cid");
        require(metadataHash != bytes32(0), "ModelRegistry: invalid metadata");
        require(contributors.length > 0, "ModelRegistry: no contributors");

        uint256 id = _modelCounter++;

        models[id].modelId = id;
        models[id].ipfsCID = ipfsCID;
        models[id].metadataHash = metadataHash;
        models[id].qualityScore = qualityScore;
        models[id].dpEpsilon = dpEpsilon;
        models[id].contributors = contributors;
        models[id].publishTimestamp = block.timestamp;
        models[id].publisher = msg.sender;

        emit ModelPublished(id, ipfsCID, metadataHash, qualityScore, dpEpsilon, msg.sender);
        return id;
    }

    /// @notice Link NFT to model (relayer-only)
    function linkNFT(uint256 modelId, address nftContract, uint256 tokenId) external onlyRole(RELAYER_ROLE) {
        require(models[modelId].modelId == modelId, "ModelRegistry: model missing");
        require(nftContract != address(0), "ModelRegistry: invalid nft");
        nftLinks[modelId][nftContract] = tokenId;
        emit NFTLinked(modelId, nftContract, tokenId);
    }

    /// @notice Get model details
    function getModel(uint256 modelId) external view returns (
        uint256, string memory, bytes32, uint256, uint256, address[] memory, uint256, address
    ) {
        Model storage m = models[modelId];
        return (
            m.modelId,
            m.ipfsCID,
            m.metadataHash,
            m.qualityScore,
            m.dpEpsilon,
            m.contributors,
            m.publishTimestamp,
            m.publisher
        );
    }

    function getCommit(uint256 commitId) external view returns (bytes32, address, uint256, uint256) {
        Commit storage c = commits[commitId];
        return (c.commitHash, c.contributor, c.roundId, c.timestamp);
    }

    function totalCommits() external view returns (uint256) { return _commitCounter; }
    function totalModels() external view returns (uint256) { return _modelCounter; }
}
