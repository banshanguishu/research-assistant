export interface ReflectionResult {
  status: "PASS" | "FAIL" | null;
  finalAnswer: string;
  reason: string;
  nextAction: string;
}

export function parseReflectionResult(content: string): ReflectionResult {
  const normalizedContent = content.trim();
  const statusMatch = normalizedContent.match(
    /REFLECTION_STATUS:\s*(PASS|FAIL)/i,
  );
  const reasonMatch = normalizedContent.match(
    /REASON:\s*([\s\S]*?)(?:\n[A-Z_]+:|$)/i,
  );
  const nextActionMatch = normalizedContent.match(
    /NEXT_ACTION:\s*([\s\S]*?)(?:\n[A-Z_]+:|$)/i,
  );
  const finalAnswerMatch = normalizedContent.match(
    /FINAL_ANSWER:\s*([\s\S]*)$/i,
  );

  return {
    status: (statusMatch?.[1]?.toUpperCase() as ReflectionResult["status"]) ?? null,
    finalAnswer: finalAnswerMatch?.[1]?.trim() ?? "",
    reason: reasonMatch?.[1]?.trim() ?? "",
    nextAction: nextActionMatch?.[1]?.trim() ?? "",
  };
}
