// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperArena — real-time on-chain bomber arena
/// @notice Every move, bomb and explosion is an on-chain transaction.
///         Timed 60s lobbies -> live match -> winner-takes-all pot.
///         A port of the Send Arcade fully-on-chain game model to Robinhood
///         Chain. No rollup layer is needed: the L2's fast blocks are the
///         speed layer MagicBlock's ephemeral rollups provided on Solana.
///
/// Game design (locked 2026-09-30):
///  - Timed lobby windows (60s): everyone who joins in time plays.
///  - Winner-takes-all: entry fees form the pot, 5% protocol fee, rest to winner.
///  - Chaos tuning: short fuse, generous blast radius, chain detonations.
///  - Sudden death: if the match outlives its block budget, survivors split.
///  - Simultaneous final deaths: the last batch eliminated splits the pot.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ViperArena {
    // ---- Tunables ----
    uint8 public constant GRID = 11;          // 11x11 arena
    uint8 public constant MAX_PLAYERS = 16;
    uint8 public constant BLAST_RADIUS = 3;   // tiles in each direction
    uint256 public constant LOBBY_DURATION = 60; // seconds
    uint256 public constant FEE_BPS = 500;    // 5% protocol fee

    /// @dev Fuse and match length are measured in blocks so they track the
    ///      chain's real cadence. Calibrate against Robinhood Chain's actual
    ///      block time before mainnet: FUSE_BLOCKS ~= 2.5s of blocks.
    uint256 public immutable FUSE_BLOCKS;
    uint256 public immutable MAX_MATCH_BLOCKS;

    IERC20 public immutable stakeToken;
    uint256 public immutable entryFee;
    address public immutable treasury;

    enum Phase { Lobby, Live }

    struct Bomb {
        uint8 x;
        uint8 y;
        address planter;
        uint256 detonateAt; // block number
        bool live;
    }

    uint256 public matchId;
    Phase public phase;
    uint256 public lobbyEndsAt;
    uint256 public liveEndsAt; // block number
    address[] public players;
    Bomb[] public bombs;
    uint256 public pot;
    uint256 public aliveCount;
    uint256 public lastDeathBatch; // detonateAt of the latest death batch (SEC-04)
    address[] public lastDeaths;

    mapping(address => bool) public joined;
    mapping(address => bool) public alive;
    mapping(address => uint8) public px;
    mapping(address => uint8) public py;

    /// @notice Pull-payment ledger (SEC-03): winnings, splits, refunds and
    ///         fees are credited here instead of push-transferred during
    ///         settlement, so one failing recipient can't brick the match.
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
    ///         actions. A session key can never move funds: move/plantBomb
    ///         resolve it to its player; everything else keys off msg.sender.
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events: the client rebuilds all game state from these (SendRC pattern) ----
    event LobbyOpened(uint256 indexed matchId, uint256 closesAt);
    event PlayerJoined(uint256 indexed matchId, address indexed player);
    event MatchStarted(uint256 indexed matchId, uint256 playerCount);
    event MatchCancelled(uint256 indexed matchId);
    event PlayerMoved(uint256 indexed matchId, address indexed player, uint8 x, uint8 y);
    event BombPlanted(uint256 indexed matchId, address indexed player, uint8 x, uint8 y, uint256 detonateAt);
    event BombExploded(uint256 indexed matchId, uint8 x, uint8 y);
    event PlayerEliminated(uint256 indexed matchId, address indexed player);
    event MatchEnded(uint256 indexed matchId, address indexed winner, uint256 prize);
    event PotSplit(uint256 indexed matchId, uint256 recipients, uint256 shareEach);
    event Refunded(uint256 indexed matchId, address indexed player, uint256 amount);
    event WithdrawalCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event SessionAuthorized(uint256 indexed matchId, address indexed player, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(uint256 indexed matchId, address indexed player, address indexed sessionKey);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address _stakeToken,
        uint256 _entryFee,
        address _treasury,
        uint256 _fuseBlocks,
        uint256 _maxMatchBlocks
    ) {
        require(_stakeToken != address(0) && _treasury != address(0), "zero addr");
        require(_entryFee > 0 && _fuseBlocks > 0 && _maxMatchBlocks > 0, "zero param");
        stakeToken = IERC20(_stakeToken);
        entryFee = _entryFee;
        treasury = _treasury;
        FUSE_BLOCKS = _fuseBlocks;
        MAX_MATCH_BLOCKS = _maxMatchBlocks;
        _openLobby();
    }

    // ---- Lobby ----

    /// @notice Pay the entry fee to join the currently open lobby.
    function join() external nonReentrant {
        _join(address(0), 0);
    }

    /// @notice Join and authorize a session key for gameplay in one tx.
    ///         The key is scoped to this match and expires at `expiry`
    ///         (must be in the future, capped at MAX_SESSION_TTL).
    ///         Gameplay via the key costs zero wallet pop-ups; the key pays
    ///         its own gas from a native top-up the player sends it.
    function joinWithSession(address sessionKey, uint64 expiry) external nonReentrant {
        require(sessionKey != address(0), "zero session key");
        require(expiry > block.timestamp, "expiry in past");
        require(expiry <= block.timestamp + MAX_SESSION_TTL, "expiry too far");
        _join(sessionKey, expiry);
    }

    function _join(address sessionKey, uint64 expiry) internal {
        require(phase == Phase.Lobby, "lobby closed");
        require(!joined[msg.sender], "already joined");
        require(players.length < MAX_PLAYERS, "lobby full");
        if (players.length == 0) {
            // First joiner (re)starts the 60s countdown, so a lobby left
            // idle past expiry can't trap anyone in an instant-cancel (SEC-02).
            lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        } else {
            require(block.timestamp < lobbyEndsAt, "lobby closed");
        }
        require(stakeToken.transferFrom(msg.sender, address(this), entryFee), "fee failed");

        joined[msg.sender] = true;
        players.push(msg.sender);
        pot += entryFee;
        emit PlayerJoined(matchId, msg.sender);

        if (sessionKey != address(0)) {
            sessions[sessionKey] = SessionAuth(msg.sender, expiry, false, matchId);
            emit SessionAuthorized(matchId, msg.sender, sessionKey, expiry);
        }
    }

    /// @notice Anyone can start the match once the 60s window closes.
    ///         Fewer than 2 players -> everyone is refunded, new lobby opens.
    function startMatch() external nonReentrant {
        require(phase == Phase.Lobby, "not in lobby");
        require(block.timestamp >= lobbyEndsAt, "lobby still open");

        if (players.length < 2) {
            for (uint256 i = 0; i < players.length; i++) {
                // Pull-payment (SEC-03): credit the refund instead of
                // push-transferring it, so a failing recipient can't block
                // the lobby reset.
                _credit(players[i], entryFee);
                emit Refunded(matchId, players[i], entryFee);
            }
            emit MatchCancelled(matchId);
            _openLobby();
            return;
        }

        phase = Phase.Live;
        liveEndsAt = block.number + MAX_MATCH_BLOCKS;
        for (uint256 i = 0; i < players.length; i++) {
            (uint8 sx, uint8 sy) = _spawnPoint(i);
            px[players[i]] = sx;
            py[players[i]] = sy;
            alive[players[i]] = true;
        }
        aliveCount = players.length;
        emit MatchStarted(matchId, players.length);
    }

    // ---- Gameplay: every move and bomb is a transaction ----

    /// @notice Move one tile orthogonally. Callable directly by a joined
    ///         player or by their authorized session key (zero pop-ups).
    function move(int8 dx, int8 dy) external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        address player = _resolvePlayer(msg.sender);
        if (!alive[player]) {
            // Eliminated by this block's explosions: finalize the match
            // instead of reverting, so the death is not rolled back (SEC-01).
            _settle();
            return;
        }

        int16 nx = int16(int8(px[player])) + int16(dx);
        int16 ny = int16(int8(py[player])) + int16(dy);
        require(_abs(dx) + _abs(dy) == 1, "one orthogonal step");
        require(nx >= 0 && ny >= 0 && nx < int16(uint16(GRID)) && ny < int16(uint16(GRID)), "out of bounds");
        require(!_liveBombAt(_toU8(nx), _toU8(ny)), "tile has live bomb");

        px[player] = _toU8(nx);
        py[player] = _toU8(ny);
        emit PlayerMoved(matchId, player, _toU8(nx), _toU8(ny));
        _settle();
    }

    /// @notice Plant a bomb on your current tile. One live bomb per player.
    ///         Callable directly or via an authorized session key.
    function plantBomb() external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        address player = _resolvePlayer(msg.sender);
        if (!alive[player]) {
            // Eliminated by this block's explosions: finalize the match
            // instead of reverting, so the death is not rolled back (SEC-01).
            _settle();
            return;
        }
        require(!_hasLiveBomb(player), "already armed");
        require(!_liveBombAt(px[player], py[player]), "bomb already here");

        uint256 detonateAt = block.number + FUSE_BLOCKS;
        bombs.push(Bomb(px[player], py[player], player, detonateAt, true));
        emit BombPlanted(matchId, player, px[player], py[player], detonateAt);
        _settle();
    }

    /// @notice Advance the game: detonate due bombs, chain reactions, settle.
    ///         Anyone can call this; keeps the match moving without keepers.
    function poke() external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        _settle();
    }

    /// @notice Pull-payment: withdraw credited winnings, splits, refunds or
    ///         fees. The balance is zeroed BEFORE the transfer
    ///         (checks-effects-interactions), and a failing transfer only
    ///         reverts the caller's own claim — never match progression.
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(stakeToken.transfer(msg.sender, amount), "claim failed");
    }

    /// @notice Revoke a session key. Callable by the player who authorized
    ///         it, or by the session key itself (escape hatch if the browser
    ///         is compromised — kill the key on-chain).
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
    ///      unrevoked. Funds-moving functions (join, startMatch, claim)
    ///      never route through here: session keys can't touch tokens.
    ///      Note: callers who are neither joined nor authed revert here
    ///      ("no session"); use poke() for permissionless settling.
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

    /// @dev Pull-payment credit (SEC-03). Storage write + event only: can
    ///      never revert on a recipient's behalf, so settlement always
    ///      progresses. Called before _openLobby() so the event carries the
    ///      settled match's id.
    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit WithdrawalCredited(matchId, to, amount);
    }

    function _openLobby() internal {
        // Clear per-match player state before dropping the roster.
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            joined[p] = false;
            alive[p] = false;
        }
        delete players;
        delete bombs;
        delete lastDeaths;
        pot = 0;
        aliveCount = 0;
        lastDeathBatch = 0;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    /// @dev Lazily resolves explosions: no keeper needed, every gameplay
    ///      transaction first brings the world up to date. Due bombs detonate
    ///      in ascending detonateAt order (min-scan), so deaths batch by the
    ///      time they chronologically happened (SEC-04) instead of merging
    ///      into one block batch when a lazy poke processes several due
    ///      bombs at once.
    function _processExplosions() internal {
        bool anyDetonated;
        bool detonated;
        do {
            detonated = false;
            uint256 next = type(uint256).max;
            uint256 nextAt = type(uint256).max;
            for (uint256 i = 0; i < bombs.length; i++) {
                if (
                    bombs[i].live &&
                    block.number >= bombs[i].detonateAt &&
                    bombs[i].detonateAt < nextAt
                ) {
                    nextAt = bombs[i].detonateAt;
                    next = i;
                }
            }
            if (next != type(uint256).max) {
                _detonate(next, nextAt);
                detonated = true;
                anyDetonated = true;
            }
        } while (detonated);
        // SEC-05: drop tombstoned bombs so per-call scans stay O(live),
        // not O(ever-planted). Compaction runs here, never mid-detonation:
        // chain reactions address bombs by index while a blast resolves.
        if (anyDetonated) _compactBombs();
    }

    /// @dev Swap-and-pop removal of detonated (live=false) bombs.
    function _compactBombs() internal {
        uint256 i = 0;
        while (i < bombs.length) {
            if (bombs[i].live) {
                i++;
            } else {
                bombs[i] = bombs[bombs.length - 1];
                bombs.pop();
            }
        }
    }

    function _detonate(uint256 idx, uint256 batchId) internal {
        Bomb storage b = bombs[idx];
        b.live = false;
        emit BombExploded(matchId, b.x, b.y);

        _blastTile(b.x, b.y, batchId);
        int8[4] memory dxs = [int8(1), int8(-1), int8(0), int8(0)];
        int8[4] memory dys = [int8(0), int8(0), int8(1), int8(-1)];
        for (uint256 d = 0; d < 4; d++) {
            for (uint8 r = 1; r <= BLAST_RADIUS; r++) {
                int16 nx = int16(int8(b.x)) + dxs[d] * int16(uint16(r));
                int16 ny = int16(int8(b.y)) + dys[d] * int16(uint16(r));
                if (nx < 0 || ny < 0 || nx >= int16(uint16(GRID)) || ny >= int16(uint16(GRID))) break;
                _blastTile(_toU8(nx), _toU8(ny), batchId);
            }
        }
    }

    function _blastTile(uint8 x, uint8 y, uint256 batchId) internal {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (alive[p] && px[p] == x && py[p] == y) {
                alive[p] = false;
                aliveCount -= 1;
                _recordDeath(p, batchId);
                emit PlayerEliminated(matchId, p);
            }
        }
        // Chain-detonate any other live bomb caught in the blast: it explodes
        // "now", so its deaths land in their own latest batch (SEC-04).
        for (uint256 i = 0; i < bombs.length; i++) {
            if (bombs[i].live && bombs[i].x == x && bombs[i].y == y) {
                bombs[i].detonateAt = block.number;
            }
        }
    }

    function _recordDeath(address p, uint256 batchId) internal {
        if (batchId > lastDeathBatch) {
            lastDeathBatch = batchId;
            delete lastDeaths;
        }
        lastDeaths.push(p);
    }

    function _settle() internal {
        if (aliveCount == 1) {
            address winner;
            for (uint256 i = 0; i < players.length; i++) {
                if (alive[players[i]]) { winner = players[i]; break; }
            }
            uint256 fee = (pot * FEE_BPS) / 10000;
            uint256 prize = pot - fee;
            emit MatchEnded(matchId, winner, prize);
            // Pull-payment (SEC-03): credit before the lobby reset so the
            // WithdrawalCredited event carries the settled match's id. The
            // credit is a storage write, not a token transfer, so no
            // recipient can revert settlement.
            _credit(treasury, fee);
            _credit(winner, prize);
            _openLobby();
        } else if (aliveCount == 0) {
            // Simultaneous final deaths: the last batch eliminated splits it.
            _splitPot();
        } else if (block.number >= liveEndsAt) {
            // Sudden death: survivors split the pot.
            delete lastDeaths;
            for (uint256 i = 0; i < players.length; i++) {
                if (alive[players[i]]) lastDeaths.push(players[i]);
            }
            _splitPot();
        }
    }

    function _splitPot() internal {
        address[] memory recipients = lastDeaths; // copy: _openLobby wipes storage
        uint256 n = recipients.length;
        require(n > 0, "no recipients");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 share = (pot - fee) / n;
        // Integer-division remainder: sweep the dust to the treasury as
        // house seed instead of leaving it locked in the contract.
        uint256 dust = (pot - fee) % n;
        emit PotSplit(matchId, n, share);
        // Pull-payment (SEC-03): credit before the lobby reset so the
        // WithdrawalCredited events carry the settled match's id.
        _credit(treasury, fee);
        _credit(treasury, dust);
        for (uint256 i = 0; i < n; i++) {
            _credit(recipients[i], share);
        }
        _openLobby();
    }

    function _liveBombAt(uint8 x, uint8 y) internal view returns (bool) {
        for (uint256 i = 0; i < bombs.length; i++) {
            if (bombs[i].live && bombs[i].x == x && bombs[i].y == y) return true;
        }
        return false;
    }

    function _hasLiveBomb(address p) internal view returns (bool) {
        for (uint256 i = 0; i < bombs.length; i++) {
            if (bombs[i].live && bombs[i].planter == p) return true;
        }
        return false;
    }

    function _abs(int8 v) internal pure returns (int16) {
        return v >= 0 ? int16(v) : int16(-v);
    }

    /// @dev Safe after an explicit bounds check.
    function _toU8(int16 v) internal pure returns (uint8) {
        return uint8(uint16(v));
    }

    /// @dev 16 spread spawn points on the 11x11 grid, assigned by join order.
    function _spawnPoint(uint256 i) internal pure returns (uint8, uint8) {
        uint8[16] memory sx = [0, 10, 0, 10, 5, 5, 0, 10, 2, 8, 2, 8, 5, 5, 2, 8];
        uint8[16] memory sy = [0, 0, 10, 10, 0, 10, 5, 5, 2, 2, 8, 8, 2, 8, 5, 5];
        return (sx[i], sy[i]);
    }

    // ---- Views for the client ----

    function getPlayers() external view returns (address[] memory) { return players; }

    function getBombs() external view returns (Bomb[] memory) { return bombs; }

    /// @notice Whole match state in one call, so the client polls with a
    /// single eth_call instead of one per player (no multicall3 on this chain).
    function getMatchState()
        external
        view
        returns (
            address[] memory addrs,
            uint8[] memory xs,
            uint8[] memory ys,
            bool[] memory alives
        )
    {
        uint256 n = players.length;
        addrs = new address[](n);
        xs = new uint8[](n);
        ys = new uint8[](n);
        alives = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            addrs[i] = p;
            xs[i] = px[p];
            ys[i] = py[p];
            alives[i] = alive[p];
        }
    }

    function lobbyOpen() external view returns (bool) {
        return phase == Phase.Lobby && block.timestamp < lobbyEndsAt;
    }
}
