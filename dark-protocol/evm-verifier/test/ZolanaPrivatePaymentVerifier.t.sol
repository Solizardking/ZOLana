// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../src/ZolanaPrivatePaymentVerifier.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
}

contract ZolanaPrivatePaymentVerifierTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ZolanaPrivatePaymentVerifier private verifier;

    function setUp() public {
        verifier = new ZolanaPrivatePaymentVerifier();
    }

    function testRecordIntentProofConsumesDigest() public {
        uint256 privateKey = 0xA11CE;
        address signer = vm.addr(privateKey);
        ZolanaPrivatePaymentVerifier.PrivatePaymentIntent memory intent = _intent("x402");
        bytes32 digest = verifier.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

        bytes32 recorded = verifier.recordIntentProof(intent, signer, abi.encodePacked(r, s, v), 12345);
        require(recorded == digest, "digest mismatch");
        require(verifier.consumedProofs(digest), "proof not consumed");
    }

    function testRejectsReplay() public {
        uint256 privateKey = 0xB0B;
        address signer = vm.addr(privateKey);
        ZolanaPrivatePaymentVerifier.PrivatePaymentIntent memory intent = _intent("ap2");
        bytes32 digest = verifier.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        verifier.recordIntentProof(intent, signer, signature, 12345);
        vm.expectRevert();
        verifier.recordIntentProof(intent, signer, signature, 12345);
    }

    function testRejectsUnsupportedRail() public {
        uint256 privateKey = 0xCAFE;
        address signer = vm.addr(privateKey);
        ZolanaPrivatePaymentVerifier.PrivatePaymentIntent memory intent = _intent("badrail");
        bytes32 digest = verifier.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

        vm.expectRevert();
        verifier.recordIntentProof(intent, signer, abi.encodePacked(r, s, v), 12345);
    }

    function _intent(string memory rail)
        internal
        pure
        returns (ZolanaPrivatePaymentVerifier.PrivatePaymentIntent memory)
    {
        return ZolanaPrivatePaymentVerifier.PrivatePaymentIntent({
            receiptId: "pay_mabc123_0001",
            rail: rail,
            settlement: "solana",
            proofLayer: "evm",
            durableReceipt: true,
            recipient: "zsol1testrecipient",
            amountLamports: "250000000",
            commitmentHex: "0x9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c",
            nonce: "0x0102030405060708090a0b0c0d0e0f10",
            memoHash: "0x00000000000000000000000000000000",
            solanaSignature: "5SolanaMemoSignature111111111111111111111111111111111",
            solanaCluster: "devnet",
            createdAt: "1760000000000"
        });
    }
}
