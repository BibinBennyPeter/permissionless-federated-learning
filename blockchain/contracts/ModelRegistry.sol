// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ModelRegistry is ERC721, Ownable {
    uint256 public nextTokenId;

    // A single submission record
    struct Submission {
        bytes32 modelHash;   // sha256 of client's (noised) update or IPFS CID
        address submitter;   // client submitter or credited address
        uint256 round;       // FL round number
        uint256 quality;     // small integer score (e.g. scaled accuracy*1000)
        uint256 numExamples; // optional: #examples used for weighting
    }

    // Mapping round => submission hashes list (indexable)
    mapping(uint256 => Submission[]) public submissionsByRound;

    // event emitted when submission recorded
    event SubmissionRecorded(uint256 indexed round, bytes32 indexed modelHash, address indexed submitter, uint256 quality, uint256 numExamples);

    // event emitted when an NFT is minted for a model
    event ModelMinted(uint256 tokenId, bytes32 modelHash, address owner, string metadataUri);

    constructor(string memory name_, string memory symbol_, address intialOwner) ERC721(name_, symbol_) Ownable(intialOwner) {
    }

    /// @notice Record a submission on-chain (onlyOwner for now).
    /// @dev For prototype we restrict to owner (aggregator). Later add aggregator role.
    function recordSubmission(
        bytes32 modelHash,
        uint256 round,
        address submitter,
        uint256 quality,
        uint256 numExamples
    ) external onlyOwner {
        submissionsByRound[round].push(Submission({
            modelHash: modelHash,
            submitter: submitter,
            round: round,
            quality: quality,
            numExamples: numExamples
        }));

        emit SubmissionRecorded(round, modelHash, submitter, quality, numExamples);
    }

    /// @notice Mint an ERC-721 token representing a model (owner only)
    function mintModelNFT(bytes32 modelHash, address to, string calldata metadataUri) external onlyOwner returns (uint256) {
        uint256 tokenId = ++nextTokenId;
        _mint(to, tokenId);
        // store mapping tokenId -> modelHash off-chain or via metadata (not stored here to save gas)
        emit ModelMinted(tokenId, modelHash, to, metadataUri);
        return tokenId;
    }

    /// @notice Simple getter: number of submissions in a round
    function submissionsCount(uint256 round) external view returns (uint256) {
        return submissionsByRound[round].length;
    }
}
