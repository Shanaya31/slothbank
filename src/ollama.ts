// Talks to a local Ollama server. No API key, no internet needed.
const HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const MODEL = process.env.SLOTH_MODEL ?? "gemma3:4b"; // check `ollama list` for your Gemma tag

export type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function chatJson(messages: Msg[], schema: object): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: schema, // structured outputs
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}
