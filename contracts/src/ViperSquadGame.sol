// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperSquadGame — big-lobby squid-style survival rounds
/// @notice Up to 32 players stake VIPER in a 60s lobby, then play Red Light /
///         Green Light elimination rounds. Each round opens a check-in window:
///         every alive player must call survive() once (green light). When the
///         window closes, anyone who missed it is eliminated (red light), and
///         the SLOWEST QUARTILE of check-ins is eliminated too.
///
///         Elimination is fully deterministic from on-chain check-in
///         timestamps — no randomness, so no resolver MEV (a resolver can't
///         shop for a favorable block the way blockhash-picked victims would
///         allow). Ties break by join order (earlier joiner ranks faster).
///         Every round eliminates at least one player, so the game always
///         converges; an eliminated player's stake forfeits into the pot,
///         concentrating it over fewer survivors.
///
///         Session keys are the default path: joinWithSession authorizes a
///         browser-held key once, then survive() calls go through it with zero
///         wallet pop-ups (same SessionAuth pattern as ViperSnake).
///         Entry fees in USDG. Last player standing takes the USDG pot (5%
///         protocol fee) PLUS the fixed VIPER winner bonus. Simultaneous
///         final wipe -> last batch splits the pot (bonus split equally).
///         Optional NFT pass: passNFT holders enter at passFee (0 = free).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
}

