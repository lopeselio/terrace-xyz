import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const TERRACE = new PublicKey("8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF");

describe("init-arcium-signer-pda", () => {
  it("creates ArciumSignerAccount PDA", async () => {
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = (provider.wallet as anchor.Wallet).publicKey;

    const [signPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ArciumSignerAccount")],
      TERRACE
    );
    console.log("\nArciumSignerAccount PDA:", signPda.toBase58());

    // Check if already exists
    const existing = await provider.connection.getAccountInfo(signPda, "confirmed");
    if (existing) {
      console.log("✅ ArciumSignerAccount already exists! Owner:", existing.owner.toBase58());
      console.log("   Data (hex):", Buffer.from(existing.data).toString("hex"));
      return;
    }

    const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../../programs/scripts/../target/idl/terrace.json"), "utf8"));
    const ix_meta = (idl.instructions as any[]).find((i: any) => i.name === "init_arcium_signer_pda");
    const disc = Buffer.from(ix_meta.discriminator as number[]);

    const ix = new web3.TransactionInstruction({
      programId: TERRACE,
      keys: [
        { pubkey: wallet,                  isSigner: true,  isWritable: true  },
        { pubkey: signPda,                 isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: disc,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    console.log("  ✓ init_arcium_signer_pda");
    console.log("    https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
    console.log("  ✅ ArciumSignerAccount created:", signPda.toBase58());
  });
});
