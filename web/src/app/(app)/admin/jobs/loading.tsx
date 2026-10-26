import { ListSkeleton } from "@/components/admin/ListSkeleton";

export default function Loading() {
  return <ListSkeleton label="Loading job runs" rows={6} />;
}
