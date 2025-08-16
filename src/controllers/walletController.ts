import { getSolanaPrice } from "../services/cryptoService";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
} from "@solana/spl-token";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

interface WalletState {
  address: string;
  currentBalance: number;
  previousBalance: number;
  subscriptionId?: number;
  lastUpdate: Date;
}

interface TokenState {
  mint: string;
  symbol: string;
  currentBalance: number;
  previousBalance: number;
  subscriptionId?: number;
  lastUpdate: Date;
  decimals: number;
}

const walletStates = new Map<string, WalletState>();
const tokenStates = new Map<string, TokenState>();

const getConnection = (): Connection => {
  const rpcUrl =
    process.env["SOLANA_RPC_URL"] || "https://api.mainnet-beta.solana.com";
  return new Connection(rpcUrl, "confirmed");
};

const getKeypair = (): Keypair => {
  const privateKeyString = process.env["ADMIN_PRIVATE_KEY"];
  if (!privateKeyString) {
    throw new Error("ADMIN_PRIVATE_KEY not found in environment variables");
  }

  const secretKeyBytes = bs58.decode(privateKeyString);
  return Keypair.fromSecretKey(secretKeyBytes);
};

// Get LLC token configuration
const getLLCTokenConfig = () => {
  const mintAddress = process.env["LLC_TOKEN_MINT"];
  const decimals = parseInt(process.env["LLC_TOKEN_DECIMALS"] || "9");

  if (!mintAddress) {
    throw new Error("LLC_TOKEN_MINT not found in environment variables");
  }

  return {
    mintAddress,
    decimals,
    symbol: "LLC",
  };
};

// Calculate LLC price based on SOL/LLC ratio
export const calculateLLCPrice = async (): Promise<number> => {
  try {
    const solBalance = await getWalletSolBalance();
    const llcBalance = await getWalletLLCBalance();

    if (llcBalance === 0) {
      throw new Error("No LLC tokens available to calculate price");
    }

    const llcPrice = solBalance / llcBalance;
    console.log(
      `💰 LLC Price: ${llcPrice.toFixed(
        6
      )} SOL per LLC (SOL: ${solBalance.toFixed(6)}, LLC: ${llcBalance.toFixed(
        6
      )})`
    );
    return llcPrice;
  } catch (error) {
    console.error("Error calculating LLC price:", error);
    throw new Error("Failed to calculate LLC price");
  }
};

// Send LLC tokens to a wallet
export const sendLLCTokens = async (
  toAddress: string,
  amount: number
): Promise<string> => {
  try {
    const connection = getConnection();
    const keypair = getKeypair();
    const { mintAddress, decimals } = getLLCTokenConfig();

    const mintPublicKey = new PublicKey(mintAddress);
    const toPublicKey = new PublicKey(toAddress);

    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      keypair.publicKey
    );
    const toTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      toPublicKey
    );

    // Convert amount to token units
    const tokenAmount = Math.floor(amount * Math.pow(10, decimals));

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      keypair.publicKey,
      tokenAmount
    );

    // Create and send transaction
    const transaction = new Transaction().add(transferInstruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      keypair,
    ]);

    console.log(`📤 Sent ${amount.toFixed(decimals)} LLC to ${toAddress}`);
    console.log(`🔗 Transaction: ${signature}`);

    return signature;
  } catch (error) {
    console.error("Error sending LLC tokens:", error);
    throw new Error("Failed to send LLC tokens");
  }
};

// Send SOL to a wallet
export const sendSOL = async (
  toAddress: string,
  amount: number
): Promise<string> => {
  try {
    const connection = getConnection();
    const keypair = getKeypair();
    const toPublicKey = new PublicKey(toAddress);

    // Convert SOL to lamports
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    // Create transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: toPublicKey,
      lamports,
    });

    // Create and send transaction
    const transaction = new Transaction().add(transferInstruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      keypair,
    ]);

    console.log(`📤 Sent ${amount.toFixed(6)} SOL to ${toAddress}`);
    console.log(`🔗 Transaction: ${signature}`);

    return signature;
  } catch (error) {
    console.error("Error sending SOL:", error);
    throw new Error("Failed to send SOL");
  }
};

