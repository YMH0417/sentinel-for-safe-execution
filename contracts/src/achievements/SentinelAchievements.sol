// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISentinelAchievements} from "./ISentinelAchievements.sol";

/// @notice On-chain badge / stats ledger for Sentinel demo (gas-minimal packed storage).
/// @dev Reporters (Vault + Router) update stats in the same tx as check/swap — no extra user txs.
contract SentinelAchievements is ISentinelAchievements {
    uint256 public constant BADGE_FIRST_SWAP = 1 << 0;
    uint256 public constant BADGE_10K_3 = 1 << 1;
    uint256 public constant BADGE_50K_5 = 1 << 2;
    uint256 public constant BADGE_100K_10 = 1 << 3;
    uint256 public constant BADGE_1M_10 = 1 << 4;

    uint256 public constant VOLUME_10K = 10_000e6;
    uint256 public constant VOLUME_50K = 50_000e6;
    uint256 public constant VOLUME_100K = 100_000e6;
    uint256 public constant VOLUME_1M = 1_000_000e6;

    struct UserStats {
        uint128 usdcVolume;
        uint64 checkCount;
        uint64 safeSwapCount;
        uint8 badgeFlags;
    }

    address public immutable usdcToken;
    address public owner;
    mapping(address => bool) public reporters;
    mapping(address => UserStats) public stats;

    event ReporterUpdated(address indexed reporter, bool allowed);
    event StatsUpdated(
        address indexed user,
        uint64 checkCount,
        uint64 safeSwapCount,
        uint128 usdcVolume,
        uint8 badgeFlags
    );
    event BadgeUnlocked(address indexed user, uint8 tier);

    error Unauthorized(address caller);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyReporter() {
        if (!reporters[msg.sender]) revert Unauthorized(msg.sender);
        _;
    }

    constructor(address usdcToken_, address owner_) {
        if (usdcToken_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        usdcToken = usdcToken_;
        owner = owner_;
    }

    function setReporter(address reporter, bool allowed) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        reporters[reporter] = allowed;
        emit ReporterUpdated(reporter, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @inheritdoc ISentinelAchievements
    function recordCheck(address user) external onlyReporter {
        if (user == address(0)) revert ZeroAddress();
        UserStats storage s = stats[user];
        s.checkCount += 1;
        _evaluateBadges(user, s);
    }

    /// @inheritdoc ISentinelAchievements
    function recordSafeSwap(address user, address tokenIn, uint256 amountIn) external onlyReporter {
        if (user == address(0)) revert ZeroAddress();
        UserStats storage s = stats[user];
        s.safeSwapCount += 1;
        if (tokenIn == usdcToken && amountIn > 0) {
            s.usdcVolume += uint128(amountIn);
        }
        _evaluateBadges(user, s);
    }

    function badgeFlagsOf(address user) external view returns (uint8) {
        return stats[user].badgeFlags;
    }

    function _evaluateBadges(address user, UserStats storage s) internal {
        uint8 oldFlags = s.badgeFlags;
        uint8 newFlags = oldFlags;

        if (s.safeSwapCount >= 1 && s.checkCount >= 1) {
            newFlags |= uint8(BADGE_FIRST_SWAP);
        }
        if (s.usdcVolume >= VOLUME_10K && s.checkCount >= 3) {
            newFlags |= uint8(BADGE_10K_3);
        }
        if (s.usdcVolume >= VOLUME_50K && s.checkCount >= 5) {
            newFlags |= uint8(BADGE_50K_5);
        }
        if (s.usdcVolume >= VOLUME_100K && s.checkCount >= 10) {
            newFlags |= uint8(BADGE_100K_10);
        }
        if (s.usdcVolume >= VOLUME_1M && s.checkCount >= 10) {
            newFlags |= uint8(BADGE_1M_10);
        }

        if (newFlags != oldFlags) {
            s.badgeFlags = newFlags;
            emit StatsUpdated(user, s.checkCount, s.safeSwapCount, s.usdcVolume, newFlags);
            _emitNewBadges(user, oldFlags, newFlags);
        } else {
            emit StatsUpdated(user, s.checkCount, s.safeSwapCount, s.usdcVolume, oldFlags);
        }
    }

    function _emitNewBadges(address user, uint8 oldFlags, uint8 newFlags) internal {
        uint8 unlocked = newFlags & ~oldFlags;
        for (uint8 tier = 0; tier < 5; tier++) {
            if (unlocked & uint8(1 << tier) != 0) {
                emit BadgeUnlocked(user, tier);
            }
        }
    }
}
