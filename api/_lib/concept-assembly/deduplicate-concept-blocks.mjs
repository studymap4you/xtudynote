export function deduplicateConceptBlocks(blocks) {
  const recordIds = new Set();
  const conceptKeys = new Set();
  const contentHashes = new Set();
  const unique = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (
      recordIds.has(block.recordId)
      || conceptKeys.has(block.conceptKey)
      || contentHashes.has(block.contentHash)
    ) continue;
    recordIds.add(block.recordId);
    conceptKeys.add(block.conceptKey);
    contentHashes.add(block.contentHash);
    unique.push(block);
  }
  return unique;
}

