// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TerraceChat, ITerraceLeaguesMembership} from "../src/TerraceChat.sol";

contract FakeLeagues is ITerraceLeaguesMembership {
    mapping(uint256 => mapping(address => bool)) public isMember;

    function add(uint256 leagueId, address who) external {
        isMember[leagueId][who] = true;
    }
}

contract TerraceChatTest is Test {
    TerraceChat chat;
    FakeLeagues leagues;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    function setUp() public {
        leagues = new FakeLeagues();
        chat = new TerraceChat(leagues);
        leagues.add(1, alice);
        leagues.add(1, bob);
    }

    function test_anyoneTalksInMatchRooms() public {
        vm.prank(stranger);
        uint256 id = chat.post(0, 1557424, "City don't score at Anfield", 0);
        assertEq(id, 1);
        assertEq(chat.getMessage(id).author, stranger);

        vm.prank(alice);
        uint256 reply = chat.post(0, 1557424, "Haaland says hi", id);
        assertEq(reply, 2);
    }

    function test_leagueRoomsAreMembersOnly() public {
        vm.prank(alice);
        chat.post(1, 1, "Bob's picks are a disgrace", 0);

        vm.prank(stranger);
        vm.expectRevert(TerraceChat.NotMember.selector);
        chat.post(1, 1, "let me in", 0);
    }

    function test_repliesStayInTheirRoom() public {
        vm.prank(alice);
        uint256 id = chat.post(1, 1, "Kop End only", 0);
        vm.prank(alice);
        vm.expectRevert(TerraceChat.BadInput.selector);
        chat.post(0, 1557424, "cross-posting", id);
    }

    function test_backingIsOncePerPersonAndNotYourOwn() public {
        vm.prank(alice);
        uint256 id = chat.post(1, 1, "Salah scores twice", 0);

        vm.prank(alice);
        vm.expectRevert(TerraceChat.BadInput.selector);
        chat.back(id);

        vm.prank(bob);
        chat.back(id);
        assertEq(chat.getMessage(id).backers, 1);

        vm.prank(bob);
        vm.expectRevert(TerraceChat.AlreadyBacked.selector);
        chat.back(id);

        vm.prank(stranger);
        vm.expectRevert(TerraceChat.NotMember.selector);
        chat.back(id);
    }

    function test_messagesHaveSensibleLengths() public {
        vm.prank(alice);
        vm.expectRevert(TerraceChat.BadInput.selector);
        chat.post(0, 1, "", 0);
    }
}
