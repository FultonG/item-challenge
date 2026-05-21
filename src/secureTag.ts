/**
 *
 * NOTE: PLEASE USE PREFERRED LANGUAGE
 * 
 * Part 1: Most Frequent Secure Tag
 *
 * You are given an array of ExamItem objects.
 *
 * Implement the function `mostFrequentSecureTag`.
 *
 * Rules:
 * - Only consider items where:
 *     - securityLevel === "secure" OR
 *     - securityLevel === "highly-secure"
 * - Count every occurrence of every tag across those items.
 * - Return the tag that appears the most total times.
 * - If there is a tie, you may return any one of them.
 * - If there are no secure items, or no tags on secure items,
 *   return null.
 *
 * Example:
 *
 * const items = [
 *   {
 *     id: "1",
 *     securityLevel: "secure",
 *     metadata: { tags: ["algebra", "functions"] },
 *   },
 *   {
 *     id: "2",
 *     securityLevel: "highly-secure",
 *     metadata: { tags: ["algebra"] },
 *   },
 *   {
 *     id: "3",
 *     securityLevel: "standard",
 *     metadata: { tags: ["algebra"] },
 *   },
 * ];
 *
 * mostFrequentSecureTag(items); // "algebra"
 */

/**
 * Minimal ExamItem shape needed for this exercise.
 */
export interface ExamItem {
  id: string;
  metadata: {
    tags: string[];
  };
  securityLevel: string; // "standard" | "secure" | "highly-secure"
}



export function mostFrequentSecureTag(
  items: ExamItem[]
): string | null {
  if(items.length === 0){
    return null
  }
  let tagMap = new Map();

  //could probably use a flatmap here or something similar
  items.forEach(item => {
    const {securityLevel, metadata: {tags}} = item;
    if(securityLevel === 'secure' || securityLevel === 'highly-secure'){
      tags.forEach(tag => {
        if(tagMap.has(tag)){
          tagMap.set(tag, tagMap.get(tag) + 1);
        } else {
          tagMap.set(tag, 1);
        }
      })
    }
  })

  let mostFrequentTag = null;
  let frequency = 0;

  for(const [key, value] of tagMap){
    if(value > frequency){
      mostFrequentTag = key;
      frequency = value;
    }
  }

  return mostFrequentTag;
}

const items = [
    {
      id: "1",
      securityLevel: "standard",
      metadata: { tags: ["algebra", "functions"] },
    },
    {
      id: "2",
      securityLevel: "standard",
      metadata: { tags: ["algebra"] },
    },
    {
      id: "3",
      securityLevel: "standard",
      metadata: { tags: ["algebra"] },
    },
  ];
 
 let ans = mostFrequentSecureTag(items); // "algebra"
 console.log(ans);