contract ViperSquadGame {
    // ---- Tunables ----
    uint256 public constant FEE_BPS = 500; // 5% protocol fee
    uint256 public constant LOBBY_DURATION = 60; // seconds

    /// @notice Elimination reasons, surfaced in PlayerEliminated events.
    uint8 public constant REASON_MISSED_WINDOW = 0;
    uint8 public constant REASON_SLOWEST = 1;

    IERC20 public immutable usdg;
    uint256 public immutable entryFee;
    address public immutable treasury;

    /// @notice VIPER token paying the fixed winner bonus (18 decimals).
    IERC20 public immutable viper;
    /// @notice Rewards-pool holder expected to fund the VIPER bonus reserve.
    address public immutable rewardsPool;
    /// @notice Fixed VIPER bonus per match win. Single winner takes it all;
    ///         the final-batch split divides it equally. Not USD-pegged.
    uint256 public constant BONUS_PER_WIN = 6000 * 1e18;

    /// @notice VIPER bonuses credited but not yet claimed via claimViper().
    mapping(address => uint256) public pendingViperBonus;
    /// @notice Sum of all unclaimed VIPER bonuses. Invariant:
    ///         viperBonusOwed <= viper.balanceOf(address(this)).
    uint256 public viperBonusOwed;
    uint8 public immutable maxPlayers;
    uint8 public immutable minPlayers;
    uint256 public immutable roundDuration;
    IERC721 public immutable passNFT; // zero address = open entry
    uint256 public immutable passFee; // entry fee for pass holders (0 = free)

    enum Phase { Lobby, Live }

    uint256 public matchId;
    Phase public phase;
    uint256 public lobbyEndsAt;
    uint256 public round; // 1-based while live
    uint256 public roundEndsAt; // green-light window close for the current round
    address[] public players;
    uint256 public pot;
    uint256 public aliveCount;
    uint256 public checkInCount; // check-ins recorded this round
    address[] public lastEliminated; // final batch, for the 0-alive split

    mapping(address => bool) public joined;
    mapping(address => bool) public alive;
    mapping(address => bool) public checkedIn; // checked in this round
    mapping(address => uint256) public checkInTime; // first check-in timestamp
    mapping(address => uint256) public joinIndex; // join order (tie-break)
    mapping(address => uint256) public paidFee; // entry fee actually paid

    /// @notice Pull-payment ledger (same as ViperSnake): winnings, splits,
    ///         refunds and fees are credited here instead of push-transferred
    ///         during settlement, so one failing recipient can't brick the match.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Maximum session-key lifetime. Bounds the compromise window of
    ///         a browser-held key. Matches last minutes; a day is generous.
    uint64 public constant MAX_SESSION_TTL = 1 days;

    struct SessionAuth {
        address player;
        uint64 expiry;
        bool revoked;
        uint256 authMatchId; // keys only work in the match they joined
    }

    /// @notice Browser-held session keys authorized for gameplay-only
    ///         actions. A session key can never move funds: survive() resolves
    ///         it to its player; everything else keys off msg.sender.
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events: the client rebuilds game state from these + getMatchState ----
    event LobbyOpened(uint256 indexed matchId, uint256 closesAt);
    event PlayerJoined(uint256 indexed matchId, address indexed player, uint256 feePaid);
    event MatchStarted(uint256 indexed matchId, uint256 playerCount, uint256 roundEndsAt);
    event MatchCancelled(uint256 indexed matchId);
    event CheckedIn(uint256 indexed matchId, uint256 indexed round, address indexed player, uint256 at);
    event RoundResolved(uint256 indexed matchId, uint256 indexed round, uint256 eliminated);
    event PlayerEliminated(uint256 indexed matchId, uint256 indexed round, address indexed player, uint8 reason);
    event MatchEnded(uint256 indexed matchId, address indexed winner, uint256 prize);
    event PotSplit(uint256 indexed matchId, uint256 recipients, uint256 shareEach);
    event Refunded(uint256 indexed matchId, address indexed player, uint256 amount);
    event WithdrawalCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event ViperBonusCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event BonusShortfall(uint256 indexed matchId, address indexed to, uint256 needed, uint256 credited);
    event ViperFunded(address indexed funder, uint256 amount);
    event SessionAuthorized(uint256 indexed matchId, address indexed player, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(uint256 indexed matchId, address indexed player, address indexed sessionKey);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address _usdg,
        address _viper,
        uint256 _entryFee,
        address _treasury,
        address _rewardsPool,
        uint8 _maxPlayers,
        uint8 _minPlayers,
        uint256 _roundDuration,
        address _passNFT,
        uint256 _passFee
    ) {
        require(
            _usdg != address(0) && _viper != address(0) &&
            _treasury != address(0) && _rewardsPool != address(0),
            "zero addr"
        );
        require(_entryFee > 0, "zero entry");
        require(_maxPlayers >= 2 && _minPlayers >= 2 && _minPlayers <= _maxPlayers, "bad player bounds");
        require(_roundDuration >= 10, "round too short");
        require(_passFee <= _entryFee, "pass fee > entry");
        usdg = IERC20(_usdg);
        viper = IERC20(_viper);
        entryFee = _entryFee;
        treasury = _treasury;
        rewardsPool = _rewardsPool;
        maxPlayers = _maxPlayers;
        minPlayers = _minPlayers;
        roundDuration = _roundDuration;
        passNFT = IERC721(_passNFT);
        passFee = _passFee;
        _openLobby();
    }

    // ---- VIPER bonus reserve ----

    /// @notice Top up the VIPER winner-bonus reserve (approve + transferFrom).
    ///         In practice the rewards pool funds this; anyone may top up.
    ///         A plain VIPER transfer to the contract works too.
    function fundViper(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(viper.transferFrom(msg.sender, address(this), amount), "fund transfer failed");
        emit ViperFunded(msg.sender, amount);
    }

    /// @notice Claim credited VIPER winner bonuses. Pull-payment: balance
    ///         zeroed BEFORE the transfer; a failing transfer only reverts
    ///         the caller's own claim.
    function claimViper() external nonReentrant {
        uint256 amount = pendingViperBonus[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingViperBonus[msg.sender] = 0;
        viperBonusOwed -= amount;
        require(viper.transfer(msg.sender, amount), "claim failed");
    }

    // ---- Lobby ----

    /// @notice Pay the entry fee to join the currently open lobby.
    ///         NFT pass holders (when passNFT is set) pay passFee instead.
    function join() external nonReentrant {
        _join(address(0), 0);
    }

    /// @notice Join and authorize a session key for gameplay in one tx.
    ///         The key is scoped to this match and expires at `expiry`.
    function joinWithSession(address sessionKey, uint64 expiry) external nonReentrant {
        require(sessionKey != address(0), "zero session key");
        require(expiry > block.timestamp, "expiry in past");
        require(expiry <= block.timestamp + MAX_SESSION_TTL, "expiry too far");
        _join(sessionKey, expiry);
    }

    function _join(address sessionKey, uint64 expiry) internal {
        require(phase == Phase.Lobby, "lobby closed");
        require(!joined[msg.sender], "already joined");
        require(players.length < maxPlayers, "lobby full");
        if (players.length == 0) {
            // First joiner (re)starts the 60s countdown, so a lobby left
            // idle past expiry can't trap anyone in an instant-cancel.
            lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        } else {
            require(block.timestamp < lobbyEndsAt, "lobby closed");
        }

        uint256 fee = entryFee;
        if (address(passNFT) != address(0) && passNFT.balanceOf(msg.sender) > 0) {
            fee = passFee;
        }
        if (fee > 0) {
            require(usdg.transferFrom(msg.sender, address(this), fee), "fee failed");
        }

        joinIndex[msg.sender] = players.length;
        joined[msg.sender] = true;
        alive[msg.sender] = true;
        paidFee[msg.sender] = fee;
        players.push(msg.sender);
        pot += fee;
        emit PlayerJoined(matchId, msg.sender, fee);

        if (sessionKey != address(0)) {
            sessions[sessionKey] = SessionAuth(msg.sender, expiry, false, matchId);
            emit SessionAuthorized(matchId, msg.sender, sessionKey, expiry);
        }
    }

    /// @notice Anyone can start the match once the 60s window closes.
    ///         Fewer than minPlayers -> everyone is refunded, new lobby opens.
    function startMatch() external nonReentrant {
        require(phase == Phase.Lobby, "not in lobby");
        require(block.timestamp >= lobbyEndsAt, "lobby still open");

        if (players.length < minPlayers) {
            for (uint256 i = 0; i < players.length; i++) {
                uint256 fee = paidFee[players[i]];
                _credit(players[i], fee);
                emit Refunded(matchId, players[i], fee);
            }
            emit MatchCancelled(matchId);
            _openLobby();
            return;
        }

        phase = Phase.Live;
        round = 1;
        roundEndsAt = block.timestamp + roundDuration;
        aliveCount = players.length;
        emit MatchStarted(matchId, players.length, roundEndsAt);
    }

    // ---- Gameplay: red light / green light ----

    /// @notice Check in for the current round (green light). First check-in
    ///         timestamp counts; later ones are rejected. Callable directly
    ///         or via an authorized session key (zero pop-ups). If the round
    ///         window already closed, the round resolves first (lazy,
    ///         keeperless) and the check-in lands in the new round — unless
    ///         the player was eliminated or the match settled in between.
    function survive() external nonReentrant {
        require(phase == Phase.Live, "not live");
        address player = _resolvePlayer(msg.sender);
        require(alive[player], "eliminated");
        _resolveRoundIfDue();
        if (phase != Phase.Live) return; // match settled during resolve
        if (!alive[player]) return; // eliminated in the just-resolved round
        require(!checkedIn[player], "already checked in");
        checkedIn[player] = true;
        checkInTime[player] = block.timestamp;
        checkInCount += 1;
        emit CheckedIn(matchId, round, player, block.timestamp);
    }

    /// @notice Resolve the current round once its window closes. Anyone can
    ///         call; also runs automatically at the top of survive().
    function resolveRound() external nonReentrant {
        require(phase == Phase.Live, "not live");
        require(block.timestamp >= roundEndsAt, "round not due");
        _resolveRound();
    }

    /// @dev Lazy path: resolve at most one due round. Called at the top of
    ///      survive() so gameplay txs keep the match moving.
    function _resolveRoundIfDue() internal {
        if (phase == Phase.Live && block.timestamp >= roundEndsAt) {
            _resolveRound();
        }
    }

    function _resolveRound() internal {
        // Fresh batch each round: lastEliminated doubles as the "final batch"
        // for the 0-alive split and as this round's elimination count.
        delete lastEliminated;

        // 1. Missed the window -> eliminated (red light).
        uint256 checked = 0;
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!alive[p]) continue;
            if (checkedIn[p]) {
                checked += 1;
            } else {
                _eliminate(p, REASON_MISSED_WINDOW);
            }
        }

        // 2. Slowest quartile of check-ins -> eliminated. The lone checker
        //    of a round survives it.
        if (checked >= 2) {
            uint256 k = (checked + 3) / 4; // ceil(checked / 4)
            // Insertion sort of the checked-in, by (checkInTime, joinIndex)
            // ascending: earlier check-in — and earlier join on ties — ranks
            // "faster". 32 players max, so O(n^2) is cheap.
            address[] memory ordered = new address[](checked);
            uint256 o = 0;
            for (uint256 i = 0; i < players.length; i++) {
                address p = players[i];
                if (alive[p] && checkedIn[p]) ordered[o++] = p;
            }
            for (uint256 i = 1; i < checked; i++) {
                address key = ordered[i];
                uint256 j = i;
                // Ascending: the element before key shifts right while it is
                // SLOWER than key, so the slowest end up at the tail.
                while (j > 0 && _slower(ordered[j - 1], key)) {
                    ordered[j] = ordered[j - 1];
                    j--;
                }
                ordered[j] = key;
            }
            for (uint256 i = checked - k; i < checked; i++) {
                _eliminate(ordered[i], REASON_SLOWEST);
            }
        }

        emit RoundResolved(matchId, round, lastEliminated.length);

        if (aliveCount == 1) {
            address winner;
            for (uint256 i = 0; i < players.length; i++) {
                if (alive[players[i]]) { winner = players[i]; break; }
            }
            uint256 fee = (pot * FEE_BPS) / 10000;
            uint256 prize = pot - fee;
            emit MatchEnded(matchId, winner, prize);
            _credit(treasury, fee);
            _credit(winner, prize);
            _creditViper(winner, BONUS_PER_WIN);
            _openLobby();
        } else if (aliveCount == 0) {
            // Everybody AFK in the final round: the last batch splits equally.
            _splitPotEqual();
        } else {
            // Next round: fresh window, check-ins reset.
            round += 1;
            roundEndsAt = block.timestamp + roundDuration;
            checkInCount = 0;
            for (uint256 i = 0; i < players.length; i++) {
                address p = players[i];
                checkedIn[p] = false;
                checkInTime[p] = 0;
            }
        }
    }

    /// @dev True if `a` ranks slower than `b`: later check-in, or same
    ///      timestamp but later join.
    function _slower(address a, address b) internal view returns (bool) {
        if (checkInTime[a] != checkInTime[b]) return checkInTime[a] > checkInTime[b];
        return joinIndex[a] > joinIndex[b];
    }

    function _eliminate(address p, uint8 reason) internal {
        if (!alive[p]) return;
        alive[p] = false;
        aliveCount -= 1;
        lastEliminated.push(p);
        emit PlayerEliminated(matchId, round, p, reason);
    }

    function _splitPotEqual() internal {
        address[] memory recipients = lastEliminated; // copy: _openLobby wipes storage
        uint256 n = recipients.length;
        require(n > 0, "no recipients");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 share = (pot - fee) / n;
        uint256 dust = (pot - fee) % n;
        // VIPER bonus follows the same equal split (VIPER dust stays as reserve).
        uint256 bonusShare = BONUS_PER_WIN / n;
        emit PotSplit(matchId, n, share);
        _credit(treasury, fee);
        _credit(treasury, dust);
        for (uint256 i = 0; i < n; i++) {
            _credit(recipients[i], share);
            _creditViper(recipients[i], bonusShare);
        }
        _openLobby();
    }

    /// @notice Pull-payment: withdraw credited USDG winnings, splits, refunds or
    ///         fees. Balance zeroed BEFORE the transfer; a failing transfer
    ///         only reverts the caller's own claim.
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(usdg.transfer(msg.sender, amount), "claim failed");
    }

    /// @notice Revoke a session key. Callable by the player who authorized
    ///         it, or by the session key itself (escape hatch).
    function revokeSession(address sessionKey) external nonReentrant {
        SessionAuth storage s = sessions[sessionKey];
        require(s.player != address(0), "unknown session");
        require(msg.sender == s.player || msg.sender == sessionKey, "not authorized");
        require(!s.revoked, "already revoked");
        s.revoked = true;
        emit SessionRevoked(s.authMatchId, s.player, sessionKey);
    }

    // ---- Internals ----

    /// @dev Resolve a gameplay caller to its player. Direct joiners act as
    ///      themselves; an authorized session key acts as its player — but
    ///      only in the match it was authorized for, while unexpired and
    ///      unrevoked. Funds-moving functions never route through here.
    function _resolvePlayer(address sender) internal view returns (address) {
        if (joined[sender]) return sender;
        SessionAuth memory s = sessions[sender];
        require(
            s.player != address(0) &&
            !s.revoked &&
            s.authMatchId == matchId &&
            block.timestamp <= s.expiry,
            "no session"
        );
        return s.player;
    }

    /// @dev Pull-payment credit. Storage write + event only: can never
    ///      revert on a recipient's behalf. Called before _openLobby() so
    ///      the event carries the settled match's id.
    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit WithdrawalCredited(matchId, to, amount);
    }

    /// @dev Credit a VIPER winner bonus from the rewards reserve. The credit
    ///      is capped at the funded-but-unclaimed reserve: if the pool hasn't
    ///      funded enough, the bonus degrades to a BonusShortfall event and
    ///      the USDG game continues untouched. VIPER dust from splits stays
    ///      in the contract as future bonus reserve.
    function _creditViper(address to, uint256 amount) internal {
        if (amount == 0) return;
        uint256 bal = viper.balanceOf(address(this));
        uint256 available = bal > viperBonusOwed ? bal - viperBonusOwed : 0;
        uint256 credit = amount > available ? available : amount;
        if (credit < amount) emit BonusShortfall(matchId, to, amount, credit);
        if (credit == 0) return;
        pendingViperBonus[to] += credit;
        viperBonusOwed += credit;
        emit ViperBonusCredited(matchId, to, credit);
    }

    function _openLobby() internal {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            joined[p] = false;
            alive[p] = false;
            checkedIn[p] = false;
            checkInTime[p] = 0;
            joinIndex[p] = 0;
            paidFee[p] = 0;
        }
        delete players;
        delete lastEliminated;
        pot = 0;
        aliveCount = 0;
        checkInCount = 0;
        round = 0;
        roundEndsAt = 0;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    // ---- Views for the client ----

    function getPlayers() external view returns (address[] memory) { return players; }

    /// @notice Whole match state in one call, so the client polls with a
    ///         single eth_call instead of one per player (no multicall3 on
    ///         this chain).
    function getMatchState()
        external
        view
        returns (
            address[] memory addrs,
            bool[] memory alives,
            bool[] memory checkedIns,
            uint256[] memory checkInTimes,
            uint256[] memory paidFees,
            uint256 roundOut,
            uint256 roundEndsAtOut,
            uint256 aliveCountOut,
            uint256 potOut,
            uint256 checkInCountOut
        )
    {
        uint256 n = players.length;
        addrs = new address[](n);
        alives = new bool[](n);
        checkedIns = new bool[](n);
        checkInTimes = new uint256[](n);
        paidFees = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            addrs[i] = p;
            alives[i] = alive[p];
            checkedIns[i] = checkedIn[p];
            checkInTimes[i] = checkInTime[p];
            paidFees[i] = paidFee[p];
        }
        roundOut = round;
        roundEndsAtOut = roundEndsAt;
        aliveCountOut = aliveCount;
        potOut = pot;
        checkInCountOut = checkInCount;
    }

    function lobbyOpen() external view returns (bool) {
        return phase == Phase.Lobby && block.timestamp < lobbyEndsAt;
    }

    /// @notice True when the pass-NFT gate is active (non-zero contract).
    function passEnabled() external view returns (bool) {
        return address(passNFT) != address(0);
    }
}
