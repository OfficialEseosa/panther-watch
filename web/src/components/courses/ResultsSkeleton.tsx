import { LoadingBar } from "./LoadingBar";

/** Course results while the search streams: the original loading bar. */
export function ResultsSkeleton() {
  return <LoadingBar message="Searching for courses..." />;
}