// Get the sender address from recent transactions
const getRecentSender = async (
  walletAddress: string,
  assetType: string
): Promise<string | null> => {
  try {
    const connection = getConnection();
    const walletPublicKey = new PublicKey(walletAddress);

    // Get recent transactions for the wallet
    const signatures = await connection.getSignaturesForAddress(
      walletPublicKey,
      { limit: 3 }
    );

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(
          sig.signature,
          "confirmed"
        );
        if (!tx) continue;

        // Check if this is an incoming transaction
        if (assetType === "SOL") {
          // Look for SOL transfer to our wallet
          if (tx.meta && tx.transaction.message.instructions) {
            for (const instruction of tx.transaction.message.instructions) {
              if (
                "parsed" in instruction &&
                instruction.parsed?.type === "transfer"
              ) {
                const parsed = instruction.parsed;
                if (
                  parsed.info.destination === walletAddress &&
                  parsed.info.source !== walletAddress
                ) {
                  return parsed.info.source;
                }
              }
            }
          }
        } else if (assetType === "LLC") {
          // Look for token transfer to our wallet
          if (tx.meta && tx.transaction.message.instructions) {
            for (const instruction of tx.transaction.message.instructions) {
              if (
                "parsed" in instruction &&
                instruction.parsed?.type === "transfer"
              ) {
                const parsed = instruction.parsed;
                if (
                  parsed.info.destination === walletAddress &&
                  parsed.info.source !== walletAddress
                ) {
                  return parsed.info.source;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error parsing transaction ${sig.signature}:`, error);
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting recent sender:", error);
    return null;
  }
};

// Handle automatic token swapping
const handleAutomaticSwap = async (
  transactionType: string,
  amount: number,
  walletAddress: string
): Promise<void> => {
  try {
    console.log(
      `🔄 Processing automatic swap for ${transactionType} to ${walletAddress}`
    );

    // Determine asset type and get sender
    let assetType = "";
    if (transactionType.includes("INCOMING SOL")) {
      assetType = "SOL";
    } else if (transactionType.includes("INCOMING LLC")) {
      assetType = "LLC";
    }

    // Add a small delay to ensure transaction is confirmed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get the actual sender from recent transactions
    const senderAddress = await getRecentSender(walletAddress, assetType);
    if (!senderAddress) {
      console.log(
        `⚠️ Could not determine sender for ${transactionType}, skipping auto-swap`
      );
      return;
    }

    console.log(`🔄 Detected sender: ${senderAddress}`);

    // Calculate current LLC price (ratio changes every time)
    const solBalance = await getWalletSolBalance();
    const llcBalance = await getWalletLLCBalance();

    if (llcBalance === 0) {
      console.log(`⚠️ No LLC tokens available for swap`);
      return;
    }

    // Calculate current ratio: 1 LLC = solBalance / llcBalance
    const currentRatio = solBalance / llcBalance;
    console.log(
      `💰 Current ratio: 1 LLC = ${currentRatio.toFixed(
        6
      )} SOL (SOL: ${solBalance.toFixed(6)}, LLC: ${llcBalance.toFixed(6)})`
    );

    if (transactionType.includes("INCOMING SOL")) {
      // Admin received SOL from user, send LLC back to user
      // Calculate LLC amount: received SOL / current ratio
      const llcAmount = amount / currentRatio;
      console.log(
        `🔄 Auto-swap: Admin received ${amount.toFixed(
          6
        )} SOL from ${senderAddress}, sending ${llcAmount.toFixed(6)} LLC back`
      );
      await sendLLCTokens(senderAddress, llcAmount);
    } else if (transactionType.includes("INCOMING LLC")) {
      // Admin received LLC from user, send SOL back to user
      // Calculate SOL amount: received LLC * current ratio
      const solAmount = amount * currentRatio;
      console.log(
        `🔄 Auto-swap: Admin received ${amount.toFixed(
          6
        )} LLC from ${senderAddress}, sending ${solAmount.toFixed(6)} SOL back`
      );
      await sendSOL(senderAddress, solAmount);
    }
  } catch (error) {
    console.error("Error in automatic swap:", error);
  }
};

export const solPrice = async (): Promise<number> => {
  return await getSolanaPrice();
};

export const getWalletSolBalance = async (): Promise<number> => {
  try {
    const keypair = getKeypair();
    const connection = getConnection();

    const balance = await connection.getBalance(keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("Error getting wallet SOL balance:", error);
    throw new Error("Failed to get wallet SOL balance");
  }
};

// Get LLC token balance
export const getWalletLLCBalance = async (): Promise<number> => {
  try {
    const keypair = getKeypair();
    const connection = getConnection();
    const { mintAddress, decimals } = getLLCTokenConfig();

    const mintPublicKey = new PublicKey(mintAddress);
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      keypair.publicKey
    );

    try {
      const tokenAccount = await getAccount(connection, tokenAccountAddress);
      const balance = Number(tokenAccount.amount);
      return balance / Math.pow(10, decimals);
    } catch (error) {
      // Token account doesn't exist, return 0
      return 0;
    }
  } catch (error) {
    console.error("Error getting wallet LLC balance:", error);
    throw new Error("Failed to get wallet LLC balance");
  }
};

// Monitor LLC token balance changes
const monitorLLCTokenBalance = async (walletAddress: string): Promise<void> => {
  try {
    const connection = getConnection();
    const { mintAddress, decimals, symbol } = getLLCTokenConfig();
    const walletPublicKey = new PublicKey(walletAddress);
    const mintPublicKey = new PublicKey(mintAddress);

    // Get associated token account address
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      walletPublicKey
    );

    // Get initial token balance
    let initialBalance = 0;
    try {
      const tokenAccount = await getAccount(connection, tokenAccountAddress);
      initialBalance = Number(tokenAccount.amount) / Math.pow(10, decimals);
    } catch (error) {
      // Token account doesn't exist yet
      console.log(
        `🔍 No existing ${symbol} token account found for ${walletAddress}`
      );
    }

    // Initialize token state
    const tokenKey = `${walletAddress}-${mintAddress}`;
    tokenStates.set(tokenKey, {
      mint: mintAddress,
      symbol,
      currentBalance: initialBalance,
      previousBalance: initialBalance,
      decimals,
      lastUpdate: new Date(),
    });

    console.log(`🔍 Monitoring ${symbol} balance for ${walletAddress}...`);
    console.log(
      `💰 Initial ${symbol} balance: ${initialBalance.toFixed(
        decimals
      )} ${symbol}`
    );

    // Capture symbol in closure for the callback
    const tokenSymbol = symbol;

    // Subscribe to token account changes
    const subscriptionId = connection.onAccountChange(
      tokenAccountAddress,
      async () => {
        try {
          const tokenAccount = await getAccount(
            connection,
            tokenAccountAddress
          );
          const newTokenBalance =
            Number(tokenAccount.amount) / Math.pow(10, decimals);
          const timestamp = new Date();

          // Get previous state
          const tokenState = tokenStates.get(tokenKey);
          if (!tokenState) return;

          const previousBalance = tokenState.currentBalance;
          const balanceChange = newTokenBalance - previousBalance;

          // Update token state
          tokenState.previousBalance = previousBalance;
          tokenState.currentBalance = newTokenBalance;
          tokenState.lastUpdate = timestamp;

          // Determine transaction type and amount
          let transactionType = "";
          let transactionAmount = 0;

          if (balanceChange > 0) {
            transactionType = `📥 INCOMING ${tokenSymbol}`;
            transactionAmount = balanceChange;
          } else if (balanceChange < 0) {
            transactionType = `📤 OUTGOING ${tokenSymbol}`;
            transactionAmount = Math.abs(balanceChange);
          }

          // Log the transaction details
          if (balanceChange !== 0) {
            console.log(
              `${transactionType} [${timestamp.toISOString()}] ${walletAddress}:`
            );
            console.log(
              `   Previous: ${previousBalance.toFixed(decimals)} ${tokenSymbol}`
            );
            console.log(
              `   Current:  ${newTokenBalance.toFixed(decimals)} ${tokenSymbol}`
            );
            console.log(
              `   Change:   ${
                balanceChange > 0 ? "+" : ""
              }${balanceChange.toFixed(decimals)} ${tokenSymbol}`
            );
            console.log(
              `   Amount:   ${transactionAmount.toFixed(
                decimals
              )} ${tokenSymbol}`
            );
            console.log("─".repeat(60));

            // Handle automatic swap for incoming LLC
            if (balanceChange > 0) {
              await handleAutomaticSwap(
                transactionType,
                transactionAmount,
                walletAddress
              );
            }
          } else {
            // Minor balance updates
            console.log(
              `💰 [${timestamp.toISOString()}] ${tokenSymbol} balance updated: ${newTokenBalance.toFixed(
                decimals
              )} ${tokenSymbol} (no significant change)`
            );
          }
        } catch (error) {
          console.error(
            `Error processing ${tokenSymbol} account change:`,
            error
          );
        }
      },
      "confirmed"
    );

    // Store subscription ID
    const tokenState = tokenStates.get(tokenKey);
    if (tokenState) {
      tokenState.subscriptionId = subscriptionId;
    }
  } catch (error) {
    console.error(`Error setting up LLC token monitoring:`, error);
  }
};

export const monitorWalletBalance = async (
  walletAddress?: string
): Promise<number> => {
  try {
    const addressToMonitor = walletAddress || process.env["WALLET_PUBLIC_KEY"];

    if (!addressToMonitor) {
      throw new Error("No valid wallet address provided for monitoring");
    }

    const publicKey = new PublicKey(addressToMonitor);
    const connection = getConnection();

    // Get initial SOL balance
    const initialBalance = await connection.getBalance(publicKey);
    const initialSolBalance = initialBalance / LAMPORTS_PER_SOL;

    // Initialize wallet state
    walletStates.set(addressToMonitor, {
      address: addressToMonitor,
      currentBalance: initialSolBalance,
      previousBalance: initialSolBalance,
      lastUpdate: new Date(),
    });

    console.log(`🔍 Monitoring SOL balance for ${publicKey.toBase58()}...`);
    console.log(`💰 Initial SOL balance: ${initialSolBalance.toFixed(6)} SOL`);

    // Start monitoring LLC token balance
    await monitorLLCTokenBalance(addressToMonitor);

    const subscriptionId = connection.onAccountChange(
      publicKey,
      async (accountInfo) => {
        const lamports = accountInfo.lamports;
        const newSolBalance = lamports / LAMPORTS_PER_SOL;
        const timestamp = new Date();

        // Get previous state
        const walletState = walletStates.get(addressToMonitor);
        if (!walletState) return;

        const previousBalance = walletState.currentBalance;
        const balanceChange = newSolBalance - previousBalance;

        // Update wallet state
        walletState.previousBalance = previousBalance;
        walletState.currentBalance = newSolBalance;
        walletState.lastUpdate = timestamp;

        // Determine transaction type and amount
        let transactionType = "";
        let transactionAmount = 0;

        if (balanceChange > 0) {
          transactionType = "📥 INCOMING SOL";
          transactionAmount = balanceChange;
        } else if (balanceChange < 0) {
          transactionType = "📤 OUTGOING SOL";
          transactionAmount = Math.abs(balanceChange);
        }

        // Log the transaction details
        if (balanceChange !== 0) {
          console.log(
            `${transactionType} [${timestamp.toISOString()}] ${publicKey.toBase58()}:`
          );
          console.log(`   Previous: ${previousBalance.toFixed(6)} SOL`);
          console.log(`   Current:  ${newSolBalance.toFixed(6)} SOL`);
          console.log(
            `   Change:   ${
              balanceChange > 0 ? "+" : ""
            }${balanceChange.toFixed(6)} SOL`
          );
          console.log(`   Amount:   ${transactionAmount.toFixed(6)} SOL`);
          console.log("─".repeat(60));

          // Handle automatic swap for incoming SOL
          if (balanceChange > 0) {
            await handleAutomaticSwap(
              transactionType,
              transactionAmount,
              addressToMonitor
            );
          }
        } else {
          // Minor balance updates (e.g., rent changes)
          console.log(
            `💰 [${timestamp.toISOString()}] SOL balance updated: ${newSolBalance.toFixed(
              6
            )} SOL (no significant change)`
          );
        }
      },
      "confirmed"
    );

    // Store subscription ID
    const walletState = walletStates.get(addressToMonitor);
    if (walletState) {
      walletState.subscriptionId = subscriptionId;
    }

    return subscriptionId;
  } catch (error) {
    console.error("Error setting up wallet monitoring:", error);
    throw new Error("Failed to set up wallet monitoring");
  }
};

// Function to start monitoring when server starts
export const startWalletMonitoring = async (): Promise<void> => {
  try {
    console.log("🚀 Starting wallet monitoring service...");

    const walletAddress = process.env["WALLET_PUBLIC_KEY"];
    if (!walletAddress) {
      console.warn(
        "⚠️  WALLET_PUBLIC_KEY not set. Wallet monitoring disabled."
      );
      return;
    }

    await monitorWalletBalance(walletAddress);
    console.log("✅ Wallet monitoring service started successfully");
  } catch (error) {
    console.error("❌ Failed to start wallet monitoring:", error);
  }
};
