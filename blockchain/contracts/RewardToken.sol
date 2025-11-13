// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Simple ERC20 used for rewards 
contract RewardToken is ERC20, ERC20Burnable, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Max supply cap. Set to 0 for uncapped.
    uint256 public immutable maxSupply;

    constructor(
        string memory name_,
        string memory symbol_,
        address admin_,
        uint256 maxSupply_
    ) ERC20(name_, symbol_) {
        require(admin_ != address(0), "RewardToken: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        maxSupply = maxSupply_;
    }

    /// @notice Mint tokens (only MINTER_ROLE)
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "RewardToken: mint to zero");
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "RewardToken: cap exceeded");
        }
        _mint(to, amount);
    }

    /// @notice Pause token transfers (only PAUSER_ROLE)
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause token transfers (only PAUSER_ROLE)
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Override the internal hook _update called 
     * on transfers, mints, burns. We embed the pause logic in it.
     */
    function _update(address from, address to, uint256 amount) internal virtual override {
        require(!paused(), "RewardToken: token transfer while paused");
        super._update(from, to, amount);
    }

    /// @notice Supports interfaces for AccessControl + ERC20
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
