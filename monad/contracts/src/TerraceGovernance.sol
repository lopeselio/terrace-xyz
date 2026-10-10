// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITerraceLeaguesGov {
    function isMember(uint256 leagueId, address member) external view returns (bool);
    function memberCount(uint256 leagueId) external view returns (uint256);
    function addGameweek(uint256 leagueId, uint256[] calldata fixtureIds) external returns (uint256 contestId);
    function featureTake(uint256 leagueId, uint256 marketId) external;
}

/// @title TerraceGovernance
/// @notice Community-run leagues. Members decide together what the league plays:
///
///  - Gameweek  "These matches are next week's gameweek." (governed leagues get gameweeks only this way)
///  - Take      "Feature this take": a winning bet on it counts double on the league table.
///
///  One member, one vote. A proposal passes the moment a majority of all members back it.
///  Otherwise, once voting closes, it passes with more yes than no votes and at least a third of
///  members voting. Anyone can then execute it.
contract TerraceGovernance {
    enum Kind {
        Gameweek, // payload = abi.encode(uint256[] fixtureIds)
        FeatureTake // payload = abi.encode(uint256 marketId)
    }

    enum Status {
        Open,
        Executed,
        Rejected,
        Failed // passed, but the action could no longer run (e.g. a match had already kicked off)
    }

    struct Proposal {
        uint256 leagueId;
        address proposer;
        Kind kind;
        Status status;
        uint64 deadline;
        uint32 yes;
        uint32 no;
        bytes payload;
    }

    uint64 public constant VOTING_PERIOD = 1 days;

    ITerraceLeaguesGov public immutable leagues;
    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event Proposed(uint256 indexed proposalId, uint256 indexed leagueId, address indexed proposer, Kind kind, bytes payload, uint64 deadline);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint32 yes, uint32 no);
    event Resolved(uint256 indexed proposalId, Status status);

    error NotMember();
    error BadInput();
    error VotingClosed();
    error AlreadyVoted();
    error NotOpen();
    error StillVoting();

    constructor(ITerraceLeaguesGov leagues_) {
        leagues = leagues_;
    }

    function propose(uint256 leagueId, Kind kind, bytes calldata payload) external returns (uint256 proposalId) {
        if (!leagues.isMember(leagueId, msg.sender)) revert NotMember();
        if (kind == Kind.Gameweek) {
            uint256[] memory ids = abi.decode(payload, (uint256[]));
            if (ids.length == 0) revert BadInput();
        } else {
            abi.decode(payload, (uint256));
        }

        proposalId = _proposals.length;
        uint64 deadline = uint64(block.timestamp) + VOTING_PERIOD;
        _proposals.push(
            Proposal({leagueId: leagueId, proposer: msg.sender, kind: kind, status: Status.Open, deadline: deadline, yes: 0, no: 0, payload: payload})
        );
        emit Proposed(proposalId, leagueId, msg.sender, kind, payload, deadline);
        _vote(proposalId, true); // proposing counts as a yes
    }

    function vote(uint256 proposalId, bool support) external {
        _vote(proposalId, support);
    }

    /// @notice Close a proposal whose voting period has ended. Anyone can call it.
    function execute(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Open) revert NotOpen();
        if (block.timestamp <= p.deadline) revert StillVoting();

        uint256 members = leagues.memberCount(p.leagueId);
        bool quorum = uint256(p.yes) + p.no >= (members + 2) / 3;
        if (quorum && p.yes > p.no) _run(proposalId);
        else _resolve(proposalId, Status.Rejected);
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    function _vote(uint256 proposalId, bool support) internal {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Open) revert NotOpen();
        if (block.timestamp > p.deadline) revert VotingClosed();
        if (!leagues.isMember(p.leagueId, msg.sender)) revert NotMember();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        hasVoted[proposalId][msg.sender] = true;
        if (support) p.yes += 1;
        else p.no += 1;
        emit Voted(proposalId, msg.sender, support, p.yes, p.no);

        // An outright majority of the whole league settles it straight away.
        if (uint256(p.yes) * 2 > leagues.memberCount(p.leagueId)) _run(proposalId);
    }

    function _run(uint256 proposalId) internal {
        Proposal storage p = _proposals[proposalId];
        bool ok;
        if (p.kind == Kind.Gameweek) {
            uint256[] memory ids = abi.decode(p.payload, (uint256[]));
            try leagues.addGameweek(p.leagueId, ids) {
                ok = true;
            } catch {}
        } else {
            try leagues.featureTake(p.leagueId, abi.decode(p.payload, (uint256))) {
                ok = true;
            } catch {}
        }
        _resolve(proposalId, ok ? Status.Executed : Status.Failed);
    }

    function _resolve(uint256 proposalId, Status status) internal {
        _proposals[proposalId].status = status;
        emit Resolved(proposalId, status);
    }
}
