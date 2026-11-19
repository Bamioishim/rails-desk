import { appendFileReceipt, readReceiptFile } from "../../../lib/file-receipts.mjs";

const filePath = () => process.env.RAILS_DESK_RECEIPTS_FILE || undefined;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(await readReceiptFile(filePath()), { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the receipt log.";
    return Response.json({ error: message }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const proposal = body?.proposal;
    const rails = body?.rails;
    if (!proposal || typeof proposal !== "object" || typeof proposal.recipient !== "string" || typeof proposal.reason !== "string" || !rails || typeof rails !== "object" ||
      !Array.isArray(rails.allowedRecipients) || !Number.isFinite(Number(rails.spendingCap)) ||
      !["approved", "refused", "cancelled"].includes(body.decision)) {
      return Response.json({ error: "A proposal, valid rails and a decision are required." }, { status: 400, headers: noStore });
    }
    const receipt = await appendFileReceipt({
      amount: Number.isFinite(Number(proposal.amount)) ? Number(proposal.amount) : 0,
      recipient: proposal.recipient,
      reason: proposal.reason,
      decision: body.decision,
      decisionReason: typeof body.decisionReason === "string" ? body.decisionReason : undefined,
      rails: { spendingCap: Number(rails.spendingCap), allowedRecipients: rails.allowedRecipients },
      filePath: filePath(),
    });
    const state = await readReceiptFile(filePath());
    return Response.json({ ...state, receipt }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to append the receipt.";
    const status = message.startsWith("Refusing to append") ? 409 : 500;
    return Response.json({ error: message }, { status, headers: noStore });
  }
}
