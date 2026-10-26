import { ListSkeleton } from "@/components/admin/ListSkeleton";

export default function Loading() {
  return <ListSkeleton label="Loading the composer" rows={3} />;
}
