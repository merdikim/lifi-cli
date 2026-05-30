# LI.FI CLI

> **Note:** This CLI provides **read-only** tools — it does not sign or broadcast transactions. Quote responses include unsigned `transactionRequest` objects that must be signed and submitted externally using your own wallet.

A TypeScript CLI that wraps the [LI.FI REST API](https://li.quest) to give developers, integrators, and internal teams a scriptable, human-readable interface to cross-chain swap infrastructure.

## Quickstart

```bash
git clone https://github.com/lifinance/lifi-cli.git
cd lifi-cli
npm install && npm run build
node dist/lifi.cjs chains
```

Once published to npm:

```bash
npm install -g @lifi/cli
lifi chains
```

No API key required — works immediately with public rate limits. Add a key for higher throughput.

## Commands

### Token Information

```bash
lifi tokens --chain 1                    # List tokens on Ethereum
lifi tokens --chain 1 --min-price 100    # Filter by min USD price
lifi token 1 USDC                        # Get specific token detail
lifi token 1 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48   # By address
```

### Chain Information

```bash
lifi chains                    # List all supported chains
lifi chains --type EVM         # Filter by chain type
lifi chain 42161               # Get chain detail by ID
lifi chain arbitrum            # Get chain detail by name (case-insensitive)
```

### Quote & Swap

```bash
# With flags
lifi quote \
  --from ethereum --to arbitrum \
  --from-token USDC --to-token USDC \
  --amount 1000000000 \
  --from-address 0xd8dA...

# Interactive mode (prompts for missing flags)
lifi quote
```

### Routes

```bash
lifi routes \
  --from 1 --to 42161 \
  --from-token USDC --to-token USDC \
  --amount 1000000000 \
  --order CHEAPEST
```

### Transaction Status

```bash
lifi status 0xabc123...                  # One-shot status check
lifi status 0xabc123... --watch          # Poll until complete/failed
lifi status 0xabc123... --bridge hop     # Speed up lookup with bridge hint
```

### Connections

```bash
lifi connections                               # All connections
lifi connections --from-chain 1 --to-chain 42161  # Specific pair
```

### Tools (Bridges & DEXes)

```bash
lifi tools                     # List all bridges and DEXes
lifi tools --chain 1           # Filter by chain
```

### Gas

```bash
lifi gas                       # Gas prices for all chains
lifi gas 1                     # Detailed gas suggestion for Ethereum
```

### Earn

```bash
lifi earn vaults --chain 8453 --asset USDC        # List Earn vaults
lifi earn vaults --protocol aave --json           # Raw vault data
lifi earn vault 8453 0xVAULT_ADDRESS              # Get one vault
lifi earn chains                                  # Chains supported by Earn
lifi earn protocols                               # Protocols supported by Earn
lifi earn positions 0xYOUR_ADDRESS                # Wallet Earn positions
```

### API Key Management

```bash
lifi auth show                 # Display masked key
lifi auth test                 # Validate key against the API
```

### Health Check

```bash
lifi health                    # Check API connectivity and latency
```

### Balances & Allowances

Read on-chain balances and ERC-20 allowances directly via JSON-RPC (no signing).

```bash
# Native (gas) balance — EVM or Solana
lifi balance native --chain ethereum --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
lifi balance native --chain solana   --address 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

# ERC-20 / SPL token balance
lifi balance token --chain ethereum \
  --token  0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# ERC-20 allowance (EVM only)
lifi balance allowance --chain ethereum \
  --token   0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --owner   0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 \
  --spender 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE

# Override the public RPC when needed
lifi balance native --chain arbitrum --address 0x... --rpc https://arb1.example/v1
```

RPC URLs are pulled from the LI.FI chain catalog by default and tried in order on transient failures.

## Output Modes

| Mode | Trigger | Behaviour |
|------|---------|-----------|
| Human | Default (TTY detected) | Coloured tables, formatted amounts |
| Machine | `--json` flag or non-TTY pipe | Raw JSON, stable schema, no colour |

```bash
# Pipe-friendly — auto-detects non-TTY
lifi chains | jq '.chains[].name'

# Force JSON in terminal
lifi chains --json

# Disable colour
lifi chains --no-color

# Verbose errors with stack traces
lifi quote --from 1 --to 42161 --verbose
```

## Configuration

All configuration is via environment variables. No config files needed.

```bash
# LI.FI API key (higher rate limits)
export LIFI_API_KEY=your_key_here
```

Without `LIFI_API_KEY`, the CLI uses public rate limits (200 req/2hr). With a key, you get 200 req/min.
The same `LIFI_API_KEY` is sent to both LI.FI API hosts used by this CLI: `https://li.quest/v1` and `https://earn.li.fi/v1`.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments / usage |
| 3 | Authentication error |
| 4 | API error (rate limit, server error) |
| 5 | Network error (unreachable) |

## Common Chain IDs

| Chain | ID | Native Token |
|-------|-----|--------------|
| Ethereum | 1 | ETH |
| Polygon | 137 | MATIC |
| Arbitrum | 42161 | ETH |
| Optimism | 10 | ETH |
| BSC | 56 | BNB |
| Avalanche | 43114 | AVAX |
| Base | 8453 | ETH |

## Example Workflow: Cross-Chain Swap

```bash
# 1. Find chain IDs
lifi chains --type EVM

# 2. Look up token addresses
lifi token 1 USDC

# 3. Get best quote
lifi quote --from 1 --to 8453 --from-token USDC --to-token USDC --amount 1000000000 --from-address 0xYOUR_ADDRESS

# 4. (External) Approve tokens and sign transactionRequest with your wallet

# 5. Track progress
lifi status 0xTX_HASH --watch
```

## Installation

### npm (primary)

```bash
npm install -g @lifi/cli
```

### npx (no install)

```bash
npx @lifi/cli chains
```

## Development

```bash
git clone https://github.com/lifinance/lifi-cli.git
cd lifi-cli
npm install
npm run build
node dist/lifi.cjs --help
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build with tsup |
| `npm run dev` | Watch mode |
| `npm test` | Run tests (vitest) |
| `npm run typecheck` | Type check (tsc --noEmit) |

## License

MIT
