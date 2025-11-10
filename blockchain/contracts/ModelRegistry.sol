// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ModelRegistry is ERC721, AccessControl {
    uint256 public nextTokenId;

    bytes32 public constant AGGREGATOR_ROLE = keccak256("AGGREGATOR_ROLE");

    // A single submission record
    struct Submission {
        bytes32 modelHash;   // sha256 of client's (noised) update or IPFS CID
        address submitter;   // client submitter or credited address
        uint256 round;       // FL round number
        uint256 quality;     // small integer score (e.g. scaled accuracy*1000)
        uint256 numExamples; // optional: #examples used for weighting
    }

    // A training round's metadata
    struct Round {
        bytes32 merkleRoot;
        string manifestCid;
        bytes32 modelHash;
        address aggregator;
        uint256 timestamp;
    }

    // Mapping round => submission hashes list (indexable)
    mapping(uint256 => Submission[]) public submissionsByRound;

    // Mapping round => Round metadata
    mapping(uint256 => Round) public rounds;
   
    // event emitted when a new round is published
    event RoundPublished(
        uint256 indexed round,
        bytes32 indexed merkleRoot,
        string manifestCid,
        bytes32 modelHash,
        address indexed aggregator
    );

    // event emitted when submission recorded
    event SubmissionRecorded(uint256 indexed round, bytes32 indexed modelHash, address indexed submitter, uint256 quality, uint256 numExamples);

    // event emitted when an NFT is minted for a model
    event ModelMinted(uint256 tokenId, bytes32 modelHash, address owner, string metadataUri);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AGGREGATOR_ROLE, msg.sender);
    }

    /// @notice Record a submission on-chain (onlyOwner for now).
    function recordSubmission(
        bytes32 modelHash,
        uint256 round,
        address submitter,
        uint256 quality,
        uint256 numExamples
    ) external onlyRole(AGGREGATOR_ROLE) {
        submissionsByRound[round].push(Submission({
            modelHash: modelHash,
            submitter: submitter,
            round: round,
            quality: quality,
            numExamples: numExamples
        }));

        emit SubmissionRecorded(round, modelHash, submitter, quality, numExamples);
    }

    /// @notice Publish round metadata
    function publishRound(
        uint256 round,
        bytes32 merkleRoot,
        string calldata manifestCid,
        bytes32 modelHash
    ) external onlyRole(AGGREGATOR_ROLE) {
        require(rounds[round].timestamp == 0, "Round already published");
        rounds[round] = Round({
            merkleRoot: merkleRoot,
            manifestCid: manifestCid,
            modelHash: modelHash,
            aggregator: msg.sender,
            timestamp: block.timestamp
        });
        emit RoundPublished(round, merkleRoot, manifestCid, modelHash, msg.sender);
    }

    /// @notice Mint an ERC-721 token representing a model
    function mintModelNFT(
        bytes32 modelHash,
        address to,
        string calldata metadataUri
    ) external onlyRole(AGGREGATOR_ROLE) returns (uint256) {
        uint256 tokenId = ++nextTokenId;
        _mint(to, tokenId);
        emit ModelMinted(tokenId, modelHash, to, metadataUri);
        return tokenId;
    }

    /// @notice Simple getter: number of submissions in a round
    function submissionsCount(uint256 round) external view returns (uint256) {
        return submissionsByRound[round].length;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
