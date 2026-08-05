// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISentinelAchievements} from "../achievements/ISentinelAchievements.sol";
import {ISentinelLedger} from "./ISentinelLedger.sol";

/// @notice On-chain stats ledger for Sentinel demo — updated in the same tx as each trade.
/// @dev Reporters (Vault + Router) write; no block scanning required for badge reads on anvil.
contract SentinelLedger is ISentinelLedger {
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
        uint64 tradeCount;
        uint64 safeTradeCount;
        uint8 badgeFlags;
    }

    /// @dev Global dashboard aggregates (链条状态 / 交易概览) — same contract as user badges.
    struct LabelStats {
        uint128 usdcVolume;
        uint64 swapCount;
    }

    address public immutable usdcToken;
    address public owner;
    mapping(address => bool) public reporters;
    mapping(address => UserStats) public stats;

    LabelStats[4] public labelStats;
    uint64 public globalTradeCount;
    uint16 public abnormalPoolCount;
    uint16 public totalPoolCount;

    event ReporterUpdated(address indexed reporter, bool allowed);
    event CheckRecorded(address indexed user, uint64 checkCount);
    event TradeRecorded(
        address indexed user,
        bytes32 indexed routeId,
        ExecutionMode mode,
        uint8 poolLabel,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint64 tradeCount
    );
    event StatsUpdated(
        address indexed user,
        uint64 checkCount,
        uint64 tradeCount,
        uint64 safeTradeCount,
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

    /// @notice Demo seed for pool health row (异常/空池) on dashboard.
    function seedPoolHealth(uint16 abnormal, uint16 total) external onlyOwner {
        abnormalPoolCount = abnormal;
        totalPoolCount = total;
    }

    /// @notice Single read for dashboard 链条状态 (volumes + pool health + trade count).
    function dashboardSnapshot()
        external
        view
        returns (
            uint64 tradeCount,
            uint16 abnormalPools,
            uint16 poolCount,
            uint128 safeVolume,
            uint64 safeSwaps,
            uint128 shallowVolume,
            uint64 shallowSwaps,
            uint128 toxicVolume,
            uint64 toxicSwaps,
            uint128 sdaVolume,
            uint64 sdaSwaps
        )
    {
        tradeCount = globalTradeCount;
        abnormalPools = abnormalPoolCount;
        poolCount = totalPoolCount;
        safeVolume = labelStats[0].usdcVolume;
        safeSwaps = labelStats[0].swapCount;
        shallowVolume = labelStats[1].usdcVolume;
        shallowSwaps = labelStats[1].swapCount;
        toxicVolume = labelStats[2].usdcVolume;
        toxicSwaps = labelStats[2].swapCount;
        sdaVolume = labelStats[3].usdcVolume;
        sdaSwaps = labelStats[3].swapCount;
    }

    /// @dev Legacy hook from Vault — no longer affects badge checkCount (checked trades only).
    function recordCheck(address user) external onlyReporter {
        if (user == address(0)) revert ZeroAddress();
        emit CheckRecorded(user, stats[user].checkCount);
    }

    /// @inheritdoc ISentinelAchievements
    function recordSafeSwap(address user, address tokenIn, uint256 amountIn) external onlyReporter {
        recordTrade(user, bytes32(0), ExecutionMode.Safe, 0, tokenIn, amountIn, 0);
    }

    /// @inheritdoc ISentinelLedger
    function recordTrade(
        address user,
        bytes32 routeId,
        ExecutionMode mode,
        uint8 poolLabel,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut
    ) public onlyReporter {
        if (user == address(0)) revert ZeroAddress();
        UserStats storage s = stats[user];
        s.tradeCount += 1;
        if (mode == ExecutionMode.Safe) {
            s.safeTradeCount += 1;
            s.checkCount += 1;
        }
        if (tokenIn == usdcToken && amountIn > 0) {
            s.usdcVolume += uint128(amountIn);
        }
        emit TradeRecorded(user, routeId, mode, poolLabel, tokenIn, amountIn, amountOut, s.tradeCount);
        _recordGlobalTrade(poolLabel, tokenIn, amountIn);
        _evaluateBadges(user, s);
    }

    function _recordGlobalTrade(uint8 poolLabel, address tokenIn, uint256 amountIn) internal {
        globalTradeCount += 1;
        if (poolLabel >= 4) return;
        LabelStats storage ls = labelStats[poolLabel];
        ls.swapCount += 1;
        if (tokenIn == usdcToken && amountIn > 0) {
            ls.usdcVolume += uint128(amountIn);
        }
    }

    function badgeFlagsOf(address user) external view returns (uint8) {
        return stats[user].badgeFlags;
    }

    function _evaluateBadges(address user, UserStats storage s) internal {
        uint8 oldFlags = s.badgeFlags;
        uint8 newFlags = oldFlags;

        if (s.checkCount >= 1) {
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
            emit StatsUpdated(user, s.checkCount, s.tradeCount, s.safeTradeCount, s.usdcVolume, newFlags);
            _emitNewBadges(user, oldFlags, newFlags);
        } else {
            emit StatsUpdated(user, s.checkCount, s.tradeCount, s.safeTradeCount, s.usdcVolume, oldFlags);
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
