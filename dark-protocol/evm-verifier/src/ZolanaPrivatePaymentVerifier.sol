// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title ZOLana private-payment EVM intent verifier
/// @notice Verifies EIP-712 signatures over Solana-anchored private-payment receipts.
/// @dev This contract does not settle funds. It consumes a proof that binds x402/AP2/M2M
///      payment intent metadata to a Solana Memo signature and prevents replay by digest.
contract ZolanaPrivatePaymentVerifier {
    struct PrivatePaymentIntent {
        string receiptId;
        string rail;
        string settlement;
        string proofLayer;
        bool durableReceipt;
        string recipient;
        string amountLamports;
        string commitmentHex;
        string nonce;
        string memoHash;
        string solanaSignature;
        string solanaCluster;
        string createdAt;
    }

    bytes32 public constant PRIVATE_PAYMENT_INTENT_TYPEHASH = keccak256(
        "PrivatePaymentIntent(string receiptId,string rail,string settlement,string proofLayer,bool durableReceipt,string recipient,string amountLamports,string commitmentHex,string nonce,string memoHash,string solanaSignature,string solanaCluster,string createdAt)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(bytes32 => bool) public consumedProofs;

    event PrivatePaymentIntentVerified(
        bytes32 indexed digest,
        address indexed signer,
        string receiptId,
        string rail,
        string settlement,
        string proofLayer,
        string solanaSignature,
        string solanaCluster,
        uint256 solanaSlot
    );

    error InvalidSignature();
    error ProofAlreadyConsumed(bytes32 digest);
    error ReceiptMustBeDurable();
    error UnsupportedRail(string rail);
    error MissingSolanaAnchor();

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ZOLana Dark Private Payment")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashIntent(PrivatePaymentIntent memory intent) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashIntentStruct(intent))
        );
    }

    function hashIntentStruct(PrivatePaymentIntent memory intent) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PRIVATE_PAYMENT_INTENT_TYPEHASH,
                keccak256(bytes(intent.receiptId)),
                keccak256(bytes(intent.rail)),
                keccak256(bytes(intent.settlement)),
                keccak256(bytes(intent.proofLayer)),
                intent.durableReceipt,
                keccak256(bytes(intent.recipient)),
                keccak256(bytes(intent.amountLamports)),
                keccak256(bytes(intent.commitmentHex)),
                keccak256(bytes(intent.nonce)),
                keccak256(bytes(intent.memoHash)),
                keccak256(bytes(intent.solanaSignature)),
                keccak256(bytes(intent.solanaCluster)),
                keccak256(bytes(intent.createdAt))
            )
        );
    }

    function verifyIntent(
        PrivatePaymentIntent memory intent,
        address signer,
        bytes memory signature
    ) public view returns (bool) {
        _validateIntentShape(intent);
        return recover(hashIntent(intent), signature) == signer;
    }

    function recordIntentProof(
        PrivatePaymentIntent memory intent,
        address signer,
        bytes memory signature,
        uint256 solanaSlot
    ) external returns (bytes32 digest) {
        _validateIntentShape(intent);
        digest = hashIntent(intent);
        if (consumedProofs[digest]) revert ProofAlreadyConsumed(digest);
        if (recover(digest, signature) != signer) revert InvalidSignature();

        consumedProofs[digest] = true;
        emit PrivatePaymentIntentVerified(
            digest,
            signer,
            intent.receiptId,
            intent.rail,
            intent.settlement,
            intent.proofLayer,
            intent.solanaSignature,
            intent.solanaCluster,
            solanaSlot
        );
    }

    function recover(bytes32 digest, bytes memory signature) public pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
        return recovered;
    }

    function _validateIntentShape(PrivatePaymentIntent memory intent) internal pure {
        if (!intent.durableReceipt) revert ReceiptMustBeDurable();
        if (bytes(intent.solanaSignature).length == 0) revert MissingSolanaAnchor();

        bytes32 rail = keccak256(bytes(intent.rail));
        if (
            rail != keccak256(bytes("x402")) &&
            rail != keccak256(bytes("ap2")) &&
            rail != keccak256(bytes("m2m"))
        ) {
            revert UnsupportedRail(intent.rail);
        }
    }
}

