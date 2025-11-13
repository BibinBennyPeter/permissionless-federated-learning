// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Minimal NFT representing a published model. Relayer or PUBLISHER_ROLE can mint.
contract ModelNFT is ERC721, ERC2981, AccessControl {
    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10% cap for demo

    // Replace Counters.Counter with a simple uint256
    uint256 private _nextTokenId;
    address public modelRegistry;

    // mapping tokenId -> modelId and modelId -> tokenId
    mapping(uint256 => uint256) public modelIdByToken;
    mapping(uint256 => uint256) public tokenIdByModel;

    // store token URIs
    mapping(uint256 => string) private _tokenURIs;

    event ModelNFTMinted(uint256 indexed tokenId, uint256 indexed modelId, address indexed owner);

    error UnauthorizedMinter();
    error InvalidModelId();
    error InvalidAddress();
    error RoyaltyTooHigh();
    error TokenDoesNotExist();

    constructor(address _modelRegistry, address admin) ERC721("AI Model NFT", "AIMODEL") {
        require(_modelRegistry != address(0), "ModelNFT: zero registry");
        require(admin != address(0), "ModelNFT: zero admin");
        modelRegistry = _modelRegistry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PUBLISHER_ROLE, admin);
        
        // Initialize counter at 1 (optional, depends on if you want tokenId to start at 1 or 0)
        _nextTokenId = 1;
    }

    /**
     * @notice Mint a model NFT.
     * @dev Callable by the modelRegistry address (trusted relayer flow) or addresses with PUBLISHER_ROLE.
     */
    function mintModelNFT(
        address to,
        uint256 modelId,
        string calldata tokenURI_,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external returns (uint256) {
        // authorization: modelRegistry OR PUBLISHER_ROLE
        if (msg.sender != modelRegistry && !hasRole(PUBLISHER_ROLE, msg.sender)) revert UnauthorizedMinter();
        if (to == address(0) || royaltyReceiver == address(0)) revert InvalidAddress();
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();

        // Lightweight check that model exists: modelId < totalModels()
        (bool success, bytes memory data) = modelRegistry.staticcall(abi.encodeWithSignature("totalModels()"));
        require(success && data.length > 0, "ModelNFT: registry error");
        uint256 total = abi.decode(data, (uint256));
        if (modelId >= total) revert InvalidModelId();

        // Get current tokenId and increment for next mint
        uint256 tokenId = _nextTokenId++;

        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = tokenURI_;

        modelIdByToken[tokenId] = modelId;
        tokenIdByModel[modelId] = tokenId;

        // Set royalty (fee numerator uses 10000 denominator by default in OZ)
        _setTokenRoyalty(tokenId, royaltyReceiver, royaltyBps);

        emit ModelNFTMinted(tokenId, modelId, to);
        return tokenId;
    }

    /// @notice Return token URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId); // OZ v5 way to check token existence
        return _tokenURIs[tokenId];
    }

    /// @notice Support interfaces for ERC721, ERC2981, AccessControl
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
