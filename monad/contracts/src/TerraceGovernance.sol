// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LeagueRules} from "./interfaces/LeagueRules.sol";

interface ITerraceLeaguesGov {
    function isMember(uint256 leagueId, address member) external view returns (bool);
    function memberCount(uint256 leagueId) external view returns (uint256);
    function addGameweek(uint256 leagueId, uint256[] calldata fixtureIds) external returns (uint256 contestId);
    function featureTake(uint256 leagueId, uint256 marketId) external;
    function setRules(uint256 leagueId, LeagueRules calldata rules) external;
    function rulesOf(uint256 leagueId) external view returns (LeagueRules memory);
}

/// @title TerraceGovernance
/// @notice Community-run leagues. Members decide together what the league plays:
///
///  - Gameweek  "These matches are next week's gameweek." (governed leagues get gameweeks only this way)
///  - Take      "Feature this take": a winning bet on it scores the league's featured points.
///  - Rules     "Change the house rules": scoring, featured points, sealed picks, jokers, voting.
///
///  One member, one vote. A proposal passes the moment a majority of all members back it.
///  Otherwise, once voting closes, it passes with more yes than no votes and at least the league's
///  quorum of members voting. The voting period and quorum are the league's house rules at the
///  time of the proposal. Anyone can then execute it.
contract TerraceGovernance {
    enum Kind {
        Gameweek, // payload = abi.encode(uint256[] fixtureIds)
        FeatureTake, // payload = abi.encode(uint256 marketId)
        Rules // payload = abi.encode(LeagueRules)
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

    /// @notice First proposal id; later deployments start above every earlier id.
    uint256 public immutable idBase;

    ITerraceLeaguesGov public immutable leagues;
    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    /// @notice The league's quorum (percent of members) when the proposal was made.
    mapping(uint256 => uint8) public quorumOf;

    event Proposed(uint256 indexed proposalId, uint256 indexed leagueId, address indexed proposer, Kind kind, bytes payload, uint64 deadline);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint32 yes, uint32 no);
    event Resolved(uint256 indexed proposalId, Status status);

    error NotMember();
    error BadInput();
    error VotingClosed();
    error AlreadyVoted();
    error NotOpen();
    error StillVoting();

    constructor(ITerraceLeaguesGov leagues_, uint256 idBase_) {
        leagues = leagues_;
        idBase = idBase_;
    }

    function propose(uint256 leagueId, Kind kind, bytes calldata payload) external returns (uint256 proposalId) {
        if (!leagues.isMember(leagueId, msg.sender)) revert NotMember();
        if (kind == Kind.Gameweek) {
            uint256[] memory ids = abi.decode(payload, (uint256[]));
            if (ids.length == 0) revert BadInput();
        } else if (kind == Kind.FeatureTake) {
            abi.decode(payload, (uint256));
        } else {
            abi.decode(payload, (LeagueRules));
        }

        LeagueRules memory rules = leagues.rulesOf(leagueId);
        proposalId = idBase + _proposals.length;
        uint64 deadline = uint64(block.timestamp) + rules.votingPeriod;
        quorumOf[proposalId] = rules.quorumPct;
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
        Proposal storage p = _proposal(proposalId);
        if (p.status != Status.Open) revert NotOpen();
        if (block.timestamp <= p.deadline) revert StillVoting();

        uint256 members = leagues.memberCount(p.leagueId);
        bool quorum = (uint256(p.yes) + p.no) * 100 >= members * quorumOf[proposalId];
        if (quorum && p.yes > p.no) _run(proposalId);
        else _resolve(proposalId, Status.Rejected);
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposal(proposalId);
    }

    function _vote(uint256 proposalId, bool support) internal {
        Proposal storage p = _proposal(proposalId);
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
        Proposal storage p = _proposal(proposalId);
        bool ok;
        if (p.kind == Kind.Gameweek) {
            uint256[] memory ids = abi.decode(p.payload, (uint256[]));
            try leagues.addGameweek(p.leagueId, ids) {
                ok = true;
            } catch {}
        } else if (p.kind == Kind.FeatureTake) {
            try leagues.featureTake(p.leagueId, abi.decode(p.payload, (uint256))) {
                ok = true;
            } catch {}
        } else {
            try leagues.setRules(p.leagueId, abi.decode(p.payload, (LeagueRules))) {
                ok = true;
            } catch {}
        }
        _resolve(proposalId, ok ? Status.Executed : Status.Failed);
    }

    function _resolve(uint256 proposalId, Status status) internal {
        _proposal(proposalId).status = status;
        emit Resolved(proposalId, status);
    }

    function _proposal(uint256 proposalId) internal view returns (Proposal storage) {
        if (proposalId < idBase || proposalId >= idBase + _proposals.length) revert BadInput();
        return _proposals[proposalId - idBase];
    }
}
