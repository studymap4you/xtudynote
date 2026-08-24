function finiteSequence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sortConceptBlocks(blocks, conceptKeys) {
  const mappingOrder = new Map(conceptKeys.map((key, index) => [key, index]));
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => {
      const leftSequence = finiteSequence(left.block.sequence);
      const rightSequence = finiteSequence(right.block.sequence);
      if (leftSequence !== null || rightSequence !== null) {
        if (leftSequence === null) return 1;
        if (rightSequence === null) return -1;
        if (leftSequence !== rightSequence) return leftSequence - rightSequence;
      }
      const mappingDifference = (mappingOrder.get(left.block.conceptKey) ?? Number.MAX_SAFE_INTEGER)
        - (mappingOrder.get(right.block.conceptKey) ?? Number.MAX_SAFE_INTEGER);
      if (mappingDifference) return mappingDifference;
      const pageDifference = (Number(left.block.source?.page) || Number.MAX_SAFE_INTEGER)
        - (Number(right.block.source?.page) || Number.MAX_SAFE_INTEGER);
      if (pageDifference) return pageDifference;
      return left.index - right.index;
    })
    .map(({ block }) => block);
}

