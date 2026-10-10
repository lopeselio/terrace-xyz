// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITerraceLeaguesMembership {
    function isMember(uint256 leagueId, address member) external view returns (bool);
}

/// @title TerraceChat
/// @notice Group chat where every message can become a market.
///
///  Rooms   A match room per fixture (anyone can talk) and a room per league (members only).
///  Takes   Any message can be turned into a market with TerraceMarkets.createTakeMarket,
///          passing the message id as chatRef; the indexer joins the two.
///  Backing "I back this take" is a free, one-per-person endorsement. The ranked feed uses it,
///          along with the money on the take's market and the author's record.
///
///  Messages live in events (cheap on Monad); storage keeps only what other contracts and the
///  indexer need to check: who wrote a message and where.
contract TerraceChat {
    uint8 public constant ROOM_MATCH = 0;
    uint8 public constant ROOM_LEAGUE = 1;
    uint256 public constant MAX_MESSAGE_BYTES = 280;

    struct Message {
        address author;
        uint8 roomKind;
        uint64 postedAt;
        uint32 backers;
        uint256 roomId; // fixture id or league id
    }

    ITerraceLeaguesMembership public immutable leagues;
    Message[] private _messages; // id = index + 1
    mapping(uint256 => mapping(address => bool)) public hasBacked;

    event MessagePosted(
        uint256 indexed messageId, uint8 indexed roomKind, uint256 indexed roomId, address author, uint256 replyTo, string text
    );
    event TakeBacked(uint256 indexed messageId, address indexed backer, uint32 backers);

    error BadInput();
    error NotMember();
    error UnknownMessage();
    error AlreadyBacked();

    constructor(ITerraceLeaguesMembership leagues_) {
        leagues = leagues_;
    }

    /// @param replyTo message id this replies to (0 = none); must be in the same room
    function post(uint8 roomKind, uint256 roomId, string calldata text, uint256 replyTo) external returns (uint256 messageId) {
        uint256 len = bytes(text).length;
        if (len == 0 || len > MAX_MESSAGE_BYTES || roomKind > ROOM_LEAGUE) revert BadInput();
        _checkAccess(roomKind, roomId, msg.sender);
        if (replyTo != 0) {
            Message storage parent = _message(replyTo);
            if (parent.roomKind != roomKind || parent.roomId != roomId) revert BadInput();
        }

        _messages.push(Message({author: msg.sender, roomKind: roomKind, postedAt: uint64(block.timestamp), backers: 0, roomId: roomId}));
        messageId = _messages.length;
        emit MessagePosted(messageId, roomKind, roomId, msg.sender, replyTo, text);
    }

    /// @notice Back someone's take. Free, once per person, not your own.
    function back(uint256 messageId) external {
        Message storage m = _message(messageId);
        if (m.author == msg.sender) revert BadInput();
        _checkAccess(m.roomKind, m.roomId, msg.sender);
        if (hasBacked[messageId][msg.sender]) revert AlreadyBacked();
        hasBacked[messageId][msg.sender] = true;
        m.backers += 1;
        emit TakeBacked(messageId, msg.sender, m.backers);
    }

    function getMessage(uint256 messageId) external view returns (Message memory) {
        return _message(messageId);
    }

    function messageCount() external view returns (uint256) {
        return _messages.length;
    }

    function _checkAccess(uint8 roomKind, uint256 roomId, address who) internal view {
        if (roomKind == ROOM_LEAGUE && !leagues.isMember(roomId, who)) revert NotMember();
    }

    function _message(uint256 messageId) internal view returns (Message storage) {
        if (messageId == 0 || messageId > _messages.length) revert UnknownMessage();
        return _messages[messageId - 1];
    }
}
