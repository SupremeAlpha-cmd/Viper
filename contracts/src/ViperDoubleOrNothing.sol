// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperDoubleOrNothing — solo vs the house coin flip
/// @notice Simplest game in the Viper arcade.
///         1. Player stakes VIPER and commits to a hidden choice: keccak256(choice, secret).
///         2. Player reveals within 50 blocks: flipReveal(choice, secret). Contract flips a fair coin.
///         3. Win -> payout 1.9x stake (2x minus 5% arcade fee), paid from bankroll. Lose -> stake goes to bankroll.
///         4. No reveal in 50 blocks -> stake reclaimable via refund().
///
/// Conventions:
///  - VIPER entry via approve+transferFrom
///  - 5% treasury fee on wins
///  - Pull-payment claims (SEC-03 pattern from ViperArena)
///  - No owner/admin privileges
///  - Self-funded session keys (commit + reveal with zero pop-ups after one auth)
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ViperDoubleOrNothing {
    // ---- Tunables ----
    uint256 public constant REVEAL_WINDOW_BLOCKS = 50;
    uint256 public constant FEE_BPS = 500;       // 5% protocol fee on 2x payout
    uint256 public constant MAX_STAKE_BPS = 1000; // 10% of bankroll
    uint64 public constant MAX_SESSION_TTL = 1 days;

    IERC20 public immutable stakeToken;
    address public immutable treasury;

    uint256 public bankroll;

    struct Flip {
        bytes32 commitment;
        uint256 stake;
        uint256 commitBlock;
        bool active;
    }

    struct SessionAuth {
        address player;
        uint64 expiry;
        bool revoked;
    }

    mapping(address => Flip) public flips;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events ----
    event FlipCommitted(address indexed player, bytes32 commitment, uint256 stake);
    event FlipRevealed(address indexed player, bool won, uint256 payout);
    event BankrollFunded(address indexed funder, uint256 amount);
    event Refunded(address indexed player, uint256 amount);
    event WithdrawalCredited(address indexed to, uint256 amount);
    event SessionAuthorized(address indexed player, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(address indexed player, address indexed sessionKey);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _stakeToken, address _treasury) {
        require(_stakeToken != address(0) && _treasury != address(0), "zero addr");
        stakeToken = IERC20(_stakeToken);
        treasury = _treasury;
    }

    // ---- Bankroll ----

    /// @notice Anyone can top up the bankroll (house liquidity).
    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(stakeToken.transferFrom(msg.sender, address(this), amount), "fund transfer failed");
        bankroll += amount;
        emit BankrollFunded(msg.sender, amount);
    }

    /// @notice Maximum allowed stake per flip (10% of bankroll).
    function maxStake() public view returns (uint256) {
        return (bankroll * MAX_STAKE_BPS) / 10000;
    }

    // ---- Game Loop ----

    /// @notice Commit to a flip with stake and commitment = keccak256(choice, secret).
    ///         Callable directly by player or by authorized session key.
    function flipCommit(uint256 stake, bytes32 commitment) public nonReentrant {
        address player = _resolvePlayer(msg.sender);
        _flipCommit(player, stake, commitment);
    }

    /// @notice Overload defaulting to maxStake() when stake argument omitted.
    function flipCommit(bytes32 commitment) external nonReentrant {
        address player = _resolvePlayer(msg.sender);
        _flipCommit(player, maxStake(), commitment);
    }

    /// @notice Authorize session key and commit in a single wallet transaction.
    function flipCommitWithSession(
        uint256 stake,
        bytes32 commitment,
        address sessionKey,
        uint64 expiry
    ) external nonReentrant {
        _authorizeSession(msg.sender, sessionKey, expiry);
        _flipCommit(msg.sender, stake, commitment);
    }

    function _flipCommit(address player, uint256 stake, bytes32 commitment) internal {
        require(commitment != bytes32(0), "empty commitment");
        require(!flips[player].active, "flip active");
        require(stake > 0, "zero stake");
        require(stake <= maxStake(), "stake exceeds max");

        require(stakeToken.transferFrom(player, address(this), stake), "stake transfer failed");

        flips[player] = Flip({
            commitment: commitment,
            stake: stake,
            commitBlock: block.number,
            active: true
        });

        emit FlipCommitted(player, commitment, stake);
    }

    /// @notice Reveal choice (0: heads, 1: tails) and secret within 50 blocks.
    ///         Contract flips a fair coin. Win -> 1.9x payout; Lose -> stake to bankroll.
    function flipReveal(uint8 choice, bytes32 secret) external nonReentrant {
        address player = _resolvePlayer(msg.sender);
        Flip memory f = flips[player];
        require(f.active, "no active flip");
        require(block.number <= f.commitBlock + REVEAL_WINDOW_BLOCKS, "reveal window expired");
        require(choice == 0 || choice == 1, "invalid choice");

        bytes32 packedHash = keccak256(abi.encodePacked(choice, secret));
        bytes32 encodeHash = keccak256(abi.encode(choice, secret));
        bytes32 uint256Packed = keccak256(abi.encodePacked(uint256(choice), secret));
        require(
            f.commitment == packedHash || f.commitment == encodeHash || f.commitment == uint256Packed,
            "invalid secret"
        );

        delete flips[player];

        uint8 coin = _flipCoin(player, secret, f.commitBlock);
        bool won = (choice == coin);

        uint256 payout = 0;
        if (won) {
            uint256 gross = f.stake * 2;
            uint256 fee = (gross * FEE_BPS) / 10000; // 5% arcade fee
            payout = gross - fee;                   // 1.9x stake

            require(bankroll >= f.stake, "bankroll insolvent");
            bankroll -= f.stake;

            _credit(player, payout);
            _credit(treasury, fee);
        } else {
            bankroll += f.stake;
        }

        emit FlipRevealed(player, won, payout);
    }

    /// @notice Reclaim stake if 50 blocks passed without reveal.
    function refund() external nonReentrant {
        address player = _resolvePlayer(msg.sender);
        _refund(player);
    }

    /// @notice Rescue an expired flip for any player.
    function refund(address player) external nonReentrant {
        _refund(player);
    }

    function _refund(address player) internal {
        Flip memory f = flips[player];
        require(f.active, "no active flip");
        require(block.number > f.commitBlock + REVEAL_WINDOW_BLOCKS, "reveal window active");

        delete flips[player];
        _credit(player, f.stake);
        emit Refunded(player, f.stake);
    }

    // ---- Pull-Payment Claims ----

    /// @notice Withdraw credited winnings or refunds.
    ///         Checks-effects-interactions: zero balance before transfer.
    ///         Callable only by the wallet directly (session keys cannot claim).
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(stakeToken.transfer(msg.sender, amount), "claim failed");
    }

    // ---- Session Keys ----

    /// @notice Authorize an ephemeral browser key for gameplay-only actions.
    function authorizeSession(address sessionKey, uint64 expiry) external nonReentrant {
        _authorizeSession(msg.sender, sessionKey, expiry);
    }

    function _authorizeSession(address player, address sessionKey, uint64 expiry) internal {
        require(sessionKey != address(0), "zero session key");
        require(expiry > block.timestamp, "expiry in past");
        require(expiry <= block.timestamp + MAX_SESSION_TTL, "expiry too far");
        sessions[sessionKey] = SessionAuth({
            player: player,
            expiry: expiry,
            revoked: false
        });
        emit SessionAuthorized(player, sessionKey, expiry);
    }

    /// @notice Revoke a session key. Callable by player or session key itself.
    function revokeSession(address sessionKey) external nonReentrant {
        SessionAuth storage s = sessions[sessionKey];
        require(s.player != address(0), "unknown session");
        require(msg.sender == s.player || msg.sender == sessionKey, "not authorized");
        require(!s.revoked, "already revoked");
        s.revoked = true;
        emit SessionRevoked(s.player, sessionKey);
    }

    // ---- Internals & Helpers ----

    function _resolvePlayer(address sender) internal view returns (address) {
        SessionAuth memory s = sessions[sender];
        if (s.player != address(0)) {
            require(!s.revoked, "session revoked");
            require(block.timestamp <= s.expiry, "session expired");
            return s.player;
        }
        return sender;
    }

    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit WithdrawalCredited(to, amount);
    }

    function _flipCoin(address player, bytes32 secret, uint256 commitBlock) internal view returns (uint8) {
        bytes32 bHash = blockhash(commitBlock);
        return uint8(uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            bHash,
            player,
            secret,
            commitBlock
        ))) % 2);
    }

    /// @notice View helper to check coin flip outcome for testing or verification.
    function getCoin(address player, bytes32 secret, uint256 commitBlock) external view returns (uint8) {
        return _flipCoin(player, secret, commitBlock);
    }

    /// @notice View flip state for a player.
    function getFlip(address player) external view returns (bytes32 commitment, uint256 stake, uint256 commitBlock, bool active) {
        Flip memory f = flips[player];
        return (f.commitment, f.stake, f.commitBlock, f.active);
    }

    /// @notice Check if a session key is currently valid.
    function isSessionValid(address sessionKey) external view returns (bool) {
        SessionAuth memory s = sessions[sessionKey];
        return (s.player != address(0) && !s.revoked && block.timestamp <= s.expiry);
    }
}
