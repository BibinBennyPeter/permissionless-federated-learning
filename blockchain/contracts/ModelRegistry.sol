// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IRewardToken {
    function mint(address to, uint256 amount) external;
}

/// @notice On-chain registry for commits and published models with integrated reward distribution
contract ModelRegistry is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint256 private _commitCounter;
    uint256 private _modelCounter;

    IRewardToken public immutable rewardToken;

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
        uint256[] rewards;
        uint256 publishTimestamp;
        address publisher;
        uint256 roundId;
    }

    mapping(uint256 => Commit) public commits;
    mapping(uint256 => Model) public models;
    mapping(bytes32 => bool) public usedCommitHashes;
    mapping(uint256 => mapping(address => uint256)) public nftLinks; // modelId => nftContract => tokenId

    event CommitRegistered(uint256 indexed commitId, bytes32 indexed commitHash, address indexed contributor, uint256 roundId);
    event BatchCommitsRegistered(uint256 indexed firstCommitId, uint256 count, uint256 indexed roundId);
    event ModelPublished(
        uint256 indexed modelId, 
        string ipfsCID, 
        bytes32 metadataHash, 
        uint256 qualityScore, 
        uint256 dpEpsilon, 
        address indexed publisher,
        uint256 roundId
    );
    event ContributorRewarded(
        address indexed contributor,
        uint256 indexed modelId,
        uint256 indexed roundId,
        uint256 tokensAllocated
    );
    event NFTLinked(uint256 indexed modelId, address indexed nftContract, uint256 indexed tokenId);

    constructor(address admin, address _rewardToken) {
        require(admin != address(0), "ModelRegistry: admin zero");
        require(_rewardToken != address(0), "ModelRegistry: reward token zero");
        
        rewardToken = IRewardToken(_rewardToken);
        
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

    /// @notice Publish model with integrated reward distribution (relayer-only)
    /// @param ipfsCID IPFS content identifier for the model
    /// @param metadataHash Hash of model metadata
    /// @param qualityScore Quality metric for the model
    /// @param dpEpsilon Differential privacy epsilon value
    /// @param contributors Array of contributor addresses
    /// @param rewardAmounts Array of reward amounts corresponding to each contributor
    /// @param roundId The training round identifier
    function publishModel(
        string calldata ipfsCID,
        bytes32 metadataHash,
        uint256 qualityScore,
        uint256 dpEpsilon,
        address[] calldata contributors,
        uint256[] calldata rewardAmounts,
        uint256 roundId
    ) external onlyRole(RELAYER_ROLE) returns (uint256 modelId) {
        require(bytes(ipfsCID).length > 0, "ModelRegistry: empty cid");
        require(metadataHash != bytes32(0), "ModelRegistry: invalid metadata");
        require(contributors.length > 0, "ModelRegistry: no contributors");
        require(contributors.length == rewardAmounts.length, "ModelRegistry: array mismatch");

        uint256 id = _modelCounter++;

        // Store model data
        models[id].modelId = id;
        models[id].ipfsCID = ipfsCID;
        models[id].metadataHash = metadataHash;
        models[id].qualityScore = qualityScore;
        models[id].dpEpsilon = dpEpsilon;
        models[id].contributors = contributors;
        models[id].rewards = rewardAmounts;
        models[id].publishTimestamp = block.timestamp;
        models[id].publisher = msg.sender;
        models[id].roundId = roundId;

        // Distribute rewards to contributors
        for (uint256 i = 0; i < contributors.length; ++i) {
            address contributor = contributors[i];
            uint256 reward = rewardAmounts[i];
            
            require(contributor != address(0), "ModelRegistry: invalid contributor");
            require(reward > 0, "ModelRegistry: zero reward");

            // Mint reward tokens directly to contributor
            rewardToken.mint(contributor, reward);

            emit ContributorRewarded(contributor, id, roundId, reward);
        }

        emit ModelPublished(id, ipfsCID, metadataHash, qualityScore, dpEpsilon, msg.sender, roundId);
        return id;
    }

    /// @notice Link NFT to model (relayer-only)
    function linkNFT(uint256 modelId, address nftContract, uint256 tokenId) external onlyRole(RELAYER_ROLE) {
        require(models[modelId].modelId == modelId, "ModelRegistry: model missing");
        require(nftContract != address(0), "ModelRegistry: invalid nft");
        nftLinks[modelId][nftContract] = tokenId;
        emit NFTLinked(modelId, nftContract, tokenId);
    }

    /// @notice Get comprehensive model details including rewards
    function getModel(uint256 modelId) external view returns (
        uint256, 
        string memory, 
        bytes32, 
        uint256, 
        uint256, 
        address[] memory, 
        uint256[] memory,
        uint256, 
        address,
        uint256
    ) {
        Model storage m = models[modelId];
        return (
            m.modelId,
            m.ipfsCID,
            m.metadataHash,
            m.qualityScore,
            m.dpEpsilon,
            m.contributors,
            m.rewards,
            m.publishTimestamp,
            m.publisher,
            m.roundId
        );
    }

    /// @notice Get the latest model CID and round
    function getLatestModel(uint256 modelId) external view returns (
        string memory ipfsCID,
        uint256 roundId
    ) {
        Model storage m = models[modelId];
        require(m.modelId == modelId, "ModelRegistry: model not found");
        return (m.ipfsCID, m.roundId);
    }

    /// @notice Get commit details
    function getCommit(uint256 commitId) external view returns (
        bytes32, 
        address, 
        uint256, 
        uint256
    ) {
        Commit storage c = commits[commitId];
        return (c.commitHash, c.contributor, c.roundId, c.timestamp);
    }

    /// @notice Get contributor rewards for a specific model
    function getContributorRewards(uint256 modelId) external view returns (
        address[] memory contributors,
        uint256[] memory rewards
    ) {
        Model storage m = models[modelId];
        require(m.modelId == modelId, "ModelRegistry: model not found");
        return (m.contributors, m.rewards);
    }

    /// @notice Get total number of commits registered
    function totalCommits() external view returns (uint256) { 
        return _commitCounter; 
    }

    /// @notice Get total number of models published
    function totalModels() external view returns (uint256) { 
        return _modelCounter; 
    }
}
