// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISentinelAchievements} from "./achievements/ISentinelAchievements.sol";

/**
 * @title VaultExecution
 * @notice 执行安全闸门 — 在交易真正发出前做最后一道链上校验
 * @dev Week 3 MVP：只做约束校验和执行留痕，不实现实际 swap 路由
 */
contract VaultExecution {
    // ========== Constants ==========

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant REJECT_RISK_SCORE = 70;

    bytes32 public constant EXECUTION_PERMIT_TYPEHASH = keccak256(
        "ExecutionPermit(address user,bytes32 routeId,uint256 amountIn,uint256 amountOutQuoted,uint256 deadline,uint256 riskScore,uint8 decision,uint256 nonce)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Sentinel Vault Execution");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    enum Decision {
        ALLOW,
        REJECT,
        FALLBACK_TO_SAFE_ROUTE
    }

    // ========== State ==========

    address public owner;
    address public agentSigner;
    address public achievements;
    bool public paused;
    uint256 public maxLossBps; // 默认 100 bps = 1%
    mapping(address user => uint256 nonce) public nonces;

    // ========== Events ==========

    event VaultExecuted(
        address indexed user,
        bytes32 indexed routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 riskScore,
        Decision decision,
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

    event AgentSignerUpdated(address indexed oldSigner, address indexed newSigner);

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ========== Errors ==========

    error Unauthorized(address caller);
    error ZeroAddress();
    error InvalidMaxLossBps(uint256 maxLossBps);
    error InvalidRiskScore(uint256 riskScore);
    error InvalidAmountIn();
    error InvalidRouteId();
    error InvalidNonce(uint256 expected, uint256 provided);
    error InvalidSignature();
    error VaultIsPaused();
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    error LossExceedsMax(uint256 lossBps, uint256 maxBps);

    // ========== Constructor ==========

    constructor(uint256 _maxLossBps, address _owner, address _agentSigner) {
        if (_owner == address(0) || _agentSigner == address(0)) revert ZeroAddress();
        if (_maxLossBps > BPS_DENOMINATOR) {
            revert InvalidMaxLossBps(_maxLossBps);
        }

        owner = _owner;
        agentSigner = _agentSigner;
        maxLossBps = _maxLossBps;

        emit OwnershipTransferred(address(0), _owner);
        emit AgentSignerUpdated(address(0), _agentSigner);
    }

    // ========== Modifiers ==========

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    // ========== Admin ==========

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit VaultPaused(msg.sender, _paused, block.timestamp);
    }

    function setMaxLossBps(uint256 _maxLossBps) external onlyOwner {
        if (_maxLossBps > BPS_DENOMINATOR) {
            revert InvalidMaxLossBps(_maxLossBps);
        }

        uint256 old = maxLossBps;
        maxLossBps = _maxLossBps;
        emit ConfigUpdated("maxLossBps", old, _maxLossBps);
    }

    function setAgentSigner(address _agentSigner) external onlyOwner {
        if (_agentSigner == address(0)) revert ZeroAddress();

        address oldSigner = agentSigner;
        agentSigner = _agentSigner;
        emit AgentSignerUpdated(oldSigner, _agentSigner);
    }

    function setAchievements(address _achievements) external onlyOwner {
        address old = achievements;
        achievements = _achievements;
        emit ConfigUpdated("achievements", uint256(uint160(old)), uint256(uint160(_achievements)));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ========== Core ==========

    /**
     * @notice 校验 Agent 签发的执行许可，并记录执行或拒绝结果
     * @param user 发起交易的钱包地址
     * @param routeId 路由唯一标识
     * @param amountIn 输入金额
     * @param amountOutQuoted 报价输出金额
     * @param deadline 过期时间戳
     * @param riskScore Agent 计算的风险评分 (0-100)
     * @param decision Agent 决策结果
     * @param nonce 用户当前 nonce，防止许可被重放
     * @param signature Agent 对 EIP-712 ExecutionPermit 的签名
     * @return executed 是否通过链上闸门
     */
    function executeRoute(
        address user,
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 deadline,
        uint256 riskScore,
        Decision decision,
        uint256 nonce,
        bytes calldata signature
    ) external returns (bool executed) {
        // 1. paused 硬约束
        if (paused) revert VaultIsPaused();

        // 2. deadline 硬约束
        if (block.timestamp > deadline) {
            revert DeadlineExpired(deadline, block.timestamp);
        }

        // 3. 基础输入与 nonce 校验
        if (user == address(0)) revert ZeroAddress();
        if (routeId == bytes32(0)) revert InvalidRouteId();
        if (amountIn == 0) revert InvalidAmountIn();
        if (riskScore > 100) revert InvalidRiskScore(riskScore);

        uint256 expectedNonce = nonces[user];
        if (nonce != expectedNonce) {
            revert InvalidNonce(expectedNonce, nonce);
        }

        // 4. Agent 签名校验，防止调用方伪造 decision/riskScore
        bytes32 digest = getExecutionDigest(
            user,
            routeId,
            amountIn,
            amountOutQuoted,
            deadline,
            riskScore,
            decision,
            nonce
        );
        if (_recoverSigner(digest, signature) != agentSigner) {
            revert InvalidSignature();
        }

        // 签名验证成功后消费 nonce；后续 revert 会自动回滚
        nonces[user] = expectedNonce + 1;

        // 5. maxLossBps 硬约束
        uint256 lossBps = computeLossBps(amountIn, amountOutQuoted);
        if (lossBps > maxLossBps) {
            revert LossExceedsMax(lossBps, maxLossBps);
        }

        // 6. 明确拒绝或风险分过高：不上路由，只保留拒绝事件
        if (decision == Decision.REJECT || riskScore >= REJECT_RISK_SCORE) {
            emit VaultRejected(
                user,
                routeId,
                decision == Decision.REJECT
                    ? "Agent decision is REJECT"
                    : "Risk score exceeds threshold",
                riskScore,
                block.timestamp
            );
            return false;
        }

        // 7. ALLOW / FALLBACK 通过校验 → 记录执行
        emit VaultExecuted(
            user,
            routeId,
            amountIn,
            amountOutQuoted,
            riskScore,
            decision,
            block.timestamp
        );

        if (achievements != address(0)) {
            ISentinelAchievements(achievements).recordCheck(user);
        }

        return true;
    }

    /**
     * @notice 返回供 Agent 签名的 EIP-712 digest
     */
    function getExecutionDigest(
        address user,
        bytes32 routeId,
        uint256 amountIn,
        uint256 amountOutQuoted,
        uint256 deadline,
        uint256 riskScore,
        Decision decision,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTION_PERMIT_TYPEHASH,
                user,
                routeId,
                amountIn,
                amountOutQuoted,
                deadline,
                riskScore,
                decision,
                nonce
            )
        );

        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(), structHash)
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
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

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address signer)
    {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) {
            revert InvalidSignature();
        }

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
