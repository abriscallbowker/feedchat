import OpenAI from "openai";
import { storage } from "./firebase";
import type { Logger } from "pino";

const openaiKey =
  process.env.OPENAI_MODERATION_API_KEY?.trim() ??
  process.env.OPENAI_API_KEY?.trim() ??
  process.env.OPENAI_SECRET_KEY?.trim() ??
  "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

export async function moderateAndEnforceProfilePic(
  imageBuffer: Buffer,
  storagePath: string,
  log: Logger,
): Promise<void> {
  if (!openai) {
    log.info({ storagePath }, "Moderation disabled (missing OpenAI key)");
    return;
  }
  const base64Image = imageBuffer.toString("base64");
  const dataUrl = `data:image/webp;base64,${base64Image}`;

  let flagged = false;

  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ],
    });

    flagged = response.results[0]?.flagged ?? false;

    log.info(
      { storagePath, flagged, categories: response.results[0]?.categories },
      "Moderation check complete",
    );
  } catch (err) {
    log.error({ err, storagePath }, "Moderation API call failed — image kept");
    return;
  }

  if (flagged) {
    try {
      await storage.bucket().file(storagePath).delete();
      log.warn(
        { storagePath },
        "Profile picture flagged by moderation and removed from storage",
      );
    } catch (err) {
      log.error(
        { err, storagePath },
        "Failed to delete flagged profile picture from storage",
      );
    }
  }
}
