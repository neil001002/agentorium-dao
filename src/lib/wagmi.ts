import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ target: "metaMask" }), injected()],
  transports: {
    [sepolia.id]: http(),
  },
});

export { sepolia };