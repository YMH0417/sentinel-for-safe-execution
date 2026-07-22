// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VaultExecution
 * @notice 执行安全闸门 — 在交易真正发出前做最后一道链上校验
 * @dev Week 3 MVP：只做约束校验，不实现实际 swap 路由
 */
contract VaultExecution {
    // ========== State ==========

    bool public paused;
    uint256 public maxLossBps; // 默认 100 bps = 1%

    // ========== Events ==========

    event VaultExecuted(
        address indexed user,
        bytes32 indexed routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 timestamp
    );

    event VaultRejected(
        address indexed user,
        bytes32 indexed routeId,
        string reason,
        uint256 riskScore,
        uint256 timestamp
    );

    event VaultPaused(address indexed admin, bool isPaused, uint256 timestamp);

    event ConfigUpdated(string param, uint256 oldValue, uint256 newValue);

    // ========== Errors ==========

    error VaultIsPaused();
    error DeadlineExpired(uint256 deadline, uint256 now);
    error LossExceedsMax(uint256 lossBps, uint256 maxBps);

    // ========== Constructor ==========

    constructor(uint256 _maxLossBps) {
        require(_maxLossBps > 0, "maxLossBps must be > 0");
        maxLossBps = _maxLossBps;
        paused = false;
    }

    // ========== Admin ==========

    function setPaused(bool _paused) external {
        paused = _paused;
        emit VaultPaused(msg.sender, _paused, block.timestamp);
    }

    function setMaxLossBps(uint256 _maxLossBps) external {
        uint256 old = maxLossBps;
        maxLossBps = _maxLossBps;
        emit ConfigUpdated("maxLossBps", old, _maxLossBps);
    }

    // ========== Core ==========

    /**
     * @notice 执行路由的链上闸门校验
     * @param routeId 路由唯一标识
     * @param amountIn 输入金额
     * @param amountOutQuoted 报价输出金额
     * @param deadline 过期时间戳
     * @param riskScore Agent 计算的风险评分 (0-100)
     * @param decision Agent 决策结果
     */
    function executeRoute(
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 deadline,
        uint256 riskScore,
        string memory decision
    ) external {
        // 1. paused 硬约束
        if (paused) revert VaultIsPaused();

        // 2. deadline 硬约束
        if (block.timestamp > deadline) {
            revert DeadlineExpired(deadline, block.timestamp);
        }

        // 3. maxLossBps 硬约束
        uint256 lossBps = computeLossBps(amountIn, amountOutQuoted);
        if (lossBps > maxLossBps) {
            revert LossExceedsMax(lossBps, maxLossBps);
        }

        // 4. riskScore 校验 (>= 70 拒绝)
        if (riskScore >= 70) {
            emit VaultRejected(
                msg.sender,
                routeId,
                string(
                    abi.encodePacked("Risk score ", uintToString(riskScore), " exceeds threshold. Decision: ", decision)
                ),
                riskScore,
                block.timestamp
            );
            return;
        }

        // 5. 通过校验 → 记录执行
        emit VaultExecuted(
            msg.sender,
            routeId,
            amountIn,
            amountOutQuoted,
            block.timestamp
        );
    }

    // ========== Internal ==========

    /**
     * @dev 计算 loss bps: (amountIn - amountOutQuoted) / amountIn * 10000
     */
    function computeLossBps(uint256 amountIn, uint256 amountOutQuoted)
        public
        pure
        returns (uint256)
    {
        if (amountIn == 0) return 0;
        if (amountOutQuoted >= amountIn) return 0;
        return ((amountIn - amountOutQuoted) * 10000) / amountIn;
    }

    function uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
