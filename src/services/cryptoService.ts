export interface CryptoPrice {
  id: string;
  price: number;
  currency: string;
  timestamp: string;
}

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export async function getSolanaPrice(): Promise<number> {
  try {
    const response = await fetch(
      `${COINGECKO_BASE_URL}/simple/price?ids=solana&vs_currencies=usd`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as { solana: { usd: number } };
    return data.solana.usd;
  } catch (error) {
    console.error("Error fetching Solana price:", error);
    throw new Error("Failed to fetch Solana price from external API");
  }
}
