import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { getContract, readContract, prepareContractCall, sendTransaction, toEther, toWei } from "thirdweb";
import thirdwebIcon from "./thirdweb.svg";
import { client } from "./client";

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS as string ;

export function App() {
  return (
    <main className="p-4 pb-10 min-h-[100vh] flex items-center justify-center container max-w-screen-lg mx-auto">
      <div className="py-20 w-full">
        <Header />

        <div className="flex justify-center mb-10">
          <ConnectButton
            client={client}
            appMetadata={{
              name: "Deployer",
              url: "https://example.com",
            }}
          />
        </div>

        <DeploySection />

      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="flex flex-col items-center mb-10 md:mb-16">
      <img
        src={thirdwebIcon}
        alt=""
        className="w-32 object-center invert bg-white rounded-full p-3"
        style={{
          filter: "drop-shadow(0px 0px 24px #a726a9a8)",
        }}
      />

      <h1 className="text-2xl md:text-5xl font-bold tracking-tighter mb-4 text-zinc-100">
        Contract Deployer
      </h1>

      <p className="text-zinc-300 text-base text-center">
        Connect your wallet, review the fee, and deploy a new contract instance with a label.
      </p>
    </header>
  );
}

function DeploySection() {
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const [label, setLabel] = useState("");
  const [ownerNote, setOwnerNote] = useState("");
  const [customEther, setCustomEther] = useState("");
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Array<{ contractAddress: string; owner: string; creationTime: bigint }>>([]);

  const contract = useMemo(() => {
    if (!FACTORY_ADDRESS || !chain) return null;
    return getContract({ client, address: FACTORY_ADDRESS, chain });
  }, [chain]);

  // Read fee and paused state
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!contract) return;
      try {
        const fee = (await readContract({
          contract,
          // function deploymentFee() public view returns (uint256)
          method: "function deploymentFee() view returns (uint256)",
          params: [],
        })) as bigint;
        const isPaused = (await readContract({
          contract,
          method: "function paused() view returns (bool)",
          params: [],
        })) as boolean;
        if (!cancelled) {
          setFeeWei(fee);
          setPaused(isPaused);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [contract]);

  // Fetch user deployments
  useEffect(() => {
    let cancelled = false;
    async function fetchDeployments() {
      if (!contract || !account) return;
      try {
        const res = (await readContract({
          contract,
          method:
              "function getUserDeployments(address _user) view returns ((address contractAddress, address owner, string label, uint256 creationTime)[])",
          params: [account.address],
        })) as Array<{ contractAddress: string; owner: string; label: string; creationTime: bigint }>;
        if (!cancelled) setDeployments(res);
      } catch (e) {
        // ignore for now
      }
    }
    fetchDeployments();
    // re-fetch when account changes
  }, [contract, account?.address, success]);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!account) {
      setError("Connect your wallet first.");
      return;
    }
    if (!contract) {
      setError("Contract not configured. Set VITE_FACTORY_ADDRESS in .env.local and reload.");
      return;
    }
    if (paused) {
      setError("Factory is paused.");
      return;
    }

    try {
      setLoading(true);
      const value = feeWei??10000000000000000n;

      const tx = prepareContractCall({
        contract,
        method: "function createDeployment() payable",
        params: [],
        value,
      });
      const { transactionHash } = await sendTransaction({ transaction: tx, account });
      setSuccess(`Deployment tx sent: ${transactionHash}`);
      setCustomEther("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="w-full max-w-2xl mx-auto">
      {!FACTORY_ADDRESS && (
        <div className="mb-6 p-4 border border-yellow-700 bg-yellow-900/30 rounded text-yellow-200 text-sm">
          Missing VITE_FACTORY_ADDRESS env var. Add it to client/.env.local and restart dev server.
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Create Deployment</h2>
        <form onSubmit={handleDeploy} className="space-y-3">




          <div className="grid grid-cols-1  gap-3">
            <div className="text-sm text-zinc-400 border border-zinc-800 rounded p-3">
              <div className="flex items-center justify-between">
                <span>Required Fee</span>
                <strong className="text-zinc-200">
                  {feeWei !== null ? `${toEther(feeWei)}` : "—"}
                </strong>
              </div>
              <div className="mt-1 text-xs">This is configured on-chain by the factory owner.</div>
            </div>

          </div>

          <div className="flex items-center w-full justify-end gap-3">
            <button
              type="submit"
              disabled={!account || loading || paused}
              className="px-4 py-2 rounded bg-violet-600 disabled:bg-zinc-700 hover:bg-violet-500 transition-colors"
            >
              {loading ? "Deploying..." : paused ? "Paused" : "Deploy"}
            </button>
            {paused && <span className="text-xs text-red-400">Factory is paused</span>}
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}
          {success && <div className="text-green-400 text-sm">{success}</div>}
        </form>
      </div>

      {account && (
        <div className="mt-8 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-md font-semibold mb-3">My Deployments</h3>
          {deployments.length === 0 ? (
            <div className="text-zinc-400 text-sm">No deployments yet.</div>
          ) : (
            <ul className="space-y-2">
              {deployments.map((d, i) => (
                <li key={`${d.contractAddress}-${i}`} className="text-sm flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="text-zinc-500"> — {d.contractAddress}</span>
                  </span>
                  <span className="text-xs text-zinc-500">{new Date(Number(d.creationTime) * 1000).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}


