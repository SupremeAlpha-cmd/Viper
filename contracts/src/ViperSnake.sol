// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperSnake — slither-style multiplayer snake arena
/// @notice Direction commits, not moves: every snake auto-advances one cell
///         per tick (1 tick = 1 block) in its current heading. Players only
///         transact to TURN (setDirection) or toggle BOOST (setBoost) — a
///         straight-line run costs zero transactions. This is the fix for
///         "every step you stop and transact".
///
///         Session keys are the default path: joinWithSession authorizes a
///         browser-held key once, then turns/boosts go through it with zero
///         wallet pop-ups (same SessionAuth pattern as ViperArena).
///
///         Staked in VIPER. Timed 60s lobbies -> live match -> last snake
///         alive takes the pot (5% protocol fee). Timeout -> score-weighted
///         split. Simultaneous final deaths -> last batch splits.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ViperSnake {
    // ---- Tunables ----
    uint8 public constant GRID = 24;
    uint8 public constant MAX_PLAYERS = 8;
    uint256 public constant FEE_BPS = 500; // 5% protocol fee
    uint256 public constant LOBBY_DURATION = 60; // seconds
    uint8 public constant START_LENGTH = 3;
    uint8 public constant COIN_TARGET = 8; // coins kept on the board
    uint8 public constant SCATTER_MAX = 16; // max coins scattered per death
    uint256 public constant MAX_TICKS_PER_POKE = 30; // gas bound per poke

    /// @dev Ticks are measured in blocks so they track the chain's real
    ///      cadence. Calibrate MATCH_TICKS against Robinhood Chain's actual
    ///      block time before mainnet: a tick should feel like one snake
    ///      step (~1s).
    uint256 public immutable MATCH_TICKS;

    IERC20 public immutable stakeToken;
    uint256 public immutable entryFee;
    address public immutable treasury;

    enum Phase { Lobby, Live }

    // Directions: 0 = up (-y), 1 = right (+x), 2 = down (+y), 3 = left (-x)
    uint8 private constant UP = 0;
    uint8 private constant RIGHT = 1;
    uint8 private constant DOWN = 2;
    uint8 private constant LEFT = 3;

    uint256 public matchId;
    Phase public phase;
    uint256 public lobbyEndsAt;
    uint256 public startBlock; // block the live match started
    uint256 public currentTick; // ticks processed so far
    uint256 public liveEndsAt; // startBlock + MATCH_TICKS (client display)
    address[] public players;
    uint256 public pot;
    uint256 public aliveCount;
    uint256 public lastDeathBatch; // tick of the latest death batch
    address[] public lastDeaths;
    uint256 public coinsSpawned; // entropy counter for deterministic spawns

    mapping(address => bool) public joined;
    mapping(address => bool) public alive;
    mapping(address => uint8) public direction; // current heading
    mapping(address => uint8) public pendingDir; // committed heading, applies next tick
    mapping(address => bool) public hasPendingDir;
    mapping(address => bool) public boost; // boost flag, applies from next tick
    mapping(address => uint256) public score; // coins eaten — only set in tick processing
    mapping(address => uint256) public lastCommitTick; // one direction commit per tick
    /// @dev Packed xy cells (x << 8 | y), head-first. Head = segments[p][0].
    mapping(address => uint16[]) public segments;
    /// @dev Packed xy coin cells.
    uint16[] public coins;

    /// @notice Pull-payment ledger (same as ViperArena): winnings, splits,
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
    ///         actions. A session key can never move funds: setDirection /
    ///         setBoost resolve it to its player; everything else keys off
    ///         msg.sender.
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events: the client rebuilds game state from these + getMatchState ----
    event LobbyOpened(uint256 indexed matchId, uint256 closesAt);
    event PlayerJoined(uint256 indexed matchId, address indexed player);
    event MatchStarted(uint256 indexed matchId, uint256 playerCount);
    event MatchCancelled(uint256 indexed matchId);
    event DirectionCommitted(uint256 indexed matchId, address indexed player, uint8 direction);
    event BoostSet(uint256 indexed matchId, address indexed player, bool boost);
    event CoinEaten(uint256 indexed matchId, address indexed player, uint8 x, uint8 y, uint256 score);
    event CoinSpawned(uint256 indexed matchId, uint8 x, uint8 y);
    event SnakeEliminated(uint256 indexed matchId, address indexed player);
    event MatchEnded(uint256 indexed matchId, address indexed winner, uint256 prize);
    event PotSplit(uint256 indexed matchId, uint256 recipients, uint256 shareEach);
    event PotSplitWeighted(uint256 indexed matchId, uint256 recipients);
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
        uint256 _matchTicks
    ) {
        require(_stakeToken != address(0) && _treasury != address(0), "zero addr");
        require(_entryFee > 0 && _matchTicks > 0, "zero param");
        stakeToken = IERC20(_stakeToken);
        entryFee = _entryFee;
        treasury = _treasury;
        MATCH_TICKS = _matchTicks;
        _openLobby();
    }

    // ---- Lobby ----

    /// @notice Pay the entry fee to join the currently open lobby.
    function join() external nonReentrant {
        _join(address(0), 0);
    }

    /// @notice Join and authorize a session key for gameplay in one tx.
    ///         The key is scoped to this match and expires at `expiry`.
    ///         Turns and boosts via the key cost zero wallet pop-ups; the key
    ///         pays its own gas from a native top-up the player sends it.
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
            // idle past expiry can't trap anyone in an instant-cancel.
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
                _credit(players[i], entryFee);
                emit Refunded(matchId, players[i], entryFee);
            }
            emit MatchCancelled(matchId);
            _openLobby();
            return;
        }

        phase = Phase.Live;
        startBlock = block.number;
        liveEndsAt = block.number + MATCH_TICKS;
        currentTick = 0;
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            (uint8 sx, uint8 sy, uint8 dir) = _spawnPoint(i);
            direction[p] = dir;
            // Body extends opposite to the heading, head-first.
            for (uint8 s = 0; s < START_LENGTH; s++) {
                (uint8 bx, uint8 by) = _stepBack(sx, sy, dir, s);
                segments[p].push(_pack(bx, by));
            }
            alive[p] = true;
        }
        aliveCount = players.length;
        // Seed the board with coins.
        for (uint256 i = 0; i < COIN_TARGET; i++) _spawnCoin();
        emit MatchStarted(matchId, players.length);
    }

    // ---- Gameplay: direction commits, not moves ----

    /// @notice Commit a new heading. Takes effect at the NEXT tick, never
    ///         the current one — no same-tick double-turns, no rewriting
    ///         history. One commit per tick max. 180-degree reversals revert
    ///         (can't turn into your own neck). Callable directly or via an
    ///         authorized session key (zero pop-ups).
    function setDirection(uint8 dir) external nonReentrant {
        require(phase == Phase.Live, "not live");
        require(dir <= 3, "bad direction");
        _advanceTicks();
        address player = _resolvePlayer(msg.sender);
        if (!alive[player]) {
            // Eliminated while ticks caught up: finalize instead of
            // reverting, so the death is not rolled back.
            _settle();
            return;
        }
        require(currentTick > lastCommitTick[player], "one commit per tick");
        uint8 cur = direction[player];
        require(dir != (cur + 2) % 4, "no 180 turn");
        pendingDir[player] = dir;
        hasPendingDir[player] = true;
        lastCommitTick[player] = currentTick;
        emit DirectionCommitted(matchId, player, dir);
        _settle();
    }

    /// @notice Toggle boost. While on, the snake moves 2 cells per tick and
    ///         burns 1 length per boosted tick (no boost at length 1).
    ///         Slither-style: hold to go faster. Callable directly or via an
    ///         authorized session key.
    function setBoost(bool b) external nonReentrant {
        require(phase == Phase.Live, "not live");
        _advanceTicks();
        address player = _resolvePlayer(msg.sender);
        if (!alive[player]) {
            _settle();
            return;
        }
        boost[player] = b;
        emit BoostSet(matchId, player, b);
        _settle();
    }

    /// @notice Advance the game clock: processes missed ticks (movement,
    ///         coins, collisions) in tick order, then settles. Anyone can
    ///         call this; keeps the match moving without keepers. Ticks per
    ///         call are capped so one poke can't run out of gas.
    function poke() external nonReentrant {
        require(phase == Phase.Live, "not live");
        _advanceTicks();
        _settle();
    }

    /// @notice Pull-payment: withdraw credited winnings, splits, refunds or
    ///         fees. Balance zeroed BEFORE the transfer; a failing transfer
    ///         only reverts the caller's own claim.
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(stakeToken.transfer(msg.sender, amount), "claim failed");
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

    function _openLobby() internal {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            joined[p] = false;
            alive[p] = false;
            hasPendingDir[p] = false;
            boost[p] = false;
            score[p] = 0;
            lastCommitTick[p] = 0;
            delete segments[p];
        }
        delete players;
        delete coins;
        delete lastDeaths;
        pot = 0;
        aliveCount = 0;
        currentTick = 0;
        startBlock = 0;
        liveEndsAt = 0;
        lastDeathBatch = 0;
        coinsSpawned = 0;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    /// @dev Lazily advances the world clock. 1 tick = 1 block; processes at
    ///      most MAX_TICKS_PER_POKE per call and relies on frequent
    ///      permissionless pokes (every gameplay tx pokes first).
    function _advanceTicks() internal {
        if (phase != Phase.Live) return;
        uint256 target = block.number - startBlock;
        if (target > MATCH_TICKS) target = MATCH_TICKS;
        uint256 remaining = target > currentTick ? target - currentTick : 0;
        uint256 n = remaining > MAX_TICKS_PER_POKE ? MAX_TICKS_PER_POKE : remaining;
        for (uint256 i = 0; i < n; i++) {
            _processTick();
            currentTick += 1;
            if (aliveCount <= 1) break;
        }
    }

    /// @dev Per-tick scratch state, passed as one memory reference so the
    ///      move pipeline stays under the stack limit.
    struct TickCtx {
        uint256[9] occ; // occupancy bitmap (tail tips excluded)
        uint16[] newHeads; // new head cells claimed this tick
        address[] newHeadOwners;
        uint256 headCount;
    }

    /// @dev One tick: apply pending directions, build the occupancy bitmap,
    ///      move every snake (boost = 2 steps, burns 1 length), resolve
    ///      coins and collisions, respawn coins to COIN_TARGET.
    function _processTick() internal {
        // 1. Pending direction commits take effect now (never retroactively).
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (alive[p] && hasPendingDir[p]) {
                direction[p] = pendingDir[p];
                hasPendingDir[p] = false;
            }
        }

        // 2. Occupancy bitmap, 24x24 = 576 bits in 9 words. Tail tips are
        //    excluded: they vacate this tick (a snake that grows keeps its
        //    tail, so hitting a growing tail is a missed kill, never an
        //    unfair death).
        TickCtx memory ctx;
        // 2 head claims per player max (boost = 2 steps per tick).
        ctx.newHeads = new uint16[](players.length * 2);
        ctx.newHeadOwners = new address[](players.length * 2);
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!alive[p]) continue;
            uint16[] storage segs = segments[p];
            uint256 mark = segs.length > 1 ? segs.length - 1 : 0;
            for (uint256 j = 0; j < mark; j++) {
                _bitSet(ctx.occ, segs[j], true);
            }
        }

        // 3. Move every alive snake in join order.
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!alive[p]) continue;
            bool boosted = boost[p] && segments[p].length > 1;
            uint256 steps = boosted ? 2 : 1;
            for (uint256 s = 0; s < steps && alive[p]; s++) {
                _moveStep(p, ctx);
            }
            if (alive[p] && boosted) {
                // Boost burn: 1 length per boosted tick.
                _popTail(p);
            }
        }

        // 4. Keep COIN_TARGET coins on the board.
        uint256 guard = 0;
        while (coins.length < COIN_TARGET && guard < COIN_TARGET + 1) {
            uint256 before = coins.length;
            _spawnCoin();
            guard += 1;
            if (coins.length == before) break; // board full
        }
    }

    /// @dev Advance one snake a single cell: wall check, head-to-head,
    ///      body collision, coin eating, body shift.
    function _moveStep(address p, TickCtx memory ctx) internal {
        (int16 nx, int16 ny) = _headDelta(p);
        if (_outOfBounds(nx, ny)) {
            _kill(p, ctx);
            return;
        }
        uint16 cell = _pack(uint8(uint16(nx)), uint8(uint16(ny)));

        // Head-to-head: another new head already claimed this cell.
        address rival = _findHeadOwner(cell, ctx);
        if (rival != address(0)) {
            _resolveHeadToHead(p, rival, ctx);
            if (!alive[p]) return;
        }

        // Body collision (O(1) bitmap test).
        if (_bitTest(ctx.occ, cell)) {
            _kill(p, ctx);
            return;
        }

        (uint8 ux, uint8 uy) = _unpack(cell);
        bool grew = _takeCoin(ux, uy);
        _shiftBody(p, cell);
        _bitSet(ctx.occ, cell, true);

        if (grew) {
            score[p] += 1;
            emit CoinEaten(matchId, p, ux, uy, score[p]);
        } else {
            _popTail(p);
        }

        ctx.newHeads[ctx.headCount] = cell;
        ctx.newHeadOwners[ctx.headCount] = p;
        ctx.headCount += 1;
    }

    /// @dev The cell the snake's head would move into (may be out of bounds).
    function _headDelta(address p) internal view returns (int16 nx, int16 ny) {
        uint16[] storage segs = segments[p];
        (uint8 hx, uint8 hy) = _unpack(segs[0]);
        return _advance(hx, hy, direction[p]);
    }

    function _outOfBounds(int16 nx, int16 ny) internal pure returns (bool) {
        return nx < 0 || ny < 0 || nx >= int16(uint16(GRID)) || ny >= int16(uint16(GRID));
    }

    /// @dev Shift the body: new head at index 0, everything else moves down.
    function _shiftBody(address p, uint16 cell) internal {
        uint16[] storage segs = segments[p];
        segs.push(0);
        for (uint256 j = segs.length - 1; j > 0; j--) {
            segs[j] = segs[j - 1];
        }
        segs[0] = cell;
    }

    /// @dev Find which snake already claimed `cell` as its new head this tick.
    ///      Skips owners that died mid-tick.
    function _findHeadOwner(uint16 cell, TickCtx memory ctx) internal view returns (address) {
        for (uint256 k = 0; k < ctx.headCount; k++) {
            if (ctx.newHeads[k] == cell && alive[ctx.newHeadOwners[k]]) {
                return ctx.newHeadOwners[k];
            }
        }
        return address(0);
    }

    /// @dev Pop the tail segment. The tail tip was excluded from the
    ///      occupancy bitmap, so no bitmap update is needed.
    function _popTail(address p) internal {
        uint16[] storage segs = segments[p];
        require(segs.length > 0, "empty snake");
        segs.pop();
    }

    /// @dev Head-to-head: longer snake survives, shorter dies, equal -> both.
    function _resolveHeadToHead(address p, address q, TickCtx memory ctx) internal {
        uint256 lp = segments[p].length;
        uint256 lq = segments[q].length;
        if (lp > lq) {
            _kill(q, ctx);
            _removeNewHead(q, ctx);
        } else if (lq > lp) {
            _kill(p, ctx);
        } else {
            _kill(p, ctx);
            _kill(q, ctx);
            _removeNewHead(q, ctx);
        }
    }

    function _removeNewHead(address q, TickCtx memory ctx) internal pure {
        for (uint256 k = 0; k < ctx.headCount; k++) {
            if (ctx.newHeadOwners[k] == q) {
                ctx.newHeadOwners[k] = address(0);
                ctx.newHeads[k] = 0;
            }
        }
    }

    /// @dev Eliminate a snake: scatter its body as coins (slither-style),
    ///      clear its bits from the occupancy bitmap, batch the death.
    function _kill(address p, TickCtx memory ctx) internal {
        if (!alive[p]) return; // already dead this tick: no double scatter
        alive[p] = false;
        aliveCount -= 1;
        uint16[] storage segs = segments[p];
        uint256 n = segs.length;
        // Clear bitmap bits.
        for (uint256 i = 0; i < n; i++) {
            _bitSet(ctx.occ, segs[i], false);
        }
        // Scatter up to SCATTER_MAX evenly-spaced segments as coins.
        uint256 scatter = n > SCATTER_MAX ? SCATTER_MAX : n;
        for (uint256 i = 0; i < scatter; i++) {
            uint256 idx = scatter > 1 ? (i * (n - 1)) / (scatter - 1) : 0;
            (uint8 x, uint8 y) = _unpack(segs[idx]);
            if (!_coinAt(x, y)) {
                coins.push(segs[idx]);
                emit CoinSpawned(matchId, x, y);
            }
        }
        _recordDeath(p);
        emit SnakeEliminated(matchId, p);
    }

    function _recordDeath(address p) internal {
        if (currentTick > lastDeathBatch) {
            lastDeathBatch = currentTick;
            delete lastDeaths;
        }
        lastDeaths.push(p);
    }

    /// @dev Deterministic coin spawn on an empty cell:
    ///      keccak256(matchId, coinsSpawned, attempt). Ungameable, verifiable.
    function _spawnCoin() internal {
        for (uint256 i = 0; i < 200; i++) {
            uint256 h = uint256(keccak256(abi.encode(matchId, coinsSpawned, i)));
            uint8 x = uint8(h % GRID);
            uint8 y = uint8((h >> 8) % GRID);
            if (!_coinAt(x, y) && !_bodyAt(x, y)) {
                coins.push(_pack(x, y));
                coinsSpawned += 1;
                emit CoinSpawned(matchId, x, y);
                return;
            }
        }
    }

    /// @dev Take the coin at (x, y) if present. Swap-and-pop removal.
    function _takeCoin(uint8 x, uint8 y) internal returns (bool) {
        for (uint256 i = 0; i < coins.length; i++) {
            (uint8 cx, uint8 cy) = _unpack(coins[i]);
            if (cx == x && cy == y) {
                coins[i] = coins[coins.length - 1];
                coins.pop();
                return true;
            }
        }
        return false;
    }

    function _coinAt(uint8 x, uint8 y) internal view returns (bool) {
        for (uint256 i = 0; i < coins.length; i++) {
            (uint8 cx, uint8 cy) = _unpack(coins[i]);
            if (cx == x && cy == y) return true;
        }
        return false;
    }

    function _bodyAt(uint8 x, uint8 y) internal view returns (bool) {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!alive[p]) continue;
            uint16[] storage segs = segments[p];
            for (uint256 j = 0; j < segs.length; j++) {
                (uint8 sx, uint8 sy) = _unpack(segs[j]);
                if (sx == x && sy == y) return true;
            }
        }
        return false;
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
            _credit(treasury, fee);
            _credit(winner, prize);
            _openLobby();
        } else if (aliveCount == 0) {
            // Simultaneous final deaths: the last batch splits it equally.
            _splitPotEqual();
        } else if (currentTick >= MATCH_TICKS) {
            // Tick budget exhausted: score-weighted split among survivors.
            _splitPotScored();
        }
    }

    function _splitPotEqual() internal {
        address[] memory recipients = lastDeaths; // copy: _openLobby wipes storage
        uint256 n = recipients.length;
        require(n > 0, "no recipients");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 share = (pot - fee) / n;
        uint256 dust = (pot - fee) % n;
        emit PotSplit(matchId, n, share);
        _credit(treasury, fee);
        _credit(treasury, dust);
        for (uint256 i = 0; i < n; i++) {
            _credit(recipients[i], share);
        }
        _openLobby();
    }

    function _splitPotScored() internal {
        uint256 n = 0;
        uint256 totalScore = 0;
        for (uint256 i = 0; i < players.length; i++) {
            if (alive[players[i]]) {
                n += 1;
                totalScore += score[players[i]];
            }
        }
        require(n > 0, "no survivors");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 distributable = pot - fee;
        _credit(treasury, fee);
        if (totalScore == 0) {
            // Nobody scored: fall back to an equal split.
            uint256 share = distributable / n;
            uint256 dust = distributable % n;
            _credit(treasury, dust);
            for (uint256 i = 0; i < players.length; i++) {
                if (alive[players[i]]) _credit(players[i], share);
            }
            emit PotSplit(matchId, n, share);
        } else {
            uint256 paid = 0;
            for (uint256 i = 0; i < players.length; i++) {
                address p = players[i];
                if (alive[p]) {
                    uint256 share = (distributable * score[p]) / totalScore;
                    _credit(p, share);
                    paid += share;
                }
            }
            // Integer-division remainder sweeps to the treasury as house seed.
            _credit(treasury, distributable - paid);
            emit PotSplitWeighted(matchId, n);
        }
        _openLobby();
    }

    // ---- Cell packing & bitmap helpers ----

    function _pack(uint8 x, uint8 y) internal pure returns (uint16) {
        return (uint16(x) << 8) | uint16(y);
    }

    function _unpack(uint16 cell) internal pure returns (uint8 x, uint8 y) {
        x = uint8(cell >> 8);
        y = uint8(cell);
    }

    /// @dev 24x24 = 576 bits across 9 words. Sets or clears one bit.
    function _bitSet(uint256[9] memory occ, uint16 cell, bool value) internal pure {
        (uint8 x, uint8 y) = _unpack(cell);
        uint256 idx = uint256(y) * GRID + uint256(x);
        uint256 word = idx / 256;
        uint256 bit = idx % 256;
        if (value) {
            occ[word] |= (uint256(1) << bit);
        } else {
            occ[word] &= ~(uint256(1) << bit);
        }
    }

    /// @dev Read a bit (separate from the setter above for clarity).
    function _bitTest(uint256[9] memory occ, uint16 cell) internal pure returns (bool) {
        (uint8 x, uint8 y) = _unpack(cell);
        uint256 idx = uint256(y) * GRID + uint256(x);
        return (occ[idx / 256] >> (idx % 256)) & 1 == 1;
    }

    function _advance(uint8 x, uint8 y, uint8 dir) internal pure returns (int16 nx, int16 ny) {
        nx = int16(uint16(x));
        ny = int16(uint16(y));
        if (dir == UP) ny -= 1;
        else if (dir == RIGHT) nx += 1;
        else if (dir == DOWN) ny += 1;
        else nx -= 1; // LEFT
    }

    /// @dev One step back from (x, y) opposite to `dir`, repeated `s` times.
    function _stepBack(uint8 x, uint8 y, uint8 dir, uint8 s) internal pure returns (uint8, uint8) {
        int16 nx = int16(uint16(x));
        int16 ny = int16(uint16(y));
        if (dir == UP) ny += int16(uint16(s));
        else if (dir == RIGHT) nx -= int16(uint16(s));
        else if (dir == DOWN) ny -= int16(uint16(s));
        else nx += int16(uint16(s));
        return (uint8(uint16(nx)), uint8(uint16(ny)));
    }

    /// @dev 8 spread spawn points on the 24x24 grid, assigned by join order.
    ///      Each faces the center; the body extends behind the head.
    function _spawnPoint(uint256 i) internal pure returns (uint8 x, uint8 y, uint8 dir) {
        uint8[8] memory sx = [2, 21, 2, 21, 11, 11, 2, 21];
        uint8[8] memory sy = [2, 2, 21, 21, 2, 21, 11, 11];
        uint8[8] memory sd = [RIGHT, DOWN, RIGHT, LEFT, DOWN, UP, RIGHT, LEFT];
        return (sx[i], sy[i], sd[i]);
    }

    // ---- Views for the client ----

    function getPlayers() external view returns (address[] memory) { return players; }

    function getCoins() external view returns (uint16[] memory) { return coins; }

    function getSegments(address p) external view returns (uint16[] memory) {
        return segments[p];
    }

    /// @notice Whole match state in one call, so the client polls with a
    ///         single eth_call instead of one per player (no multicall3 on
    ///         this chain). Segments are packed xy, head-first.
    function getMatchState()
        external
        view
        returns (
            address[] memory addrs,
            uint8[] memory headX,
            uint8[] memory headY,
            uint8[] memory dirs,
            uint256[] memory scores,
            bool[] memory alives,
            uint16[][] memory allSegments,
            uint16[] memory coinCells
        )
    {
        uint256 n = players.length;
        addrs = new address[](n);
        headX = new uint8[](n);
        headY = new uint8[](n);
        dirs = new uint8[](n);
        scores = new uint256[](n);
        alives = new bool[](n);
        allSegments = new uint16[][](n);
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            addrs[i] = p;
            uint16[] storage segs = segments[p];
            allSegments[i] = segs;
            if (segs.length > 0) {
                (uint8 hx, uint8 hy) = _unpack(segs[0]);
                headX[i] = hx;
                headY[i] = hy;
            }
            dirs[i] = direction[p];
            scores[i] = score[p];
            alives[i] = alive[p];
        }
        coinCells = coins;
    }

    function lobbyOpen() external view returns (bool) {
        return phase == Phase.Lobby && block.timestamp < lobbyEndsAt;
    }
}
