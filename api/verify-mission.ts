// Provide a minimal declaration for `process.env` to satisfy TypeScript
declare const process: {
  env: {
    OPENAI_API_KEY?: string;
  };
};

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type MissionRequest = {
  mission?: {
    title?: string;
    description?: string;
    successCriteria?: string;
  };
  image?: string;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const body = req.body as MissionRequest;
    const mission = body?.mission;
    const image = body?.image;

    if (!mission?.title || !image) {
      return res.status(400).json({
        error: "Mission title and image are required.",
      });
    }

    const prompt = `
You are WakeRun's mission verifier.

Determine whether the player successfully completed the mission shown below.

Mission title:
${mission.title}

Mission description:
${mission.description ?? "No description provided."}

Success criteria:
${mission.successCriteria ?? "The requested target or completed action must be clearly visible."}

Return only valid JSON in this exact shape:

{
  "completed": true,
  "confidence": 0.95,
  "reason": "Short explanation",
  "feedback": "Short message for the player"
}

Rules:
- completed must be true or false.
- confidence must be between 0 and 1.
- Be strict when the image is unclear.
- Do not include markdown or extra text.
`.trim();

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: image,
              detail: "low",
            },
          ],
        },
      ],
    });

    const rawResult = response.output_text?.trim();

    if (!rawResult) {
      throw new Error("OpenAI returned an empty response.");
    }

    let result;

    try {
      result = JSON.parse(rawResult);
    } catch {
      console.error("Invalid AI response:", rawResult);

      throw new Error(
        "OpenAI returned an invalid verification response."
      );
    }

    return res.status(200).json({
      completed: Boolean(result.completed),
      confidence:
        typeof result.confidence === "number"
          ? Math.min(1, Math.max(0, result.confidence))
          : 0,
      reason:
        typeof result.reason === "string"
          ? result.reason
          : "No reason provided.",
      feedback:
        typeof result.feedback === "string"
          ? result.feedback
          : result.completed
            ? "Mission completed."
            : "Target not verified yet.",
    });
  } catch (error) {
    console.error("Mission verification failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Unknown verification error.";

    return res.status(500).json({
      error: message,
    });
  }
}
      