// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperSnakesLadders — 4-team race to square 100
/// @notice Team board race on a 10x10 snakes & ladders board.
///         Teams: RED (0), BLUE (1), GREEN (2), YELLOW (3).
///         First team to reach or exceed square 100 wins.
///         Winning team splits 95% of the total pot pro-rata by stake; 5% to treasury.
///         Pull payments (claim pattern) & session keys matching ViperArena conventions.

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ViperSnakesLadders {
    enum Team { RED, BLUE, GREEN, YELLOW }
    enum Phase { Lobby, Live }

    // ---- Constants ----
    uint8 public constant BOARD_SIZE = 100;
    uint8 public constant WINNING_SQUARE = 100;
    uint256 public constant LOBBY_DURATION = 60; // seconds
    uint256 public constant TURN_TIMEOUT_BLOCKS = 30; // turn passes after 30 blocks of inactivity
    uint256 public constant FEE_BPS = 500; // 5% protocol fee
    uint64 public constant MAX_SESSION_TTL = 1 days;

    // ---- Immutables ----
    IERC20 public immutable stakeToken;
    uint256 public immutable entryFee;
    address public immutable treasury;

    // ---- State ----
    uint256 public matchId;
    Phase public phase;
    uint256 public lobbyEndsAt;
    uint256 public pot;

    Team public currentTurn;
    uint256 public turnStartBlock;

    mapping(Team => uint8) public positions;
    mapping(Team => uint256) public teamStake;
    mapping(Team => address[]) internal _teamPlayers;
    mapping(address => bool) public hasJoined;
    mapping(address => Team) public playerTeam;
    mapping(address => uint256) public playerStake;
    address[] internal _allPlayers;

    // Pull-payment ledger (claims)
    mapping(address => uint256) public pendingWithdrawals;

    // Session keys (zero-popup gameplay)
    struct SessionAuth {
        address player;
        uint64 expiry;
        bool revoked;
        uint256 authMatchId;
    }
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events ----
    event LobbyOpened(uint256 indexed matchId, uint256 closesAt);
    event TeamJoined(address indexed player, Team indexed team, uint256 amount);
    event MatchStarted(uint256 indexed matchId);
    event MatchCancelled(uint256 indexed matchId);
    event Rolled(Team indexed team, uint8 dice, uint8 from, uint8 to);
    event Climbed(Team indexed team, uint8 from, uint8 to);
    event Slid(Team indexed team, uint8 from, uint8 to);
    event TurnPassed(Team indexed team);
    event MatchWon(Team indexed team);
    event WithdrawalCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event SessionAuthorized(uint256 indexed matchId, address indexed player, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(uint256 indexed matchId, address indexed player, address indexed sessionKey);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _stakeToken, uint256 _entryFee, address _treasury) {
        require(_stakeToken != address(0) && _treasury != address(0), "zero addr");
        require(_entryFee > 0, "zero entry fee");
        stakeToken = IERC20(_stakeToken);
        entryFee = _entryFee;
        treasury = _treasury;
        _openLobby();
    }

    // ---- Board Definition (10x10 with 8 ladders and 8 snakes) ----

    /// @notice Returns destination square after landing on pos (snakes & ladders transition).
    function getTarget(uint8 pos) public pure returns (uint8) {
        // Ladders (climb up)
        if (pos == 4) return 14;
        if (pos == 9) return 31;
        if (pos == 20) return 38;
        if (pos == 28) return 84;
        if (pos == 40) return 59;
        if (pos == 51) return 67;
        if (pos == 63) return 81;
        if (pos == 71) return 91;

        // Snakes (slide down)
        if (pos == 17) return 7;
        if (pos == 54) return 34;
        if (pos == 62) return 18;
        if (pos == 64) return 60;
        if (pos == 87) return 24;
        if (pos == 93) return 73;
        if (pos == 95) return 75;
        if (pos == 99) return 78;

        return pos;
    }

    // ---- Lobby & Joining ----

    /// @notice Join a team with standard entry fee.
    function join(Team team) external nonReentrant {
        _join(team, entryFee, address(0), 0);
    }

    /// @notice Join a team with a custom stake (>= entryFee).
    function join(Team team, uint256 amount) external nonReentrant {
        require(amount >= entryFee, "stake below entry fee");
        _join(team, amount, address(0), 0);
    }

    /// @notice Join a team with standard entry fee and authorize a session key.
    function joinWithSession(Team team, address sessionKey, uint64 expiry) external nonReentrant {
        _validateSessionKey(sessionKey, expiry);
        _join(team, entryFee, sessionKey, expiry);
    }

    /// @notice Join a team with custom stake and authorize a session key.
    function joinWithSession(Team team, uint256 amount, address sessionKey, uint64 expiry) external nonReentrant {
        require(amount >= entryFee, "stake below entry fee");
        _validateSessionKey(sessionKey, expiry);
        _join(team, amount, sessionKey, expiry);
    }

    function _validateSessionKey(address sessionKey, uint64 expiry) internal view {
        require(sessionKey != address(0), "zero session key");
        require(expiry > block.timestamp, "expiry in past");
        require(expiry <= block.timestamp + MAX_SESSION_TTL, "expiry too far");
    }

    function _join(Team team, uint256 amount, address sessionKey, uint64 expiry) internal {
        require(phase == Phase.Lobby, "lobby closed");
        require(!hasJoined[msg.sender], "already joined");

        if (_allPlayers.length == 0) {
            lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        } else {
            require(block.timestamp < lobbyEndsAt, "lobby closed");
        }

        require(stakeToken.transferFrom(msg.sender, address(this), amount), "fee failed");

        hasJoined[msg.sender] = true;
        playerTeam[msg.sender] = team;
        playerStake[msg.sender] = amount;
        teamStake[team] += amount;
        _teamPlayers[team].push(msg.sender);
        _allPlayers.push(msg.sender);
        pot += amount;

        emit TeamJoined(msg.sender, team, amount);

        if (sessionKey != address(0)) {
            sessions[sessionKey] = SessionAuth(msg.sender, expiry, false, matchId);
            emit SessionAuthorized(matchId, msg.sender, sessionKey, expiry);
        }
    }

    /// @notice Start the race after the lobby window has elapsed.
    ///         Requires at least 2 teams with players; otherwise refunds all stakes.
    function startMatch() external nonReentrant {
        require(phase == Phase.Lobby, "not in lobby");
        require(block.timestamp >= lobbyEndsAt, "lobby still open");

        uint8 activeTeams = 0;
        for (uint8 i = 0; i < 4; i++) {
            if (teamStake[Team(i)] > 0) {
                activeTeams++;
            }
        }

        if (activeTeams < 2) {
            // Refund all joined players via pull payment
            for (uint256 i = 0; i < _allPlayers.length; i++) {
                address p = _allPlayers[i];
                uint256 staked = playerStake[p];
                if (staked > 0) {
                    _credit(p, staked);
                }
            }
            emit MatchCancelled(matchId);
            _openLobby();
            return;
        }

        phase = Phase.Live;
        for (uint8 i = 0; i < 4; i++) {
            positions[Team(i)] = 0;
        }

        // Fixed turn order starts with first active team starting from RED
        Team turn = Team.RED;
        while (teamStake[turn] == 0) {
            turn = Team((uint8(turn) + 1) % 4);
        }
        currentTurn = turn;
        turnStartBlock = block.number;

        emit MatchStarted(matchId);
    }

    // ---- Gameplay ----

    /// @notice Submit dice roll for current turn.
    ///         Callable by any member of the current team or their authorized session key.
    function roll() external nonReentrant {
        require(phase == Phase.Live, "not live");
        address player = _resolvePlayer(msg.sender);
        require(hasJoined[player], "not a player");
        require(playerTeam[player] == currentTurn, "not your team's turn");

        // Randomness (v1): Dice = 1 + (blockhash of the previous block % 6) at roll time.
        // Trust assumption note: Miners / block proposers could theoretically attempt to bias
        // blockhash, but for v1 casual race this is simple, self-contained, and cheap.
        // Future upgrades can incorporate Chainlink VRF or commit-reveal.
        uint8 dice = uint8(1 + (uint256(blockhash(block.number - 1)) % 6));

        uint8 fromPos = positions[currentTurn];
        uint8 toPos = fromPos + dice;

        if (toPos >= WINNING_SQUARE) {
            toPos = WINNING_SQUARE;
            positions[currentTurn] = WINNING_SQUARE;
            emit Rolled(currentTurn, dice, fromPos, WINNING_SQUARE);
            emit MatchWon(currentTurn);
            _settle(currentTurn);
            return;
        }

        uint8 target = getTarget(toPos);
        emit Rolled(currentTurn, dice, fromPos, toPos);

        if (target > toPos) {
            emit Climbed(currentTurn, toPos, target);
            toPos = target;
        } else if (target < toPos) {
            emit Slid(currentTurn, toPos, target);
            toPos = target;
        }
        positions[currentTurn] = toPos;

        if (toPos >= WINNING_SQUARE) {
            positions[currentTurn] = WINNING_SQUARE;
            emit MatchWon(currentTurn);
            _settle(currentTurn);
            return;
        }

        _advanceTurn();
    }

    /// @notice Pass the turn if the current team did not roll within TURN_TIMEOUT_BLOCKS.
    ///         Permissionless anti-grief function: token stays at current square.
    function passTurn() external nonReentrant {
        require(phase == Phase.Live, "not live");
        require(block.number >= turnStartBlock + TURN_TIMEOUT_BLOCKS, "turn not expired");
        emit TurnPassed(currentTurn);
        _advanceTurn();
    }

    /// @notice Permissionless keep-alive matching ViperArena poke pattern.
    function poke() external nonReentrant {
        require(phase == Phase.Live, "not live");
        if (block.number >= turnStartBlock + TURN_TIMEOUT_BLOCKS) {
            emit TurnPassed(currentTurn);
            _advanceTurn();
        }
    }

    function _advanceTurn() internal {
        Team next = currentTurn;
        do {
            next = Team((uint8(next) + 1) % 4);
        } while (teamStake[next] == 0);

        currentTurn = next;
        turnStartBlock = block.number;
    }

    // ---- Settlement & Pull-Payments ----

    function _settle(Team winningTeam) internal {
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 prize = pot - fee;

        address[] memory winners = _teamPlayers[winningTeam];
        uint256 winningTotalStake = teamStake[winningTeam];
        require(winningTotalStake > 0, "zero winning stake");

        uint256 distributed = 0;
        for (uint256 i = 0; i < winners.length; i++) {
            address p = winners[i];
            uint256 stake = playerStake[p];
            if (stake > 0) {
                uint256 share = (prize * stake) / winningTotalStake;
                distributed += share;
                _credit(p, share);
            }
        }

        // Remainder dust from integer division sweeps to treasury
        uint256 dust = prize - distributed;
        _credit(treasury, fee + dust);

        _openLobby();
    }

    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit WithdrawalCredited(matchId, to, amount);
    }

    /// @notice Claim accumulated pull payments.
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(stakeToken.transfer(msg.sender, amount), "claim failed");
    }

    function _openLobby() internal {
        for (uint256 i = 0; i < _allPlayers.length; i++) {
            address p = _allPlayers[i];
            hasJoined[p] = false;
            playerStake[p] = 0;
        }
        delete _allPlayers;

        for (uint8 i = 0; i < 4; i++) {
            Team t = Team(i);
            teamStake[t] = 0;
            delete _teamPlayers[t];
            positions[t] = 0;
        }

        pot = 0;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    // ---- Session Keys ----

    /// @notice Revoke session key. Callable by player or session key itself.
    function revokeSession(address sessionKey) external nonReentrant {
        SessionAuth storage s = sessions[sessionKey];
        require(s.player != address(0), "unknown session");
        require(msg.sender == s.player || msg.sender == sessionKey, "not authorized");
        require(!s.revoked, "already revoked");
        s.revoked = true;
        emit SessionRevoked(s.authMatchId, s.player, sessionKey);
    }

    function _resolvePlayer(address sender) internal view returns (address) {
        if (hasJoined[sender]) return sender;
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

    // ---- Views ----

    function getTeamPlayers(Team team) external view returns (address[] memory) {
        return _teamPlayers[team];
    }

    function getAllPlayers() external view returns (address[] memory) {
        return _allPlayers;
    }

    function getAllPositions() external view returns (uint8[4] memory pos) {
        pos[0] = positions[Team.RED];
        pos[1] = positions[Team.BLUE];
        pos[2] = positions[Team.GREEN];
        pos[3] = positions[Team.YELLOW];
    }

    function getTeamStakes() external view returns (uint256[4] memory stakes) {
        stakes[0] = teamStake[Team.RED];
        stakes[1] = teamStake[Team.BLUE];
        stakes[2] = teamStake[Team.GREEN];
        stakes[3] = teamStake[Team.YELLOW];
    }

    function getMatchState() external view returns (
        Phase currentPhase,
        uint256 currentMatchId,
        Team activeTurn,
        uint256 turnBlock,
        uint8[4] memory pos,
        uint256[4] memory stakes,
        uint256 totalPot,
        uint256 lobbyEnd
    ) {
        currentPhase = phase;
        currentMatchId = matchId;
        activeTurn = currentTurn;
        turnBlock = turnStartBlock;
        pos = [
            positions[Team.RED],
            positions[Team.BLUE],
            positions[Team.GREEN],
            positions[Team.YELLOW]
        ];
        stakes = [
            teamStake[Team.RED],
            teamStake[Team.BLUE],
            teamStake[Team.GREEN],
            teamStake[Team.YELLOW]
        ];
        totalPot = pot;
        lobbyEnd = lobbyEndsAt;
    }

    function lobbyOpen() external view returns (bool) {
        return phase == Phase.Lobby && block.timestamp < lobbyEndsAt;
    }
}
