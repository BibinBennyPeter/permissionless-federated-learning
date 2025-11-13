// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Gas-efficient reward distributor using Merkle proofs (relayer-driven)
contract RewardDistributor is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable rewardToken;

    struct Distribution {
        bytes32 merkleRoot;
        uint256 totalReward;
        uint256 claimedAmount;
    }

    // modelId => distribution
    mapping(uint256 => Distribution) public distributions;

    // claimed bitmap: modelId => wordIndex => bits
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitmap;

    event MerkleRootSet(uint256 indexed modelId, bytes32 merkleRoot, uint256 totalReward);
    event RewardClaimed(uint256 indexed modelId, address indexed account, uint256 amount, uint256 index);

    error InvalidRoot();
    error ZeroReward();
    error InsufficientBalance();
    error AlreadyClaimed();
    error InvalidProof();

    constructor(address token_, address admin) {
        require(token_ != address(0) && admin != address(0), "MerkleRewardDistributor: zero");
        rewardToken = IERC20(token_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    /// @notice Set merkle root and total reward for a model (relayer only)
    function setDistributionMerkle(uint256 modelId, bytes32 merkleRoot, uint256 totalReward) external onlyRole(RELAYER_ROLE) {
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (totalReward == 0) revert ZeroReward();

        // compute already committed for this model (if updating)
        uint256 committed = 0;
        if (distributions[modelId].merkleRoot != bytes32(0)) {
            committed = distributions[modelId].totalReward - distributions[modelId].claimedAmount;
        }

        // ensure contract has enough tokens to cover new distribution
        if (rewardToken.balanceOf(address(this)) < committed + totalReward) revert InsufficientBalance();

        distributions[modelId].merkleRoot = merkleRoot;
        distributions[modelId].totalReward = totalReward;
        distributions[modelId].claimedAmount = 0;

        emit MerkleRootSet(modelId, merkleRoot, totalReward);
    }

    /// @notice Claim a reward entry using merkle proof
    function claimMerkle(uint256 modelId, uint256 index, address account, uint256 amount, bytes32[] calldata proof) external {
        Distribution storage d = distributions[modelId];
        if (d.merkleRoot == bytes32(0)) revert InvalidRoot();

        if (isClaimed(modelId, index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(proof, d.merkleRoot, leaf)) revert InvalidProof();

        _setClaimed(modelId, index);
        d.claimedAmount += amount;

        rewardToken.safeTransfer(account, amount);

        emit RewardClaimed(modelId, account, amount, index);
    }

    /// @notice Check if an index was already claimed
    function isClaimed(uint256 modelId, uint256 index) public view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = claimedBitmap[modelId][wordIndex];
        uint256 mask = (uint256(1) << bitIndex);
        return word & mask != 0;
    }

    function _setClaimed(uint256 modelId, uint256 index) private {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        claimedBitmap[modelId][wordIndex] |= (uint256(1) << bitIndex);
    }

    /// @notice Emergency withdraw tokens (admin)
    function emergencyWithdraw(address token, uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "MerkleRewardDistributor: zero");
        IERC20(token).safeTransfer(to, amount);
    }
}
