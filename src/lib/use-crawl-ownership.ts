import { useQuery } from "@tanstack/react-query";
import * as api from "./technical-ownership.functions";
export function useCrawlOwnership(owner: string, projectId: string) {
  return useQuery({
    queryKey: ["crawl-ownership", owner, projectId],
    queryFn: () => api.readCrawlOwnershipFn({ data: { projectId } }),
    retry: false,
    staleTime: 0,
    refetchInterval: 30000,
  });
}
