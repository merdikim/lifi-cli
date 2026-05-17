import { readFile } from "node:fs/promises";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import {
  Contract,
  type TransactionRequest as EthersTransactionRequest,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
} from "ethers";
import qrCode from "qrcode-terminal";
import type {
  ApprovalResult,
  ExecutionConfig,
  ExecutionWallet,
  QuoteAction,
  QuoteEstimate,
  SendTransactionResult,
  TransactionRequest,
} from "../types/index.js";
import { DEFAULT_CHAIN_RPC_URLS, ExitCode } from "./constants.js";
import { CliError } from "./errors.js";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const ERC20_INTERFACE = new Interface(ERC20_ABI);
const WALLET_CONNECT_METHODS = [
  "eth_accounts",
  "eth_requestAccounts",
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
];
const WALLET_CONNECT_EVENTS = ["accountsChanged", "chainChanged", "connect", "disconnect"];

async function normalizePrivateKey(walletPath: string | undefined): Promise<string> {
  const value = walletPath ? (await readFile(walletPath, "utf8")).trim() : process.env["PRIVATE_KEY"]?.trim();
  if (!value) {
    throw new CliError(
      "Missing private key for transaction execution",
      ExitCode.InvalidArgs,
      "Pass --wallet-path or set PRIVATE_KEY. Use a dedicated wallet with limited funds.",
    );
  }
  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeRpcUrl(rpcUrl: string | undefined, chainId: number | string | undefined): string {
  const value = rpcUrl || (chainId !== undefined ? DEFAULT_CHAIN_RPC_URLS[String(chainId)] : undefined);
  if (!value) {
    throw new CliError(
      "Missing RPC URL for transaction execution",
      ExitCode.InvalidArgs,
      "Pass --rpc-url or use a chain with a bundled public RPC URL.",
    );
  }
  return value;
}

function normalizeWalletConnectProjectId(projectId: string | undefined): string {
  const value = projectId || process.env["WALLETCONNECT_PROJECT_ID"] || process.env["WC_PROJECT_ID"];
  if (!value) {
    throw new CliError(
      "Missing WalletConnect project ID",
      ExitCode.InvalidArgs,
      "Pass --wallet-connect-project-id or set WALLETCONNECT_PROJECT_ID.",
    );
  }
  return value;
}

function normalizeChainId(chainId: number | string | undefined): number {
  const value = Number(chainId);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliError("WalletConnect requires a numeric EVM chain ID", ExitCode.InvalidArgs);
  }
  return value;
}

function isNativeTokenAddress(address: string | undefined): boolean {
  if (!address) return true;
  const normalized = address.toLowerCase();
  return normalized === ZeroAddress.toLowerCase() || normalized === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function requireTransactionRequest(transactionRequest: TransactionRequest | undefined): TransactionRequest {
  if (!transactionRequest?.to) {
    throw new CliError(
      "Missing transactionRequest in LI.FI response",
      ExitCode.General,
      "Re-fetch the quote or route transaction before executing.",
    );
  }
  return transactionRequest;
}

function toQuantity(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.startsWith("0x")) return value;
  return `0x${BigInt(value).toString(16)}`;
}

function toEthersTransactionRequest(transactionRequest: TransactionRequest): EthersTransactionRequest {
  const request: EthersTransactionRequest = {};
  if (transactionRequest.to) request.to = transactionRequest.to;
  if (transactionRequest.from) request.from = transactionRequest.from;
  if (transactionRequest.data) request.data = transactionRequest.data;
  if (transactionRequest.value) request.value = transactionRequest.value;
  if (transactionRequest.gasLimit) request.gasLimit = transactionRequest.gasLimit;
  if (transactionRequest.gasPrice) request.gasPrice = transactionRequest.gasPrice;
  if (transactionRequest.maxFeePerGas) request.maxFeePerGas = transactionRequest.maxFeePerGas;
  if (transactionRequest.maxPriorityFeePerGas) request.maxPriorityFeePerGas = transactionRequest.maxPriorityFeePerGas;
  if (transactionRequest.nonce !== undefined) request.nonce = transactionRequest.nonce;
  if (transactionRequest.chainId !== undefined) request.chainId = transactionRequest.chainId;
  return request;
}

function toWalletConnectTransactionRequest(
  wallet: ExecutionWallet,
  transactionRequest: TransactionRequest | undefined,
): Record<string, string> {
  const request = requireTransactionRequest(transactionRequest);
  const tx: Record<string, string> = { from: wallet.address };
  if (request.to) tx["to"] = request.to;
  if (request.data) tx["data"] = request.data;
  if (request.value) tx["value"] = toQuantity(request.value) ?? "0x0";
  if (request.gasLimit) tx["gas"] = toQuantity(request.gasLimit) ?? "0x0";
  if (request.gasPrice) tx["gasPrice"] = toQuantity(request.gasPrice) ?? "0x0";
  if (request.maxFeePerGas) tx["maxFeePerGas"] = toQuantity(request.maxFeePerGas) ?? "0x0";
  if (request.maxPriorityFeePerGas) tx["maxPriorityFeePerGas"] = toQuantity(request.maxPriorityFeePerGas) ?? "0x0";
  if (request.nonce !== undefined) tx["nonce"] = toQuantity(request.nonce) ?? "0x0";
  return tx;
}

