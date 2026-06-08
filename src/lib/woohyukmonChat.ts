export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WoohyukmonChatResponse = {
  content: string;
  source: "openai" | "mock";
};

export async function requestWoohyukmonChat(messages: ChatMessage[]): Promise<WoohyukmonChatResponse> {
  const response = await fetch("/api/woohyukmon-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      context: "xuniverse-site-assistant",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<WoohyukmonChatResponse> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Woohyukmon chat request failed");
  }

  if (!payload.content || (payload.source !== "openai" && payload.source !== "mock")) {
    throw new Error("Invalid Woohyukmon chat response");
  }

  return {
    content: payload.content,
    source: payload.source,
  };
}
