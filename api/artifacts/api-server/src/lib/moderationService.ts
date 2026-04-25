import OpenAI from "openai";
import { storage } from "./firebase.js";
import type { Logger } from "pino";

const openai = new OpenAI({ apiKey: process.env.OPENAI_MODERATION_API_KEY });

export async function moderateAndEnforceProfilePic(
  imageBuffer: Buffer,
  storagePath: string,
  log: Logger,
): Promise<void> {
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
