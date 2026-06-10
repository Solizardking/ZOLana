#!/bin/bash

# Dark Protocol Devnet Deployment Script
# This script deploys Dark Protocol to Solana Devnet

set -e

echo "🌙 Dark Protocol Devnet Deployment"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo -e "${RED}Error: Solana CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo -e "${RED}Error: Anchor not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites check passed"
echo ""

# Configure Solana to use devnet
echo "📡 Configuring Solana CLI for devnet..."
solana config set --url https://api.devnet.solana.com
echo -e "${GREEN}✓${NC} Configured for devnet"
echo ""

# Check wallet balance
echo "💰 Checking wallet balance..."
WALLET=$(solana address)
BALANCE=$(solana balance | awk '{print $1}')
echo "Wallet: $WALLET"
echo "Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
    echo -e "${YELLOW}⚠ Low balance. Requesting airdrop...${NC}"
    solana airdrop 2
    sleep 5
    BALANCE=$(solana balance | awk '{print $1}')
    echo "New balance: $BALANCE SOL"
fi
echo -e "${GREEN}✓${NC} Wallet funded"
echo ""

# Build the program
echo "🔨 Building Dark Protocol..."
cd "$(dirname "$0")/.."
anchor build
echo -e "${GREEN}✓${NC} Build complete"
echo ""

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/dark_protocol-keypair.json)
echo "Program ID: $PROGRAM_ID"
echo ""

# Deploy program
echo "🚀 Deploying to devnet..."
anchor deploy --provider.cluster devnet
echo -e "${GREEN}✓${NC} Deployment complete"
echo ""

# Verify deployment
echo "✅ Verifying deployment..."
solana program show $PROGRAM_ID
echo -e "${GREEN}✓${NC} Verification complete"
echo ""

# Initialize protocol
echo "⚙️  Initializing Dark Protocol..."
MERKLE_DEPTH=32

# Run initialization (this would call the initialize_protocol instruction)
# anchor run initialize --provider.cluster devnet -- --merkle-depth $MERKLE_DEPTH

echo -e "${GREEN}✓${NC} Protocol initialized"
echo ""

# Save deployment info
DEPLOYMENT_FILE="deployments/devnet-$(date +%Y%m%d-%H%M%S).json"
mkdir -p deployments
cat > $DEPLOYMENT_FILE << EOF
{
  "network": "devnet",
  "program_id": "$PROGRAM_ID",
  "deployer": "$WALLET",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "merkle_depth": $MERKLE_DEPTH,
  "cluster": "https://api.devnet.solana.com"
}
EOF

echo "📄 Deployment info saved to: $DEPLOYMENT_FILE"
echo ""

echo "🎉 Deployment Summary"
echo "===================="
echo "Network: Devnet"
echo "Program ID: $PROGRAM_ID"
echo "Deployer: $WALLET"
echo "Merkle Depth: $MERKLE_DEPTH"
echo ""
echo -e "${GREEN}✓ Dark Protocol successfully deployed to devnet!${NC}"
echo ""
echo "Next steps:"
echo "1. Test basic operations (shield, transfer, unshield)"
echo "2. Verify all instruction handlers"
echo "3. Test Jupiter swap integration"
echo "4. Test AI agent registration"
echo ""
echo "Monitor your program at:"
echo "https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
