/**
 * Storage Factory
 *
 * Automatically selects the appropriate storage backend based on environment variables.
 * Defaults to in-memory storage for easy local development.
 */

import { ItemStorage } from "./interface.js";
import { MemoryStorage } from "./memory.js";
import { DynamoDBStorage } from "./dynamodb.js";

// When running the tests we need an instance instead of a new one per call 
// so we can validate roundtrips
let instance: ItemStorage | null = null;

export function createStorage(): ItemStorage {
  if (instance) return instance;

  if (process.env.USE_DYNAMODB === "true") {
    console.log("📦 Using DynamoDB storage");
    instance = new DynamoDBStorage();
  } else {
    console.log("📦 Using in-memory storage");
    instance = new MemoryStorage();
  }

  return instance;
}

export * from "./interface.js";
