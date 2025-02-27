# USDN Rebase Event Tracker

A TypeScript script that tracks and analyzes rebase events for the USDN token on Ethereum. The script fetches historical rebase events, calculates token value changes, and provides a comprehensive summary of the token's rebase history.

## Features

- Tracks all rebase events from a specified starting block
- Calculates token value changes and percentage increases
- Provides detailed event information including timestamps and block numbers
- Generates a summary including:
  - First and latest rebase details
  - Total token value growth
  - Average time between rebases

## Configuration

Before running the script, update the following variables in the code:

```typescript
const PROVIDER_URL = "your-ethereum-node-url";
```

## Requirements

- Node.js
- ethers.js v5
- TypeScript

## Running the Script

1. Install dependencies:
```bash
npm install ethers@^5.7.2 typescript @types/node
```

2. Run the script:
```bash
ts-node usdnRebase.ts
```

The script includes automatic batch size adjustment to handle RPC limitations and will output results to the console as it processes events.
