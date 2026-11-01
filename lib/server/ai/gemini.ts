import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { generateValidated, toModelSchema, type AiProvider, type AiRequest } from './provider'

/** The only file that talks to Gemini. Structured output via `responseJsonSchema`; Zod re-validates every answer. */
export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI

  constructor(apiKey: string, private model: string) {
    this.client = new GoogleGenAI({ apiKey })
  }

  generateJson<T>(req: AiRequest<T>): Promise<T> {
    const responseJsonSchema = toModelSchema(req.schema)
    return generateValidated(req, this.model, async (user, timeoutMs) => {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: user,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema,
          maxOutputTokens: req.maxOutputTokens,
          temperature: req.temperature,
          // No thinking: the token caps go to the JSON itself. `thinkingBudget: 0` is accepted by gemini-3.6-flash and
          // gemini-3.8-flash; `thinkingLevel: MINIMAL` is rejected by 3.8 (checked against the live API, Nov 2026).
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      })
      return res.text ?? ''
    })
  }
}
