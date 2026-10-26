import { ListSkeleton } from "@/components/admin/ListSkeleton";

export default function Loading() {
  return <ListSkeleton label="Loading announcements" rows={3} />;
}