async function createWalletConnectWallet(
  config: ExecutionConfig,
  chainId: number | string | undefined,
): Promise<ExecutionWallet> {
  const numericChainId = normalizeChainId(chainId);
  const rpcUrl = normalizeRpcUrl(config.rpcUrl, numericChainId);
  const provider = new JsonRpcProvider(rpcUrl);
  const walletConnectProvider = await EthereumProvider.init({
    projectId: normalizeWalletConnectProjectId(config.walletConnectProjectId),
    optionalChains: [numericChainId],
    showQrModal: false,
    methods: WALLET_CONNECT_METHODS,
    events: WALLET_CONNECT_EVENTS,
    rpcMap: { [numericChainId]: rpcUrl },
    metadata: {
      name: "LI.FI CLI",
      description: "LI.FI Composer transaction signing",
      url: "https://li.fi",
      icons: ["https://li.fi/favicon.ico"],
    },
  });

  walletConnectProvider.on("display_uri", (uri: string) => {
    console.error("\nScan this WalletConnect QR code with your wallet:\n");
    qrCode.generate(uri, { small: true }, (code) => console.error(code));
    console.error(`WalletConnect URI: ${uri}\n`);
  });

  await walletConnectProvider.connect({ chains: [numericChainId], rpcMap: { [numericChainId]: rpcUrl } });
  const accounts =
    walletConnectProvider.accounts.length > 0
      ? walletConnectProvider.accounts
      : await walletConnectProvider.request<string[]>({ method: "eth_accounts" });
  const address = accounts[0];
  if (!address) {
    throw new CliError(
      "No account returned from WalletConnect",
      ExitCode.General,
      "Approve the session in your wallet.",
    );
  }
  return { kind: "walletConnect", address, provider, walletConnectProvider };
}

export async function createWallet(
  config: ExecutionConfig,
  chainId: number | string | undefined,
): Promise<ExecutionWallet> {
  if (config.walletConnect) return createWalletConnectWallet(config, chainId);
  const provider = new JsonRpcProvider(normalizeRpcUrl(config.rpcUrl, chainId));
  const signer = new Wallet(await normalizePrivateKey(config.walletPath), provider);
  return { kind: "privateKey", address: signer.address, provider, signer };
}

export async function ensureAllowance(
  wallet: ExecutionWallet,
  action: QuoteAction | undefined,
  estimate: QuoteEstimate | undefined,
): Promise<ApprovalResult> {
  const tokenAddress = action?.fromToken?.address;
  const approvalAddress = estimate?.approvalAddress;
  const amount = action?.fromAmount;

  if (isNativeTokenAddress(tokenAddress)) return { approved: false };
  if (!tokenAddress || !approvalAddress || !amount) {
    throw new CliError(
      "Missing allowance data in LI.FI response",
      ExitCode.General,
      "The response must include action.fromToken.address, action.fromAmount, and estimate.approvalAddress.",
    );
  }

  const erc20 = new Contract(tokenAddress, ERC20_ABI, wallet.kind === "privateKey" ? wallet.signer : wallet.provider);
  const owner = wallet.address;
  const allowance = erc20.getFunction("allowance");
  const currentAllowance = (await allowance(owner, approvalAddress)) as bigint;
  const requiredAllowance = BigInt(amount);
  if (currentAllowance >= requiredAllowance) return { approved: false };

  if (wallet.kind === "privateKey") {
    const approve = erc20.getFunction("approve");
    const tx = await approve(approvalAddress, requiredAllowance);
    const receipt = await tx.wait();
    return { approved: true, hash: receipt?.hash ?? tx.hash };
  }

  const hash = await wallet.walletConnectProvider.request<string>({
    method: "eth_sendTransaction",
    params: [
      {
        from: wallet.address,
        to: tokenAddress,
        data: ERC20_INTERFACE.encodeFunctionData("approve", [approvalAddress, requiredAllowance]),
        value: "0x0",
      },
    ],
  });
  await wallet.provider.waitForTransaction(hash);
  return { approved: true, hash };
}

export async function sendTransactionRequest(
  wallet: ExecutionWallet,
  transactionRequest: TransactionRequest | undefined,
): Promise<SendTransactionResult> {
  if (wallet.kind === "walletConnect") {
    const hash = await wallet.walletConnectProvider.request<string>({
      method: "eth_sendTransaction",
      params: [toWalletConnectTransactionRequest(wallet, transactionRequest)],
    });
    const receipt = await wallet.provider.waitForTransaction(hash);
    const result: SendTransactionResult = { hash };
    if (receipt?.blockNumber !== undefined) result.blockNumber = receipt.blockNumber;
    return result;
  }

  const tx = await wallet.signer.sendTransaction(
    toEthersTransactionRequest(requireTransactionRequest(transactionRequest)),
  );
  const receipt = await tx.wait();
  const result: SendTransactionResult = { hash: tx.hash };
  if (receipt?.blockNumber !== undefined) result.blockNumber = receipt.blockNumber;
  return result;
}
