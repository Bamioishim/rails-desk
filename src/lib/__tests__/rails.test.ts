import { describe, expect, it } from "vitest";
import { checkProposal, appendReceipt, verifyChain, DEFAULT_RAILS, type Proposal } from "../rails";
const proposal = (amount:number, recipient="Alex"):Proposal => ({id:"p1",amount,recipient,reason:"test reason",createdAt:"2026-11-19T00:00:00.000Z"});
describe("referee",()=>{
 it("approves an allowed recipient within the cap",()=>expect(checkProposal(proposal(10),DEFAULT_RAILS).decision).toBe("approved"));
 it("refuses an amount above the cap",()=>expect(checkProposal(proposal(21),DEFAULT_RAILS).reason).toContain("spending cap"));
 it("refuses a recipient outside the allowlist",()=>expect(checkProposal(proposal(10,"Mallory"),DEFAULT_RAILS).reason).toContain("allowed list"));
 it("matches recipient names case-insensitively",()=>expect(checkProposal(proposal(10,"aLeX"),DEFAULT_RAILS).decision).toBe("approved"));
 it("refuses non-positive amounts",()=>expect(checkProposal(proposal(0),DEFAULT_RAILS).decision).toBe("refused"));
});
describe("receipt chain",()=>{
 it("verifies a valid chain",async()=>{const one=await appendReceipt([],proposal(10),"approved","ok");const two=await appendReceipt(one,proposal(5,"Sam"),"cancelled","cancelled");expect(await verifyChain(two)).toEqual({valid:true,brokenAt:null})});
 it("detects a modified receipt",async()=>{const one=await appendReceipt([],proposal(10),"approved","ok");const changed=[{...one[0],amount:100}];expect(await verifyChain(changed)).toEqual({valid:false,brokenAt:1})});
});

describe("K¶»§q«^