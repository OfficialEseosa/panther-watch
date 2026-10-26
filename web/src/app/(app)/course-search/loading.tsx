import { LoadingBar } from "@/components/courses/LoadingBar";
import { SearchPageFrame } from "@/components/courses/SearchPageFrame";

export default function Loading() {
  return (
    <SearchPageFrame>
      <LoadingBar message="Loading terms..." />
    </SearchPageFrame>
  );
}
