import { ListSkeleton } from "@/components/admin/ListSkeleton";

export default function Loading() {
  return <ListSkeleton label="Loading grade data" rows={4} />;
}
