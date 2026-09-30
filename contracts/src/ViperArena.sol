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
    uint256 public lastDeathBlock;
    address[] public lastDeaths;

    mapping(address => bool) public joined;
    mapping(address => bool) public alive;
    mapping(address => uint8) public px;
    mapping(address => uint8) public py;

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
        require(phase == Phase.Lobby, "lobby closed");
        require(!joined[msg.sender], "already joined");
        require(players.length < MAX_PLAYERS, "lobby full");
        require(stakeToken.transferFrom(msg.sender, address(this), entryFee), "fee failed");

        joined[msg.sender] = true;
        players.push(msg.sender);
        pot += entryFee;
        emit PlayerJoined(matchId, msg.sender);
    }

    /// @notice Anyone can start the match once the 60s window closes.
    ///         Fewer than 2 players -> everyone is refunded, new lobby opens.
    function startMatch() external nonReentrant {
        require(phase == Phase.Lobby, "not in lobby");
        require(block.timestamp >= lobbyEndsAt, "lobby still open");

        if (players.length < 2) {
            for (uint256 i = 0; i < players.length; i++) {
                require(stakeToken.transfer(players[i], entryFee), "refund failed");
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

    /// @notice Move one tile orthogonally.
    function move(int8 dx, int8 dy) external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        require(alive[msg.sender], "not alive");

        int16 nx = int16(int8(px[msg.sender])) + int16(dx);
        int16 ny = int16(int8(py[msg.sender])) + int16(dy);
        require(_abs(dx) + _abs(dy) == 1, "one orthogonal step");
        require(nx >= 0 && ny >= 0 && nx < int16(uint16(GRID)) && ny < int16(uint16(GRID)), "out of bounds");
        require(!_liveBombAt(_toU8(nx), _toU8(ny)), "tile has live bomb");

        px[msg.sender] = _toU8(nx);
        py[msg.sender] = _toU8(ny);
        emit PlayerMoved(matchId, msg.sender, _toU8(nx), _toU8(ny));
        _settle();
    }

    /// @notice Plant a bomb on your current tile. One live bomb per player.
    function plantBomb() external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        require(alive[msg.sender], "not alive");
        require(!_hasLiveBomb(msg.sender), "already armed");
        require(!_liveBombAt(px[msg.sender], py[msg.sender]), "bomb already here");

        uint256 detonateAt = block.number + FUSE_BLOCKS;
        bombs.push(Bomb(px[msg.sender], py[msg.sender], msg.sender, detonateAt, true));
        emit BombPlanted(matchId, msg.sender, px[msg.sender], py[msg.sender], detonateAt);
        _settle();
    }

    /// @notice Advance the game: detonate due bombs, chain reactions, settle.
    ///         Anyone can call this; keeps the match moving without keepers.
    function poke() external nonReentrant {
        require(phase == Phase.Live, "not live");
        _processExplosions();
        _settle();
    }

    // ---- Internals ----

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
        lastDeathBlock = 0;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    /// @dev Lazily resolves explosions: no keeper needed, every gameplay
    ///      transaction first brings the world up to date.
    function _processExplosions() internal {
        bool exploded;
        do {
            exploded = false;
            for (uint256 i = 0; i < bombs.length; i++) {
                if (bombs[i].live && block.number >= bombs[i].detonateAt) {
                    _detonate(i);
                    exploded = true;
                }
            }
        } while (exploded);
    }

    function _detonate(uint256 idx) internal {
        Bomb storage b = bombs[idx];
        b.live = false;
        emit BombExploded(matchId, b.x, b.y);

        _blastTile(b.x, b.y);
        int8[4] memory dxs = [int8(1), int8(-1), int8(0), int8(0)];
        int8[4] memory dys = [int8(0), int8(0), int8(1), int8(-1)];
        for (uint256 d = 0; d < 4; d++) {
            for (uint8 r = 1; r <= BLAST_RADIUS; r++) {
                int16 nx = int16(int8(b.x)) + dxs[d] * int16(uint16(r));
                int16 ny = int16(int8(b.y)) + dys[d] * int16(uint16(r));
                if (nx < 0 || ny < 0 || nx >= int16(uint16(GRID)) || ny >= int16(uint16(GRID))) break;
                _blastTile(_toU8(nx), _toU8(ny));
            }
        }
    }

    function _blastTile(uint8 x, uint8 y) internal {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (alive[p] && px[p] == x && py[p] == y) {
                alive[p] = false;
                aliveCount -= 1;
                _recordDeath(p);
                emit PlayerEliminated(matchId, p);
            }
        }
        // Chain-detonate any other live bomb caught in the blast.
        for (uint256 i = 0; i < bombs.length; i++) {
            if (bombs[i].live && bombs[i].x == x && bombs[i].y == y) {
                bombs[i].detonateAt = block.number;
            }
        }
    }

    function _recordDeath(address p) internal {
        if (block.number > lastDeathBlock) {
            lastDeathBlock = block.number;
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
            _openLobby(); // state first, tokens after
            require(stakeToken.transfer(treasury, fee), "fee xfer failed");
            require(stakeToken.transfer(winner, prize), "prize xfer failed");
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
        emit PotSplit(matchId, n, share);
        _openLobby(); // state first, tokens after
        require(stakeToken.transfer(treasury, fee), "fee xfer failed");
        for (uint256 i = 0; i < n; i++) {
            require(stakeToken.transfer(recipients[i], share), "split xfer failed");
        }
        // Dust (if any) stays as seed for the house; negligible by construction.
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
