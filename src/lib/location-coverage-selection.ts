import {
  selectProjectKnowledge,
  type KnowledgeRecord,
  type KnowledgeSource,
  type KnowledgeScope,
} from "./project-knowledge";
import { parseCoverage } from "./location-coverage";
export function coverageRows(
  sources: KnowledgeSource[],
  records: KnowledgeRecord[],
  scope: KnowledgeScope,
  now: string,
) {
  const selected = selectProjectKnowledge(sources, records, scope, "text", now);
  const eligible = new Set(selected.records.map((r) => r.id));
  const scoped = records.filter(
    (r) =>
      r.ownerId === scope.ownerId &&
      r.projectId === scope.projectId &&
      r.key.startsWith("coverage."),
  );
  const parsed = scoped.map((record) => ({ record, value: parseCoverage(record) }));
  return parsed.map(({ record, value }) => {
    const conflict = selected.conflicts.includes(record.key);
    const state = !value
      ? "invalid"
      : conflict
        ? "conflict"
        : eligible.has(record.id)
          ? "reviewed"
          : "unavailable";
    const source = sources.find(
      (s) =>
        s.id === record.sourceId && s.ownerId === scope.ownerId && s.projectId === scope.projectId,
    );
    const canReview =
      !!value &&
      !!source &&
      source.status === "active" &&
      source.revision === record.sourceRevision &&
      Date.parse(source.observedAt) <= Date.parse(now) &&
      (!record.validUntil || Date.parse(record.validUntil) > Date.parse(now));
    return {
      canReview,
      record,
      value,
      state,
      source: sources.find(
        (s) =>
          s.id === record.sourceId &&
          s.ownerId === scope.ownerId &&
          s.projectId === scope.projectId,
      ),
    };
  });
}
