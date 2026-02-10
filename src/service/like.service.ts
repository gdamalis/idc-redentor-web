import { connect } from "./database.service";

interface LikesDocument {
  slug: string;
  count: number;
  visitors: string[];
  updatedAt: Date;
}

interface LikesResult {
  count: number;
  hasLiked: boolean;
}

export async function getLikes(
  slug: string,
  visitorId?: string,
): Promise<LikesResult> {
  const client = await connect();
  if (!client) {
    throw new Error("Failed to connect to database");
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const doc = await collection.findOne({ slug });

    return {
      count: doc?.count ?? 0,
      hasLiked: visitorId ? (doc?.visitors?.includes(visitorId) ?? false) : false,
    };
  } catch (error) {
    console.error("Error fetching likes:", error);
    throw error;
  }
}

export async function toggleLike(
  slug: string,
  visitorId: string,
): Promise<LikesResult> {
  const client = await connect();
  if (!client) {
    throw new Error("Failed to connect to database");
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const existing = await collection.findOne({ slug });
    const alreadyLiked = existing?.visitors?.includes(visitorId) ?? false;

    if (alreadyLiked) {
      // Remove like
      await collection.updateOne(
        { slug },
        {
          $pull: { visitors: visitorId },
          $inc: { count: -1 },
          $set: { updatedAt: new Date() },
        },
      );
    } else {
      // Add like (upsert for first-time likes on this post)
      await collection.updateOne(
        { slug },
        {
          $addToSet: { visitors: visitorId },
          $inc: { count: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { slug },
        },
        { upsert: true },
      );
    }

    return {
      count: Math.max((existing?.count ?? 0) + (alreadyLiked ? -1 : 1), 0),
      hasLiked: !alreadyLiked,
    };
  } catch (error) {
    console.error("Error toggling like:", error);
    throw error;
  }
}
