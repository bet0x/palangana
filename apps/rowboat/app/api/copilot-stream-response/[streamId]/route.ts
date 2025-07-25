import { getCustomerIdForProject, logUsage } from "@/app/lib/billing";
import { USE_BILLING } from "@/app/lib/feature_flags";
import { redisClient } from "@/app/lib/redis";
import { CopilotAPIRequest } from "@/app/lib/types/copilot_types";
import { streamMultiAgentResponse } from "@/app/lib/copilot/copilot";

export async function GET(request: Request, props: { params: Promise<{ streamId: string }> }) {
  const params = await props.params;
  // get the payload from redis
  const payload = await redisClient.get(`copilot-stream-${params.streamId}`);
  if (!payload) {
    return new Response("Stream not found", { status: 404 });
  }

  // parse the payload
  const { projectId, context, messages, workflow, dataSources } = CopilotAPIRequest.parse(JSON.parse(payload));

  // fetch billing customer id
  let billingCustomerId: string | null = null;
  if (USE_BILLING) {
    billingCustomerId = await getCustomerIdForProject(projectId);
  }

  const encoder = new TextEncoder();
  let messageCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Iterate over the copilot stream generator
        for await (const event of streamMultiAgentResponse(
          projectId,
          context,
          messages,
          workflow,
          dataSources || [],
        )) {
          // Check if this is a content event
          if ('content' in event) {
            messageCount++;
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(event)}\n\n`));
          }
        }

        controller.close();

        // increment copilot request count in billing
        if (USE_BILLING && billingCustomerId) {
          try {
            await logUsage(billingCustomerId, {
              type: "copilot_requests",
              amount: 1,
            });
          } catch (error) {
            console.error("Error logging usage", error);
          }
        }
      } catch (error) {
        console.error('Error processing copilot stream:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}